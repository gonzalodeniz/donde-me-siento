"""Tests de integracion para el servido del frontend en produccion."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import create_app


@pytest.fixture
async def frontend_client(tmp_path: Path):
    frontend_dist_dir = tmp_path / "frontend-dist"
    assets_dir = frontend_dist_dir / "assets"
    assets_dir.mkdir(parents=True)
    (frontend_dist_dir / "index.html").write_text("<html><body>Donde me siento</body></html>", encoding="utf-8")
    (assets_dir / "app.js").write_text("console.log('hola');", encoding="utf-8")

    app = create_app(frontend_dist_dir=frontend_dist_dir)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


@pytest.mark.anyio
async def test_root_serves_frontend_index(frontend_client: AsyncClient) -> None:
    response = await frontend_client.get("/")

    assert response.status_code == 200
    assert "Donde me siento" in response.text
    assert response.headers["content-type"].startswith("text/html")


@pytest.mark.anyio
async def test_frontend_client_routes_fallback_to_index(frontend_client: AsyncClient) -> None:
    response = await frontend_client.get("/workspace/mesas")

    assert response.status_code == 200
    assert "Donde me siento" in response.text


@pytest.mark.anyio
async def test_frontend_static_assets_are_served_directly(frontend_client: AsyncClient) -> None:
    response = await frontend_client.get("/assets/app.js")

    assert response.status_code == 200
    assert "console.log('hola');" in response.text


@pytest.mark.anyio
async def test_unknown_api_routes_keep_returning_404(frontend_client: AsyncClient) -> None:
    response = await frontend_client.get("/api/no-existe")

    assert response.status_code == 404
