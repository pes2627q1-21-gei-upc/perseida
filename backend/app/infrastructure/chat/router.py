import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.chat.errors import CHAT_ROOM_NOT_FOUND
from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    DATABASE_UNAVAILABLE,
    INVALID_SESSION,
)
from app.domain.chat.errors import (
    CHAT_INVALID_CURSOR,
    CHAT_INVALID_LIMIT,
    PAGE_MAX_LIMIT,
)
from app.domain.chat.models import ChatMessage, EventChatRoom
from app.domain.events.errors import EVENT_NOT_FOUND
from app.infrastructure.api.schemas import PROBLEM_CONTENT, ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.chat.dependencies import ChatServiceDep
from app.infrastructure.chat.schemas import (
    ChatHistoryResponse,
    ChatMessageResponse,
    ChatRoomResponse,
)
from app.infrastructure.users.dependencies import UserServiceDep

# Event chat over REST (TG-455): rooms and history. Sending goes through the
# WebSocket. Every endpoint needs a session.
router = APIRouter(tags=["chat"])


def _problem(description: str) -> dict[str, Any]:
    return {
        "model": ProblemDetails,
        "description": description,
        "content": PROBLEM_CONTENT,
    }


_SESSION_ERRORS: dict[int | str, dict[str, Any]] = {
    401: _problem(f"Sessió absent, invàlida o revocada (`{INVALID_SESSION}`)."),
    403: _problem(
        f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`)."
    ),
    503: _problem(
        f"No es pot comprovar la sessió (`{SESSION_UNAVAILABLE}`) o la base de "
        f"dades no respon (`{DATABASE_UNAVAILABLE}`)."
    ),
}
_EVENT_ERRORS: dict[int | str, dict[str, Any]] = {
    **_SESSION_ERRORS,
    403: _problem(
        f"No estàs subscrita a l'esdeveniment (`FORBIDDEN`), o el compte és "
        f"suspès (`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`)."
    ),
    404: _problem(
        f"L'esdeveniment no existeix (`{EVENT_NOT_FOUND}`) o no té sala "
        f"(`{CHAT_ROOM_NOT_FOUND}`)."
    ),
}


def _room_dto(room: EventChatRoom, last: ChatMessage | None) -> ChatRoomResponse:
    return ChatRoomResponse(
        id=room.id,
        event_id=room.event_id,
        created_at=room.created_at,
        last_message=(
            ChatMessageResponse.model_validate(last, from_attributes=True)
            if last
            else None
        ),
    )


@router.get(
    "/chat/rooms",
    operation_id="list_my_chat_rooms",
    response_model=list[ChatRoomResponse],
    status_code=status.HTTP_200_OK,
    summary="Sales de xat de les teves subscripcions",
    description=(
        "Retorna les sales dels esdeveniments als quals està subscrita la usuària "
        "de la sessió, ordenades pel darrer missatge (o, si no en tenen, per "
        "creació) de més nou a més antic. Cada sala inclou el darrer missatge o "
        "`null`. Els esdeveniments sense sala encara no hi surten. Array buit si "
        "no n'hi ha cap."
    ),
    response_description="Les sales de la usuària.",
    responses=_SESSION_ERRORS,
)
async def list_my_chat_rooms(
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: ChatServiceDep,
) -> list[ChatRoomResponse]:
    """Llista les sales de xat de la usuària."""
    user = await users.get_profile(session.sub)
    summaries = await chat.list_rooms(user.id)
    return [_room_dto(s.room, s.last_message) for s in summaries]


@router.put(
    "/events/{event_id}/chat/room",
    operation_id="open_event_chat_room",
    response_model=ChatRoomResponse,
    status_code=status.HTTP_200_OK,
    summary="Obre la sala de xat d'un esdeveniment",
    description=(
        "Retorna la sala de l'esdeveniment, i la crea si encara no existeix. És "
        "idempotent: sempre respon 200 amb la mateixa sala. Inclou el darrer "
        "missatge o `null` si encara no en té, igual que `GET /chat/rooms`. Cal "
        "estar subscrita a l'esdeveniment; si no, 403 i no es crea res."
    ),
    response_description="La sala de l'esdeveniment.",
    responses={
        **_EVENT_ERRORS,
        422: _problem("Identificador d'esdeveniment invàlid."),
    },
)
async def open_event_chat_room(
    event_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: ChatServiceDep,
) -> ChatRoomResponse:
    """Obre (o crea) la sala de l'esdeveniment."""
    user = await users.get_profile(session.sub)
    summary = await chat.open_room(user.id, event_id)
    return _room_dto(summary.room, summary.last_message)


@router.get(
    "/events/{event_id}/chat/messages",
    operation_id="list_event_chat_messages",
    response_model=ChatHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Historial de xat d'un esdeveniment",
    description=(
        "Retorna una pàgina de l'historial, del missatge més nou al més antic. "
        f"`limit` va de 1 a {PAGE_MAX_LIMIT} (per defecte {PAGE_MAX_LIMIT}). "
        "`before` és el `next_cursor` de la pàgina anterior; `next_cursor` és "
        "`null` quan no hi ha missatges més antics. Cal estar subscrita a "
        "l'esdeveniment. Crea la sala si encara no existeix."
    ),
    response_description="Una pàgina de missatges.",
    responses={
        **_EVENT_ERRORS,
        422: _problem(
            f"`limit` fora de rang (`{CHAT_INVALID_LIMIT}`), cursor invàlid "
            f"(`{CHAT_INVALID_CURSOR}`) o identificador d'esdeveniment invàlid."
        ),
    },
)
async def list_event_chat_messages(
    event_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: ChatServiceDep,
    before: Annotated[
        str | None, Query(description="Cursor de la pàgina anterior (opac).")
    ] = None,
    # No ge/le here on purpose: the service answers CHAT_INVALID_LIMIT.
    limit: Annotated[
        int, Query(description=f"Missatges per pàgina (1 a {PAGE_MAX_LIMIT}).")
    ] = PAGE_MAX_LIMIT,
) -> ChatHistoryResponse:
    """Retorna una pàgina de l'historial."""
    user = await users.get_profile(session.sub)
    page = await chat.history(user.id, event_id, before=before, limit=limit)
    return ChatHistoryResponse(
        messages=[
            ChatMessageResponse.model_validate(m, from_attributes=True)
            for m in page.messages
        ],
        next_cursor=page.next_cursor,
    )
