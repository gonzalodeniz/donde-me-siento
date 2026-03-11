"""Dependencias de FastAPI."""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from backend.app.db.session import get_db_session
from backend.app.repositories.events import EventRepository
from backend.app.services.events import EventService


async def get_event_repository(session: Session = Depends(get_db_session)) -> EventRepository:
    """Construye el repositorio de eventos para la request actual."""

    return EventRepository(session)


async def get_event_service(repository: EventRepository = Depends(get_event_repository)) -> EventService:
    """Construye el servicio de eventos para la request actual."""

    return EventService(repository)
