"""Configuracion base del proyecto para la Fase 1."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Settings:
    """Valores por defecto del backend mientras se levanta el MVP."""

    app_name: str = "Donde me siento API"
    environment: str = "development"
    data_dir: Path = Path("data")
    database_url: str = "sqlite:///data/donde_me_siento.db"
    default_admin_username: str = "admin"
    default_admin_password: str = "admin1234"
    default_workspace_id: str = "workspace-main"
    default_workspace_name: str = "Workspace principal"
    default_workspace_table_count: int = 8
    default_workspace_table_capacity: int = 10


def load_settings() -> Settings:
    """Carga configuracion desde variables de entorno con defaults seguros."""

    data_dir = Path(os.getenv("DMS_DATA_DIR", "data"))
    database_url = os.getenv("DMS_DATABASE_URL", f"sqlite:///{data_dir / 'donde_me_siento.db'}")

    return Settings(
        app_name=os.getenv("DMS_APP_NAME", "Donde me siento API"),
        environment=os.getenv("DMS_ENVIRONMENT", "development"),
        data_dir=data_dir,
        database_url=database_url,
        default_admin_username=os.getenv("DMS_DEFAULT_ADMIN_USERNAME", "admin"),
        default_admin_password=os.getenv("DMS_DEFAULT_ADMIN_PASSWORD", "admin1234"),
        default_workspace_id=os.getenv("DMS_DEFAULT_WORKSPACE_ID", "workspace-main"),
        default_workspace_name=os.getenv("DMS_DEFAULT_WORKSPACE_NAME", "Workspace principal"),
        default_workspace_table_count=int(os.getenv("DMS_DEFAULT_WORKSPACE_TABLE_COUNT", "8")),
        default_workspace_table_capacity=int(os.getenv("DMS_DEFAULT_WORKSPACE_TABLE_CAPACITY", "10")),
    )


settings = load_settings()
