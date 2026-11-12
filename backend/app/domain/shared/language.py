from enum import StrEnum


class Language(StrEnum):
    """The languages of the app. Shared by several features (users, quiz)."""

    CA = "ca"
    ES = "es"
    EN = "en"
