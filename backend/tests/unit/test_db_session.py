"""Tests unitarios de migraciones ligeras en db.session."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from backend.app.db.session import init_db


def _sqlite_engine(database_path: Path):
    return create_engine(f"sqlite:///{database_path}", connect_args={"check_same_thread": False})


def test_init_db_adds_missing_columns_to_legacy_tables_and_guests(tmp_path: Path) -> None:
    engine = _sqlite_engine(tmp_path / "legacy-workspace.db")

    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE events (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, date VARCHAR(255), default_table_capacity INTEGER NOT NULL)"))
        connection.execute(text("INSERT INTO events (id, name, date, default_table_capacity) VALUES ('workspace-main', 'Workspace principal', NULL, 8)"))
        connection.execute(text("CREATE TABLE tables (id VARCHAR(255) PRIMARY KEY, event_id VARCHAR(255) NOT NULL, number INTEGER NOT NULL, capacity INTEGER NOT NULL, position_x FLOAT NOT NULL, position_y FLOAT NOT NULL)"))
        connection.execute(text("CREATE TABLE guests (id VARCHAR(255) PRIMARY KEY, event_id VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, guest_type VARCHAR(32) NOT NULL, group_id VARCHAR(255), table_id VARCHAR(255))"))

    init_db(engine)

    inspector = inspect(engine)
    table_columns = {column["name"] for column in inspector.get_columns("tables")}
    guest_columns = {column["name"] for column in inspector.get_columns("guests")}

    assert "table_kind" in table_columns
    assert "rotation_degrees" in table_columns
    assert "seat_index" in guest_columns
    assert "confirmed" in guest_columns
    assert "intolerance" in guest_columns
    assert "menu" in guest_columns


def test_init_db_adds_created_at_to_legacy_saved_sessions(tmp_path: Path) -> None:
    engine = _sqlite_engine(tmp_path / "legacy-sessions.db")

    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE events (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, date VARCHAR(255), default_table_capacity INTEGER NOT NULL)"))
        connection.execute(text("INSERT INTO events (id, name, date, default_table_capacity) VALUES ('workspace-main', 'Workspace principal', NULL, 8)"))
        connection.execute(text("CREATE TABLE guests (id VARCHAR(255) PRIMARY KEY, event_id VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, guest_type VARCHAR(32) NOT NULL, group_id VARCHAR(255), table_id VARCHAR(255))"))
        connection.execute(text("CREATE TABLE saved_sessions (id VARCHAR(255) PRIMARY KEY, event_id VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, snapshot_json TEXT NOT NULL)"))
        connection.exec_driver_sql(
            """INSERT INTO saved_sessions (id, event_id, name, snapshot_json)
            VALUES ('session-1', 'workspace-main', 'Base', '{"id":"workspace-main","name":"Workspace principal","default_table_capacity":8,"tables":[],"guests":[]}')
            """
        )

    init_db(engine)

    inspector = inspect(engine)
    session_columns = {column["name"] for column in inspector.get_columns("saved_sessions")}
    assert "created_at" in session_columns

    with engine.connect() as connection:
        created_at = connection.execute(text("SELECT created_at FROM saved_sessions WHERE id = 'session-1'")).scalar_one()

    assert created_at == "2026-03-13T00:00:00"
