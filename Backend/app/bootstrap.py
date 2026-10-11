"""Create the first organization, site, and platform administrator."""
import argparse
import getpass
import sys

from sqlalchemy import select

from .database import SessionLocal
from .models import Organization, Role, Site, User
from .security import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization", required=True)
    parser.add_argument("--site", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    email = args.email.strip().lower()
    password = getpass.getpass("New administrator password (12+ characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if len(password) < 12 or password != confirmation:
        print("Password must contain at least 12 characters and both entries must match.", file=sys.stderr)
        return 2

    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == email)):
            print("An account with this email already exists.", file=sys.stderr)
            return 2
        organization = Organization(name=args.organization.strip())
        db.add(organization)
        db.flush()
        site = Site(organization_id=organization.id, name=args.site.strip())
        db.add(site)
        db.flush()
        admin = User(email=email, full_name=args.name.strip(), password_hash=hash_password(password), role=Role.super_admin, organization_id=organization.id, site_id=site.id)
        db.add(admin)
        db.commit()
        print(f"Created organization {organization.id}, site {site.id}, and administrator {admin.email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
