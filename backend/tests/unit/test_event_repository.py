"""Tests unitarios del repositorio SQLAlchemy de eventos."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.app.db.base import Base
from backend.app.domains.seating import Event, Guest, GuestType
from backend.app.repositories.events import EventRepository


def build_event() -> Event:
    event = Event(id="event-1", name="Cena", default_table_capacity=4)
    event.create_tables(2)
    event.add_guest(Guest(id="guest-1", name="Ana", guest_type=GuestType.ADULT, group_id="g1"))
    event.add_guest(
        Guest(id="guest-2", name="Luis", guest_type=GuestType.ADULT, group_id="g1", table_id="table-1")
    )
    return event


def test_repository_persists_and_restores_complete_event() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    with Session(engine) as session:
        repository = EventRepository(session)
        stored = repository.create(build_event())

        restored = repository.get(stored.id)

    assert restored is not None
    assert restored.name == "Cena"
    assert len(restored.tables) == 3
    assert "table-couple" in restored.tables
    assert len(restored.guests) == 2
    assert restored.guests["guest-2"].table_id == "table-1"


def test_repository_delete_returns_false_when_event_does_not_exist() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    with Session(engine) as session:
        repository = EventRepository(session)

        assert repository.delete("missing-event") is False


def test_repository_save_replaces_existing_event_state() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    with Session(engine) as session:
        repository = EventRepository(session)
        event = repository.create(build_event())
        event.update_guest("guest-1", name="Ana Maria")
        event.assign_guest_to_table("guest-1", "table-2")

        saved = repository.save(event)

    assert saved.guests["guest-1"].name == "Ana Maria"
    assert saved.guests["guest-1"].table_id == "table-2"
