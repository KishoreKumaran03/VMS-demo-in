# VisitorHub staff Dashboard

The React Dashboard authenticates with the FastAPI service and reads and writes visits, hosts, sites, accounts, notifications, and audit records in PostgreSQL.

## Run with Docker Compose

Use the [Backend setup guide](../../Backend/README.md) to create `Backend/.env`, start PostgreSQL and the API, and provision the demo accounts. Open [http://localhost:3000](http://localhost:3000) and sign in with one of the provisioned accounts.

## Run the Dashboard outside Docker

Keep PostgreSQL and the API running in Docker, then run:

```sh
cd Frontend/Dashboard
npm ci
npm run dev -- --port 3000
```

`VITE_API_URL` defaults to `http://localhost:8000/api/v1`. Set it in `.env.local` if your API uses another address. On sign-in, the Dashboard restores the API token, loads data for the signed-in role, and clears an invalid or expired session.

Super Admins create accounts from the **Accounts** tab. Site Admins create hosts and receptionists from **Account management**. Host creation goes through the API endpoint that writes both the login account and host-directory record.

## Checks

```sh
npm run lint
npm run build
```

The live browser end-to-end tests for the Dashboard and kiosk are documented in the [Backend setup guide](../../Backend/README.md).
