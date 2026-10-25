from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings


class Base(DeclarativeBase):
    pass


url = settings().database_url.replace("postgresql://", "postgresql+psycopg://", 1)
options = {"check_same_thread": False} if url.startswith("sqlite") else {}
engine = create_engine(url, connect_args=options, pool_pre_ping=True, **({} if url.startswith("sqlite") else {"pool_size": 3, "max_overflow": 2}))
if url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def enable_fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
