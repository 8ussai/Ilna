from pathlib import Path

from alembic import command
from alembic.config import Config

from backend.database import engine

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


# brings the database up to the newest migration; a missing database is created from the first one
def run_migrations():
    config = Config(str(ALEMBIC_INI))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
