"""Dependencias de FastAPI."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.app.db.session import get_db_session
from backend.app.repositories.auth import SessionRepository, UserRepository
from backend.app.repositories.events import EventRepository
from backend.app.services.auth import AuthService, AuthenticationError
from backend.app.services.events import EventService

security = HTTPBearer(auto_error=False)


async def get_event_repository(session: Session = Depends(get_db_session)) -> EventRepository:
    """Construye el repositorio de eventos para la request actual."""

    return EventRepository(session)


async def get_event_service(repository: EventRepository = Depends(get_event_repository)) -> EventService:
    """Construye el servicio de eventos para la request actual."""

    return EventService(repository)


async def get_user_repository(session: Session = Depends(get_db_session)) -> UserRepository:
    """Construye el repositorio de usuarios para la request actual."""

    return UserRepository(session)


async def get_session_repository(session: Session = Depends(get_db_session)) -> SessionRepository:
    """Construye el repositorio de sesiones para la request actual."""

    return SessionRepository(session)


async def get_auth_service(
    user_repository: UserRepository = Depends(get_user_repository),
    session_repository: SessionRepository = Depends(get_session_repository),
) -> AuthService:
    """Construye el servicio de autenticacion para la request actual."""

    return AuthService(user_repository, session_repository)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    auth_service: AuthService = Depends(get_auth_service),
):
    """Obtiene el usuario autenticado desde un bearer token."""

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
        )

    try:
        return auth_service.get_current_user(credentials.credentials)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion invalida",
        ) from exc
