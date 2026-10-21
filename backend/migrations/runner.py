from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from backend.database import engine

# the first migration: the tables as they were before migrations were added
BASELINE_REVISION = "0001_baseline"

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def run_migrations():
    """Brings the database up to the newest migration.

    A database made before migrations existed (by create_all) already has the baseline tables,
    so it's marked as being at the baseline instead of having them created again."""
    config = Config(str(ALEMBIC_INI))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        tables = set(inspect(connection).get_table_names())
        if tables and "alembic_version" not in tables:
            command.stamp(config, BASELINE_REVISION)
        command.upgrade(config, "head")
