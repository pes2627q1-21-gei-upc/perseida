"""GET /api/users/me/achievements. TG-574 (US TG-58 criteris 5, 6 i 7)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.achievements.achievement_service import AchievementService
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import INVALID_SESSION
from app.application.users.user_service import UserService
from app.domain.achievements.models import (
    Achievement,
    AchievementCategory,
    AchievementKind,
)
from app.domain.auth.models import GoogleIdentity
from app.domain.users.models import User
from app.infrastructure.achievements.dependencies import get_achievement_service
from app.infrastructure.achievements.router import router
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.auth.dependencies import get_auth_service
from app.infrastructure.users.dependencies import get_user_service
from tests.fakes.achievements import FakeAchievementRepository
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.users import InMemoryUserRepository

PATH = "/api/users/me/achievements"
PROBLEM_JSON = "application/problem+json"
IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)
FIELDS = {
    "code",
    "name",
    "description",
    "category",
    "position",
    "current",
    "goal",
    "unlocked",
    "unlocked_at",
}

ME = User.create(google_sub="google-123", email="ana@example.com", display_name="Ana")
OTHER = User.create(
    google_sub="google-999", email="bob@example.com", display_name="Bob"
)


def _achievement(
    kind: AchievementKind,
    threshold: int,
    category: AchievementCategory,
    position: int,
) -> Achievement:
    return Achievement(
        id=uuid.uuid4(),
        code=f"{kind.value}_{threshold}",
        name=f"{kind.value} {threshold}",
        description="d",
        kind=kind,
        threshold=threshold,
        category=category,
        position=position,
    )


STREAK_3 = _achievement(AchievementKind.STREAK_DAYS, 3, AchievementCategory.STREAKS, 1)
STREAK_7 = _achievement(AchievementKind.STREAK_DAYS, 7, AchievementCategory.STREAKS, 2)
QUIZ_10 = _achievement(AchievementKind.QUIZ_COMPLETED, 10, AchievementCategory.QUIZ, 1)
QUIZ_50 = _achievement(AchievementKind.QUIZ_COMPLETED, 50, AchievementCategory.QUIZ, 2)


async def _client(
    repo: FakeAchievementRepository, *, streak: int = 0
) -> AsyncIterator[tuple[AsyncClient, str]]:
    auth = AuthService(
        FakeGoogleTokenVerifier(IDENTITY),
        FakeTokenCodec(),
        InMemorySessionStore(),
        FakeAccountGateway(),
        DURATIONS,
    )
    streaks_asked: list[uuid.UUID] = []

    async def streak_days(user_id: uuid.UUID) -> int:
        streaks_asked.append(user_id)
        return streak

    app = FastAPI()
    app.include_router(router, prefix="/api")
    register_error_handlers(app)
    app.dependency_overrides[get_auth_service] = lambda: auth
    app.dependency_overrides[get_user_service] = lambda: UserService(
        InMemoryUserRepository(ME, OTHER)
    )
    app.dependency_overrides[get_achievement_service] = lambda: AchievementService(
        repo, streak_days
    )
    tokens = await auth.login("google-id-token")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http, tokens.access_token


async def _get(repo: FakeAchievementRepository, *, streak: int = 0) -> Response:
    async for client, token in _client(repo, streak=streak):
        return await client.get(PATH, headers={"Authorization": f"Bearer {token}"})
    raise AssertionError("unreachable")


def _by_code(response: Response) -> dict[str, dict[str, object]]:
    return {item["code"]: item for item in response.json()}


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Bearer forged"}, id="forged-token"),
    ],
)
async def test_without_a_valid_session_is_401_with_a_stable_code(
    headers: dict[str, str],
) -> None:
    # TG-574 / US TG-58 criteri 7: endpoint privat
    repo = FakeAchievementRepository(STREAK_3)
    async for client, _ in _client(repo):
        response = await client.get(PATH, headers=headers)

    assert response.status_code == 401
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == INVALID_SESSION


async def test_returns_a_flat_list_with_the_documented_snake_case_fields() -> None:
    # TG-574 / US TG-58 criteri 7: forma de la resposta
    response = await _get(FakeAchievementRepository(STREAK_3, QUIZ_10))

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2
    assert all(set(item) == FIELDS for item in body)
    item = _by_code(response)[STREAK_3.code]
    assert item["name"] == STREAK_3.name
    assert item["description"] == "d"
    assert item["category"] == "streaks"
    assert item["position"] == 1
    assert item["goal"] == 3


async def test_a_streak_of_5_shows_7_as_5_of_7_and_3_as_3_of_3_with_a_date() -> None:
    # TG-574 / US TG-58 criteri 7: progres amb ratxa de 5 dies
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)
    await AchievementService(repo, lambda _: _zero()).record_activity(
        ME.id, "streak_days", 3
    )
    moment = repo.unlocked[ME.id][STREAK_3.id].unlocked_at

    items = _by_code(await _get(repo, streak=5))

    three = items[STREAK_3.code]
    assert (three["current"], three["goal"], three["unlocked"]) == (3, 3, True)
    assert three["unlocked_at"] == moment.isoformat().replace("+00:00", "Z")
    seven = items[STREAK_7.code]
    assert (seven["current"], seven["goal"], seven["unlocked"]) == (5, 7, False)
    assert seven["unlocked_at"] is None


async def _zero() -> int:
    return 0


async def test_the_progress_never_exceeds_the_goal() -> None:
    # TG-574 / US TG-58 criteri 7: ratxa 20 -> fita de 7 surt 7 de 7
    items = _by_code(await _get(FakeAchievementRepository(STREAK_7), streak=20))

    assert (items[STREAK_7.code]["current"], items[STREAK_7.code]["goal"]) == (7, 7)


async def test_an_unlocked_achievement_is_full_even_if_the_streak_lapsed() -> None:
    # TG-574 / US TG-58 criteri 7: desbloquejada amb ratxa caducada (0)
    repo = FakeAchievementRepository(STREAK_7)
    await AchievementService(repo, lambda _: _zero()).record_activity(
        ME.id, "streak_days", 7
    )

    item = _by_code(await _get(repo, streak=0))[STREAK_7.code]

    assert (item["current"], item["goal"], item["unlocked"]) == (7, 7, True)
    assert isinstance(item["unlocked_at"], str)
    assert item["unlocked_at"].endswith("Z") or item["unlocked_at"].endswith("+00:00")


async def test_only_the_achievements_of_the_session_user_are_unlocked() -> None:
    # TG-574 / US TG-58 criteri 7: no es barregen les fites d'altres usuaris
    repo = FakeAchievementRepository(STREAK_3, QUIZ_10)
    await AchievementService(repo, lambda _: _zero()).record_activity(
        OTHER.id, "streak_days", 3
    )

    items = _by_code(await _get(repo))

    assert items[STREAK_3.code]["unlocked"] is False
    assert items[STREAK_3.code]["unlocked_at"] is None
    assert items[STREAK_3.code]["current"] == 0


async def test_each_item_has_category_and_position_ordered_by_them() -> None:
    # TG-574 / US TG-58 criteri 7: ordre per categoria i posicio
    # The catalog is given shuffled: the endpoint must not depend on its order.
    repo = FakeAchievementRepository(QUIZ_50, STREAK_7, QUIZ_10, STREAK_3)

    body = (await _get(repo)).json()

    assert all(
        isinstance(item["category"], str) and item["position"] >= 1 for item in body
    )
    categories = [item["category"] for item in body]
    # Contiguous blocks: a category never reappears after another one starts.
    blocks = [c for i, c in enumerate(categories) if i == 0 or c != categories[i - 1]]
    assert len(blocks) == len(set(categories)) == 2
    for category in set(categories):
        positions = [i["position"] for i in body if i["category"] == category]
        assert positions == sorted(positions)
    assert [i["code"] for i in body if i["category"] == "streaks"] == [
        STREAK_3.code,
        STREAK_7.code,
    ]


async def test_categories_follow_the_enum_order_and_positions_ascend_inside() -> None:
    # TG-574 / US TG-58 criteri 7: ordre fix entre categories (el de l'enum
    # AchievementCategory) i per position dins de cada una, amb catàleg barrejat.
    shuffled = [
        _achievement(AchievementKind.MINIGAME_WON, 2, AchievementCategory.MINIGAME, 2),
        _achievement(AchievementKind.FOLLOWERS, 5, AchievementCategory.SOCIAL, 3),
        _achievement(AchievementKind.QUIZ_COMPLETED, 9, AchievementCategory.QUIZ, 2),
        _achievement(AchievementKind.EVENT_EXPORTED, 1, AchievementCategory.EVENTS, 2),
        _achievement(AchievementKind.STREAK_DAYS, 30, AchievementCategory.STREAKS, 3),
        _achievement(
            AchievementKind.MINIGAME_PLAYED, 1, AchievementCategory.MINIGAME, 1
        ),
        _achievement(AchievementKind.FOLLOWING, 1, AchievementCategory.SOCIAL, 1),
        _achievement(AchievementKind.QUIZ_PERFECT, 1, AchievementCategory.QUIZ, 1),
        _achievement(
            AchievementKind.EVENT_SUBSCRIPTION, 1, AchievementCategory.EVENTS, 1
        ),
        _achievement(AchievementKind.STREAK_DAYS, 3, AchievementCategory.STREAKS, 1),
        _achievement(AchievementKind.MESSAGE_SENT, 1, AchievementCategory.SOCIAL, 2),
        _achievement(AchievementKind.STREAK_DAYS, 7, AchievementCategory.STREAKS, 2),
    ]

    body = (await _get(FakeAchievementRepository(*shuffled))).json()

    assert [(i["category"], i["position"]) for i in body] == [
        (category, position)
        for category in ("streaks", "quiz", "events", "social", "minigame")
        for position in range(1, 4 if category in ("streaks", "social") else 3)
    ]
    assert [c.value for c in AchievementCategory] == [
        "streaks",
        "quiz",
        "events",
        "social",
        "minigame",
    ]


def test_the_operation_is_documented_in_openapi() -> None:
    # TG-574 / US TG-58 criteri 7: OpenAPI (summary, description, operation_id)
    app = FastAPI()
    app.include_router(router, prefix="/api")

    operation = app.openapi()["paths"][PATH]["get"]

    assert operation["operationId"] == "list_my_achievements"
    assert operation["summary"]
    assert operation["description"]
    assert set(operation["responses"]) >= {"200", "401", "403", "503"}
    for code in ("401", "403", "503"):
        assert set(operation["responses"][code]["content"]) == {PROBLEM_JSON}
    assert INVALID_SESSION in operation["responses"]["401"]["description"]


def test_unlock_moment_type_is_a_nullable_datetime_in_the_schema() -> None:
    # TG-574 / US TG-58 criteri 7: unlocked_at es datetime o null
    app = FastAPI()
    app.include_router(router, prefix="/api")
    schemas = app.openapi()["components"]["schemas"]
    item = next(s for s in schemas.values() if "unlocked_at" in s.get("properties", {}))

    assert set(item["properties"]) == FIELDS
    kinds = item["properties"]["unlocked_at"]["anyOf"]
    assert {"type": "null"} in kinds
    assert any(k.get("format") == "date-time" for k in kinds)
