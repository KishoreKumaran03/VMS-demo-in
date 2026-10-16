# VisitorHub operations

How to configure, run, back up, restore and monitor the backend. [BACKEND.md](BACKEND.md) explains what the system does; this document explains how to operate it.

## 1. Services

| Compose service | Command | Purpose |
|---|---|---|
| `db` | `postgres:17-alpine` | The database (volume `visitorhub-postgres`) |
| `api` | `alembic upgrade head && uvicorn app.main:app` | Applies migrations, then serves `/api/v1` |
| `worker` | `python -m app.worker` | Outbox delivery, visit sweeps, blacklist maintenance, nightly retention |
| `backup` | `backup.sh` (profile `backup`) | Nightly encrypted backups and weekly restore tests |
| `dashboard`, `kiosk` | nginx / node | The two frontends |

Run one worker. A second one is harmless, because advisory locks stop duplicate job runs, but it is not needed.

## 2. Configuration

Set these in `Backend/.env`; `.env.example` lists them all.

| Variable | Required | Meaning |
|---|---|---|
| `POSTGRES_PASSWORD` | yes | Database password |
| `JWT_SECRET` | yes | Signs access tokens. Rotating it signs everyone out. |
| `TOKEN_PEPPER` | yes | HMAC key for stored reset-link and **device-key** hashes. Rotating it invalidates outstanding reset links **and every paired kiosk**, so kiosks must be re-paired. |
| `PASS_ENCRYPTION_KEY` | yes | Encrypts the re-displayable copy of active QR passes. After rotation existing passes still scan, but staff can no longer re-display them. |
| `APP_ENV` | no (`production`) | `development` enables console email delivery. In `production`, ops health also requires backups and restore tests. |
| `EMAIL_DELIVERY` | no (`disabled`) | `console` prints emails (development only); `disabled` sends nothing. To connect a provider, implement `services/notify.py:send_email`. |
| `DASHBOARD_URL` | no | Base URL used in reset links |
| `INITIAL_SETUP_KEY` | no | Enables the one-time first Super Admin signup |
| `ACCESS_TOKEN_MINUTES` | no (30) | Session and token lifetime |
| `CORS_ORIGINS` | no | Allowed browser origins |
| `BACKUP_AGE_RECIPIENT` | for backups | `age` public key that backups are encrypted to |
| `BACKUP_AGE_IDENTITY_FILE` | for restore tests | Path, inside the backup container, to the `age` private key. Mount it only where restore tests should run. |
| `BACKUP_TIME` | no (`02:00`) | UTC time of the daily backup. Retention runs at 02:30, after it. |
| `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY` | no (7 / 4) | Local rotation: daily copies kept for N days, and Sunday copies for N weeks |
| `BACKUP_COPY_COMMAND` | recommended | Shell command run with the new backup path as `$1`, for an off-site copy (e.g. `aws s3 cp "$1" s3://bucket/vms/`). A failed copy marks the backup run as failed. |

Generate secrets with `openssl rand -hex 32`, and use a different value for each. Never reuse `JWT_SECRET` for anything else.

Sign-in, lockout and password-reset limits have defaults in `app/config.py`, and each can be overridden by an environment variable of the same name (e.g. `LOGIN_MAX_FAILURES`, `RESET_TOKEN_MINUTES`).

## 3. First start and demo data

1. Copy `.env.example` to `.env` and set the secrets.
2. Run `./start-docker.sh`. The API applies all migrations before reporting healthy, and the worker waits for the API.
3. Development only: `APP_ENV=development ./Backend/scripts/setup-demo.sh` creates the three demo accounts. At the end it prints a **kiosk pairing code**: open the kiosk at <http://localhost:3001> and enter it.
4. In production, create the first Super Admin with `python -m app.bootstrap` (prompts for the password) or the one-time signup.

Pairing more kiosks: Dashboard → Kiosks (Site Admin page, or the Super Admin "Kiosks" tab) → Register kiosk, then type the code on the kiosk within 15 minutes. If a kiosk is lost or replaced, use **Re-pair** (the old key stops working immediately) or **Disable**.

## 4. Backups

### Set up

1. Create a key pair on a secure machine, **not** the server:
   `docker run --rm --entrypoint age-keygen backend-backup > vms-backup-key.txt`
   The file contains the private key, plus a comment with the public key (`age1…`).
2. Store the private key offline, in a password manager or HSM, with at least two custodians. Without it, backups cannot be restored.
3. Put the public key in `BACKUP_AGE_RECIPIENT`. Optionally set `BACKUP_COPY_COMMAND` to copy each backup to storage in another failure domain, ideally with object lock or versioning to protect against ransomware.
4. Start the service: `docker compose --profile backup up -d backup`. It takes a backup on start, then one daily at `BACKUP_TIME`.

### What a backup run does

`backup/backup.sh`:

1. Runs `pg_dump -Fc` into memory (`/work` is a tmpfs, so the unencrypted dump never touches disk).
2. Checks the dump: `pg_restore --list` must read the whole archive, and its SHA-256 is recorded.
3. Encrypts it to the public key into the `visitorhub-backups` volume, then runs the off-site copy command.
4. Prunes old copies according to the keep settings.
5. Records the result in `backup_runs`. Every run is recorded, success or failure.

Take a backup on demand (for example before an upgrade) with:
`docker compose --profile backup run --rm backup --now`

### Objectives (logical backups as configured here)

| | Value | Notes |
|---|---|---|
| RPO | 24 hours | Daily dumps. For minutes, use PITR (below). |
| RTO | about 1 hour | Restore plus reconciliation for a database of this size |
| Local copies | 7 daily + 4 weekly | About 1 month locally |
| Off-site | Your bucket's lifecycle policy | Recommended: monthly copies kept 6 months |

**Production recommendation.** Use a managed PostgreSQL service with point-in-time recovery (35 days), or pgBackRest with WAL archiving to object storage, and keep this nightly logical dump as a second, independent copy. If you use a managed service, use its backup mechanism rather than replacing it.

### Restore tests

When `BACKUP_AGE_IDENTITY_FILE` is mounted, `restore-test.sh` runs every Sunday after the backup. It:

1. decrypts the newest backup and checks its SHA-256;
2. restores it into a scratch database;
3. checks the schema version, that every constraint is validated, and that user accounts exist, and records row counts;
4. drops the scratch database and records a `restore_test` row.

Run one manually:

```sh
docker compose --profile backup run --rm -v /secure/vms-backup-key.txt:/run/age.key:ro \
  -e BACKUP_AGE_IDENTITY_FILE=/run/age.key --entrypoint restore-test.sh backup [path-to-backup]
```

### Restoring production

1. **Stop traffic.** Stop `dashboard`, `kiosk`, `worker` and `api` (`docker compose stop dashboard kiosk worker api`).
2. **Keep the broken state.** Take a backup of the current database if it is readable; you may need it for forensics.
3. **Decrypt** the chosen backup on a machine that holds the private key:
   `age -d -i vms-backup-key.txt -o restore.dump visitorhub-<stamp>.dump.age`
4. **Verify** that its SHA-256 matches `backup_runs.checksum` for that file.
5. **Restore into a new database, then swap** (inside the `db` container, after copying `restore.dump` into it with `docker compose cp`):
   ```sh
   createdb -U visitorhub visitorhub_restored
   pg_restore -U visitorhub --no-owner --no-privileges --exit-on-error -d visitorhub_restored /tmp/restore.dump
   psql -U visitorhub -d postgres -c "ALTER DATABASE visitorhub RENAME TO visitorhub_broken" \
                                 -c "ALTER DATABASE visitorhub_restored RENAME TO visitorhub"
   ```
   Delete `/tmp/restore.dump` afterwards. Keep `visitorhub_broken` until the incident is closed.
6. **Start the API only** (`docker compose up -d api`). Migrations bring an older backup up to the current schema.
7. **Reconcile** before reopening:
   `docker compose exec api python -m app.restore_reconcile --backup-taken-at <UTC time of the backup> --reason "<incident reference>"`
   This signs everyone out, runs retention (removing personal data again that had been anonymized or deleted after the backup was taken), runs the visit sweeps, and writes an audit entry.
8. **Validate.** `GET /api/v1/ops/health` must report `ok` (apart from backup age). Spot-check a recent visit, a user sign-in and a kiosk scan.
9. **Reopen** with `docker compose up -d`, and take a fresh backup.
10. **Re-enter lost changes.** Anything created between the backup and the failure is gone: visits, blacklist records, merges, password changes. Use the incident timeline to re-enter what matters. Kiosks paired after the backup must be re-paired.

### Backups and retention

Retention never edits backups. Personal data anonymized in the live database still exists in backups until they expire: about 1 month locally, and your off-site lifecycle policy (recommended at most 6 months) beyond that. Say so in the privacy notice; do not promise immediate erasure from backups. Step 7 above makes sure a restore cannot bring removed data back into service.

## 5. Monitoring

`GET /api/v1/ops/health` (Super Admin; also shown on the Dashboard's Retention tab) returns `ok` or `degraded` with a list of problems:

- a job whose last success is too old (3 intervals; 36 hours for retention), or whose last run failed;
- an outbox event pending for more than 5 minutes, or any dead-lettered events;
- email deliveries that failed in the last 24 hours (as a count);
- in production: no successful backup in 26 hours, a failed latest backup, or no restore test in 8 days;
- retention more than 7 days behind.

Point your uptime monitor at it with a Super Admin service account, and alert on `status != "ok"`. Also monitor `/api/v1/health` for liveness.

Dead-lettered outbox events: fix the cause (for example the email provider), then `POST /api/v1/ops/outbox/requeue {"event_ids": [...]}`.

## 6. Retention operations

- **Preview:** Dashboard → Super Admin → Retention → "Preview next run", or `GET /api/v1/retention/preview`, or `docker compose exec worker python -m app.worker --once retention --dry-run`. The counts are exact: the run is performed and rolled back.
- **Run now:** `docker compose exec worker python -m app.worker --once retention`.
- **Change a period:** edit the months on the Retention tab, or `PUT /api/v1/retention/policies`. Confirm the periods with whoever owns the privacy notice before going live (Q9).
- **Legal or investigation hold:** `POST /api/v1/retention/holds` with the visit or person, the hold type, a reason, a case reference and a review date within 12 months. Release or extend it with `POST /api/v1/retention/holds/{id}/release`; reviews are reminded weekly.

## 7. Emergency account recovery

If the normal email recovery cannot be used, for example because the only Super Admin has lost their mailbox, an operator with shell access can set a new password:

```sh
docker compose exec api python -m app.recovery --email admin@example.com --reason "Ticket OPS-123: mailbox lost"
```

It prompts for the new password, revokes all of that account's sessions, and records an authentication event plus an audit entry with the reason. Use it only under your organization's approved break-glass procedure.

## 8. Upgrades

1. Take a backup: `docker compose --profile backup run --rm backup --now`.
2. `docker compose up -d --build`. The API applies new migrations on start.
3. Check `GET /api/v1/ops/health`.

Every migration has a working `downgrade()` (`alembic downgrade <revision>`), but downgrades that drop new tables discard what was stored in them. The backup is the real rollback.

After a migration that changes tables, regenerate the schema reference:
`DATABASE_URL=… python scripts/generate_schema_doc.py`
