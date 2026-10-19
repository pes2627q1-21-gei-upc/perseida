from pydantic import BaseModel, Field


class FieldError(BaseModel):
    field: str = Field(..., description="Camp que ha fallat la validació")
    message: str = Field(..., description="Motiu tècnic de l'error")
    type: str = Field(..., description="Tipus d'error de validació")


class ProblemDetails(BaseModel):
    """RFC 9457 error body, as built by ``problem_response``."""

    type: str = Field(..., examples=["about:blank"])
    title: str = Field(..., description="Frase HTTP estàndard de l'estat")
    status: int
    detail: str = Field(..., description="Missatge tècnic, mai per a l'usuari")
    instance: str = Field(..., description="Ruta de la petició")
    code: str = Field(..., description="Codi d'error estable que tradueix el frontend")
    correlation_id: str
    errors: list[FieldError] = Field(
        default_factory=list,
        description="Només en errors de validació; en la resta, la clau no hi és",
    )
