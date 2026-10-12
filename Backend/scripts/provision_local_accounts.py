"""Create a local site administrator and host through the authenticated API."""

from __future__ import annotations

import argparse
import getpass
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def request(api_url: str, path: str, *, token: str | None = None, body=None):
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(f"{api_url}{path}", data=data, headers=headers)
    try:
        with urlopen(req, timeout=15) as response:
            if response.status == 204:
                return None
            return json.loads(response.read())
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"API returned {error.code} for {path}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Could not reach the API at {api_url}: {error.reason}") from error


def password_for(label: str) -> str:
    password = getpass.getpass(f"{label} password (12+ characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if len(password) < 12 or password != confirmation:
        raise RuntimeError("Passwords must match and contain at least 12 characters.")
    return password


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:8000/api/v1")
    parser.add_argument("--setup-email", required=True, help="Email of the bootstrapped Super Admin")
    parser.add_argument("--site-id", required=True, help="UUID printed by the bootstrap command")
    parser.add_argument("--admin-email", required=True, help="Email for the new site administrator")
    parser.add_argument("--admin-name", required=True)
    parser.add_argument("--host-email", required=True)
    parser.add_argument("--host-name", required=True)
    parser.add_argument("--employee-id", required=True, help="For example EMP-1234")
    parser.add_argument("--department", required=True)
    args = parser.parse_args()
    api_url = args.api_url.rstrip("/")

    if len(args.employee_id) < 1 or len(args.employee_id) > 80:
        raise RuntimeError("Employee ID must be between 1 and 80 characters.")
    setup_password = getpass.getpass("Bootstrapped Super Admin password: ")
    admin_password = password_for("New site administrator")
    host_password = password_for("New host")

    login = request(api_url, "/auth/login", body={"email": args.setup_email, "password": setup_password})
    token = login["access_token"]
    me = request(api_url, "/auth/me", token=token)
    if me["role"] != "super-admin":
        raise RuntimeError("The setup account must be a Super Admin.")

    sites = request(api_url, "/sites", token=token)
    site = next((row for row in sites if row["id"] == args.site_id), None)
    if not site:
        raise RuntimeError("The selected site is not active or is not visible to this Super Admin.")

    users = request(api_url, "/users", token=token)
    requested_emails = {args.admin_email.lower(), args.host_email.lower()}
    existing = {row["email"].lower() for row in users} & requested_emails
    if existing:
        raise RuntimeError(f"Account email already exists: {', '.join(sorted(existing))}. Choose new emails.")

    host_rows = request(api_url, f"/hosts?q={args.employee_id}", token=token)
    if any(row["employee_id"] == args.employee_id for row in host_rows):
        raise RuntimeError("That employee ID already exists. Choose a new employee ID.")

    shared_scope = {"organization_id": me["organization_id"], "site_id": args.site_id}
    request(api_url, "/users", token=token, body={
        **shared_scope,
        "email": args.admin_email,
        "full_name": args.admin_name,
        "password": admin_password,
        "role": "site-admin",
    })
    request(api_url, "/users", token=token, body={
        **shared_scope,
        "email": args.host_email,
        "full_name": args.host_name,
        "password": host_password,
        "role": "host",
    })
    request(api_url, "/hosts", token=token, body={
        "site_id": args.site_id,
        "employee_id": args.employee_id,
        "name": args.host_name,
        "email": args.host_email,
        "department": args.department,
    })

    print(f"Created site administrator {args.admin_email} and host {args.host_email} ({args.employee_id}) at site {site['name']}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, KeyError) as error:
        print(f"Setup failed: {error}", file=sys.stderr)
        raise SystemExit(1)
