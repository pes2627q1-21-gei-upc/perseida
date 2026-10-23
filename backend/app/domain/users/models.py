import uuid
from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.shared.account import AccountStatus as AccessStatus
from app.domain.shared.errors import ValidationError
from app.domain.shared.text import clean_text, safe_https_url

# Same limits as the columns of ``users`` (infrastructure/users/tables.py).
EMAIL_MAX_LENGTH = 320
DISPLAY_NAME_MAX_LENGTH = 255


class Role(StrEnum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


class Language(StrEnum):
    CA = "ca"
    ES = "es"
    EN = "en"


class AccountStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BANNED = "banned"


class User(BaseModel):
    """A Perseida account.

    ``id`` is the internal identity; ``email`` is a normalized attribute, never
    a key. Deletion is soft: ``deleted_at`` is set and the account is no longer
    usable, but ``google_sub`` stays reserved so it cannot be registered again.
    """

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    google_sub: str
    email: str
    display_name: str | None = None
    avatar_url: str | None = None
    preferred_language: Language = Language.CA
    role: Role = Role.USER
    status: AccountStatus = AccountStatus.ACTIVE
    created_at: datetime
    last_login_at: datetime
    deleted_at: datetime | None = None

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValidationError("USER_EMAIL_EMPTY", "User email must not be empty")
        if len(normalized) > EMAIL_MAX_LENGTH or any(
            char.isspace() or not char.isprintable() for char in normalized
        ):
            raise ValidationError("USER_EMAIL_INVALID", "User email is not valid")
        return normalized

    @field_validator("display_name")
    @classmethod
    def _clean_display_name(cls, value: str | None) -> str | None:
        return clean_text(value, DISPLAY_NAME_MAX_LENGTH)

    @field_validator("avatar_url")
    @classmethod
    def _require_https_avatar(cls, value: str | None) -> str | None:
        # A link that is not plain https (javascript:, data:...) is dropped, not stored.
        return safe_https_url(value)

    @field_validator("google_sub")
    @classmethod
    def _require_google_sub(cls, value: str) -> str:
        if not value.strip():
            raise ValidationError(
                "USER_GOOGLE_SUB_EMPTY", "User google_sub must not be empty"
            )
        return value

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def account_status(self) -> AccessStatus:
        """Status as seen by the auth flow; a deleted account wins over any other."""
        if self.is_deleted:
            return AccessStatus.DELETED
        return AccessStatus(self.status.value)

    def record_login(self, at: datetime) -> User:
        """Return the account with ``last_login_at`` set to ``at``."""
        return self.model_copy(update={"last_login_at": at})

    @classmethod
    def create(
        cls,
        *,
        google_sub: str,
        email: str,
        display_name: str | None = None,
        avatar_url: str | None = None,
        preferred_language: Language = Language.CA,
    ) -> User:
        """Register a new account with default role and status."""
        now = datetime.now(UTC)
        return cls(
            id=uuid.uuid7(),
            google_sub=google_sub,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
            preferred_language=preferred_language,
            created_at=now,
            last_login_at=now,
        )
