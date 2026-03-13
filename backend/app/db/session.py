"""Gestion de engine y sesiones SQLAlchemy."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, inspect, text
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
    inspector = inspect(current_engine)
    table_names = inspector.get_table_names()
    if "guests" not in table_names:
        return

    guest_columns = {column["name"] for column in inspector.get_columns("guests")}
    with current_engine.begin() as connection:
        if "seat_index" not in guest_columns:
            connection.execute(text("ALTER TABLE guests ADD COLUMN seat_index INTEGER"))

        if "saved_sessions" in table_names:
            session_columns = {column["name"] for column in inspector.get_columns("saved_sessions")}
            if "created_at" not in session_columns:
                connection.execute(text("ALTER TABLE saved_sessions ADD COLUMN created_at VARCHAR(32)"))
                connection.execute(text("UPDATE saved_sessions SET created_at = '2026-03-13T00:00:00' WHERE created_at IS NULL"))


async def get_db_session():
    """Dependency de FastAPI para sesiones transaccionales."""

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
