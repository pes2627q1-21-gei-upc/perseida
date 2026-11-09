"""Load the bank of quiz questions (TG-60).

The questions are in ``alembic/seed/quiz_questions.json``, in the order the daily
rotation walks them. Their answers and sources were checked when the bank was
written; ``tests/unit/infrastructure/quiz/test_quiz_seed.py`` validates the file.

Downgrading removes the bank and, with it, the answers already given.
"""

import json
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import sqlalchemy as sa

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
        question_id = uuid.uuid7()
        question_rows.append(
            {
                "id": question_id,
                "position": position,
                "correct_option": question["correct_option"],
                "source_url": question["source_url"],
            }
        )
        translation_rows.extend(
            {"question_id": question_id, "language": language, **texts}
            for language, texts in question["translations"].items()
        )
    op.bulk_insert(questions, question_rows)
    op.bulk_insert(translations, translation_rows)


def downgrade() -> None:
    op.execute("DELETE FROM quiz_answers")
    op.execute("DELETE FROM quiz_questions")
