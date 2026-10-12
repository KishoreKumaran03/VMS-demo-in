"""Provision disposable host and site-admin accounts through the authenticated API."""

import os
import sys

import httpx


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"Set {name} before running this script.")
    return value


def main() -> int:
    api_url = os.getenv("VMS_E2E_API_URL", "http://localhost:8000/api/v1").rstrip("/")
    site_id = required("VMS_E2E_SITE_ID")
    setup_email = required("VMS_SETUP_EMAIL")
    setup_password = required("VMS_SETUP_PASSWORD")
    admin_email = required("VMS_E2E_ADMIN_EMAIL").lower()
    admin_password = required("VMS_E2E_ADMIN_PASSWORD")
    host_email = required("VMS_E2E_HOST_EMAIL").lower()
    host_password = required("VMS_E2E_HOST_PASSWORD")
    employee_id = required("VMS_E2E_HOST_EMPLOYEE_ID")
    host_name = required("VMS_E2E_HOST_NAME")
    department = os.getenv("VMS_E2E_HOST_DEPARTMENT", "Smoke Test").strip()

    if len(admin_password) < 12 or len(host_password) < 12:
        raise SystemExit("E2E account passwords must contain at least 12 characters.")
    if not employee_id.startswith("EMP-") or not employee_id[4:].isdigit() or len(employee_id[4:]) != 4:
        raise SystemExit("VMS_E2E_HOST_EMPLOYEE_ID must use the form EMP-1234.")

    with httpx.Client(base_url=api_url, timeout=15) as client:
        login = client.post("/auth/login", json={"email": setup_email, "password": setup_password})
        login.raise_for_status()
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        me = client.get("/auth/me", headers=headers)
        me.raise_for_status()
        organization_id = me.json()["organization_id"]
        sites = client.get("/sites", headers=headers)
        sites.raise_for_status()
        if not any(site["id"] == site_id for site in sites.json()):
            raise SystemExit("VMS_E2E_SITE_ID must identify an active site visible to the setup administrator.")

        users_response = client.get("/users", headers=headers)
        users_response.raise_for_status()
        users = {user["email"].lower(): user for user in users_response.json()}
        admin = users.get(admin_email)
        if admin:
            if admin["role"] != "site-admin" or admin["organization_id"] != organization_id or admin["site_id"] != site_id:
                raise SystemExit(f"Existing account {admin_email} must be a Site Admin at the selected site.")
        else:
            client.post("/users", headers=headers, json={
                "email": admin_email,
                "full_name": "E2E Site Administrator",
                "password": admin_password,
                "role": "site-admin",
                "organization_id": organization_id,
                "site_id": site_id,
            }).raise_for_status()

        host_account = users.get(host_email)
        if host_account and (host_account["role"] != "host" or host_account["organization_id"] != organization_id or host_account["site_id"] != site_id):
            raise SystemExit(f"Existing account {host_email} must be a Host at the selected site.")
        host_rows = client.get("/hosts", headers=headers, params={"q": employee_id})
        host_rows.raise_for_status()
        directory_host = next((host for host in host_rows.json() if host["employee_id"] == employee_id), None)
        if directory_host and directory_host["site_id"] != site_id:
            raise SystemExit("The configured employee ID belongs to a different site.")
        host_payload = {"employee_id": employee_id, "name": host_name, "email": host_email, "department": department, "site_id": site_id}
        if not host_account:
            client.post("/hosts/accounts", headers=headers, json={
                **host_payload,
                "full_name": host_name,
                "password": host_password,
            }).raise_for_status()
        elif directory_host:
            client.patch(f"/hosts/{directory_host['id']}", headers=headers, json={
                "name": host_name, "email": host_email, "department": department,
            }).raise_for_status()
        else:
            # Repair an existing Host login that lacks its host-directory entry.
            client.post("/hosts", headers=headers, json=host_payload).raise_for_status()

    print(f"E2E accounts are ready for site {site_id}: {admin_email}, {host_email} ({employee_id}).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except httpx.HTTPStatusError as error:
        detail = error.response.text[:500]
        print(f"Provisioning failed: {error.response.status_code} {detail}", file=sys.stderr)
        raise SystemExit(1)
