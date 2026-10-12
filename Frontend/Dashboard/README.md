# VisitorHub Staff Dashboard

The dashboard uses the VisitorHub API for accounts, visits, approvals, and notifications.

## Run locally

Start PostgreSQL and the API using the [backend setup guide](../../Backend/README.md). Then, in this directory, run:

```sh
npm install
npm run dev -- --port 3000
```

Open [http://localhost:3000](http://localhost:3000). On a new database, use **First-time setup** with the one-time `INITIAL_SETUP_KEY` configured in `Backend/.env` to create the organization, first site, and Super Admin. After setup is complete, use **Sign in** with an account created by an administrator. The selected portal does not change a user's role.

Super Admins can add site admins, Super Admins, hosts, and receptionists from the **Accounts** tab. Site admins can add hosts and receptionists for their site from **Account management** on their dashboard. The backend verifies permissions for every account request.

The API address defaults to `http://localhost:8000/api/v1`. To change it, set `VITE_API_URL` in `.env.local`.

## Checks

```sh
npm run lint
npm run build
```

Badge printing opens the browser print dialog. No physical printer is connected.
