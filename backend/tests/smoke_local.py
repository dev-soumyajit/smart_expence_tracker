"""Explicit LOCAL Docker smoke check. Never reads .env or uses a cloud database."""
from pathlib import Path
import subprocess
import time
from uuid import uuid4
import httpx

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://127.0.0.1:8000"


def docker(*arguments):
    subprocess.run(["docker", *arguments], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)


def wait_health(client, url):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            if client.get(url).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(.5)
    raise RuntimeError("Local verification container did not become ready")


def main():
    email = f"smoke-{uuid4().hex}@example.com"
    password = "local-smoke-only-passphrase-123"
    created = False
    with httpx.Client(timeout=10) as client:
        try:
            registration = client.post(BASE + "/api/v1/auth/register", json={"email": email, "name": "Local Smoke", "password": password})
            registration.raise_for_status()
            client.headers["Authorization"] = "Bearer " + registration.json()["access_token"]
            created = True
            account = client.post(BASE + "/api/v1/accounts", json={"name": "Smoke persistence", "type": "bank", "opening_balance": 1234500})
            account.raise_for_status()
            account_id = account.json()["id"]
            docker("compose", "-f", "infrastructure/docker-compose.yml", "restart", "api")
            wait_health(client, BASE + "/ready")
            accounts = client.get(BASE + "/api/v1/accounts")
            accounts.raise_for_status()
            assert next(a["balance"] for a in accounts.json() if a["id"] == account_id) == 1234500
            print("PASS: financial records and authenticated session survive a backend container restart")
        finally:
            if created:
                result = client.request("DELETE", BASE + "/api/v1/settings/account", json={"email": email, "password": password})
                result.raise_for_status()

        container = "paisasense-port-verification"
        docker("run", "--rm", "-d", "--name", container, "--network", "infrastructure_default", "-p", "127.0.0.1:8123:8123", "-e", "PORT=8123", "-e", "DATABASE_URL=postgresql+psycopg://paisa:paisa-local-only@db:5432/paisa", "infrastructure-api")
        try:
            wait_health(client, "http://127.0.0.1:8123/health")
            print("PASS: Docker startup respects PORT=8123")
        finally:
            docker("stop", container)


if __name__ == "__main__":
    main()
