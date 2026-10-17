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
from app.security import principal_for

with SessionLocal() as db:
    site = db.get(Site, uuid.UUID("00000000-0000-4000-8000-000000000001"))
    expected = {
        "superadmin@visitorhub.example.com": Role.super_admin,
        "siteadmin@visitorhub.example.com": Role.site_admin,
        "host@visitorhub.example.com": Role.host,
    }
    accounts = {u.email: u for u in db.scalars(select(User).where(User.email.in_(expected))).all()}
    access = {email: principal_for(user) for email, user in accounts.items()}
    if not site or any(email not in accounts or access[email] is None or access[email].role != role or accounts[email].organization_id != site.organization_id or (email != "superadmin@visitorhub.example.com" and access[email].site_ids != frozenset({site.id})) for email, role in expected.items()):
        raise SystemExit("Demo user roles and site assignments are incomplete.")
    host = db.scalar(select(Host).where(Host.user_id == accounts["host@visitorhub.example.com"].id, Host.site_id == site.id, Host.status == "active"))
    if not host or host.employee_id != "EMP-1234":
        raise SystemExit("The Host login is missing its active host-directory entry.")
    print(f"Verified 3 demo accounts and active host directory record at site {site.id}.")

    # Register (or re-pair) the demo kiosk and print a one-time pairing code to type into it.
    from app.models import Device
    from app.services import devices
    kiosk = db.scalar(select(Device).where(Device.site_id == site.id, Device.name == "Lobby kiosk"))
    if kiosk is None:
        kiosk, code = devices.register(db, site=site, name="Lobby kiosk", device_type="kiosk", actor_id=accounts["superadmin@visitorhub.example.com"].id)
    else:
        code = devices.new_pairing_code(db, kiosk)
    db.commit()
    print(f"Kiosk pairing code (valid 15 minutes): {code}  - open http://localhost:3001 and enter it.")
PY
