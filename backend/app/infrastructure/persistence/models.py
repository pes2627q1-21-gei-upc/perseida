from sqlmodel import SQLModel

SQLModel.metadata.naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# Import the table models after the naming convention is set so that
# ``SQLModel.metadata`` (used by Alembic) knows every table.
from app.infrastructure.users.tables import (  # noqa: E402, F401
    UserIdentityRow,
    UserRow,
)
