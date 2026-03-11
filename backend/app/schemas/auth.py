"""Esquemas Pydantic de autenticacion."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Payload de login."""

    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=255)


class AuthenticatedUserResponse(BaseModel):
    """Usuario autenticado expuesto a cliente."""

    id: str
    username: str


class LoginResponse(BaseModel):
    """Respuesta de login exitoso."""

    access_token: str
    token_type: str = "bearer"
    user: AuthenticatedUserResponse
