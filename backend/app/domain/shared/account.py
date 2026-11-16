from enum import StrEnum


class AccountStatus(StrEnum):
    """What a feature may do with an account; shared by ``auth`` and ``users``."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    BANNED = "banned"
    DELETED = "deleted"
