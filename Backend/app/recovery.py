"""Emergency account recovery for operators with server access.

This is the approved break-glass procedure for when the normal email recovery flow cannot be used
(for example the only Super Admin has lost access to their mailbox). It requires shell access to
the API host, a written reason, and records an authentication event and an audit entry; all
sessions for the account are revoked.

    docker compose exec api python -m app.recovery --email admin@example.com --reason "Mailbox lost, ticket OPS-123"
"""
import argparse
import getpass
import sys

from sqlalchemy import select

from .services import accounts
from .database import SessionLocal
from .models import User


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--reason", required=True, help="Why break-glass recovery is needed (stored in the audit trail)")
    args = parser.parse_args()
    reason = args.reason.strip()
    if len(reason) < 10:
        print("Give a meaningful reason (10+ characters), such as a ticket reference.", file=sys.stderr)
        return 2

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
        if user is None or not user.is_active:
            print("No active account has that email.", file=sys.stderr)
            return 2
        password = getpass.getpass("New password (12+ characters): ")
        if len(password) < 12 or len(password) > 128 or password != getpass.getpass("Confirm password: "):
            print("Password must be 12-128 characters and both entries must match.", file=sys.stderr)
            return 2
        accounts.change_password(db, user, password, actor_id=None, reason="emergency_reset")
        accounts.record_auth_event(db, "reset.emergency", user, operator_reason=reason)
        accounts.audit_account(db, user, None, "password.emergency_reset_reason", operator_reason=reason[:500])
        db.commit()
    print(f"Password replaced and all sessions revoked for {args.email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
