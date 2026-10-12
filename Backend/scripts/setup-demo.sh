#!/bin/sh
set -eu

if [ "${APP_ENV:-}" != "development" ]; then
  printf 'Refusing demo account setup. Run with APP_ENV=development explicitly.\n' >&2
  exit 1
fi

backend_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$backend_dir"

docker compose exec -it api python -m app.bootstrap \
  --organization "VisitorHub Demo" \
  --site "Main Office" \
  --site-id 00000000-0000-4000-8000-000000000001 \
  --email superadmin@visitorhub.example.com \
  --name "Demo Super Admin"

docker compose exec -it api python scripts/provision_local_accounts.py \
  --setup-email superadmin@visitorhub.example.com \
  --site-id 00000000-0000-4000-8000-000000000001 \
  --admin-email siteadmin@visitorhub.example.com \
  --admin-name "Demo Site Admin" \
  --host-email host@visitorhub.example.com \
  --host-name "Demo Host" \
  --employee-id EMP-1234 \
  --department Engineering

docker compose exec -T api python - <<'PY'
from sqlalchemy import select
import uuid
from app.database import SessionLocal
from app.models import Host, Role, Site, User

with SessionLocal() as db:
    site = db.get(Site, uuid.UUID("00000000-0000-4000-8000-000000000001"))
    expected = {
        "superadmin@visitorhub.example.com": Role.super_admin,
        "siteadmin@visitorhub.example.com": Role.site_admin,
        "host@visitorhub.example.com": Role.host,
    }
    accounts = {u.email: u for u in db.scalars(select(User).where(User.email.in_(expected))).all()}
    if not site or any(email not in accounts or accounts[email].role != role or accounts[email].organization_id != site.organization_id or (email != "superadmin@visitorhub.example.com" and accounts[email].site_id != site.id) for email, role in expected.items()):
        raise SystemExit("Demo user roles and site assignments are incomplete.")
    host = db.scalar(select(Host).where(Host.email == "host@visitorhub.example.com", Host.site_id == site.id, Host.active.is_(True)))
    if not host or host.employee_id != "EMP-1234":
        raise SystemExit("The Host login is missing its active host-directory entry.")
    print(f"Verified 3 demo accounts and active host directory record at site {site.id}.")
PY
