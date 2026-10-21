"""Enable PostGIS extension."""

from collections.abc import Sequence

from alembic import op

revision: str = "ef67a1f41ec0"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS postgis CASCADE")
