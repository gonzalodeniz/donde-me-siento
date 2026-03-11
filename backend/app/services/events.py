"""Casos de uso de eventos."""

from __future__ import annotations

from uuid import uuid4

from backend.app.domains.seating import DomainError, Event, Guest, GuestType
from backend.app.repositories.events import EventRepository
from backend.app.schemas.events import EventCreate


class EventNotFoundError(LookupError):
    """El evento solicitado no existe."""


class EventService:
    """Orquesta reglas de dominio y persistencia de eventos."""

    def __init__(self, repository: EventRepository) -> None:
        self.repository = repository

    def create_event(self, payload: EventCreate) -> Event:
        event = Event(
            id=f"event-{uuid4().hex[:12]}",
            name=payload.name,
            date=payload.date,
            default_table_capacity=payload.default_table_capacity,
        )
        event.create_tables(payload.table_count)

        for guest_payload in payload.guests:
            try:
                guest_type = GuestType(guest_payload.guest_type)
            except ValueError as exc:
                raise DomainError(f"Tipo de invitado no soportado: {guest_payload.guest_type}") from exc

            guest = Guest(
                id=guest_payload.id,
                name=guest_payload.name,
                guest_type=guest_type,
                group_id=guest_payload.group_id,
                table_id=guest_payload.table_id,
            )
            event.add_guest(guest)

        return self.repository.create(event)

    def list_events(self) -> list[Event]:
        return self.repository.list()

    def get_event(self, event_id: str) -> Event:
        event = self.repository.get(event_id)
        if event is None:
            raise EventNotFoundError(event_id)
        return event

    def delete_event(self, event_id: str) -> None:
        deleted = self.repository.delete(event_id)
        if not deleted:
            raise EventNotFoundError(event_id)
