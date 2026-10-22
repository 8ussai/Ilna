from alembic import context

import backend.accounts.models  # noqa: F401
import backend.admin.models  # noqa: F401
import backend.blog.models  # noqa: F401
import backend.contact.models  # noqa: F401
import backend.courses.models  # noqa: F401
import backend.friends.models  # noqa: F401
import backend.maintenance.models  # noqa: F401
import backend.notifications.models  # noqa: F401
import backend.study.models  # noqa: F401
from backend.database import Base, engine

# the model imports above register every table on Base, so autogenerate compares all of them


# runs migrations on the runner's connection, or opens one for the alembic command line
def run_migrations_online():
    # the runner passes its own connection; the alembic command line opens one here
    connection = context.config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    with engine.begin() as connection:
        _run(connection)


# runs the migrations on a connection, in batch mode for SQLite
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
