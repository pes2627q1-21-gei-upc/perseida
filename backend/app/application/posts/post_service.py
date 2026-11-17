import base64
import json
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.application.shared.errors import ForbiddenError
from app.domain.posts.models import Post, PostAuthor, PostCursor
from app.domain.posts.ports import EventLookup, PostRepository
from app.domain.shared.errors import NotFoundError, ValidationError


def _encode_cursor(cursor: PostCursor) -> str:
    raw = json.dumps(
        [cursor.created_at.isoformat(), str(cursor.id)],
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(value: str) -> PostCursor:
    try:
        if len(value) > 256:
            raise ValueError
        raw = base64.b64decode(
            value + "=" * (-len(value) % 4),
            altchars=b"-_",
            validate=True,
        )
        data = json.loads(raw)
        if (
            not isinstance(data, list)
            or len(data) != 2
            or not all(isinstance(x, str) for x in data)
        ):
            raise ValueError
        date = datetime.fromisoformat(data[0])
        if date.utcoffset() is None:
            raise ValueError
        cursor = PostCursor(created_at=date, id=uuid.UUID(data[1]))
        if _encode_cursor(cursor) != value:
            raise ValueError
        return cursor
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValidationError("INVALID_CURSOR", "Cursor is invalid") from exc


class PostPage(BaseModel):
    """A paginated page of posts with an opaque string cursor for the next page."""

    model_config = ConfigDict(frozen=True)

    posts: list[Post]
    next_cursor: str | None = None


class PostService:
    """Application use cases for community event posts."""

    def __init__(self, posts: PostRepository, events: EventLookup) -> None:
        self._posts = posts
        self._events = events

    async def create_post(
        self,
        event_id: uuid.UUID,
        author: PostAuthor,
        text: str,
    ) -> Post:
        """Create a new post for an event."""
        if not await self._events.exists(event_id):
            raise NotFoundError("EVENT_NOT_FOUND", f"Event {event_id} does not exist")
        post = Post.create(event_id=event_id, author=author, text=text)
        return await self._posts.create(post)

    async def list_posts(
        self,
        event_id: uuid.UUID,
        *,
        cursor: str | None = None,
        limit: int = 20,
    ) -> PostPage:
        """List posts of an event, sorted newest first, cursor-paginated."""
        if not await self._events.exists(event_id):
            raise NotFoundError("EVENT_NOT_FOUND", f"Event {event_id} does not exist")
        clamped_limit = max(1, min(limit, 50))
        decoded_cursor = _decode_cursor(cursor) if cursor is not None else None
        repo_page = await self._posts.list_by_event(
            event_id, before=decoded_cursor, limit=clamped_limit
        )
        next_cursor = (
            _encode_cursor(repo_page.next_cursor)
            if repo_page.next_cursor is not None
            else None
        )
        return PostPage(posts=repo_page.posts, next_cursor=next_cursor)

    async def update_post(
        self,
        post_id: uuid.UUID,
        author_id: uuid.UUID,
        new_text: str,
    ) -> Post:
        """Update the text of an existing post. Only the author is allowed."""
        post = await self._posts.get_by_id(post_id)
        if post is None:
            raise NotFoundError("POST_NOT_FOUND", f"Post {post_id} does not exist")
        if post.author.id != author_id:
            raise ForbiddenError("POST_FORBIDDEN", "Only the author can edit this post")
        updated = post.edit(new_text)
        return await self._posts.update(updated)

    async def delete_post(
        self,
        post_id: uuid.UUID,
        author_id: uuid.UUID,
    ) -> None:
        """Delete an existing post. Only the author is allowed."""
        post = await self._posts.get_by_id(post_id)
        if post is None:
            raise NotFoundError("POST_NOT_FOUND", f"Post {post_id} does not exist")
        if post.author.id != author_id:
            raise ForbiddenError(
                "POST_FORBIDDEN", "Only the author can delete this post"
            )
        await self._posts.delete(post_id)
