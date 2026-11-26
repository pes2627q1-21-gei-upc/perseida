"""The repository port of the observation zones (TG-70, criteri 1)."""

import inspect

from app.domain.observation_zones import ports


def test_tg70_c1_the_port_saves_and_finds_zones_within_a_radius() -> None:
    port = ports.ObservationZoneRepository

    for name in ("save", "find_within"):
        assert inspect.iscoroutinefunction(getattr(port, name)), name
