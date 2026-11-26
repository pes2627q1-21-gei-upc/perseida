"""Create persistent direct conversations, messages, and blocks (TG-65)."""

import sqlalchemy as sa

from alembic import op

revision = "a65d1ec70001"
down_revision = "a1c4e9b27d03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "direct_conversations",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("user_a_id", sa.Uuid(), nullable=False),
        sa.Column("user_b_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("user_a_read_at", sa.DateTime(timezone=True)),
        sa.Column("user_b_read_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "user_a_id < user_b_id", name=op.f("ck_direct_conversations_pair_ordered")
        ),
        sa.ForeignKeyConstraint(["user_a_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_b_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_a_id", "user_b_id", name="uq_direct_conversations_pair"
        ),
    )
    op.create_index(
        "ix_direct_conversations_user_b_id", "direct_conversations", ["user_b_id"]
    )
    op.create_table(
        "direct_messages",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.String(1000), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("client_message_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "length(text) >= 1", name=op.f("ck_direct_messages_text_not_empty")
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["direct_conversations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sender_id", "client_message_id"),
    )
    op.create_index(
        "ix_direct_messages_conversation_id_sent_at_id",
        "direct_messages",
        ["conversation_id", sa.text("sent_at DESC"), sa.text("id DESC")],
    )
    op.create_table(
        "user_blocks",
        sa.Column("blocker_id", sa.Uuid(), nullable=False),
        sa.Column("blocked_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "blocker_id <> blocked_id", name=op.f("ck_user_blocks_not_self")
        ),
        sa.ForeignKeyConstraint(["blocker_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["blocked_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("blocker_id", "blocked_id"),
    )


def downgrade() -> None:
    op.drop_table("user_blocks")
    op.drop_index(
        "ix_direct_messages_conversation_id_sent_at_id", table_name="direct_messages"
    )
    op.drop_table("direct_messages")
    op.drop_index(
        "ix_direct_conversations_user_b_id", table_name="direct_conversations"
    )
    op.drop_table("direct_conversations")
