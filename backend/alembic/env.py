from alembic import context
from sqlalchemy import create_engine, pool
from app.core.config import settings
from app.core.db import Base
from app import models

config = context.config
url = settings().database_url.replace("postgresql://", "postgresql+psycopg://", 1)
if context.is_offline_mode():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
