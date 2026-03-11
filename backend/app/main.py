"""Punto de entrada minimo de FastAPI para la Fase 1."""

from __future__ import annotations

from fastapi import FastAPI

from backend.app.core.config import settings


app = FastAPI(title=settings.app_name)


@app.get("/health", tags=["system"])
def healthcheck() -> dict[str, str]:
    """Endpoint basico para comprobar que la API responde."""
    return {"status": "ok"}
