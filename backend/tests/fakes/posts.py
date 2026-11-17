import uuid

from app.domain.posts.models import Post, PostCursor, PostRepositoryPage


class FakePostRepository:
    """In-memory PostRepository for unit testing."""

    def __init__(self, posts: list[Post] | None = None) -> None:
        self.posts: dict[uuid.UUID, Post] = {p.id: p for p in (posts or [])}

    async def create(self, post: Post) -> Post:
        self.posts[post.id] = post
        return post

    async def get_by_id(self, post_id: uuid.UUID) -> Post | None:
        return self.posts.get(post_id)

    async def update(self, post: Post) -> Post:
        self.posts[post.id] = post
        return post

    async def delete(self, post_id: uuid.UUID) -> None:
        self.posts.pop(post_id, None)

    async def list_by_event(
        self,
        event_id: uuid.UUID,
        *,
        before: PostCursor | None = None,
        limit: int = 20,
    ) -> PostRepositoryPage:
        matching = [p for p in self.posts.values() if p.event_id == event_id]
        # Sort newest first (created_at desc, id desc)
        matching.sort(key=lambda p: (p.created_at, p.id), reverse=True)
        if before is not None:
            matching = [
                p
                for p in matching
                if (p.created_at, p.id) < (before.created_at, before.id)
            ]
        slice_posts = matching[:limit]
        next_cursor = None
        if len(matching) > limit:
            last = slice_posts[-1]
            next_cursor = PostCursor(created_at=last.created_at, id=last.id)
        return PostRepositoryPage(posts=slice_posts, next_cursor=next_cursor)
