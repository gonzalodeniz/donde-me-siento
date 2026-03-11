"""Tests de integracion para la API de eventos."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from pathlib import Path

from backend.app.api.dependencies import get_current_user
from backend.app.core.config import Settings
from backend.app.db.base import Base
from backend.app.db.session import create_engine_from_settings
from backend.app.main import create_app
from backend.app.repositories.auth import AuthUser
from backend.app.repositories.events import EventRepository
from backend.app.services.events import EventService


@pytest.fixture
async def client(tmp_path: Path):
    app_settings = Settings(
        app_name="Donde me siento API Test",
        environment="test",
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
    )
    engine = create_engine_from_settings(app_settings)
    Base.metadata.create_all(bind=engine)

    app = create_app()
    app.dependency_overrides = {}

    from sqlalchemy.orm import sessionmaker

    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    session = testing_session_local()

    async def override_get_event_service() -> EventService:
        return EventService(EventRepository(session))

    async def override_get_current_user() -> AuthUser:
        return AuthUser(
            id="user-test",
            username="tester",
            password_hash="",
            password_salt="",
        )

    from backend.app.api.dependencies import get_event_service

    app.dependency_overrides[get_event_service] = override_get_event_service
    app.dependency_overrides[get_current_user] = override_get_current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client
    session.close()


@pytest.mark.anyio
async def test_create_list_get_and_delete_event(client: AsyncClient) -> None:
    response = await client.post(
        "/api/events",
        json={
            "name": "Boda Laura y Pablo",
            "default_table_capacity": 6,
            "table_count": 3,
            "guests": [
                {"id": "guest-1", "name": "Laura", "guest_type": "adulto", "group_id": "g1"},
                {"id": "guest-2", "name": "Pablo", "guest_type": "adulto", "group_id": "g1"},
            ],
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Boda Laura y Pablo"
    assert len(created["tables"]) == 3
    assert len(created["guests"]) == 2

    list_response = await client.get("/api/events")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed == [
        {
            "id": created["id"],
            "name": "Boda Laura y Pablo",
            "date": None,
            "default_table_capacity": 6,
            "table_count": 3,
            "guest_count": 2,
        }
    ]

    get_response = await client.get(f"/api/events/{created['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == created["id"]

    delete_response = await client.delete(f"/api/events/{created['id']}")
    assert delete_response.status_code == 204

    missing_response = await client.get(f"/api/events/{created['id']}")
    assert missing_response.status_code == 404


@pytest.mark.anyio
async def test_create_event_returns_400_for_invalid_guest_type(client: AsyncClient) -> None:
    response = await client.post(
        "/api/events",
        json={
            "name": "Evento invalido",
            "default_table_capacity": 4,
            "table_count": 2,
            "guests": [{"id": "guest-1", "name": "Ana", "guest_type": "vip"}],
        },
    )

    assert response.status_code == 400
    assert "Tipo de invitado no soportado" in response.json()["detail"]
