"""Tests de integracion de autenticacion."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import sessionmaker

from backend.app.api.dependencies import get_auth_service, get_event_service
from backend.app.core.config import Settings
from backend.app.db.base import Base
from backend.app.db.session import create_engine_from_settings
from backend.app.main import create_app
from backend.app.repositories.auth import SessionRepository, UserRepository
from backend.app.repositories.events import EventRepository
from backend.app.services.auth import AuthService
from backend.app.services.events import EventService


@pytest.fixture
async def client_with_auth(tmp_path: Path):
    app_settings = Settings(
        app_name="Donde me siento API Test",
        environment="test",
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'auth-test.db'}",
    )
    engine = create_engine_from_settings(app_settings)
    Base.metadata.create_all(bind=engine)
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    session = testing_session_local()

    auth_service = AuthService(UserRepository(session), SessionRepository(session))
    auth_service.ensure_pair_users()

    app = create_app()
    async def override_get_auth_service() -> AuthService:
        return auth_service

    async def override_get_event_service() -> EventService:
        return EventService(EventRepository(session))

    app.dependency_overrides[get_auth_service] = override_get_auth_service
    app.dependency_overrides[get_event_service] = override_get_event_service

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client

    session.close()


@pytest.mark.anyio
async def test_login_me_logout_and_protected_workspace(client_with_auth: AsyncClient) -> None:
    unauthorized_response = await client_with_auth.get("/api/workspace")
    assert unauthorized_response.status_code == 401

    login_response = await client_with_auth.post(
        "/api/auth/login",
        json={"username": "raquel", "password": "hector"},
    )
    assert login_response.status_code == 200
    payload = login_response.json()
    token = payload["access_token"]

    me_response = await client_with_auth.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "raquel"

    authorized_workspace_response = await client_with_auth.get(
        "/api/workspace",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert authorized_workspace_response.status_code == 200

    logout_response = await client_with_auth.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert logout_response.status_code == 204

    post_logout_me = await client_with_auth.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert post_logout_me.status_code == 401


@pytest.mark.anyio
async def test_login_rejects_invalid_credentials(client_with_auth: AsyncClient) -> None:
    response = await client_with_auth.post(
        "/api/auth/login",
        json={"username": "raquel", "password": "incorrecta"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales invalidas"


@pytest.mark.anyio
async def test_login_accepts_crossed_credentials_for_hector(client_with_auth: AsyncClient) -> None:
    response = await client_with_auth.post(
        "/api/auth/login",
        json={"username": "hector", "password": "raquel"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "hector"


@pytest.mark.anyio
async def test_login_rejects_unknown_username(client_with_auth: AsyncClient) -> None:
    response = await client_with_auth.post(
        "/api/auth/login",
        json={"username": "invitado", "password": "raquel"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales invalidas"
