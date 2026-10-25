"""Run from backend/: python -m app.workers.mail --once (or leave running as a worker)."""
import argparse
import logging
import time
from ..core.config import settings
from ..core.db import engine
from ..services.mail import dispatch_one


def main():
    parser = argparse.ArgumentParser(description="Retry pending transactional Resend emails")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    if not settings().email_auth_enabled:
        raise SystemExit("Email authentication is disabled. Configure Resend before running the worker.")
    if not 1 <= args.limit <= 100:
        parser.error("--limit must be between 1 and 100")
    logging.basicConfig(level=logging.INFO)
    while True:
        processed = 0
        for _ in range(args.limit):
            try:
                if not dispatch_one(engine):
                    break
                processed += 1
            except Exception as error:
                logging.warning("Mail worker deferred: type=%s", type(error).__name__)
                break
        if args.once:
            print(f"Processed {processed} queued mail jobs.")
            return
        time.sleep(5)


if __name__ == "__main__":
    main()
