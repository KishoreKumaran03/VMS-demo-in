# VisitorHub implementation status

## Applications

- `Backend/` contains:
  - the FastAPI service;
  - the background worker;
  - the PostgreSQL schema (Alembic migrations 0001–0008);
  - role, permission and site authorization;
  - the encrypted backup sidecar;
  - operator commands;
  - Docker Compose services.
- `Frontend/Dashboard/` is the staff application for Super Admin, Site Admin, Host and Receptionist. It authenticates through the API and reloads role-scoped PostgreSQL data. Administrators also manage kiosks, security reviews, restricted-entry records, retention and system health there.
- `Kiosk-FrontEnd/` is the visitor kiosk. It must be paired with a one-time code from the Dashboard. After that, pass lookup, host lookup, walk-ins, check-in and check-out use the same API and database as the Dashboard, limited to the kiosk's site.

## Documentation

- [Backend/README.md](Backend/README.md): local development, demo data, tests
- [Backend/docs/BACKEND.md](Backend/docs/BACKEND.md): architecture, data model, rules, API reference
- [Backend/docs/SCHEMA.md](Backend/docs/SCHEMA.md): generated table reference
- [Backend/docs/OPERATIONS.md](Backend/docs/OPERATIONS.md): configuration, backups and restores, monitoring, recovery
- [Backend/docs/DATABASE_DESIGN.md](Backend/docs/DATABASE_DESIGN.md): design decisions and implementation report

## Verification

- `Backend/tests`: pytest against a disposable PostgreSQL, covering migrations, authentication, scoping, visits, passes, security, retention and the sync feed.
- `Kiosk-FrontEnd/src/test`: kiosk UI unit tests.
- `Kiosk-FrontEnd/e2e/`: Playwright, running the real Dashboard and kiosk against the HTTP API and PostgreSQL.

## Not connected

- No email or SMS provider. Development prints emails to the container output; phone OTP is simulated.
- Badge printing is a browser preview. Gate and badge-reader hardware is not integrated.
- Off-site backup storage is a configurable copy command; production point-in-time recovery depends on the hosting choice.
