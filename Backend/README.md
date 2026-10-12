# VisitorHub API

FastAPI backend shared by the staff dashboard and visitor kiosk. PostgreSQL stores application data.

## Start with Docker Compose

1. Make sure Docker Desktop is running.
2. In `Backend/`, create `.env` from `.env.example` if needed. Set a strong `POSTGRES_PASSWORD` and `JWT_SECRET`. Keep this file private.
3. Start PostgreSQL, the API, the staff dashboard, and the visitor kiosk:

   ```sh
   docker compose up --build -d
   ```

From the repository root on Windows, use `start-docker.bat` to build and start the services, and `stop-docker.bat` to stop them. The stop script preserves the PostgreSQL data volume.

Open the dashboard at [http://localhost:3000](http://localhost:3000), the kiosk at [http://localhost:3001](http://localhost:3001), the API health check at [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health), or the API docs at [http://localhost:8000/docs](http://localhost:8000/docs).

On a **new PostgreSQL data volume**, the Postgres image creates the VisitorHub tables from `database/schema.sql`. The API then runs Alembic on startup; the SQL bootstrap records the initial revision, so Alembic can apply later migrations normally. Existing volumes are not reinitialized by the Postgres image, and continue to use Alembic migrations. Keep the SQL bootstrap aligned with `migrations/versions/0001_initial.py` when changing the initial schema.

The schema covers organizations, sites, staff users and roles, hosts, visitors, visits and pass lifecycle, consent timestamps, audit events, and notifications. PostgreSQL UUIDs and timezone-aware timestamps are used throughout. Check the API at [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health). Open [http://localhost:8000/docs](http://localhost:8000/docs) to explore the API.

## Create accounts

There is no default login. To create the first Super Admin from the dashboard login page, set a private one-time key in `Backend/.env`:

```env
INITIAL_SETUP_KEY=use-a-long-random-secret-here
```

Start the services and choose **First-time setup** on the login page. Enter the key, organization, first site, and admin details. This creates the organization, site, and Super Admin together. Signup only works while there are no user accounts; after the first account is created, the endpoint refuses further signup. Keep the key private and remove it from `.env` after setup.

You can also create the first organization, site, and Super Admin with the CLI:

```sh
docker compose exec api python -m app.bootstrap \
  --organization "Example Organization" \
  --site "Main Office" \
  --email admin@example.com \
  --name "Platform Admin"
```

The command prompts for the admin password and prints the new site ID. Use either first-time setup method, not both. Set `VITE_KIOSK_SITE_ID` in `Backend/.env` to that site ID, then rebuild the kiosk so the site assignment is included in the frontend bundle:

```sh
docker compose up --build -d kiosk
```

To create a site administrator and a host account with its kiosk directory entry:

```sh
docker compose exec api python scripts/provision_local_accounts.py \
  --setup-email admin@example.com \
  --site-id '<site-id>' \
  --admin-email site-admin@example.com --admin-name "Site Admin" \
  --host-email host@example.com --host-name "Example Host" \
  --employee-id EMP-1234 --department Engineering
```

This command prompts for the existing Super Admin password and both new account passwords. Once signed in, Super Admins can create site admins, other Super Admins, hosts, and receptionists from the dashboard **Accounts** tab. Site admins can create hosts and receptionists for their own site from **Account management**. These forms call the backend account APIs, which enforce the role and site permissions. Hosts cannot grant themselves admin access.

## Run the frontends without Docker

From the repository root, start the dashboard in one terminal:

```sh
cd Frontend/Dashboard
npm install
npm run dev -- --port 3000
```

Then start the kiosk in another terminal:

```sh
cd Kiosk-FrontEnd
npm install
npm run dev -- --host 0.0.0.0 --port 3001
```

Set `VITE_KIOSK_SITE_ID` in `Kiosk-FrontEnd/.env.local` to the site ID. Open the dashboard at [http://localhost:3000](http://localhost:3000) and the kiosk at [http://localhost:3001](http://localhost:3001). Both use `http://localhost:8000/api/v1` by default.

## Browser smoke tests

Run Playwright only against a dedicated test database and test accounts. Test visits remain in the database for audit history. See the kiosk README for the test command and required environment variables.
