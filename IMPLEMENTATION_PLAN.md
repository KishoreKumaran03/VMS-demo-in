# VisitorHub implementation status

## Applications

- `Backend/` contains the FastAPI service, PostgreSQL models, Alembic migrations, role and site authorization, bootstrap/provisioning scripts, and Docker Compose services.
- `Frontend/Dashboard/` is the staff application for Super Admin, Site Admin, Host, and Receptionist. It authenticates through the API and reloads role-scoped PostgreSQL data.
- `Kiosk-FrontEnd/` is the visitor kiosk. Normal pass lookup, host lookup, walk-in, check-in, and check-out flows use the same API and database as the Dashboard.

## Local development

Use the steps in [Backend/README.md](Backend/README.md). Docker Compose applies Alembic migrations, waits for service health, and starts both frontends. `Backend/scripts/setup-demo.sh` requires an explicit `APP_ENV=development` and creates/reuses the three local demo accounts using the application's bootstrap and authenticated provisioning API.

`Backend/scripts/reset-dev-db.sh` verifies the Compose project, PostgreSQL database, and exact project volume before asking for an explicit reset phrase. It does not delete unrelated Docker data.

## Verification

The Kiosk package has unit tests for UI rendering. Its Playwright suite in `Kiosk-FrontEnd/e2e/` runs the actual staff Dashboard and kiosk against the configured HTTP API and PostgreSQL. Use that suite for visit lifecycle and role-permission verification; the unit fixtures and development-only demo panel are not production visitor records.

## Not connected

Phone OTP is simulated and sends no SMS. Badge printing is a preview. Physical gate, badge-reader, camera hardware, and database backup services are not configured by this prototype.
