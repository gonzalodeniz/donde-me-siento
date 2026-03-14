"""Casos de uso del workspace unico."""

from __future__ import annotations

from uuid import uuid4

from backend.app.core.config import settings
from backend.app.domains.seating import DomainError, Event, Guest, GuestType
from backend.app.repositories.events import EventRepository
from backend.app.services.report_pdf import generate_workspace_report_pdf
from backend.app.schemas.events import GuestCreate, GuestUpdate


class EventService:
    """Orquesta reglas de dominio y persistencia de un unico workspace."""

    def __init__(self, repository: EventRepository) -> None:
        self.repository = repository

    def ensure_workspace(self) -> Event:
        event = self.repository.get_singleton()
        if event is not None:
            return event

        event = Event(
            id=settings.default_workspace_id,
            name=settings.default_workspace_name,
            default_table_capacity=settings.default_workspace_table_capacity,
        )
        event.create_tables(settings.default_workspace_table_count)
        return self.repository.create(event)

    def get_workspace(self) -> Event:
        return self.ensure_workspace()

    def generate_workspace_report_pdf(self) -> bytes:
        event = self.ensure_workspace()
        return generate_workspace_report_pdf(event)

    def add_guest(self, payload: GuestCreate) -> Event:
        event = self.ensure_workspace()
        event.add_guest(self._build_guest(payload))
        return self.repository.save(event)

    def add_table(self) -> Event:
        event = self.ensure_workspace()
        event.add_table()
        return self.repository.save(event)

    def add_tables(self, count: int, capacity: int) -> Event:
        event = self.ensure_workspace()
        event.add_tables(count, capacity)
        return self.repository.save(event)

    def duplicate_table(self, table_id: str) -> Event:
        event = self.ensure_workspace()
        event.duplicate_table(table_id)
        return self.repository.save(event)

    def remove_table(self, table_id: str) -> Event:
        event = self.ensure_workspace()
        event.remove_table(table_id)
        return self.repository.save(event)

    def update_guest(self, guest_id: str, payload: GuestUpdate) -> Event:
        event = self.ensure_workspace()
        guest_type = self._parse_guest_type(payload.guest_type) if payload.guest_type is not None else None
        event.update_guest(
            guest_id,
            name=payload.name,
            guest_type=guest_type,
            confirmed=payload.confirmed,
            group_id=payload.group_id,
        )
        return self.repository.save(event)

    def delete_guest(self, guest_id: str) -> Event:
        event = self.ensure_workspace()
        event.remove_guest(guest_id)
        return self.repository.save(event)

    def assign_guest_to_table(self, guest_id: str, table_id: str, seat_index: int | None = None) -> Event:
        event = self.ensure_workspace()
        event.assign_guest_to_table(guest_id, table_id, seat_index)
        return self.repository.save(event)

    def unassign_guest(self, guest_id: str) -> Event:
        event = self.ensure_workspace()
        event.unassign_guest(guest_id)
        return self.repository.save(event)

    def update_table_capacity(self, table_id: str, capacity: int) -> Event:
        event = self.ensure_workspace()
        event.update_table_capacity(table_id, capacity)
        return self.repository.save(event)

    def update_table_position(self, table_id: str, position_x: float, position_y: float) -> Event:
        event = self.ensure_workspace()
        event.update_table_position(table_id, position_x, position_y)
        return self.repository.save(event)

    def update_default_table_capacity(self, capacity: int) -> Event:
        event = self.ensure_workspace()
        event.update_default_table_capacity(capacity)
        return self.repository.save(event)

    def list_sessions(self) -> list[dict[str, str]]:
        event = self.ensure_workspace()
        return self.repository.list_sessions(event.id)

    def save_session(self, name: str) -> dict[str, str]:
        event = self.ensure_workspace()
        return self.repository.save_session(event, name)

    def load_session(self, session_id: str) -> Event:
        current_event = self.ensure_workspace()
        loaded_event = self.repository.load_session(current_event.id, session_id)
        return self.repository.save(loaded_event)

    def delete_session(self, session_id: str) -> bool:
        event = self.ensure_workspace()
        return self.repository.delete_session(event.id, session_id)

    def export_session(self, session_id: str) -> dict[str, object]:
        event = self.ensure_workspace()
        return self.repository.export_session(event.id, session_id)

    def import_session(self, backup: dict[str, object]) -> Event:
        event = self.ensure_workspace()
        return self.repository.import_session(event.id, backup)

    def reset_workspace(self) -> Event:
        event = self.ensure_workspace()
        event.tables.clear()
        event.guests.clear()
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
            confirmed=payload.confirmed,
            group_id=payload.group_id,
            table_id=payload.table_id,
            seat_index=payload.seat_index,
        )
