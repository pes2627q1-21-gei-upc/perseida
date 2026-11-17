"""Stable error codes of the observation outings (TG-629, ADR-0018).

The error class decides the HTTP status: ValidationError 422, NotFoundError 404 and
ForbiddenError 403.
"""

# ValidationError (422)
OUTING_TITLE_EMPTY = "OUTING_TITLE_EMPTY"
OUTING_TITLE_TOO_LONG = "OUTING_TITLE_TOO_LONG"
OUTING_DESCRIPTION_TOO_LONG = "OUTING_DESCRIPTION_TOO_LONG"
OUTING_ENDS_BEFORE_START = "OUTING_ENDS_BEFORE_START"
OUTING_STARTS_IN_PAST = "OUTING_STARTS_IN_PAST"
# The related astronomical event does not exist: a field of the body, not the URL.
OUTING_EVENT_NOT_FOUND = "OUTING_EVENT_NOT_FOUND"

# NotFoundError (404)
OUTING_NOT_FOUND = "OUTING_NOT_FOUND"

# ForbiddenError (403): only the author may edit or delete an outing.
OUTING_FORBIDDEN = "OUTING_FORBIDDEN"
