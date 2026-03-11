"""Rutas HTTP de autenticacion."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from backend.app.api.dependencies import get_auth_service, get_current_user, security
from backend.app.repositories.auth import AuthUser
from backend.app.schemas.auth import AuthenticatedUserResponse, LoginRequest, LoginResponse
from backend.app.services.auth import AuthService, AuthenticationError


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, auth_service: AuthService = Depends(get_auth_service)) -> LoginResponse:
    """Autentica un usuario y crea una sesion."""

    try:
        access_token, user = auth_service.login(payload.username, payload.password)
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales invalidas") from exc

    return LoginResponse(
        access_token=access_token,
        user=AuthenticatedUserResponse(id=user.id, username=user.username),
    )


@router.get("/me", response_model=AuthenticatedUserResponse)
async def me(current_user: AuthUser = Depends(get_current_user)) -> AuthenticatedUserResponse:
    """Devuelve el usuario autenticado."""

    return AuthenticatedUserResponse(id=current_user.id, username=current_user.username)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    auth_service: AuthService = Depends(get_auth_service),
) -> None:
    """Cierra la sesion actual."""

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")

    try:
        auth_service.logout(credentials.credentials)
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion invalida") from exc
