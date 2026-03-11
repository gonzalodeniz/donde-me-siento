"""Configuracion base del proyecto para la Fase 1."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Settings:
    """Valores por defecto del backend mientras se levanta el MVP."""

    app_name: str = "Donde me siento API"
    environment: str = "development"
    data_dir: Path = Path("data")
    database_url: str = "sqlite:///data/donde_me_siento.db"


settings = Settings()
