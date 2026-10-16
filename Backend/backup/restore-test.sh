#!/bin/sh
# Restore test: proves the newest backup can actually be restored, without touching the live database.
#
#   decrypt (needs BACKUP_AGE_IDENTITY_FILE, the age private key) -> verify SHA-256 against backup_runs
#   -> restore into a scratch database -> check schema version, constraints and row counts -> drop scratch
#   -> record a backup_runs row with kind = 'restore_test'.
#
# Usage: restore-test.sh [backup-file]   (default: newest file in BACKUP_DIR)
set -eu
: "${BACKUP_AGE_IDENTITY_FILE:?Mount the age private key and set BACKUP_AGE_IDENTITY_FILE}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
WORK="${BACKUP_WORK_DIR:-/work}"
umask 077
sql() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

file="${1:-$(ls -1t "$BACKUP_DIR"/visitorhub-*.dump.age 2>/dev/null | head -n 1)}"
[ -n "$file" ] && [ -f "$file" ] || { echo "No backup file found" >&2; exit 1; }
scratch="restore_test_$(date -u +%Y%m%d%H%M%S)"
id=$(echo "INSERT INTO backup_runs (kind, status, location) VALUES ('restore_test', 'running', :'file') RETURNING id" | sql -v file="$file")
finish() {
  echo "UPDATE backup_runs SET status = :'status', finished_at = now(), details = COALESCE(NULLIF(:'details', ''), '{}')::jsonb,
          error = NULLIF(:'error', '') WHERE id = :'id'" | sql -v id="$id" -v status="$1" -v details="$2" -v error="$3" >/dev/null
}
cleanup() { rm -f "$WORK/restore.dump"; dropdb --if-exists "$scratch" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { finish failed "" "$1"; echo "restore test FAILED: $1" >&2; exit 1; }

age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "$WORK/restore.dump" "$file" || fail "decryption failed"
expected=$(echo "SELECT checksum FROM backup_runs WHERE kind = 'full' AND location = :'file' AND status = 'succeeded'" | sql -v file="$file")
actual=$(sha256sum "$WORK/restore.dump" | cut -d' ' -f1)
[ -z "$expected" ] || [ "$expected" = "$actual" ] || fail "checksum mismatch (expected $expected, got $actual)"
createdb "$scratch" || fail "could not create scratch database"
pg_restore --no-owner --no-privileges --exit-on-error -d "$scratch" "$WORK/restore.dump" 2>"$WORK/restore.err" || fail "pg_restore: $(head -c 800 "$WORK/restore.err")"

restored_version=$(sql -d "$scratch" -c "SELECT version_num FROM alembic_version")
invalid=$(sql -d "$scratch" -c "SELECT count(*) FROM pg_constraint WHERE NOT convalidated")
counts=$(sql -d "$scratch" -c "SELECT json_build_object('organizations', (SELECT count(*) FROM organizations), 'users', (SELECT count(*) FROM users),
  'people', (SELECT count(*) FROM people), 'visits', (SELECT count(*) FROM visits), 'audit_logs', (SELECT count(*) FROM audit_logs))")
[ -n "$restored_version" ] || fail "restored database has no schema version"
[ "$invalid" = 0 ] || fail "$invalid constraints are not validated in the restored database"
users=$(sql -d "$scratch" -c "SELECT count(*) FROM users")
[ "$users" -gt 0 ] || fail "restored database has no user accounts"
finish succeeded "{\"schema_version\": \"$restored_version\", \"checksum\": \"$actual\", \"row_counts\": $counts}" ""
echo "restore test succeeded: $file -> schema $restored_version, $counts"
