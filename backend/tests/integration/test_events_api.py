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


@pytest.mark.anyio
async def test_guest_crud_assignment_and_validation_flow(client: AsyncClient) -> None:
    create_event_response = await client.post(
        "/api/events",
        json={
            "name": "Evento seating",
            "default_table_capacity": 2,
            "table_count": 2,
            "guests": [],
        },
    )
    assert create_event_response.status_code == 201
    event = create_event_response.json()
    event_id = event["id"]

    add_guest_1 = await client.post(
        f"/api/events/{event_id}/guests",
        json={"name": "Ana", "guest_type": "adulto", "group_id": "g1"},
    )
    assert add_guest_1.status_code == 201
    event = add_guest_1.json()
    guest_1 = next(guest for guest in event["guests"] if guest["name"] == "Ana")

    add_guest_2 = await client.post(
        f"/api/events/{event_id}/guests",
        json={"name": "Luis", "guest_type": "adulto", "group_id": "g1"},
    )
    assert add_guest_2.status_code == 201
    event = add_guest_2.json()
    guest_2 = next(guest for guest in event["guests"] if guest["name"] == "Luis")

    update_guest = await client.put(
        f"/api/events/{event_id}/guests/{guest_1['id']}",
        json={"name": "Ana Maria", "guest_type": "adulto", "group_id": "g1"},
    )
    assert update_guest.status_code == 200
    assert any(guest["name"] == "Ana Maria" for guest in update_guest.json()["guests"])

    assign_guest_1 = await client.put(
        f"/api/events/{event_id}/guests/{guest_1['id']}/assignment",
        json={"table_id": "table-1"},
    )
    assert assign_guest_1.status_code == 200

    assign_guest_2 = await client.put(
        f"/api/events/{event_id}/guests/{guest_2['id']}/assignment",
        json={"table_id": "table-2"},
    )
    assert assign_guest_2.status_code == 200

    validation_response = await client.get(f"/api/events/{event_id}/validation")
    assert validation_response.status_code == 200
    validation = validation_response.json()
    assert validation["grouping_conflicts"] == {"g1": sorted([guest_1["id"], guest_2["id"]])}
    assert validation["assigned_guests"] == 2
    assert validation["unassigned_guests"] == 0

    unassign_guest_2 = await client.delete(f"/api/events/{event_id}/guests/{guest_2['id']}/assignment")
    assert unassign_guest_2.status_code == 200
    unassigned_guest = next(
        guest for guest in unassign_guest_2.json()["guests"] if guest["id"] == guest_2["id"]
    )
    assert unassigned_guest["table_id"] is None

    delete_guest = await client.delete(f"/api/events/{event_id}/guests/{guest_2['id']}")
    assert delete_guest.status_code == 200
    assert all(guest["id"] != guest_2["id"] for guest in delete_guest.json()["guests"])


@pytest.mark.anyio
async def test_assignment_rejects_full_table(client: AsyncClient) -> None:
    create_event_response = await client.post(
        "/api/events",
        json={
            "name": "Evento capacidad",
            "default_table_capacity": 1,
            "table_count": 1,
            "guests": [
                {"id": "guest-1", "name": "Ana", "guest_type": "adulto"},
                {"id": "guest-2", "name": "Luis", "guest_type": "adulto"},
            ],
        },
    )
    event_id = create_event_response.json()["id"]

    assign_first = await client.put(
        f"/api/events/{event_id}/guests/guest-1/assignment",
        json={"table_id": "table-1"},
    )
    assert assign_first.status_code == 200

    assign_second = await client.put(
        f"/api/events/{event_id}/guests/guest-2/assignment",
        json={"table_id": "table-1"},
    )
    assert assign_second.status_code == 400
    assert "no tiene asientos libres" in assign_second.json()["detail"]


@pytest.mark.anyio
async def test_tables_summary_and_capacity_update_flow(client: AsyncClient) -> None:
    create_event_response = await client.post(
        "/api/events",
        json={
            "name": "Evento panel",
            "default_table_capacity": 4,
            "table_count": 2,
            "guests": [
                {"id": "guest-1", "name": "Ana", "guest_type": "adulto"},
                {"id": "guest-2", "name": "Luis", "guest_type": "adulto"},
            ],
        },
    )
    assert create_event_response.status_code == 201
    event_id = create_event_response.json()["id"]

    await client.put(
        f"/api/events/{event_id}/guests/guest-1/assignment",
        json={"table_id": "table-1"},
    )
    await client.put(
        f"/api/events/{event_id}/guests/guest-2/assignment",
        json={"table_id": "table-1"},
    )

    summary_response = await client.get(f"/api/events/{event_id}/tables/summary")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary[0] == {
        "table_id": "table-1",
        "table_number": 1,
        "capacity": 4,
        "occupied": 2,
        "available": 2,
    }

    update_capacity_response = await client.put(
        f"/api/events/{event_id}/tables/table-1",
        json={"capacity": 6},
    )
    assert update_capacity_response.status_code == 200
    updated_table = next(table for table in update_capacity_response.json()["tables"] if table["id"] == "table-1")
    assert updated_table["capacity"] == 6

    validation_response = await client.get(f"/api/events/{event_id}/validation")
    assert validation_response.status_code == 200
    updated_summary = validation_response.json()["tables"][0]
    assert updated_summary["capacity"] == 6
    assert updated_summary["occupied"] == 2
    assert updated_summary["available"] == 4


@pytest.mark.anyio
async def test_capacity_update_rejects_value_below_current_occupancy(client: AsyncClient) -> None:
    create_event_response = await client.post(
        "/api/events",
        json={
            "name": "Evento aforo",
            "default_table_capacity": 3,
            "table_count": 1,
            "guests": [
                {"id": "guest-1", "name": "Ana", "guest_type": "adulto"},
                {"id": "guest-2", "name": "Luis", "guest_type": "adulto"},
            ],
        },
    )
    assert create_event_response.status_code == 201
    event_id = create_event_response.json()["id"]

    await client.put(
        f"/api/events/{event_id}/guests/guest-1/assignment",
        json={"table_id": "table-1"},
    )
    await client.put(
        f"/api/events/{event_id}/guests/guest-2/assignment",
        json={"table_id": "table-1"},
    )

    update_capacity_response = await client.put(
        f"/api/events/{event_id}/tables/table-1",
        json={"capacity": 1},
    )
    assert update_capacity_response.status_code == 400
    assert "capacidad no puede ser menor" in update_capacity_response.json()["detail"]
