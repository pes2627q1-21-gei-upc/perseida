import uuid
from datetime import UTC, datetime

from app.infrastructure.posts.repository import _to_domain
from app.infrastructure.posts.tables import PostRow


def test_post_row_attributes_and_table_name() -> None:
    assert PostRow.__tablename__ == "posts"
    post_id = uuid.uuid7()
    event_id = uuid.uuid7()
    user_id = uuid.uuid7()
    now = datetime.now(UTC)

    row = PostRow(
        id=post_id,
        event_id=event_id,
        user_id=user_id,
        text="Observació des del telescopi",
        created_at=now,
        edited_at=None,
    )

    assert row.id == post_id
    assert row.event_id == event_id
    assert row.user_id == user_id
    assert row.text == "Observació des del telescopi"
    assert row.created_at == now
    assert row.edited_at is None


def test_to_domain_mapping() -> None:
    post_id = uuid.uuid7()
    event_id = uuid.uuid7()
    user_id = uuid.uuid7()
    now = datetime.now(UTC)

    row = PostRow(
        id=post_id,
        event_id=event_id,
        user_id=user_id,
        text="Cel nocturn increïble",
        created_at=now,
        edited_at=now,
    )

    domain_post = _to_domain(row, "Astrònoma Maria")

    assert domain_post.id == post_id
    assert domain_post.event_id == event_id
    assert domain_post.author.id == user_id
    assert domain_post.author.name == "Astrònoma Maria"
    assert domain_post.text == "Cel nocturn increïble"
    assert domain_post.created_at == now
    assert domain_post.edited_at == now
