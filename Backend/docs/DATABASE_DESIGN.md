# VisitorHub database: design record and implementation report

This document records why the schema looks the way it does. It covers what existed before (Phase 1), the decisions taken, how the build differed from the first proposal, and what each phase delivered and how it was verified. The authoritative descriptions of the system are:

- [BACKEND.md](BACKEND.md): architecture, rules, API reference
- [SCHEMA.md](SCHEMA.md): generated table-by-table reference
- [OPERATIONS.md](OPERATIONS.md): running, backups, restores, monitoring

Starting point: the team's *VMS DB Initial Ideas* preliminary design, which proposed `people`, `users`, `roles/user_roles`, `sites`, `hosts`, `invitations`, `visits`, `passes`, `visit_events` and `audit_logs`. All of those exist in the final schema with the relationships the draft described.

---

## 1. Phase 1 findings: the prototype before this work

The stack was PostgreSQL 17, FastAPI, SQLAlchemy 2 and Alembic (`0001`, `0002`). Passwords already used Argon2id, and every frontend operation already went through the API. The prototype had eight tables: `organizations`, `sites`, `users`, `hosts`, `visitors`, `visits`, `audit_events`, `notifications`.

| # | Defect | Resolved by |
|---|---|---|
| D1 | Every visit inserted a new `visitors` row, so there was no returning-visitor history | `people` + identity matching (0006) |
| D2 | Hosts were linked to accounts by matching email strings | `hosts.user_id` (0006) |
| D3 | Deleting an organization or site cascaded into visit history | RESTRICT everywhere (0003, 0005, 0006, 0007) |
| D4 | Pass state was stored as columns on `visits` | `passes`, `pass_scans` (0006) |
| D5 | The pass ciphertext key was derived from `JWT_SECRET` | Separate `PASS_ENCRYPTION_KEY` (0006) |
| D6 | A single check-in/check-out pair, so no re-entry | `visit_events` + `temporarily-out` (0006) |
| D7 | Unauthenticated kiosk endpoints returned pass codes | Paired devices (0006) |
| D8 | The kiosk rate limit was a per-process dict | Device auth + database-backed limits on pairing, sign-in and resets |
| D9 | No versions, so edits could silently overwrite each other | `version` columns + 409 (0003–0006) |
| D10 | The dashboard summary loaded every visit into Python | SQL aggregates (Phase 4) |
| D11 | No password reset, lockout, sessions, blacklist, retention or outbox | Phases 3, 5 and 6 |
| D12 | Postgres ENUMs for evolving states | TEXT + CHECK (0005, 0006) |

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Re-displaying QR codes | **No replacement passes.** One pass per visit; SHA-256 lookup hash plus an encrypted copy under its own key while the pass is active. |
| Q2 | Pass usage | Multi-entry within the validity window; each entry and exit is a `visit_events` row; check-out is allowed after expiry. |
| Q3 | Walk-ins | Visits created directly (`invitation_id` NULL); invitations are host pre-registrations only. |
| Q4 | Contact uniqueness | `people.email`/`phone` are not unique; the login email is globally unique and case-insensitive. |
| Q5 | Multi-site staff | Supported: one `user_roles` row per site. |
| Q6 | Sync engine | *Open; the default was applied:* outbox plus a pull-based feed, with no destination-specific tables until a destination exists. |
| Q7 | Email/SMS provider | *Open.* `EMAIL_DELIVERY=console` for development; SMS OTP not built. |
| Q8 | Production hosting | *Open.* Determines whether managed PITR or pgBackRest complements the nightly dumps. |
| Q9 | Retention periods | *Open for confirmation.* Seeded defaults: 5 months for ordinary visits, 24 months for security-related visits and the audit log, plus the others in BACKEND.md §11. |

## 3. Where the build differs from the first proposal

| Proposal | As built | Why |
|---|---|---|
| Renamed statuses (`expected`, `on_site`, `completed`) | Kept the existing API values and added `security-review`, `temporarily-out`, `no-show` | One vocabulary; no translation layer or frontend break |
| `passes.token_hash` as HMAC with a pepper | Plain SHA-256 of a 256-bit random token | Equally strong for random tokens; existing passes migrated without re-issuing |
| `users.login_email` | `users.email` (lowercased, unique) | Avoided touching every query; same guarantee |
| `user_sessions.refresh_token_hash` | Server-side session per sign-in, checked on every request | Gives immediate revocation; a refresh flow can be added later |
| `public_ref` and `allowed_gate_ids` on passes | Not built | No workflow needed them; `wrong_site` is enforced through the device's site |
| `employees`, `pass_revocations`, `visit_status_history`, `visit_participants`, `host_availability`, `sync_*` tables | Not built | Already covered by `hosts`, pass columns and `visit_events`; no group-visit, availability or sync destination yet |
| `system_settings` table | Environment settings (`app/config.py`) plus `site_settings` and `retention_policies` | Settings that change per site or need approval live in tables; the rest are deployment configuration |
| Separate DB roles for append-only tables | `reject_history_change()` trigger + `SET LOCAL vms.allow_history_changes` | Works with the single database user that Compose provides; it also applies to a superuser |

## 4. Implementation report

### Tables

**Created (31):** `site_settings`, `departments`, `gates`, `devices`, `people`, `person_contacts`, `visitor_profiles`, `person_merge_log`, `user_credentials`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sessions`, `password_reset_requests`, `authentication_events`, `invitations`, `visit_events`, `passes`, `pass_scans`, `idempotency_keys`, `blacklist_entries`, `blacklist_matches`, `security_approvals`, `notification_attempts`, `outbox_events`, `job_runs`, `retention_policies`, `retention_holds`, `visit_daily_stats`, `backup_runs`. With the 7 reused tables below, the schema has 38 tables.

**Reused and modified (7):**
- `organizations`, `sites`: gained a status lifecycle, versions and timezones.
- `users`: credentials, names and roles moved out to the tables above.
- `hosts`: linked to a person, department and account.
- `visits`: TEXT statuses; pass columns moved to `passes`; invitation, version and retention fields added.
- `notifications`: gained a channel and delivery status.
- `audit_events` became `audit_logs`, with structured metadata.

**Removed (1):** `visitors`. Every row became a `people` row with the same id, so existing references stayed valid.

### Migrations

`0003_org_site_structure`, `0004_identity_auth_tables`, `0005_backfill_identity_auth`, `0006_visits_passes_identity`, `0007_security_audit_outbox`, `0008_retention_backups`. All have working downgrades; see BACKEND.md §14 for the details.

### Existing data

| Data | Migration path |
|---|---|
| Accounts | One person per user; the password hash is copied unchanged, so passwords keep working; role and site become `user_roles`. The former site of a Super Admin is dropped, because Super Admins are platform-wide. Receptionists without a site keep organization-wide access (grandfathered). New site-scoped roles require a site. |
| Hosts | Linked to the account with the same email in their organization (one host per account); otherwise a new person is created. Free-text departments become `departments` rows, de-duplicated case-insensitively. |
| Visitors | Every row becomes a `people` row with the same id plus a `visitor_profiles` row. They are **not** merged automatically: duplicates from the prototype stay separate until an administrator merges them. |
| Visits | Pre-registered visits get an `invitations` row. Check-in, check-out, cancellation and rejection timestamps become `visit_events` (`metadata.source = migration`). |
| Passes | Created for `scheduled`, `checked-in` and `checked-out` visits. The digest is kept, and the ciphertext is re-encrypted from the old JWT-derived key to `PASS_ENCRYPTION_KEY`, so passes already in visitors' hands keep working. |
| Audit | Old rows keep their text in `metadata.detail`. The entity is inferred from the visit or from the `kind=<uuid>` prefix of the detail. |

Before migrating a database with real data, take a backup (OPERATIONS.md §8).

### APIs

The `main.py` monolith was split into routers. Every endpoint listed in BACKEND.md §13 that is not in the prototype is new.

Changes to existing endpoints, all backwards-compatible in their response shapes:

- `/kiosk/*` now requires a paired device.
- Staff check-in and check-out moved from the kiosk pass endpoints to `/visits/{id}/check-in`, `/visits/{id}/check-out` and `/passes/verify`.
- `UserOut` adds `site_ids`, `account_status` and `version`. `VisitOut` adds `category`, `invitation_id`, `pass_expires_at`, `overdue` and `version`.
- `AuditOut` adds structured fields and keeps `event_type`, `visit_id` and `detail`.
- Statuses can now include `security-review`, `temporarily-out` and `no-show`.

### Frontends

**Dashboard:**
- Forgot-password and reset-password pages, a change-password dialog, and server-side sign-out.
- Labels for the new statuses; check-in, check-out and verify use the staff endpoints; creates send Idempotency-Keys.
- New panels: Kiosks, Security reviews with restricted-entry records, and Retention with holds and system health.
- Accessible labels for the account form's dropdowns, which fixed a pre-existing end-to-end selector failure.

**Kiosk:**
- A pairing screen; the device key is sent on every request; the site comes from the pairing instead of a build-time variable; walk-ins send Idempotency-Keys.

### Tests executed and results (final run)

| Suite | Result |
|---|---|
| Backend pytest (`Backend/tests`, PostgreSQL 17 in Docker) | **100 passed** |
| Migration round trips (included above) | head ↔ 0002 over legacy accounts; head ↔ 0005 over legacy hosts, visitors and visits in every status, with live passes verified after upgrade and after downgrade |
| Real data | Phase 3 migrations applied to a copy of the local development database (3 accounts kept roles, sites and password hashes). Migrations 0007–0008 applied to a running stack holding end-to-end test data. |
| Playwright end-to-end (`Kiosk-FrontEnd/e2e`, real Dashboard + kiosk + API + PostgreSQL) | **5 passed** (role scoping; full visit lifecycle; Super Admin-created hosts through kiosk search, approval, QR and check-in; kiosk pairing from the Dashboard; the security review workflow) |
| Browser checks of the new UI | Password reset through the emailed link (development console delivery) and sign-in with the new password; Super Admin Retention, Security and Kiosks tabs load with no console or API errors |
| Backups | `backup.sh --now` produced an `age`-encrypted dump (header verified, no plaintext). `restore-test.sh` restored it into a scratch database and validated schema 0008, constraints and row counts. `app.restore_reconcile` ran successfully. `ops/health` reported `ok`. |
| Kiosk unit tests (vitest) | 10 passed |
| Dashboard production build | Succeeds |

### Remaining decisions and limitations

- **Q6:** sync destinations and machine credentials.
- **Q7:** email/SMS provider, and phone OTP or step-up verification.
- **Q8:** PITR or pgBackRest alongside the nightly dumps.
- **Q9:** confirmation of the retention periods.

The others are listed in BACKEND.md §16.

### How to run migrations and tests

- **Migrations:** applied automatically when the API starts; manually with `cd Backend && alembic upgrade head`.
- **Backend tests:** see [Backend/README.md](../README.md#backend-tests).
- **End-to-end tests:** see [Backend/README.md](../README.md#browser-end-to-end-tests).
- **Schema reference:** regenerate with `DATABASE_URL=… python scripts/generate_schema_doc.py`.
