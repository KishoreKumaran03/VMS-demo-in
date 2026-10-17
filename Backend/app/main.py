"""VisitorHub API application: middleware, error handling and router registration."""
import time
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from .config import get_settings
from .database import get_db
from .routers import activity, auth, devices, hosts, kiosk, ops, organizations, retention, security, sync, users, visits
from .routers.common import client_ip
from .services import audit

app = FastAPI(title="VisitorHub API", version="2.0.0", openapi_url="/api/v1/openapi.json")
app.add_middleware(
    CORSMiddleware, allow_origins=get_settings().allowed_origins, allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Device-Key", "X-Request-ID"], expose_headers=["X-Request-ID"],
)

_request_counts: dict[str, tuple[int, float]] = {}


@app.middleware("http")
async def limit_public_kiosk_requests(request: Request, call_next):
    """Coarse per-process flood guard for kiosk routes. Pairing and sign-in have their own database-backed limits."""
    if request.url.path.startswith("/api/v1/kiosk/"):
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        count, started = _request_counts.get(ip, (0, now))
        if now - started >= 60:
            count, started = 0, now
        if count >= 120:
            return JSONResponse(status_code=429, content={"detail": "Too many kiosk requests. Please try again shortly."})
        _request_counts[ip] = (count + 1, started)
    return await call_next(request)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Correlation id (from X-Request-ID or generated) and client IP for audit rows written during this request."""
    request_id = (request.headers.get("x-request-id") or uuid.uuid4().hex)[:64]
    tokens = (audit.correlation_id.set(request_id), audit.request_ip.set(client_ip(request)))
    try:
        response = await call_next(request)
    finally:
        audit.correlation_id.reset(tokens[0])
        audit.request_ip.reset(tokens[1])
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(StaleDataError)
async def concurrent_update(_request: Request, _exc: StaleDataError):
    return JSONResponse(status_code=409, content={"detail": "This record was changed by someone else. Reload and try again."})


@app.get("/api/v1/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "visitorhub-api"}


for module in (auth, organizations, users, hosts, visits, kiosk, devices, security, retention, activity, ops, sync):
    app.include_router(module.router)
