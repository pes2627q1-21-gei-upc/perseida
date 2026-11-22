"""Authenticated direct-chat REST endpoints (TG-65)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status

from app.application.direct_chat.models import ConversationOverview
from app.infrastructure.api.schemas import PROBLEM_CONTENT, ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.direct_chat.dependencies import DirectChatServiceDep
from app.infrastructure.direct_chat.schemas import (
    DirectConversationResponse,
    DirectHistoryResponse,
    DirectMessageResponse,
    OpenDirectConversationRequest,
)
from app.infrastructure.users.dependencies import UserServiceDep

router = APIRouter(tags=["direct-chat"])


def _problem(description: str) -> dict[str, Any]:
    return {
        "model": ProblemDetails,
        "description": description,
        "content": PROBLEM_CONTENT,
    }


_ERRORS: dict[int | str, dict[str, Any]] = {
    401: _problem("Sessió absent, invàlida o revocada (INVALID_SESSION)."),
    403: _problem("Compte suspès o esborrat."),
    404: _problem(
        "Usuari o conversa no trobats (USER_NOT_FOUND, CONVERSATION_NOT_FOUND)."
    ),
    422: _problem(
        "Entrada invàlida o usuari propi (VALIDATION_ERROR, CANNOT_MESSAGE_SELF)."
    ),
    503: _problem("Servei de sessió o base de dades no disponibles."),
}


@router.post(
    "/direct-conversations",
    response_model=DirectConversationResponse,
    status_code=201,
    responses={
        **_ERRORS,
        200: {"description": "Conversa existent.", "model": DirectConversationResponse},
    },
)
async def open_direct_conversation(
    body: OpenDirectConversationRequest,
    response: Response,
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: DirectChatServiceDep,
) -> DirectConversationResponse:
    user = await users.get_profile(session.sub)
    conversation, created = await chat.open_conversation(user.id, body.user_id)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return DirectConversationResponse.model_validate(conversation, from_attributes=True)


@router.get(
    "/direct-conversations",
    response_model=list[ConversationOverview],
    responses=_ERRORS,
)
async def list_direct_conversations(
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: DirectChatServiceDep,
) -> list[ConversationOverview]:
    user = await users.get_profile(session.sub)
    return await chat.list_conversations(user.id)


@router.get(
    "/direct-conversations/{conversation_id}/messages",
    response_model=DirectHistoryResponse,
    responses=_ERRORS,
)
async def direct_history(
    conversation_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: DirectChatServiceDep,
    before: Annotated[
        str | None, Query(description="Cursor opac de la pàgina anterior.")
    ] = None,
    limit: Annotated[int, Query(description="Missatges per pàgina (1 a 50).")] = 50,
) -> DirectHistoryResponse:
    user = await users.get_profile(session.sub)
    page = await chat.get_history(user.id, conversation_id, before=before, limit=limit)
    return DirectHistoryResponse(
        messages=[
            DirectMessageResponse.model_validate(m, from_attributes=True)
            for m in page.items
        ],
        next_cursor=page.next_cursor,
    )


@router.post(
    "/direct-conversations/{conversation_id}/read", status_code=204, responses=_ERRORS
)
async def mark_direct_read(
    conversation_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: DirectChatServiceDep,
) -> Response:
    user = await users.get_profile(session.sub)
    await chat.mark_read(user.id, conversation_id)
    return Response(status_code=204)


@router.put("/users/{user_id}/block", status_code=204, responses=_ERRORS)
async def block_user(
    user_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: DirectChatServiceDep,
) -> Response:
    user = await users.get_profile(session.sub)
    await chat.block_user(user.id, user_id)
    return Response(status_code=204)


@router.delete("/users/{user_id}/block", status_code=204, responses=_ERRORS)
async def unblock_user(
    user_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    chat: DirectChatServiceDep,
) -> Response:
    user = await users.get_profile(session.sub)
    await chat.unblock_user(user.id, user_id)
    return Response(status_code=204)
