# Backup sidecar: same PostgreSQL major version as the database (pg_dump must not be older than the server),
# plus `age` for public-key encryption. See docs/OPERATIONS.md.
FROM postgres:17-alpine
RUN apk add --no-cache age
COPY backup.sh restore-test.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-test.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
