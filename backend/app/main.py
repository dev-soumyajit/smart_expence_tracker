import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError
from .core.config import settings
from .core.db import engine
from .api import router

app = FastAPI(title="Morrowmint API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings().frontend_origins.split(",")], allow_credentials=False, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])


@app.middleware("http")
async def protect(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > 600_000):
        return JSONResponse({"detail": "Request body too large"}, status_code=413)
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 600_000:
                return JSONResponse({"detail": "Request body too large"}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(IntegrityError)
async def conflict(_, error):
    return JSONResponse({"detail": "Conflicting record. Refresh and retry with the original idempotency key."}, status_code=409)


@app.exception_handler(OperationalError)
async def unavailable(_, error):
    return JSONResponse({"detail": "Database temporarily unavailable. Please retry shortly."}, status_code=503)


@app.exception_handler(Exception)
async def internal_error(_, error):
    logging.getLogger("paisasense").error("Unhandled request error: %s", type(error).__name__)
    return JSONResponse({"detail": "Something went wrong. Please try again."}, status_code=500)


@app.get("/health")
def health():
    return {"status": "ok", "service": "paisasense"}


@app.get("/ready")
def ready():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready"}


app.include_router(router)
