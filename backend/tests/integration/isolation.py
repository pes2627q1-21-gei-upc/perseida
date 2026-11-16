"""Check that integration tests leave the configured database as they found it.

The skill testing-integracio asks for isolated tests: no test may delete or
leave rows that are not its own. A module compares these counts before and
after its tests.
"""

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.infrastructure.persistence.config import DatabaseSettings

# Literal queries, one per table: table names never come from a variable.
COUNTS = {
    "users": text("SELECT count(*) FROM users"),
    "user_identities": text("SELECT count(*) FROM user_identities"),
    "quiz_questions": text("SELECT count(*) FROM quiz_questions"),
    "quiz_question_translations": text(
        "SELECT count(*) FROM quiz_question_translations"
    ),
    "quiz_days": text("SELECT count(*) FROM quiz_days"),
    "quiz_answers": text("SELECT count(*) FROM quiz_answers"),
}


async def _row_counts() -> dict[str, int]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.connect() as connection:
            return {
                table: int(await connection.scalar(query) or 0)
                for table, query in COUNTS.items()
            }
    finally:
        await engine.dispose()


def row_counts() -> dict[str, int]:
    """Rows per table of the users and the quiz, read with a fresh connection."""
    return asyncio.run(_row_counts())
