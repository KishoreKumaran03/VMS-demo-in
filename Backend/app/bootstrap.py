"""Create the first organization, site, and platform administrator."""
import argparse
import getpass
import sys
import uuid

from sqlalchemy import select

from .services import accounts
from .database import SessionLocal
from .models import Organization, Role, Site, SiteSettings, User
from .security import principal_for


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization", required=True)
    parser.add_argument("--site", required=True)
    parser.add_argument("--site-id", type=uuid.UUID, help="Optional stable site UUID for a configured kiosk")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    email = args.email.strip().lower()

    organization_name = args.organization.strip()
    site_name = args.site.strip()
    full_name = args.name.strip()
    if not organization_name or not site_name or not full_name:
        print("Organization, site, and name must not be blank.", file=sys.stderr)
        return 2

    with SessionLocal() as db:
        organization = db.scalar(select(Organization).where(Organization.name == organization_name))
        if organization is None:
            organization = Organization(name=organization_name)
            db.add(organization)
            db.flush()

        site = db.scalar(select(Site).where(Site.organization_id == organization.id, Site.name == site_name))
        if site is None:
            site = Site(id=args.site_id or uuid.uuid4(), organization_id=organization.id, name=site_name)
            site.settings = SiteSettings()
            db.add(site)
            db.flush()
        elif args.site_id and site.id != args.site_id:
            print("The existing site has a different ID than --site-id.", file=sys.stderr)
            return 2

        admin = db.scalar(select(User).where(User.email == email))
        if admin is not None:
            access = principal_for(admin)
            if access is None or access.role != Role.super_admin or admin.organization_id != organization.id:
                print("That email already belongs to an account outside this bootstrap scope.", file=sys.stderr)
                return 2
        else:
            password = getpass.getpass("New administrator password (12+ characters): ")
            confirmation = getpass.getpass("Confirm password: ")
            if len(password) < 12 or password != confirmation:
                print("Password must contain at least 12 characters and both entries must match.", file=sys.stderr)
                return 2
            admin = accounts.create_account(db, organization_id=organization.id, email=email, full_name=full_name, password=password,
                                            role=Role.super_admin, site_ids=None, actor_id=None)

        db.commit()
        print(f"Development bootstrap is ready. Organization ID: {organization.id}; site ID: {site.id}; Super Admin: {admin.email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
