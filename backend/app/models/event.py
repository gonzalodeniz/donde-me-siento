"""Modelos ORM de eventos."""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base


class EventModel(Base):
    """Evento persistido."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    default_table_capacity: Mapped[int] = mapped_column(Integer, nullable=False)

    tables: Mapped[list["TableModel"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="TableModel.number",
    )
    guests: Mapped[list["GuestModel"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="GuestModel.name",
    )
    sessions: Mapped[list["SavedSessionModel"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="SavedSessionModel.name",
    )


class TableModel(Base):
    """Mesa persistida."""

    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    position_x: Mapped[float] = mapped_column(Float, nullable=False)
    position_y: Mapped[float] = mapped_column(Float, nullable=False)

    event: Mapped[EventModel] = relationship(back_populates="tables")


class GuestModel(Base):
    """Invitado persistido."""

    __tablename__ = "guests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    guest_type: Mapped[str] = mapped_column(String(32), nullable=False)
    group_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    table_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    seat_index: Mapped[int | None] = mapped_column(Integer, nullable=True)

    event: Mapped[EventModel] = relationship(back_populates="guests")


class SavedSessionModel(Base):
    """Snapshot persistido de una distribución del salón."""

    __tablename__ = "saved_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)

    event: Mapped[EventModel] = relationship(back_populates="sessions")
