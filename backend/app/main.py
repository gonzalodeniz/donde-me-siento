"""Punto de entrada de FastAPI para la Fase 1."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.events import router as events_router
from backend.app.core.config import settings
from backend.app.db.session import SessionLocal, init_db
from backend.app.repositories.auth import SessionRepository, UserRepository
from backend.app.repositories.events import EventRepository
from backend.app.services.auth import AuthService
from backend.app.services.events import EventService


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Inicializa recursos compartidos de la aplicacion."""

    init_db()
    session = SessionLocal()
    try:
        auth_service = AuthService(UserRepository(session), SessionRepository(session))
        auth_service.ensure_default_user(settings.default_admin_username, settings.default_admin_password)
        EventService(EventRepository(session)).ensure_workspace()
        yield
    finally:
        session.close()


def create_app() -> FastAPI:
    """Crea la aplicacion FastAPI y registra sus dependencias."""

    application = FastAPI(title=settings.app_name, lifespan=lifespan)

    @application.get("/health", tags=["system"])
    async def healthcheck() -> dict[str, str]:
        """Endpoint basico para comprobar que la API responde."""

        return {"status": "ok"}

    application.include_router(auth_router)
    application.include_router(events_router)
    return application


app = create_app()
