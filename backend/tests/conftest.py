import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ENVIRONMENT"] = "test"
os.environ["GROQ_API_KEY"] = ""
os.environ["GROQ_MODEL"] = ""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.db import Base, get_db
from app.core.security import _buckets
from app.main import app


@pytest.fixture
def client():
    test_url = os.environ.get("TEST_DATABASE_URL", "sqlite://")
    if test_url != "sqlite://" and "paisa_test" not in test_url:
        raise RuntimeError("TEST_DATABASE_URL must name an isolated paisa_test database")
    engine = create_engine(test_url, **({"connect_args": {"check_same_thread": False}, "poolclass": StaticPool} if test_url == "sqlite://" else {}))
    if test_url == "sqlite://":
        @event.listens_for(engine, "connect")
        def foreign_keys(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    def override():
        with factory() as db:
            try:
                yield db
                db.commit()
            except Exception:
                db.rollback()
                raise
    app.dependency_overrides[get_db] = override
    _buckets.clear()
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def auth(client):
    response = client.post("/api/v1/auth/register", json={"email": "test@example.com", "password": "secure-passphrase-123", "name": "Aarav"})
    assert response.status_code == 201, response.text
    client.headers["Authorization"] = "Bearer " + response.json()["access_token"]
    return response.json()


@pytest.fixture
def accounts(client, auth):
    result = {}
    for name, opening in [("bank", 1000000), ("cash", 0), ("credit", 0)]:
        response = client.post("/api/v1/accounts", json={"name": name, "type": name, "opening_balance": opening})
        assert response.status_code == 201, response.text
        result[name] = response.json()["id"]
    return result
