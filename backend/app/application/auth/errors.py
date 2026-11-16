# Stable codes of the auth flow (US #44). The error class decides the HTTP status.

# UnauthorizedError (401)
INVALID_GOOGLE_TOKEN = "INVALID_GOOGLE_TOKEN"
INVALID_SESSION = "INVALID_SESSION"

# ForbiddenError (403); a banned account also answers ACCOUNT_SUSPENDED.
ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED"
ACCOUNT_DELETED = "ACCOUNT_DELETED"

# ExternalServiceError (503): Google's keys cannot be fetched and none are cached.
IDENTITY_PROVIDER_UNAVAILABLE = "IDENTITY_PROVIDER_UNAVAILABLE"

# ExternalServiceError (503): Redis cannot be reached, so a session cannot be
# registered or checked.
SESSION_UNAVAILABLE = "SESSION_UNAVAILABLE"
