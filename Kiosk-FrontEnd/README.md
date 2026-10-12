# VisitorHub kiosk

The kiosk uses the shared FastAPI and PostgreSQL services. Pass lookup, host lookup, walk-in creation, approval status, check-in, and check-out are sent to the backend.

## Run with Docker Compose

Follow [Backend setup](../Backend/README.md) to configure the environment, start all services, and create the demo accounts. The kiosk opens at [http://localhost:3001](http://localhost:3001). Its development site UUID is `00000000-0000-4000-8000-000000000001`.

## Run outside Docker

Start PostgreSQL and the API with Docker Compose, then run:

```sh
cd Kiosk-FrontEnd
npm ci
cp .env.example .env.local
npm run dev -- --host 0.0.0.0 --port 3001
```

Set `VITE_KIOSK_SITE_ID` to the active site UUID assigned to this kiosk. Vite reads it at startup/build time. `VITE_API_URL` defaults to `http://localhost:8000/api/v1`.

## Checks

```sh
npm test
npm run lint
npm run build
```

The browser end-to-end suite exercises the live Dashboard, API, kiosk, and PostgreSQL database. Follow the test instructions in [Backend setup](../Backend/README.md); do not treat mocked component tests as end-to-end verification.

## Limitations

- The phone OTP is simulated; no SMS provider is configured.
- Badge printing is a preview. No physical printer, gate, or reader is connected.
- `src/kiosk/data.ts` has sample objects for unit-rendering tests and the development-only demo panel. Normal pass, host, and walk-in workflows use API responses and do not fall back to those samples.
