"""Gestion de engine y sesiones SQLAlchemy."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import Settings, settings
from backend.app.db.base import Base


def create_engine_from_settings(app_settings: Settings = settings):
    """Crea un engine SQLAlchemy para la configuracion indicada."""

    if app_settings.database_url.startswith("sqlite:///"):
        app_settings.data_dir.mkdir(parents=True, exist_ok=True)

    connect_args = {"check_same_thread": False} if app_settings.database_url.startswith("sqlite") else {}
    return create_engine(app_settings.database_url, connect_args=connect_args)


engine = create_engine_from_settings(settings)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db(current_engine=engine) -> None:
    """Inicializa el esquema de base de datos."""

    Base.metadata.create_all(bind=current_engine)


async def get_db_session():
    """Dependency de FastAPI para sesiones transaccionales."""

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
