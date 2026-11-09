import uuid
from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlmodel import Field, SQLModel


class QuizQuestionRow(SQLModel, table=True):
    """Table ``quiz_questions``: the bank, walked in ``position`` order."""

    __tablename__ = "quiz_questions"
    __table_args__ = (
        CheckConstraint("position >= 0", name="position"),
        CheckConstraint("correct_option BETWEEN 0 AND 3", name="correct_option"),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    position: int = Field(sa_column=Column(Integer(), nullable=False, unique=True))
    correct_option: int = Field(sa_column=Column(SmallInteger(), nullable=False))
    source_url: str = Field(sa_column=Column(Text(), nullable=False))


class QuizQuestionTranslationRow(SQLModel, table=True):
    """Table ``quiz_question_translations``: the texts of a question per language."""

    __tablename__ = "quiz_question_translations"
    __table_args__ = (
        CheckConstraint("language IN ('ca', 'es', 'en')", name="language"),
        CheckConstraint("cardinality(options) = 4", name="options"),
    )

    question_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("quiz_questions.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    language: str = Field(sa_column=Column(String(2), primary_key=True))
    statement: str = Field(sa_column=Column(Text(), nullable=False))
    options: list[str] = Field(sa_column=Column(ARRAY(Text()), nullable=False))
    explanation: str = Field(sa_column=Column(Text(), nullable=False))


class QuizAnswerRow(SQLModel, table=True):
    """Table ``quiz_answers`` (``QuizResult``): at most one per user and day."""

    __tablename__ = "quiz_answers"
    __table_args__ = (
        CheckConstraint("chosen_option BETWEEN 0 AND 3", name="chosen_option"),
        UniqueConstraint("user_id", "quiz_date"),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        )
    )
    quiz_date: date = Field(sa_column=Column(Date(), nullable=False))
    question_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("quiz_questions.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    chosen_option: int = Field(sa_column=Column(SmallInteger(), nullable=False))
    correct: bool = Field(sa_column=Column(Boolean(), nullable=False))
    answered_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=text("now()")
        )
    )
