#!/bin/sh
# Daily encrypted logical backups of the VisitorHub database.
#
#   1. pg_dump (custom format) to a private work directory
#   2. integrity check: pg_restore --list must read the whole archive; SHA-256 of the plaintext is recorded
#   3. encrypt to an age PUBLIC key (the private key never lives on this host) and move into BACKUP_DIR
#   4. optional off-site copy: BACKUP_COPY_COMMAND is run with the file path as $1
#   5. prune: keep BACKUP_KEEP_DAILY days of dailies and BACKUP_KEEP_WEEKLY Sunday backups
#   6. every run is recorded in backup_runs (status, size, checksum, error); GET /api/v1/ops/health alerts on failures/age
#   7. weekly (Sunday) restore test into a scratch database when BACKUP_AGE_IDENTITY_FILE is mounted
#
# Usage: backup.sh            run the daily loop (container entrypoint)
#        backup.sh --now      take one backup immediately and exit
set -eu

: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT to an age public key (age1...)}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_TIME="${BACKUP_TIME:-02:00}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
WORK="${BACKUP_WORK_DIR:-/work}"
umask 077
mkdir -p "$BACKUP_DIR" "$WORK"

# Run SQL from stdin with psql variables (values are quoted by psql, never spliced into the SQL text).
sql() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

record_start() {
  echo "INSERT INTO backup_runs (kind, status) VALUES (:'kind', 'running') RETURNING id" | sql -v kind="$1"
}

record_finish() { # id status location size checksum details_json error
  echo "UPDATE backup_runs SET status = :'status', finished_at = now(), location = NULLIF(:'location', ''),
          size_bytes = NULLIF(:'size', '')::bigint, checksum = NULLIF(:'checksum', ''), details = COALESCE(NULLIF(:'details', ''), '{}')::jsonb,
          error = NULLIF(:'error', '') WHERE id = :'id'" |
    sql -v id="$1" -v status="$2" -v location="$3" -v size="$4" -v checksum="$5" -v details="$6" -v error="$7" >/dev/null
}

prune() {
  now=$(date -u +%s)
  for file in "$BACKUP_DIR"/visitorhub-*.dump.age; do
    [ -e "$file" ] || continue
    stamp=$(basename "$file" | sed 's/^visitorhub-\(.*\)\.dump\.age$/\1/')
    taken=$(date -u -D %Y%m%dT%H%M%SZ -d "$stamp" +%s 2>/dev/null) || continue
    age_days=$(( (now - taken) / 86400 ))
    weekday=$(date -u -d "@$taken" +%u)
    if [ "$age_days" -lt "$KEEP_DAILY" ]; then continue; fi
    if [ "$weekday" = 7 ] && [ "$age_days" -lt $((KEEP_WEEKLY * 7)) ]; then continue; fi
    rm -f "$file"
    echo "pruned $file"
  done
}

backup_once() {
  id=$(record_start full)
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  plain="$WORK/visitorhub-$stamp.dump"
  final="$BACKUP_DIR/visitorhub-$stamp.dump.age"
  : > "$WORK/error"
  if pg_dump -Fc --no-owner --no-privileges -f "$plain" 2>>"$WORK/error" &&
     entries=$(pg_restore --list "$plain" 2>>"$WORK/error" | grep -c ';') &&
     checksum=$(sha256sum "$plain" | cut -d' ' -f1) &&
     age -r "$BACKUP_AGE_RECIPIENT" -o "$final.partial" "$plain" 2>>"$WORK/error" &&
     mv "$final.partial" "$final"; then
    rm -f "$plain"
    size=$(stat -c %s "$final")
    copied=false
    if [ -n "${BACKUP_COPY_COMMAND:-}" ]; then
      if sh -c "$BACKUP_COPY_COMMAND" copy "$final" 2>>"$WORK/error"; then copied=true; else
        record_finish "$id" failed "$final" "$size" "$checksum" "{\"archive_entries\": $entries}" "Backup written but off-site copy failed: $(head -c 800 "$WORK/error")"
        return 1
      fi
    fi
    record_finish "$id" succeeded "$final" "$size" "$checksum" "{\"archive_entries\": $entries, \"offsite_copy\": $copied}" ""
    echo "backup succeeded: $final ($size bytes)"
    prune
  else
    rm -f "$plain" "$final.partial"
    record_finish "$id" failed "" "" "" "" "$(head -c 900 "$WORK/error")"
    echo "backup FAILED: $(cat "$WORK/error")" >&2
    return 1
  fi
}

if [ "${1:-}" = "--now" ]; then
  backup_once
  exit $?
fi

until pg_isready -q; do sleep 2; done
until echo "SELECT 1 FROM backup_runs LIMIT 1" | sql >/dev/null 2>&1; do echo "waiting for migrations"; sleep 5; done
last_day=""
if [ "${BACKUP_ON_START:-true}" = "true" ]; then
  backup_once || true
  last_day=$(date -u +%F)
fi
while true; do
  today=$(date -u +%F)
  if [ "$today" != "$last_day" ] && [ "$(date -u +%H:%M)" \> "$BACKUP_TIME" -o "$(date -u +%H:%M)" = "$BACKUP_TIME" ]; then
    last_day="$today"
    if backup_once && [ "$(date -u +%u)" = 7 ] && [ -n "${BACKUP_AGE_IDENTITY_FILE:-}" ]; then
      restore-test.sh || true
    fi
  fi
  sleep 30
done
