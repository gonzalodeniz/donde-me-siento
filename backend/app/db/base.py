"""Base declarativa de SQLAlchemy."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base compartida para todos los modelos ORM."""
