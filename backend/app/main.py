"""Punto de entrada de FastAPI para la Fase 1."""

from __future__ import annotations

from contextlib import asynccontextmanager
import mimetypes
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, Response

from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.events import router as events_router
from backend.app.core.config import settings
from backend.app.db.session import SessionLocal, init_db
from backend.app.repositories.auth import SessionRepository, UserRepository
from backend.app.repositories.events import EventRepository
from backend.app.services.auth import AuthService
from backend.app.services.events import EventService

ROOT_DIR = Path(__file__).resolve().parents[2]
RESERVED_FRONTEND_PREFIXES = ("api/", "docs", "redoc", "openapi.json", "health")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Inicializa recursos compartidos de la aplicacion."""

    init_db()
    session = SessionLocal()
    try:
        auth_service = AuthService(UserRepository(session), SessionRepository(session))
        auth_service.ensure_pair_users()
        EventService(EventRepository(session)).ensure_workspace()
        yield
    finally:
        session.close()


def _resolve_frontend_dist_dir(frontend_dist_dir: Path | None = None) -> Path | None:
    """Localiza la build del frontend si existe para servirla desde FastAPI."""

    candidates: list[Path] = []
    if frontend_dist_dir is not None:
        candidates.append(frontend_dist_dir)

    configured_dist_dir = os.getenv("DMS_FRONTEND_DIST_DIR")
    if configured_dist_dir:
        candidates.append(Path(configured_dist_dir))

    candidates.extend((ROOT_DIR / "frontend-dist", ROOT_DIR / "frontend" / "dist"))

    for candidate in candidates:
        if candidate.is_dir() and (candidate / "index.html").is_file():
            return candidate

    return None


def create_app(frontend_dist_dir: Path | None = None) -> FastAPI:
    """Crea la aplicacion FastAPI y registra sus dependencias."""

    application = FastAPI(title=settings.app_name, lifespan=lifespan)

    @application.get("/health", tags=["system"])
    async def healthcheck() -> dict[str, str]:
        """Endpoint basico para comprobar que la API responde."""

        return {"status": "ok"}

    application.include_router(auth_router)
    application.include_router(events_router)

    resolved_frontend_dist_dir = _resolve_frontend_dist_dir(frontend_dist_dir)
    if resolved_frontend_dist_dir is not None:
        index_file = resolved_frontend_dist_dir / "index.html"
        frontend_root = resolved_frontend_dist_dir.resolve()
        index_html = index_file.read_text(encoding="utf-8")

        @application.get("/", include_in_schema=False)
        async def serve_frontend_index() -> HTMLResponse:
            return HTMLResponse(index_html)

        @application.get("/{path:path}", include_in_schema=False)
        async def serve_frontend(path: str) -> Response:
            if path.startswith(RESERVED_FRONTEND_PREFIXES):
                raise HTTPException(status_code=404, detail="Not Found")

            requested_path = (frontend_root / path).resolve()
            try:
                requested_path.relative_to(frontend_root)
            except ValueError as exc:
                raise HTTPException(status_code=404, detail="Not Found") from exc

            if requested_path.is_file():
                media_type, _ = mimetypes.guess_type(requested_path.name)
                return Response(
                    content=requested_path.read_bytes(),
                    media_type=media_type or "application/octet-stream",
                )

            return HTMLResponse(index_html)

    return application


app = create_app()
