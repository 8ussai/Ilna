from alembic import context

from backend.database import Base, engine
# every model module, so autogenerate sees all the tables
from backend.models import admin, contact, course, notification, post, study, user  # noqa: F401


def run_migrations_online():
    # the runner passes its own connection; the alembic command line opens one here
    connection = context.config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    with engine.begin() as connection:
        _run(connection)


def _run(connection):
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        # SQLite can't alter most columns in place; batch mode copies the table instead
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError("Offline (SQL script) migrations aren't set up; run them against the database.")
run_migrations_online()
