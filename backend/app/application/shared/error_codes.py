# Codes raised by more than one feature (auth and users). The error class decides the
# HTTP status; each feature re-exports them from its own ``errors`` module.

# UnauthorizedError (401)
INVALID_SESSION = "INVALID_SESSION"

# ForbiddenError (403); a banned account also answers ACCOUNT_SUSPENDED.
ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED"
ACCOUNT_DELETED = "ACCOUNT_DELETED"
