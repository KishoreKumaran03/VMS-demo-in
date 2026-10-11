# VMS Phase 1

A frontend-only visitor management experience for Hosts, Administrators, and the self-service kiosk. Visitor tasks, passes, visits, and activity are stored in this browser.

## Run locally

Requires Node.js. From this folder, run:

```sh
node server.js
```

Open <http://127.0.0.1:4173>. The server supports direct routes such as `/host/dashboard`, `/admin/requests`, and `/kiosk`, including after refresh. Set `PORT` to use another local port.

## Workspaces

- Host: Arjun Kumar, People Operations
- Admin: Visitor operations administrator
- Kiosk: available at `/kiosk` without signing in

The kiosk verification screen accepts `246810`. Active QR passes support repeated arrivals and departures until revoked, completed, or expired. Use **Clear records** from the kiosk to restore the original visitor tasks and clear the selected role.

All data and role selection are local to the browser. No backend, external service, camera, or printer is used.
