"""Load the bank of quiz questions (TG-60).

The questions are in ``alembic/seed/quiz_questions.json``, in the order the daily
rotation walks them. Their answers and sources were checked when the bank was
written; ``tests/unit/infrastructure/quiz/test_quiz_seed.py`` validates the file.

Each question has a fixed id in the file, so the ids never change: a question of
the day that Redis still holds stays valid after a downgrade and an upgrade.

Downgrading keeps the users' data: it removes only the questions that no answer
and no day of the calendar (``quiz_days``) points to. Upgrading again skips the
questions that are still there.
"""

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert

from alembic import op

revision: str = "a6e1d58c0b92"
down_revision: str | None = "4f2c9a1b7d3e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SEED = Path(__file__).resolve().parents[1] / "seed" / "quiz_questions.json"

questions = sa.table(
    "quiz_questions",
    sa.column("id", sa.Uuid()),
    sa.column("position", sa.Integer()),
    sa.column("correct_option", sa.SmallInteger()),
    sa.column("source_url", sa.Text()),
)
translations = sa.table(
    "quiz_question_translations",
    sa.column("question_id", sa.Uuid()),
    sa.column("language", sa.String()),
    sa.column("statement", sa.Text()),
    sa.column("options", sa.ARRAY(sa.Text())),
    sa.column("explanation", sa.Text()),
)


def upgrade() -> None:
    bank = json.loads(SEED.read_text(encoding="utf-8"))
    question_rows: list[dict[str, Any]] = []
    translation_rows: list[dict[str, Any]] = []
    for position, question in enumerate(bank):
        question_rows.append(
            {
                "id": question["id"],
                "position": position,
                "correct_option": question["correct_option"],
                "source_url": question["source_url"],
            }
        )
        translation_rows.extend(
            {"question_id": question["id"], "language": language, **texts}
            for language, texts in question["translations"].items()
        )
    # ON CONFLICT DO NOTHING: after a downgrade, the questions kept for the
    # answers are still there with the same id and position.
    op.execute(insert(questions).values(question_rows).on_conflict_do_nothing())
    op.execute(insert(translations).values(translation_rows).on_conflict_do_nothing())


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM quiz_questions AS q
        WHERE NOT EXISTS (SELECT 1 FROM quiz_answers AS a WHERE a.question_id = q.id)
          AND NOT EXISTS (SELECT 1 FROM quiz_days AS d WHERE d.question_id = q.id)
        """
    )
