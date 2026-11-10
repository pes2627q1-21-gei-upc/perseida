"""MeteorShowerCatalogSource: the catalog of the main meteor showers of 2026
and 2027, taken from Table 5 of the IMO Meteor Shower Calendars."""

import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import pytest
from app.infrastructure.events.meteor_catalog import (
    CATALOG_PATH,
    MeteorShowerCatalogSource,
)

from app.domain.events.models import EventCategory, EventSourceName

MAIN_SHOWERS = {"QUA", "LYR", "ETA", "SDA", "PER", "ORI", "LEO", "GEM", "URS"}


async def test_tg50_c3_has_the_nine_main_showers_of_2026_and_2027() -> None:
    drafts = await MeteorShowerCatalogSource().fetch()

    ids = {draft.external_id for draft in drafts}
    assert ids == {f"{code}-{year}" for code in MAIN_SHOWERS for year in (2026, 2027)}


async def test_tg50_c3_a_shower_spans_its_whole_activity_period() -> None:
    drafts = await MeteorShowerCatalogSource().fetch()

    [perseids] = [d for d in drafts if d.external_id == "PER-2026"]
    assert perseids.title == "Perseids 2026"
    assert perseids.starts_at == datetime(2026, 7, 17, tzinfo=UTC)
    assert perseids.ends_at == datetime(2026, 8, 24, 23, 59, 59, tzinfo=UTC)
    assert "13 August 2026" in perseids.summary
    assert "100" in perseids.summary
    assert perseids.source is EventSourceName.CATALOG
    assert perseids.category is EventCategory.METEOR_SHOWER
    assert perseids.location is None
    assert perseids.source_url == "https://www.imo.net/files/meteor-shower/cal2026.pdf"


async def test_tg50_c3_a_shower_can_start_the_year_before() -> None:
    drafts = await MeteorShowerCatalogSource().fetch()

    [quadrantids] = [d for d in drafts if d.external_id == "QUA-2027"]
    assert quadrantids.starts_at == datetime(2026, 12, 28, tzinfo=UTC)
    assert quadrantids.ends_at == datetime(2027, 1, 12, 23, 59, 59, tzinfo=UTC)
    assert "4 January 2027" in quadrantids.summary


async def test_tg50_c3_discards_and_logs_an_incomplete_entry(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    entries = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    entries[0]["end"] = "2020-01-01"
    del entries[1]["peak"]
    catalog = tmp_path / "showers.json"
    catalog.write_text(json.dumps(entries), encoding="utf-8")

    with caplog.at_level(logging.WARNING):
        drafts = await MeteorShowerCatalogSource(catalog).fetch()

    assert len(drafts) == len(entries) - 2
    assert caplog.text.count("Discarded") == 2


def test_tg50_c5_the_catalog_stays_fresh_for_a_day() -> None:
    source = MeteorShowerCatalogSource()

    assert source.name is EventSourceName.CATALOG
    assert source.ttl_seconds == 24 * 3600
