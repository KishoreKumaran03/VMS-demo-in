# VisitorHub Staff Dashboard

The dashboard uses the VisitorHub API for accounts, visits, approvals, and notifications.

## Run locally

Start PostgreSQL and the API using the [backend setup guide](../../Backend/README.md). Then, in this directory, run:

```sh
npm install
npm run dev -- --port 3000
```

Open [http://localhost:3000](http://localhost:3000) and sign in with an account created in the backend. The selected portal does not change a user's role.

The API address defaults to `http://localhost:8000/api/v1`. To change it, set `VITE_API_URL` in `.env.local`.

## Checks

```sh
npm run lint
npm run build
```

Badge printing opens the browser print dialog. No physical printer is connected.
