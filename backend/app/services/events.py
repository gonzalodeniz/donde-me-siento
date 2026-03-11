"""Casos de uso de eventos."""

from __future__ import annotations

from uuid import uuid4

from backend.app.domains.seating import DomainError, Event, Guest, GuestType
from backend.app.repositories.events import EventRepository
from backend.app.schemas.events import EventCreate, GuestCreate, GuestUpdate


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
            event.add_guest(self._build_guest(guest_payload))

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

    def add_guest(self, event_id: str, payload: GuestCreate) -> Event:
        event = self.get_event(event_id)
        event.add_guest(self._build_guest(payload))
        return self.repository.save(event)

    def update_guest(self, event_id: str, guest_id: str, payload: GuestUpdate) -> Event:
        event = self.get_event(event_id)
        guest_type = self._parse_guest_type(payload.guest_type) if payload.guest_type is not None else None
        event.update_guest(
            guest_id,
            name=payload.name,
            guest_type=guest_type,
            group_id=payload.group_id,
        )
        return self.repository.save(event)

    def delete_guest(self, event_id: str, guest_id: str) -> Event:
        event = self.get_event(event_id)
        event.remove_guest(guest_id)
        return self.repository.save(event)

    def assign_guest_to_table(self, event_id: str, guest_id: str, table_id: str) -> Event:
        event = self.get_event(event_id)
        event.assign_guest_to_table(guest_id, table_id)
        return self.repository.save(event)

    def unassign_guest(self, event_id: str, guest_id: str) -> Event:
        event = self.get_event(event_id)
        event.unassign_guest(guest_id)
        return self.repository.save(event)

    def update_table_capacity(self, event_id: str, table_id: str, capacity: int) -> Event:
        event = self.get_event(event_id)
        event.update_table_capacity(table_id, capacity)
        return self.repository.save(event)

    @staticmethod
    def _parse_guest_type(raw_guest_type: str) -> GuestType:
        try:
            return GuestType(raw_guest_type)
        except ValueError as exc:
            raise DomainError(f"Tipo de invitado no soportado: {raw_guest_type}") from exc

    def _build_guest(self, payload: GuestCreate) -> Guest:
        return Guest(
            id=payload.id or f"guest-{uuid4().hex[:12]}",
            name=payload.name,
            guest_type=self._parse_guest_type(payload.guest_type),
            group_id=payload.group_id,
            table_id=payload.table_id,
        )
