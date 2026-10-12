# VisitorHub API

FastAPI service shared by the staff dashboard (`Frontend/Dashboard`) and visitor kiosk (`Kiosk-FrontEnd`). The API uses PostgreSQL, SQLAlchemy, and Alembic. All times are stored as UTC timestamps.

## Local setup

1. Create a PostgreSQL database and role, then copy `.env.example` to `.env` and set `DATABASE_URL` and a unique `JWT_SECRET`.
2. Install dependencies with `python -m pip install -r requirements.txt`.
3. Apply the schema with `alembic -c alembic.ini upgrade head` from this directory.
4. Start the API with `uvicorn app.main:app --reload --port 8000` from this directory.
5. Open `/docs` for the API schema and `/api/v1/health` for a health check.

To run PostgreSQL and the API with Compose, copy `.env.example` to `.env`, replace both passwords/secrets with unique values, and run `docker compose up --build` from `Backend/`. The API container applies migrations before starting.

There is deliberately no default administrator account. After migrations, create the first organization, site, and Super Admin interactively:

```sh
python -m app.bootstrap --organization "Example Organization" --site "Main Office" --email admin@example.com --name "Platform Admin"
```

The bootstrap asks for the password twice and stores only its Argon2 hash. The browser clients must not receive database credentials or JWT signing secrets. Subsequent host, site, and account setup is through role-protected API endpoints.

## API outline

- `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
- Organization, site, host, and user account management under `/api/v1/organizations`, `/api/v1/sites`, `/api/v1/hosts`, and `/api/v1/users`
- `GET /api/v1/hosts`, `GET /api/v1/visits`, `POST /api/v1/visits`
- `POST /api/v1/visits/{id}/approve`, `POST /api/v1/visits/{id}/revoke`
- Kiosk pass lookup and check-in/out under `/api/v1/kiosk/pass/{pass_code}`
- `POST /api/v1/kiosk/walk-ins`, `GET /api/v1/dashboard/summary`, `GET /api/v1/notifications`, `GET /api/v1/audit`

Roles and organization/site scope are enforced in API dependencies and queries. Pass codes are high-entropy bearer secrets; only their SHA-256 digests are stored. Do not log pass codes.
