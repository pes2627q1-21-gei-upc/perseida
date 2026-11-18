"""Table ``event_subscriptions`` (TG-53, criteri 1).

The migration is checked against this model by ``test_models_match_migrations``
and its cascades against PostgreSQL by ``test_alembic``.
"""

from sqlalchemy import DateTime, UniqueConstraint

from app.infrastructure.events import tables


def test_tg53_c1_the_table_is_event_subscriptions() -> None:
    assert tables.EventSubscriptionRow.__tablename__ == "event_subscriptions"


def test_tg53_c1_user_and_event_are_foreign_keys_deleted_in_cascade() -> None:
    table = tables.EventSubscriptionRow.__table__
    targets = {
        fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys
    }

    assert targets == {
        "user_id": ("users.id", "CASCADE"),
        "event_id": ("astronomical_events.id", "CASCADE"),
    }


def test_tg53_c1_a_user_subscribes_once_to_each_event() -> None:
    table = tables.EventSubscriptionRow.__table__
    uniques = [
        [column.name for column in constraint.columns]
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    ]

    assert ["user_id", "event_id"] in uniques


def test_tg53_c1_the_columns_are_required_and_created_at_has_a_time_zone() -> None:
    columns = tables.EventSubscriptionRow.__table__.columns

    assert {"id", "user_id", "event_id", "created_at"} <= set(columns.keys())
    assert [c.name for c in columns if c.primary_key] == ["id"]
    for name in ("user_id", "event_id", "created_at"):
        assert columns[name].nullable is False, name
    created_at = columns["created_at"].type
    assert isinstance(created_at, DateTime)
    assert created_at.timezone is True
