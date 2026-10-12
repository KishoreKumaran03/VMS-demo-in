# VisitorHub Visitor Kiosk

The kiosk uses the same API and PostgreSQL data as the staff dashboard.

## Run locally

Start PostgreSQL and the API using the [backend setup guide](../Backend/README.md). In this directory, run:

```sh
npm install
```

Create `.env.local` with the API address and the ID of the kiosk's site:

```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_KIOSK_SITE_ID=<site-id>
```

Then start the kiosk:

```sh
npm run dev -- --host 0.0.0.0 --port 3001
```

Open [http://localhost:3001](http://localhost:3001). Pass verification, check-in/out, and walk-in approval use the backend.

## Notes

- Phone OTP is simulated; no SMS is sent.
- Badge printing is a preview; no physical printer is connected.
- If QR scanning is unavailable in the browser, enter the pass code manually.

## Checks

```sh
npm test
npm run lint
npm run build
```

## Browser smoke tests

Playwright exercises the dashboard and kiosk together. Use a dedicated test database because visits created by the tests remain in its history. Start the API and both frontends, then create a test site-admin and host using the backend setup guide.

Set the test URLs and account details, then run:

```sh
export VMS_E2E_API_URL=http://127.0.0.1:8000/api/v1
export VMS_E2E_DASHBOARD_URL=http://127.0.0.1:3000
export VMS_E2E_KIOSK_URL=http://127.0.0.1:3001
export VMS_E2E_ADMIN_EMAIL='site-admin-test@example.com'
export VMS_E2E_ADMIN_PASSWORD='<test-password>'
export VMS_E2E_HOST_EMAIL='host-test@example.com'
export VMS_E2E_HOST_PASSWORD='<test-password>'
export VMS_E2E_HOST_EMPLOYEE_SUFFIX=1234
npx playwright install chromium
npm run test:e2e
```
