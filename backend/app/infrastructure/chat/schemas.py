"""Public DTOs of the event chat REST API (TG-455)."""

import uuid

from pydantic import AwareDatetime, BaseModel, Field


class ChatAuthorResponse(BaseModel):
    id: uuid.UUID = Field(description="Identificador de l'autora.")
    name: str | None = Field(
        description=(
            "Nom del perfil de l'autora; `null` si no en té. Mai és el correu: "
            "l'app hi posa un nom genèric."
        ),
    )


class ChatMessageResponse(BaseModel):
    id: uuid.UUID = Field(description="Identificador del missatge (UUIDv7).")
    room_id: uuid.UUID = Field(description="Sala a la qual pertany.")
    author: ChatAuthorResponse
    text: str = Field(description="Text del missatge, ja netejat pel servidor.")
    sent_at: AwareDatetime = Field(
        description="Instant d'enviament (el posa el servidor)."
    )


class ChatRoomResponse(BaseModel):
    id: uuid.UUID = Field(description="Identificador de la sala.")
    event_id: uuid.UUID = Field(
        description="Esdeveniment de la sala (n'hi ha una per esdeveniment)."
    )
    created_at: AwareDatetime = Field(description="Instant de creació de la sala.")
    last_message: ChatMessageResponse | None = Field(
        default=None,
        description="Últim missatge de la sala; null si encara no n'hi ha.",
    )


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessageResponse] = Field(
        description="Pàgina d'historial, del missatge més nou al més antic."
    )
    next_cursor: str | None = Field(
        default=None,
        description="Cursor opac per a `before`; null si no hi ha més antics.",
    )
