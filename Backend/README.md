# VisitorHub local development

VisitorHub runs against one PostgreSQL database:

- the FastAPI backend;
- a background worker (notification delivery, visit sweeps, retention);
- the staff Dashboard;
- the visitor kiosk;
- optionally, an encrypted backup service.

The Dashboard and kiosk use the same persisted visits, passes, hosts and sites.

Documentation:

- [docs/BACKEND.md](docs/BACKEND.md): architecture, data model, rules and API reference
- [docs/SCHEMA.md](docs/SCHEMA.md): every table, generated from the database
- [docs/OPERATIONS.md](docs/OPERATIONS.md): configuration, backups and restores, monitoring, recovery
- [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md): design decisions and implementation report

## Requirements

- Docker Desktop with Docker Compose v2
- Node.js 22 and npm for Playwright browser tests
- macOS, Linux, or Windows with WSL/Git Bash for the shell scripts

## Configure and start

From the repository root, create a local environment file and set private values:

```sh
cp Backend/.env.example Backend/.env
```

Set `POSTGRES_PASSWORD`, `JWT_SECRET`, `TOKEN_PEPPER` and `PASS_ENCRYPTION_KEY` to strong, different local values (`openssl rand -hex 32` works). Compose refuses to start without them. [docs/OPERATIONS.md](docs/OPERATIONS.md#2-configuration) explains each one and what rotating it does. The Compose API builds a PostgreSQL connection URL safely from the password, including passwords with URL punctuation. `INITIAL_SETUP_KEY` is needed only if you want to bootstrap the first Super Admin from the login page; it is not needed for the demo setup command below. Keep `Backend/.env` private; it is ignored by Git.

Start all services:

```sh
./start-docker.sh
```

On Windows, use `start-docker.bat`. Compose waits for PostgreSQL and the migrated API to become healthy before starting the frontends.

Open:

- Dashboard: [http://localhost:3000](http://localhost:3000)
- Kiosk: [http://localhost:3001](http://localhost:3001)
- API health: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

The API applies Alembic migrations on startup, and the worker starts once the API is healthy. PostgreSQL is the only application database.

**Pairing the kiosk.** The kiosk shows a pairing screen until an administrator pairs it. In the Dashboard, go to Kiosks (Site Admin page, or the Super Admin "Kiosks" tab) and choose **Register kiosk**. Type the 8-character code on the kiosk within 15 minutes. The kiosk then works only for that site. The demo setup below prints a code for you.

## Create the three demo accounts

After the services are healthy, run the explicitly development-only setup script:

```sh
APP_ENV=development ./Backend/scripts/setup-demo.sh
```

It creates or reuses the `VisitorHub Demo` organization, the `Main Office` site, and these accounts:

| Role | Login email | Site |
| --- | --- | --- |
| Super Admin | `superadmin@visitorhub.example.com` | Platform-wide |
| Site Admin | `siteadmin@visitorhub.example.com` | Main Office |
| Host | `host@visitorhub.example.com` | Main Office, employee `EMP-1234` |

The script prompts you to choose passwords (12 or more characters). It prints no passwords. If run again, it reuses matching accounts and does not create duplicates. The Host account and active host-directory row are created together through the authenticated API. Use the same emails and passwords to sign in to the Dashboard.

The script ends by printing a **kiosk pairing code** for a "Lobby kiosk" at Main Office. Open the kiosk and enter it. Running the script again prints a fresh code and re-pairs that kiosk.

The login page's **First-time setup** is an alternative for creating only the initial Super Admin. It requires `INITIAL_SETUP_KEY` and closes after the first user exists. For the complete demo, use the setup script above on a clean development database.

From the Dashboard, Super Admins can create site admins, Super Admins, hosts, and receptionists. Site Admins can create hosts and receptionists within their site. API authorization enforces these roles and boundaries.

## Stop and reset the development database

Stop services while preserving PostgreSQL data:

```sh
./stop-docker.sh
```

On Windows, `stop-docker.bat` does the same. To delete only this project's development database and start fresh, run:

```sh
cd Backend
./scripts/reset-dev-db.sh
```

The script verifies the Compose project, database name, and exact `backend_visitorhub-postgres` volume, then asks you to type `RESET VISITORHUB DEVELOPMENT DATABASE`. It removes only that project volume, then rebuilds and starts the services. It does not remove Docker images or unrelated volumes. After the API is healthy, run the demo setup command again.

## Password recovery

- Users reset their own password from an emailed, single-use link (`POST /api/v1/auth/password-reset`, then `/auth/password-reset/complete`). Links last 30 minutes, or 15 for administrators. A new request cancels the previous link.
- Choose **Forgot password?** on the sign-in page. No email provider is connected yet. With `APP_ENV=development` and `EMAIL_DELIVERY=console` (the `.env.example` defaults), emails are printed to the container output instead. Find reset links with `docker compose logs api | grep "reset-password"`, and notification emails with `docker compose logs worker | grep "dev email"`. Any other setting sends nothing.
- Site and Super Admins can start a reset for accounts they manage (`POST /api/v1/users/{id}/password-reset`). The link goes to the account holder; the admin never sees it.
- Break-glass recovery for an operator with server access, for example when the only Super Admin has lost their mailbox. It is audited and signs the account out everywhere:

  ```sh
  docker compose exec api python -m app.recovery --email admin@example.com --reason "Ticket OPS-123: mailbox lost"
  ```
- Signed-in users change their password from the account menu (**Change password**). Their other sessions are signed out.

## Backend tests

The pytest suite runs against a disposable PostgreSQL database and rebuilds its schema with Alembic. It refuses to run unless the database name contains `test`, so it cannot touch your development data.

```sh
docker run -d --name vms-test-pg -e POSTGRES_USER=visitorhub -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=visitorhub_test -p 55432:5432 postgres:17-alpine
cd Backend
python3 -m venv .venv && .venv/bin/pip install -r dev-requirements.txt
TEST_DATABASE_URL=postgresql+psycopg://visitorhub:testpass@localhost:55432/visitorhub_test .venv/bin/pytest
```

## Worker and backups

- The `worker` service runs scheduled jobs: email delivery every 5 seconds, no-show and overdue checks every minute, blacklist maintenance hourly, retention daily at 02:30 UTC. See its activity with `docker compose logs worker`, or with `GET /api/v1/ops/health` as a Super Admin (also shown on the Dashboard's Retention tab).
- Run a job now: `docker compose exec worker python -m app.worker --once retention --dry-run` (drop `--dry-run` to apply it).
- Backups are opt-in locally: set `BACKUP_AGE_RECIPIENT`, then run `docker compose --profile backup up -d backup`. [docs/OPERATIONS.md](docs/OPERATIONS.md#4-backups) covers key setup, restore tests and the restore procedure.

## Browser end-to-end tests

The Playwright suite runs the actual Dashboard and kiosk in Chromium against the running API and PostgreSQL. It covers:

- role permissions;
- the visit lifecycle across both frontends: invitation, approval, kiosk check-in and check-out, a walk-in approval;
- pairing a kiosk from the Dashboard;
- the security review workflow.

Each test pairs its own kiosk through the API. It expects the demo accounts above. The test-created records remain in the database; use the reset script when you want a clean test run.

Install browser dependencies:

```sh
cd Kiosk-FrontEnd
npm ci
npx playwright install chromium
```

Set the emails, passwords you chose, and the demo site UUID in your shell, then run:

```sh
export VMS_E2E_SUPERADMIN_EMAIL=superadmin@visitorhub.example.com
export VMS_E2E_SUPERADMIN_PASSWORD='<password you chose>'
export VMS_E2E_ADMIN_EMAIL=siteadmin@visitorhub.example.com
export VMS_E2E_ADMIN_PASSWORD='<password you chose>'
export VMS_E2E_HOST_EMAIL=host@visitorhub.example.com
export VMS_E2E_HOST_PASSWORD='<password you chose>'
export VMS_E2E_HOST_EMPLOYEE_SUFFIX=1234
export VMS_E2E_SITE_ID=00000000-0000-4000-8000-000000000001
npm run test:e2e
```

The URLs default to the local Compose ports. They can be changed with `VMS_E2E_DASHBOARD_URL`, `VMS_E2E_KIOSK_URL`, and `VMS_E2E_API_URL`.

## Run frontends outside Docker

The API and PostgreSQL still run in Docker. Start the Dashboard with `cd Frontend/Dashboard && npm ci && npm run dev -- --port 3000`; start the kiosk with `cd Kiosk-FrontEnd && npm ci && npm run dev -- --host 0.0.0.0 --port 3001`. Both use `http://localhost:8000/api/v1` by default. Pair the kiosk as described above.

## Notes

- Phone OTP is simulated in the kiosk prototype; no SMS service is configured.
- After adding a migration, regenerate the schema reference: `DATABASE_URL=… python scripts/generate_schema_doc.py`.
- Badge printing is a browser preview. No physical printer, gate, or reader is connected.
- `scripts/provision_local_accounts.py` prompts for account passwords and uses authenticated APIs. `scripts/provision_e2e_accounts.py` supports test-only environments.
- Never run demo setup commands against a production database.
