import uuid
from typing import Protocol

from app.domain.posts.models import Post, PostCursor, PostRepositoryPage


class PostRepository(Protocol):
    """Storage and retrieval port for event community posts."""

    async def create(self, post: Post) -> Post:
        """Persist a new post."""
        ...

    async def get_by_id(self, post_id: uuid.UUID) -> Post | None:
        """Find a post by its identifier."""
        ...

    async def update(self, post: Post) -> Post:
        """Update an existing post."""
        ...

    async def delete(self, post_id: uuid.UUID) -> None:
        """Delete a post by its identifier."""
        ...

    async def list_by_event(
        self,
        event_id: uuid.UUID,
        *,
        before: PostCursor | None = None,
        limit: int = 20,
    ) -> PostRepositoryPage:
        """Return posts of an event, sorted newest first (created_at desc, id desc),
        cursor-paginated before the exclusive key."""
        ...


class EventLookup(Protocol):
    """Whether an event exists, the only thing the posts need from the events.

    Its own port keeps the posts independent of the events feature
    (backend-hexagonal); the events repository fulfils it by structure.
    """

    async def exists(self, event_id: uuid.UUID) -> bool:
        """Return whether an event with ``event_id`` is stored."""
        ...
