"""Create the quiz tables (TG-60)."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "4f2c9a1b7d3e"
down_revision: str | None = "8b892a8ae4b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "quiz_questions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("correct_option", sa.SmallInteger(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.CheckConstraint("position >= 0", name=op.f("ck_quiz_questions_position")),
        sa.CheckConstraint(
            "correct_option BETWEEN 0 AND 3",
            name=op.f("ck_quiz_questions_correct_option"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quiz_questions")),
        sa.UniqueConstraint("position", name=op.f("uq_quiz_questions_position")),
    )
    op.create_table(
        "quiz_question_translations",
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("language", sa.String(length=2), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("options", sa.ARRAY(sa.Text()), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "language IN ('ca', 'es', 'en')",
            name=op.f("ck_quiz_question_translations_language"),
        ),
        sa.CheckConstraint(
            "cardinality(options) = 4",
            name=op.f("ck_quiz_question_translations_options"),
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["quiz_questions.id"],
            name=op.f("fk_quiz_question_translations_question_id_quiz_questions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "question_id", "language", name=op.f("pk_quiz_question_translations")
        ),
    )
    op.create_table(
        "quiz_answers",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("quiz_date", sa.Date(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("chosen_option", sa.SmallInteger(), nullable=False),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column(
            "answered_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "chosen_option BETWEEN 0 AND 3", name=op.f("ck_quiz_answers_chosen_option")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_quiz_answers_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["quiz_questions.id"],
            name=op.f("fk_quiz_answers_question_id_quiz_questions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quiz_answers")),
        sa.UniqueConstraint(
            "user_id", "quiz_date", name=op.f("uq_quiz_answers_user_id")
        ),
    )


def downgrade() -> None:
    op.drop_table("quiz_answers")
    op.drop_table("quiz_question_translations")
    op.drop_table("quiz_questions")
