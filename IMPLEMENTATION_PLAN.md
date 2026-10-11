# VisitorHub implementation plan

## Repository map and current state

- `Frontend/Dashboard` is the staff-facing React dashboard for Super Admin, Site Admin, Host, and Receptionist. Its `VmsContext` owns seeded passes, sites, notifications, audit events, and role selection in browser `localStorage`; page actions update that local state. The login flow is demo-only.
- `Kiosk-FrontEnd` is the visitor-facing React/TypeScript kiosk. It already has home, invitation lookup, walk-in, host selection, consent, sign-in, sign-out, help, and badge screens. Passes and host records are seeded in `src/kiosk/data.ts`; visit state is in kiosk memory. It does not call a backend. Existing kiosk tests cover presentation and routing, not persisted visitor lifecycle behavior.
- `Demo VMS` is a separate vanilla-JS prototype. Its `server.js` only serves static assets and its application stores its own demo records in browser storage. Do not treat it as the staff or kiosk app, and do not integrate a second source of truth from it.
- No backend, database, migrations, API client, or shared authentication implementation exists in the repository.

## Target architecture

Add one versioned FastAPI service under `Backend/`, with PostgreSQL, SQLAlchemy, and Alembic. Both React applications call this service. Keep the existing dashboard and kiosk designs and route structures. Make the backend authoritative for identity, role/scope enforcement, visitors, visits, passes, host directory, check-in/out, notifications, and audit records. Use REST for reads and commands; begin with controlled polling for dashboard refresh/recovery, and adopt SSE only where the backend and authorization model are established. Do not add Redis, a worker, or external delivery services until a real requirement and configuration exist.

## Phases

1. **Audit and contract** — preserve this repository map; inventory each page action and kiosk transition; define shared API schemas, roles, and visit state transitions.
2. **Backend foundation** — add FastAPI app, configuration, database session, models, Alembic migrations, health endpoint, validation/error format, and secure authentication primitives.
3. **Core operations** — implement scoped host/user, visitor, visit, site, and pass APIs; transactional invitation approval, pass issuance/revocation, check-in/out, and audit events; pagination and filters.
4. **Dashboard integration** — replace `VmsContext`'s demo persistence and hardcoded operational metrics with authenticated API queries/mutations; retain current views and surface request states/errors.
5. **Kiosk integration** — preserve kiosk screens, route pass lookup, host search, walk-in creation, verification, and check-in/out through the shared API; clear temporary visitor data on idle reset; handle API, camera, and printer outcomes independently.
6. **Synchronization and notifications** — poll authorized dashboard queries initially with deduplication and refetch on reconnect; add role-scoped notifications and audit history. Revisit SSE only if polling is inadequate.
7. **Verification and documentation** — add backend and frontend integration tests for permissions and visitor lifecycle, run existing test/build scripts, document environment setup, migrations, and local development.

## Implementation constraints and decisions

- The kiosk is not missing: its interface exists; the missing part is integration with a shared backend.
- `Frontend` and `Kiosk-FrontEnd` remain separate clients, with `Frontend` reserved for staff/admin operations and `Kiosk-FrontEnd` for visitor self-service.
- `Demo VMS` remains an isolated prototype unless a later migration is explicitly requested.
- Use environment-based secrets and database URLs. No real visitor data or secrets in fixtures.
- Implement in small, reviewable increments and avoid deleting or replacing existing UI.

## Delivery status

- **Backend:** Implemented the FastAPI/PostgreSQL service, Alembic schema, scoped JWT authentication, organization/site/user/host and visitor/visit endpoints, pass issuance and revocation, kiosk check-in/out, consent capture, audit events, notifications, dashboard summary, bootstrap command, and Docker Compose setup.
- **Staff dashboard:** `Frontend/Dashboard` now authenticates against the API and loads visits, sites, hosts, audit events, notifications, and summary metrics from it. Its primary visit approval, pass, and reception flows write through to the API. The folder remains the staff/admin application.
- **Visitor kiosk:** `Kiosk-FrontEnd` now verifies real backend passes, checks visitors in/out, searches the configured site’s live host directory, and submits/polls consented walk-in requests. Its state no longer seeds operational visits. The folder remains visitor-facing.
- **Verification:** Backend lifecycle tests, kiosk tests, TypeScript lint, both frontend production builds, Python compilation, and offline Alembic SQL generation have been run successfully. Kiosk ESLint reports repository-wide CRLF/Prettier errors in the existing source tree; no broad line-ending rewrite was applied.
- **Not configured:** A real PostgreSQL deployment, SMS/email delivery (including real OTP), and badge printer/reader integrations need deployment credentials/services. Walk-in no longer presents a fake OTP step. Some existing dashboard pages still display placeholders for hardware metrics and detailed site capacity because the backend has no corresponding integration data.
