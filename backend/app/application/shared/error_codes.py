# Codes raised by more than one feature (auth and users). The error class decides the
# HTTP status; each feature re-exports them from its own ``errors`` module.

# UnauthorizedError (401)
INVALID_SESSION = "INVALID_SESSION"

# ForbiddenError (403); a banned account also answers ACCOUNT_SUSPENDED.
ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED"
ACCOUNT_DELETED = "ACCOUNT_DELETED"
# The account is active but its role is not one the route requires (require_role).
INSUFFICIENT_ROLE = "INSUFFICIENT_ROLE"

# ExternalServiceError (503): PostgreSQL is unreachable (connection refused, closed
# or lost). Repositories map connection failures to this code.
DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"

# RateLimitedError (429): a user exceeded a per-user rate limit (chat, posts).
RATE_LIMITED = "RATE_LIMITED"

# ExternalServiceError (503): the pub/sub bus (Redis) is unreachable. A message may
# already be stored when it is raised (chat, direct chat); a retry redelivers it.
PUBSUB_UNAVAILABLE = "PUBSUB_UNAVAILABLE"
