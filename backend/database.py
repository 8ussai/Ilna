import math
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from backend.backendConfig import SQLALCHEMY_DATABASE_URL


engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)


# not every SQLite build ships math functions; the "hot" post ranking needs power()
@event.listens_for(engine, "connect")
def _register_sqlite_functions(dbapi_connection, _):
    dbapi_connection.create_function("power", 2, math.pow, deterministic=True)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def utc_now() -> datetime:
    """Now, in UTC without an offset: how every time is stored (SQLite keeps no time zone)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()