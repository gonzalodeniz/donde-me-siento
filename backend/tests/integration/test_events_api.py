"""Tests de integracion para la API del workspace unico."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

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
    event_service = EventService(EventRepository(session))
    event_service.ensure_workspace()

    async def override_get_event_service() -> EventService:
        return event_service

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
async def test_workspace_endpoint_returns_default_singleton(client: AsyncClient) -> None:
    response = await client.get("/api/workspace")

    assert response.status_code == 200
    payload = response.json()
    assert payload["event_id"] == "workspace-main"
    assert payload["name"] == "Workspace principal"
    assert len(payload["tables"]) == 9
    assert payload["tables"][0]["id"] == "table-couple"
    assert payload["tables"][0]["table_kind"] == "couple"
    assert payload["tables"][0]["capacity"] == 2


@pytest.mark.anyio
async def test_create_guest_returns_400_for_invalid_guest_type(client: AsyncClient) -> None:
    response = await client.post(
        "/api/guests",
        json={"id": "guest-1", "name": "Ana", "guest_type": "vip"},
    )

    assert response.status_code == 400
    assert "Tipo de invitado no soportado" in response.json()["detail"]


@pytest.mark.anyio
async def test_guest_crud_assignment_and_validation_flow(client: AsyncClient) -> None:
    add_guest_1 = await client.post(
        "/api/guests",
        json={"id": "guest-1", "name": "Ana", "guest_type": "adulto", "group_id": "g1"},
    )
    assert add_guest_1.status_code == 201
    created_guest_1 = next(guest for guest in add_guest_1.json()["guests"] if guest["id"] == "guest-1")
    assert created_guest_1["confirmed"] is False

    add_guest_2 = await client.post(
        "/api/guests",
        json={"id": "guest-2", "name": "Luis", "guest_type": "adulto", "group_id": "g1", "confirmed": True},
    )
    assert add_guest_2.status_code == 201
    created_guest_2 = next(guest for guest in add_guest_2.json()["guests"] if guest["id"] == "guest-2")
    assert created_guest_2["confirmed"] is True

    update_guest = await client.put(
        "/api/guests/guest-1",
        json={"name": "Ana Maria", "guest_type": "adulto", "group_id": "g1", "confirmed": True},
    )
    assert update_guest.status_code == 200
    updated_guest = next(guest for guest in update_guest.json()["guests"] if guest["id"] == "guest-1")
    assert updated_guest["name"] == "Ana Maria"
    assert updated_guest["confirmed"] is True

    assign_guest_1 = await client.put(
        "/api/guests/guest-1/assignment",
        json={"table_id": "table-1"},
    )
    assert assign_guest_1.status_code == 200

    assign_guest_2 = await client.put(
        "/api/guests/guest-2/assignment",
        json={"table_id": "table-2"},
    )
    assert assign_guest_2.status_code == 200

    validation_response = await client.get("/api/validation")
    assert validation_response.status_code == 200
    validation = validation_response.json()
    assert validation["grouping_conflicts"] == {"g1": ["guest-1", "guest-2"]}
    assert validation["assigned_guests"] == 2
    assert validation["unassigned_guests"] == 0

    unassign_guest_2 = await client.delete("/api/guests/guest-2/assignment")
    assert unassign_guest_2.status_code == 200
    unassigned_guest = next(
        guest for guest in unassign_guest_2.json()["guests"] if guest["id"] == "guest-2"
    )
    assert unassigned_guest["table_id"] is None

    delete_guest = await client.delete("/api/guests/guest-2")
    assert delete_guest.status_code == 200
    assert all(guest["id"] != "guest-2" for guest in delete_guest.json()["guests"])


@pytest.mark.anyio
async def test_import_guests_creates_all_guests_atomically(client: AsyncClient) -> None:
    response = await client.post(
        "/api/guests/import",
        json={
            "guests": [
                {"id": "guest-1", "name": "Ana", "guest_type": "adulto", "confirmed": True, "group_id": "g1"},
                {"id": "guest-2", "name": "Luis", "guest_type": "adolescente", "confirmed": False, "group_id": "g1"},
                {"id": "guest-3", "name": "Marta", "guest_type": "nino", "confirmed": True},
            ]
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert len(payload["guests"]) == 3
    imported_guest = next(guest for guest in payload["guests"] if guest["id"] == "guest-2")
    assert imported_guest["guest_type"] == "adolescente"
    assert imported_guest["confirmed"] is False
    assert imported_guest["group_id"] == "g1"


@pytest.mark.anyio
async def test_import_guests_rejects_invalid_payload_without_partial_import(client: AsyncClient) -> None:
    response = await client.post(
        "/api/guests/import",
        json={
            "guests": [
                {"id": "guest-1", "name": "Ana", "guest_type": "adulto", "confirmed": True},
                {"id": "guest-2", "name": "Luis", "guest_type": "vip", "confirmed": True},
            ]
        },
    )

    assert response.status_code == 400
    assert "Tipo de invitado no soportado" in response.json()["detail"]

    workspace_response = await client.get("/api/workspace")
    assert workspace_response.status_code == 200
    workspace = workspace_response.json()
    assert workspace["guests"]["assigned"] == []
    assert workspace["guests"]["unassigned"] == []


@pytest.mark.anyio
async def test_assignment_rejects_full_table(client: AsyncClient) -> None:
    await client.put("/api/tables/table-1", json={"capacity": 1})
    await client.post("/api/guests", json={"id": "guest-1", "name": "Ana", "guest_type": "adulto"})
    await client.post("/api/guests", json={"id": "guest-2", "name": "Luis", "guest_type": "adulto"})

    assign_first = await client.put(
        "/api/guests/guest-1/assignment",
        json={"table_id": "table-1"},
    )
    assert assign_first.status_code == 200

    assign_second = await client.put(
        "/api/guests/guest-2/assignment",
        json={"table_id": "table-1"},
    )
    assert assign_second.status_code == 400
    assert "no tiene asientos libres" in assign_second.json()["detail"]


@pytest.mark.anyio
async def test_tables_summary_and_capacity_update_flow(client: AsyncClient) -> None:
    await client.post("/api/guests", json={"id": "guest-1", "name": "Ana", "guest_type": "adulto"})
    await client.post("/api/guests", json={"id": "guest-2", "name": "Luis", "guest_type": "adulto"})
    await client.put("/api/guests/guest-1/assignment", json={"table_id": "table-1"})
    await client.put("/api/guests/guest-2/assignment", json={"table_id": "table-1"})

    summary_response = await client.get("/api/tables/summary")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary[1]["table_id"] == "table-1"
    assert summary[1]["occupied"] == 2

    update_capacity_response = await client.put(
        "/api/tables/table-1",
        json={"capacity": 6},
    )
    assert update_capacity_response.status_code == 200
    updated_table = next(table for table in update_capacity_response.json()["tables"] if table["id"] == "table-1")
    assert updated_table["capacity"] == 6

    validation_response = await client.get("/api/validation")
    assert validation_response.status_code == 200
    updated_summary = validation_response.json()["tables"][1]
    assert updated_summary["capacity"] == 6
    assert updated_summary["occupied"] == 2
    assert updated_summary["available"] == 4


@pytest.mark.anyio
async def test_create_table_and_update_default_capacity_flow(client: AsyncClient) -> None:
    update_default_capacity_response = await client.put(
        "/api/workspace/default-table-capacity",
        json={"capacity": 12},
    )
    assert update_default_capacity_response.status_code == 200
    assert update_default_capacity_response.json()["default_table_capacity"] == 12

    create_table_response = await client.post("/api/tables")
    assert create_table_response.status_code == 201
    payload = create_table_response.json()
    assert len(payload["tables"]) == 10

    created_table = next(table for table in payload["tables"] if table["id"] == "table-9")
    assert created_table["number"] == 9
    assert created_table["capacity"] == 12

    workspace_response = await client.get("/api/workspace")
    assert workspace_response.status_code == 200
    workspace = workspace_response.json()
    assert workspace["default_table_capacity"] == 12
    assert workspace["tables"][-1]["id"] == "table-9"
    assert workspace["tables"][-1]["capacity"] == 12


@pytest.mark.anyio
async def test_couple_table_cannot_be_removed_and_can_rotate(client: AsyncClient) -> None:
    rotate_response = await client.put(
        "/api/tables/table-couple/position",
        json={"position_x": 520, "position_y": 64, "rotation_degrees": 30},
    )

    assert rotate_response.status_code == 200
    updated_table = next(table for table in rotate_response.json()["tables"] if table["id"] == "table-couple")
    assert updated_table["position_x"] == 520
    assert updated_table["position_y"] == 64
    assert updated_table["rotation_degrees"] == 30
    assert updated_table["table_kind"] == "couple"
    assert updated_table["capacity"] == 2

    delete_response = await client.delete("/api/tables/table-couple")
    assert delete_response.status_code == 400
    assert "mesa de novios" in delete_response.json()["detail"]

    capacity_response = await client.put("/api/tables/table-couple", json={"capacity": 4})
    assert capacity_response.status_code == 400
    assert "exactamente 2 asientos" in capacity_response.json()["detail"]


@pytest.mark.anyio
async def test_batch_create_and_duplicate_table_flow(client: AsyncClient) -> None:
    batch_response = await client.post(
        "/api/tables/batch",
        json={"count": 2, "capacity": 9},
    )
    assert batch_response.status_code == 201
    batch_payload = batch_response.json()
    assert batch_payload["default_table_capacity"] == 9
    assert len(batch_payload["tables"]) == 11
    assert batch_payload["tables"][-1]["id"] == "table-10"
    assert batch_payload["tables"][-1]["capacity"] == 9

    duplicate_response = await client.post("/api/tables/table-2/duplicate")
    assert duplicate_response.status_code == 201
    duplicate_payload = duplicate_response.json()
    duplicated_table = next(table for table in duplicate_payload["tables"] if table["id"] == "table-11")
    source_table = next(table for table in duplicate_payload["tables"] if table["id"] == "table-2")
    assert duplicated_table["capacity"] == source_table["capacity"]
    assert duplicated_table["number"] == 11
    assert duplicated_table["position_x"] == source_table["position_x"] + 120.0
    assert duplicated_table["position_y"] == source_table["position_y"] + 120.0


@pytest.mark.anyio
async def test_save_load_and_delete_sessions_flow(client: AsyncClient) -> None:
    await client.post("/api/guests", json={"id": "guest-1", "name": "Ana", "guest_type": "adulto", "confirmed": True})
    await client.put("/api/guests/guest-1/assignment", json={"table_id": "table-2", "seat_index": 1})
    await client.put("/api/tables/table-2/position", json={"position_x": 420, "position_y": 360})
    await client.put("/api/tables/table-couple/position", json={"position_x": 520, "position_y": 64, "rotation_degrees": 30})

    save_response = await client.post("/api/sessions", json={"name": "base familiar"})
    assert save_response.status_code == 201
    session_id = save_response.json()["id"]
    assert save_response.json()["created_at"]

    list_response = await client.get("/api/sessions")
    assert list_response.status_code == 200
    assert list_response.json()[0]["id"] == session_id
    assert list_response.json()[0]["name"] == "base familiar"
    assert list_response.json()[0]["created_at"]

    export_response = await client.get(f"/api/sessions/{session_id}/export")
    assert export_response.status_code == 200
    backup_payload = export_response.json()
    assert backup_payload["version"] == "1"
    assert backup_payload["session"]["name"] == "base familiar"
    assert backup_payload["snapshot"]["guests"][0]["seat_index"] == 1
    assert backup_payload["snapshot"]["guests"][0]["confirmed"] is True
    backup_couple_table = next(table for table in backup_payload["snapshot"]["tables"] if table["id"] == "table-couple")
    assert backup_couple_table["position_x"] == 600
    assert backup_couple_table["position_y"] == 90
    assert backup_couple_table["rotation_degrees"] == 0

    await client.put("/api/guests/guest-1/assignment", json={"table_id": "table-1", "seat_index": 0})
    await client.put("/api/tables/table-2/position", json={"position_x": 150, "position_y": 150})
    await client.put("/api/tables/table-couple/position", json={"position_x": 700, "position_y": 120, "rotation_degrees": 75})

    load_response = await client.post(f"/api/sessions/{session_id}/load")
    assert load_response.status_code == 200
    loaded_guest = next(guest for guest in load_response.json()["guests"] if guest["id"] == "guest-1")
    loaded_table = next(table for table in load_response.json()["tables"] if table["id"] == "table-2")
    loaded_couple_table = next(table for table in load_response.json()["tables"] if table["id"] == "table-couple")
    assert loaded_guest["table_id"] == "table-2"
    assert loaded_guest["seat_index"] == 1
    assert loaded_guest["confirmed"] is True
    assert loaded_table["position_x"] == 420
    assert loaded_table["position_y"] == 360
    assert loaded_couple_table["position_x"] == 600
    assert loaded_couple_table["position_y"] == 90
    assert loaded_couple_table["rotation_degrees"] == 0

    await client.post("/api/workspace/reset")
    import_response = await client.post("/api/sessions/import", json=backup_payload)
    assert import_response.status_code == 200
    imported_guest = next(guest for guest in import_response.json()["guests"] if guest["id"] == "guest-1")
    imported_couple_table = next(table for table in import_response.json()["tables"] if table["id"] == "table-couple")
    assert imported_guest["table_id"] == "table-2"
    assert imported_guest["seat_index"] == 1
    assert imported_couple_table["position_x"] == 600
    assert imported_couple_table["position_y"] == 90
    assert imported_couple_table["rotation_degrees"] == 0

    delete_response = await client.delete(f"/api/sessions/{session_id}")
    assert delete_response.status_code == 204

    empty_list_response = await client.get("/api/sessions")
    assert empty_list_response.status_code == 200
    assert empty_list_response.json() == []


@pytest.mark.anyio
async def test_sessions_reject_blank_name_and_missing_session_ids(client: AsyncClient) -> None:
    save_response = await client.post("/api/sessions", json={"name": "   "})
    assert save_response.status_code == 400
    assert save_response.json()["detail"] == "El nombre de la sesión es obligatorio."

    load_response = await client.post("/api/sessions/session-no-existe/load")
    assert load_response.status_code == 400
    assert "No existe la sesión" in load_response.json()["detail"]

    export_response = await client.get("/api/sessions/session-no-existe/export")
    assert export_response.status_code == 400
    assert "No existe la sesión" in export_response.json()["detail"]

    delete_response = await client.delete("/api/sessions/session-no-existe")
    assert delete_response.status_code == 404
    assert delete_response.json()["detail"] == "La sesión no existe."


@pytest.mark.anyio
async def test_import_session_rejects_semantically_invalid_snapshot(client: AsyncClient) -> None:
    response = await client.post(
        "/api/sessions/import",
        json={
            "version": "1",
            "session": {
                "id": "session-import",
                "name": "Copia rota",
                "created_at": "2026-03-17T10:00:00Z",
            },
            "snapshot": {
                "id": "workspace-main",
                "name": "Workspace principal",
                "date": None,
                "default_table_capacity": 0,
                "tables": [],
                "guests": [],
            },
        },
    )

    assert response.status_code == 400
    assert "capacidad por defecto" in response.json()["detail"]


@pytest.mark.anyio
async def test_reset_workspace_clears_tables_and_guests(client: AsyncClient) -> None:
    await client.post("/api/guests", json={"id": "guest-1", "name": "Ana", "guest_type": "adulto"})
    await client.put("/api/tables/table-1", json={"capacity": 5})
    await client.put("/api/tables/table-couple/position", json={"position_x": 520, "position_y": 64, "rotation_degrees": 30})

    reset_response = await client.post("/api/workspace/reset")
    assert reset_response.status_code == 200
    assert [table["id"] for table in reset_response.json()["tables"]] == ["table-couple"]
    assert reset_response.json()["guests"] == []
    assert reset_response.json()["tables"][0]["position_x"] == 600
    assert reset_response.json()["tables"][0]["position_y"] == 90
    assert reset_response.json()["tables"][0]["rotation_degrees"] == 0
    assert reset_response.json()["tables"][0]["capacity"] == 2

    workspace_response = await client.get("/api/workspace")
    assert workspace_response.status_code == 200
    assert [table["id"] for table in workspace_response.json()["tables"]] == ["table-couple"]
    assert workspace_response.json()["tables"][0]["capacity"] == 2
    assert workspace_response.json()["tables"][0]["position_x"] == 600
    assert workspace_response.json()["tables"][0]["position_y"] == 90
    assert workspace_response.json()["tables"][0]["rotation_degrees"] == 0
    assert workspace_response.json()["guests"]["assigned"] == []
    assert workspace_response.json()["guests"]["unassigned"] == []


@pytest.mark.anyio
async def test_workspace_report_pdf_download(client: AsyncClient) -> None:
    await client.post(
        "/api/guests",
        json={
            "id": "guest-1",
            "name": "Ana",
            "guest_type": "adulto",
            "group_id": "Familia 1",
            "menu": "carne",
            "confirmed": True,
        },
    )
    await client.put("/api/guests/guest-1/assignment", json={"table_id": "table-1", "seat_index": 0})

    response = await client.get("/api/workspace/report.pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == 'attachment; filename="donde-me-siento-informe.pdf"'
    assert response.content.startswith(b"%PDF-1.4")
    assert b"(Conf.) Tj" in response.content
    assert b"(Mesa) Tj" in response.content
    assert b"(Asiento) Tj" in response.content
    assert b"(1) Tj" in response.content
    assert b"(Carne) Tj" in response.content


@pytest.mark.anyio
async def test_workspace_report_pdf_hides_empty_tables(client: AsyncClient) -> None:
    response = await client.get("/api/workspace/report.pdf")

    assert response.status_code == 200
    assert b"No hay invitados ubicados." in response.content
    assert b"No hay ubicaciones por revisar." in response.content
    assert b"(Invitado) Tj" not in response.content
    assert b"(Familia) Tj" not in response.content
    assert b"(Intolerancia) Tj" not in response.content


@pytest.mark.anyio
async def test_workspace_report_pdf_escapes_accents_and_parentheses(client: AsyncClient) -> None:
    await client.post(
        "/api/guests",
        json={
            "id": "guest-acentos",
            "name": "María (Nina)",
            "guest_type": "adulto",
            "group_id": "Familia Gómez",
            "menu": "pescado",
        },
    )
    await client.put("/api/guests/guest-acentos/assignment", json={"table_id": "table-1", "seat_index": 0})

    response = await client.get("/api/workspace/report.pdf")

    assert response.status_code == 200
    assert b"Mar\xeda \\(Nina\\)" in response.content
    assert b"Familia G\xf3mez" in response.content


@pytest.mark.anyio
async def test_workspace_report_pdf_adds_pages_when_there_are_many_guests(client: AsyncClient) -> None:
    for index in range(90):
        await client.post(
            "/api/guests",
            json={
                "id": f"guest-{index}",
                "name": f"Invitado {index:02d}",
                "guest_type": "adulto" if index % 3 == 0 else "adolescente" if index % 3 == 1 else "nino",
                "group_id": f"Familia {index % 12}",
                "confirmed": index % 2 == 0,
                "menu": "carne" if index % 3 == 0 else "pescado" if index % 3 == 1 else "vegano",
            },
        )

    response = await client.get("/api/workspace/report.pdf")

    assert response.status_code == 200
    assert response.content.count(b"/Type /Page ") >= 4


@pytest.mark.anyio
async def test_delete_table_rejects_occupied_and_reorders_empty_tables(client: AsyncClient) -> None:
    await client.post("/api/guests", json={"id": "guest-1", "name": "Ana", "guest_type": "adulto"})
    await client.put("/api/guests/guest-1/assignment", json={"table_id": "table-1"})

    occupied_delete_response = await client.delete("/api/tables/table-1")
    assert occupied_delete_response.status_code == 400
    assert "mesa con invitados" in occupied_delete_response.json()["detail"]

    empty_delete_response = await client.delete("/api/tables/table-3")
    assert empty_delete_response.status_code == 200
    payload = empty_delete_response.json()
    assert len(payload["tables"]) == 8
    assert [table["id"] for table in payload["tables"]] == [
        "table-couple",
        "table-1",
        "table-2",
        "table-3",
        "table-4",
        "table-5",
        "table-6",
        "table-7",
    ]


@pytest.mark.anyio
async def test_capacity_update_rejects_value_below_current_occupancy(client: AsyncClient) -> None:
    await client.put("/api/tables/table-1", json={"capacity": 3})
    await client.post("/api/guests", json={"id": "guest-1", "name": "Ana", "guest_type": "adulto"})
    await client.post("/api/guests", json={"id": "guest-2", "name": "Luis", "guest_type": "adulto"})
    await client.put("/api/guests/guest-1/assignment", json={"table_id": "table-1"})
    await client.put("/api/guests/guest-2/assignment", json={"table_id": "table-1"})

    update_capacity_response = await client.put(
        "/api/tables/table-1",
        json={"capacity": 1},
    )
    assert update_capacity_response.status_code == 400
    assert "capacidad no puede ser menor" in update_capacity_response.json()["detail"]


@pytest.mark.anyio
async def test_workspace_endpoint_returns_aggregated_state_for_frontend(client: AsyncClient) -> None:
    await client.post(
        "/api/guests",
        json={"id": "guest-1", "name": "Ana", "guest_type": "adulto", "group_id": "g1"},
    )
    await client.post(
        "/api/guests",
        json={"id": "guest-2", "name": "Luis", "guest_type": "adulto", "group_id": "g1"},
    )
    await client.post(
        "/api/guests",
        json={"id": "guest-3", "name": "Marta", "guest_type": "adulto"},
    )
    await client.put("/api/guests/guest-1/assignment", json={"table_id": "table-1"})
    await client.put("/api/guests/guest-2/assignment", json={"table_id": "table-2"})

    workspace_response = await client.get("/api/workspace")
    assert workspace_response.status_code == 200
    workspace = workspace_response.json()

    assert workspace["event_id"] == "workspace-main"
    assert workspace["name"] == "Workspace principal"
    assert [guest["id"] for guest in workspace["guests"]["assigned"]] == ["guest-1", "guest-2"]
    assert [guest["id"] for guest in workspace["guests"]["unassigned"]] == ["guest-3"]

    couple_table = workspace["tables"][0]
    first_table = workspace["tables"][1]
    second_table = workspace["tables"][2]
    assert couple_table["id"] == "table-couple"
    assert couple_table["table_kind"] == "couple"
    assert couple_table["capacity"] == 2
    assert couple_table["position_x"] == 600
    assert couple_table["position_y"] == 90
    assert couple_table["rotation_degrees"] == 0
    assert first_table["id"] == "table-1"
    assert first_table["occupied"] == 1
    assert [guest["id"] for guest in first_table["guests"]] == ["guest-1"]
    assert [guest["id"] for guest in second_table["guests"]] == ["guest-2"]

    assert workspace["validation"]["grouping_conflicts"] == {"g1": ["guest-1", "guest-2"]}
    assert workspace["validation"]["assigned_guests"] == 2
    assert workspace["validation"]["unassigned_guests"] == 1
