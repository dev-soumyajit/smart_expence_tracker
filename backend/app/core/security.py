from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from threading import Lock
from time import monotonic
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession
from .config import settings
from .db import get_db
from ..models import User, Session

passwords = PasswordHash.recommended()
dummy_hash = passwords.hash("constant-dummy-password-for-timing")
bearer = HTTPBearer(auto_error=False)
_buckets: OrderedDict[str, tuple[float, int]] = OrderedDict()
_lock = Lock()


def limit(key: str, maximum=30, seconds=60):
    now = monotonic()
    with _lock:
        start, count = _buckets.get(key, (now, 0))
        if now - start >= seconds:
            start, count = now, 0
        if count >= maximum:
            raise HTTPException(429, "Too many requests. Please try again shortly.", headers={"Retry-After": str(seconds)})
        _buckets[key] = (start, count + 1)
        _buckets.move_to_end(key)
        while len(_buckets) > 10000:
            _buckets.popitem(last=False)


def auth_limit(request: Request):
    # Never trust an arbitrary X-Forwarded-For supplied by a caller.
    limit("auth:" + (request.client.host if request.client else "unknown"), 20)


def token_hash(token: str):
    return sha256(token.encode()).hexdigest()


def issue(db: DBSession, user: User, session: Session | None = None):
    now = datetime.now(timezone.utc)
    refresh = token_urlsafe(48)
    if session is None:
        session = Session(user_id=user.id, refresh_hash=token_hash(refresh), expires_at=now + timedelta(days=settings().refresh_token_expire_days))
        db.add(session)
    else:
        session.refresh_hash = token_hash(refresh)
    db.flush()
    expires = now + timedelta(minutes=settings().access_token_expire_minutes)
    access = jwt.encode({"sub": user.id, "sid": session.id, "iat": now, "exp": expires, "iss": "paisasense", "aud": "paisasense-api"}, settings().secret_key, algorithm="HS256")
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer", "expires_in": settings().access_token_expire_minutes * 60}


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: DBSession = Depends(get_db, scope="function")):
    try:
        if not credentials:
            raise ValueError()
        claims = jwt.decode(credentials.credentials, settings().secret_key, algorithms=["HS256"], audience="paisasense-api", issuer="paisasense", options={"require": ["sub", "sid", "exp", "iat"]})
        session = db.scalar(select(Session).where(Session.id == claims["sid"], Session.user_id == claims["sub"], Session.revoked.is_(False), Session.expires_at > datetime.now(timezone.utc)))
        user = db.get(User, claims["sub"]) if session else None
        if user is None:
            raise ValueError()
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, "Your session has expired. Please sign in again.", headers={"WWW-Authenticate": "Bearer"})
