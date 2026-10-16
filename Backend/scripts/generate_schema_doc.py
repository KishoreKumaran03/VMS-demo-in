"""Generate docs/SCHEMA.md from a migrated database, so the schema reference always matches the migrations.

    DATABASE_URL=postgresql+psycopg://... python scripts/generate_schema_doc.py

Run it after adding a migration and commit the result. The descriptions below are the only hand-written
part; columns, keys, delete rules, constraints, indexes, triggers and the ER diagram come from PostgreSQL.
"""
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

# (group, table, purpose, retention, access)
TABLES = [
    ("Organizations and sites", "organizations", "Tenant. Every business row belongs to exactly one organization.", "Kept", "Super Admin"),
    ("Organizations and sites", "sites", "A physical location. `is_active` is generated from `status`.", "Kept (archived, never deleted)", "Super Admin; Site Admin for own sites"),
    ("Organizations and sites", "site_settings", "One row per site: visit length, walk-in approval, re-entry, overdue grace, NDA.", "Lives with the site", "site.manage"),
    ("Organizations and sites", "departments", "Host departments, unique per organization (case-insensitive).", "Kept", "host.read / host.manage"),
    ("Organizations and sites", "gates", "Named entry points at a site (reserved for gate hardware).", "Kept", "site.manage"),
    ("Organizations and sites", "devices", "Kiosks/scanners. Stores keyed hashes of the pairing code and device key only.", "Kept (disabled/retired)", "device.manage"),
    ("Identity", "people", "Central identity for visitors, hosts and staff. Contact details only, never credentials.", "Visitors anonymized by retention; staff kept", "Scoped by organization"),
    ("Identity", "person_contacts", "Email/phone channels; `verified_at` is set when a channel is proven (e.g. a completed reset).", "Deleted with anonymization", "Internal"),
    ("Identity", "visitor_profiles", "Long-term visitor record: status (blocks entry when inactive), classification, visit counts, review flag.", "Deleted with anonymization", "visit.read; changes need visitor.update / visitor.deactivate"),
    ("Identity", "person_merge_log", "Who merged which duplicate visitor into which record, and what moved.", "Kept", "visitor.merge"),
    ("Authentication", "users", "Login accounts. `email` is the login id (globally unique). `is_active` is generated from `account_status`.", "Kept", "user.read / user.manage"),
    ("Authentication", "user_credentials", "Argon2id password hash (CHECK rejects anything else).", "Lives with the user", "Never exposed"),
    ("Authentication", "roles", "Seeded role catalog with scope (platform / organization_or_site / site) and priority.", "Seed data", "Read-only"),
    ("Authentication", "permissions", "Seeded permission codes checked by the API.", "Seed data", "Read-only"),
    ("Authentication", "role_permissions", "Which role holds which permission.", "Seed data", "Read-only"),
    ("Authentication", "user_roles", "Role assignments, one row per site for site-scoped roles. A trigger enforces the role's scope.", "Lives with the user", "user.manage"),
    ("Authentication", "user_sessions", "Server-side sessions; every request checks that its session is not revoked or expired.", "Lives with the user", "Internal"),
    ("Authentication", "password_reset_requests", "Single-use reset links (keyed hash only), expiry, attempts, who initiated.", "Lives with the user", "Internal"),
    ("Authentication", "authentication_events", "Append-only sign-in, lockout, reset and pairing events.", "auth_event policy (12 months)", "Internal; Super Admin via database"),
    ("Visits", "hosts", "Host directory entry linked to a person, department and optionally a login account.", "Kept (deactivated, never deleted)", "host.read / host.manage"),
    ("Visits", "invitations", "A host's pre-registration request; mirrors the outcome of its visit.", "Anonymized with its visit", "visit.read"),
    ("Visits", "visits", "One visit and its current status (see the state machine in BACKEND.md).", "ordinary_visit / security_visit policy; anonymized, row kept", "visit.read, scoped"),
    ("Visits", "visit_events", "Append-only history of every status change and movement.", "Deleted when the visit is anonymized", "visit.read, scoped"),
    ("Visits", "passes", "The visit's single QR pass: SHA-256 lookup hash + encrypted copy while active.", "Deleted when the visit is anonymized", "Internal; the code is shown to scoped staff"),
    ("Visits", "pass_scans", "Append-only log of every validation attempt and its outcome.", "pass_scan policy (5 months)", "Internal"),
    ("Visits", "idempotency_keys", "Stored responses for retried create requests (Idempotency-Key header).", "Deleted after 24 hours", "Internal"),
    ("Security", "blacklist_entries", "Restricted-entry records: identifiers, reason, severity, effective period, review date.", "Kept until lifted/expired; review within 12 months", "blacklist.manage"),
    ("Security", "blacklist_matches", "A visit matched an entry: basis (person/email/phone/name) and confidence.", "Deleted when the visit is anonymized", "security.approve"),
    ("Security", "security_approvals", "The security decision for a flagged visit.", "Deleted when the visit is anonymized", "security.approve"),
    ("Audit and messaging", "audit_logs", "Append-only structured audit trail (no foreign key on entity_id on purpose).", "audit_log policy (24 months); held entities kept", "audit.read, scoped"),
    ("Audit and messaging", "notifications", "In-app and email notifications with delivery status.", "notification policy (3 months)", "Recipient only"),
    ("Audit and messaging", "notification_attempts", "Each delivery attempt for email/SMS notifications.", "Deleted with the notification", "Internal"),
    ("Audit and messaging", "outbox_events", "Transactional outbox; also the incremental sync feed (`id` is the cursor).", "outbox_event policy (1 month after processing)", "organization.manage (sync feed)"),
    ("Operations", "job_runs", "Every background job run with counts and errors.", "job_run policy (6 months)", "organization.manage (ops health)"),
    ("Operations", "retention_policies", "Retention period and action per record class; site > organization > platform default.", "Kept", "Read: user.read; change: Super Admin / org-wide Site Admin"),
    ("Operations", "retention_holds", "Legal/investigation/security holds that pause retention for a visit or person.", "Kept", "retention.hold"),
    ("Operations", "visit_daily_stats", "De-identified daily visit counts kept after anonymization.", "Kept", "Internal"),
    ("Operations", "backup_runs", "Backups and restore tests written by the backup container.", "Kept", "organization.manage (ops health)"),
]
DELETE_RULES = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Set DATABASE_URL to a database migrated to head.", file=sys.stderr)
        return 2
    engine = create_engine(url)
    out = ["# VisitorHub database schema", "",
           "_Generated by `scripts/generate_schema_doc.py` from a database migrated to head. Do not edit by hand._", ""]
    with engine.connect() as conn:
        version = conn.scalar(text("SELECT version_num FROM alembic_version"))
        out += [f"Schema version: `{version}` · PostgreSQL {conn.scalar(text('SHOW server_version'))}", "",
                "Rules that span tables (state machine, scoping, retention, screening) are in [BACKEND.md](BACKEND.md).", "",
                "## Contents", ""]
        actual = set(conn.scalars(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'")).all())
        documented = {t for _, t, *_ in TABLES}
        if actual - documented or documented - actual:
            print(f"Table list out of date. Undocumented: {sorted(actual - documented)}; missing: {sorted(documented - actual)}", file=sys.stderr)
            return 1
        group = None
        for g, table, *_ in TABLES:
            if g != group:
                out.append(f"- **{g}**: " + ", ".join(f"[`{t}`](#{t.replace('_', '_')})" for gg, t, *_ in TABLES if gg == g))
                group = g
        out += ["", "## Relationships", "", "Every foreign key, generated from the catalog. `A ||--o{ B` means many `B` rows may reference one `A` row.", "", "```mermaid", "erDiagram"]
        fks = conn.execute(text("""
            SELECT DISTINCT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
            FROM pg_constraint c WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace ORDER BY 1, 2""")).all()
        for child, parent in fks:
            out.append(f"  {parent} ||--o{{ {child} : \"\"")
        out += ["```", ""]

        group = None
        for g, table, purpose, retention, access in TABLES:
            if g != group:
                out += [f"## {g}", ""]
                group = g
            out += [f"### {table}", "", purpose, "", f"- **Retention:** {retention}", f"- **Access:** {access}", ""]
            columns = conn.execute(text("""
                SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
                       CASE WHEN a.attgenerated = 's' THEN 'generated: ' || pg_get_expr(d.adbin, d.adrelid)
                            WHEN a.attidentity <> '' THEN 'identity' ELSE pg_get_expr(d.adbin, d.adrelid) END AS default
                FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = CAST(:t AS regclass) AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum"""), {"t": table}).all()
            out += ["| Column | Type | Null | Default |", "|---|---|---|---|"]
            for name, type_, nullable, default in columns:
                out.append(f"| `{name}` | {type_} | {'yes' if nullable else 'no'} | {('`' + default.replace('|', '\\|') + '`') if default else ''} |")
            constraints = conn.execute(text("""
                SELECT contype, conname, pg_get_constraintdef(oid), confdeltype FROM pg_constraint
                WHERE conrelid = CAST(:t AS regclass) ORDER BY contype, conname"""), {"t": table}).all()
            labels = {"p": "Primary key", "f": "Foreign key", "u": "Unique", "c": "Check"}
            if constraints:
                out += ["", "| Constraint | Kind | Definition |", "|---|---|---|"]
                for kind, name, definition, on_delete in constraints:
                    if kind == "f":
                        definition = definition.split(" ON DELETE")[0] + f" — on delete {DELETE_RULES.get(on_delete, on_delete)}"
                    out.append(f"| `{name}` | {labels.get(kind, kind)} | `{definition.replace('|', '\\|')}` |")
            indexes = conn.execute(text("""
                SELECT i.indexname, i.indexdef FROM pg_indexes i
                WHERE i.schemaname = 'public' AND i.tablename = :t
                  AND i.indexname NOT IN (SELECT conname FROM pg_constraint WHERE conrelid = CAST(:t AS regclass))
                ORDER BY i.indexname"""), {"t": table}).all()
            if indexes:
                out += ["", "| Index | Definition |", "|---|---|"]
                for name, definition in indexes:
                    out.append(f"| `{name}` | `{definition.split(' USING ', 1)[-1].replace('|', '\\|')}` |")
            triggers = conn.execute(text("""
                SELECT t.tgname, p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                WHERE t.tgrelid = CAST(:t AS regclass) AND NOT t.tgisinternal ORDER BY t.tgname"""), {"t": table}).all()
            if triggers:
                out += ["", "Triggers: " + ", ".join(f"`{name}` → `{function}()`" for name, function in triggers)]
            out.append("")
    target = Path(__file__).resolve().parents[1] / "docs" / "SCHEMA.md"
    target.write_text("\n".join(out) + "\n")
    print(f"Wrote {target.relative_to(Path.cwd()) if target.is_relative_to(Path.cwd()) else target} ({len(TABLES)} tables, {len(fks)} relationships)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
