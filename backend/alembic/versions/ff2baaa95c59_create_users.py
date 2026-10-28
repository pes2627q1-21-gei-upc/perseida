"""Create users and user_identities tables."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ff2baaa95c59"
down_revision: str | None = "ef67a1f41ec0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column(
            "preferred_language",
            sa.String(length=2),
            server_default=sa.text("'ca'"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.String(length=16),
            server_default=sa.text("'user'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_login_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "preferred_language IN ('ca', 'es', 'en')",
            name=op.f("ck_users_preferred_language"),
        ),
        sa.CheckConstraint(
            "role IN ('user', 'moderator', 'admin')", name=op.f("ck_users_role")
        ),
        sa.CheckConstraint(
            "status IN ('active', 'suspended', 'banned')",
            name=op.f("ck_users_status"),
        ),
        sa.CheckConstraint(
            "email = lower(email)", name=op.f("ck_users_email_lowercase")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "user_identities",
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "provider IN ('google')", name=op.f("ck_user_identities_provider")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_identities_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("provider", "subject", name=op.f("pk_user_identities")),
        sa.UniqueConstraint(
            "user_id", "provider", name=op.f("uq_user_identities_user_id")
        ),
    )


def downgrade() -> None:
    op.drop_table("user_identities")
    op.drop_table("users")
