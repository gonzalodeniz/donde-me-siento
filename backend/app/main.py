"""Punto de entrada de FastAPI para la Fase 1."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.api.routes.events import router as events_router
from backend.app.core.config import settings
from backend.app.db.session import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Inicializa recursos compartidos de la aplicacion."""

    init_db()
    yield


def create_app() -> FastAPI:
    """Crea la aplicacion FastAPI y registra sus dependencias."""

    application = FastAPI(title=settings.app_name, lifespan=lifespan)

    @application.get("/health", tags=["system"])
    async def healthcheck() -> dict[str, str]:
        """Endpoint basico para comprobar que la API responde."""

        return {"status": "ok"}

    application.include_router(events_router)
    return application


app = create_app()
