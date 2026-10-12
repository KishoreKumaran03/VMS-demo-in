# VisitorHub local development

VisitorHub runs three services against one PostgreSQL database: the FastAPI backend, staff Dashboard, and visitor kiosk. The Dashboard and kiosk use the same persisted visits, passes, hosts, and sites.

## Requirements

- Docker Desktop with Docker Compose v2
- Node.js 22 and npm for Playwright browser tests
- macOS, Linux, or Windows with WSL/Git Bash for the shell scripts

## Configure and start

From the repository root, create a local environment file and set private values:

```sh
cp Backend/.env.example Backend/.env
```

Set `POSTGRES_PASSWORD` and `JWT_SECRET` to strong local values. The Compose API builds a PostgreSQL connection URL safely from the password, including passwords with URL punctuation. `INITIAL_SETUP_KEY` is needed only if you want to bootstrap the first Super Admin from the login page; it is not needed for the demo setup command below. Keep `Backend/.env` private; it is ignored by Git.

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

The API applies Alembic migrations on startup. PostgreSQL is the only application database. The development kiosk site UUID is `00000000-0000-4000-8000-000000000001`; Compose builds the kiosk with that value unless `VITE_KIOSK_SITE_ID` is set to another site.

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

The login page's **First-time setup** is an alternative for creating only the initial Super Admin. It requires `INITIAL_SETUP_KEY` and closes after the first user exists. For a complete three-account demo with a kiosk-ready site ID, use the setup script above on a clean development database.

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

## Browser end-to-end tests

The Playwright suite runs the actual Dashboard and kiosk in Chromium against the running API and PostgreSQL. It creates unique test visits, checks them in/out at the kiosk, tests a kiosk walk-in approval, and checks authenticated role permissions. It expects the demo accounts above. The test-created visits remain in the database; use the reset script when you want a clean test run.

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

The API and PostgreSQL still run in Docker. Start the Dashboard with `cd Frontend/Dashboard && npm ci && npm run dev -- --port 3000`; start the kiosk with `cd Kiosk-FrontEnd && npm ci && npm run dev -- --host 0.0.0.0 --port 3001`. Both use `http://localhost:8000/api/v1` by default. For local changes to the kiosk site ID, set `VITE_KIOSK_SITE_ID` before building or starting Vite.

## Notes

- Phone OTP is simulated in the kiosk prototype; no SMS service is configured.
- Badge printing is a browser preview. No physical printer, gate, or reader is connected.
- `scripts/provision_local_accounts.py` prompts for account passwords and uses authenticated APIs. `scripts/provision_e2e_accounts.py` supports test-only environments.
- Never run demo setup commands against a production database.
