"""Repositorio SQLAlchemy para eventos."""

from __future__ import annotations

import copy
import json
from datetime import datetime, UTC

from uuid import uuid4

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from backend.app.domains.seating import Event, Guest, GuestMenu, GuestType, Table, TableKind
from backend.app.models.event import EventModel, GuestModel, SavedSessionModel, TableModel


class EventRepository:
    """Persistencia de eventos sobre SQLite/SQLAlchemy."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, event: Event) -> Event:
        model = self._to_model(event)
        self.session.add(model)
        self.session.commit()
        self.session.refresh(model)
        return self._to_domain(model)

    def get_singleton(self) -> Event | None:
        statement = (
            select(EventModel)
            .order_by(EventModel.id.asc())
            .limit(1)
            .options(selectinload(EventModel.tables), selectinload(EventModel.guests))
        )
        model = self.session.scalar(statement)
        if model is None:
            return None
        return self._to_domain(model)

    def list(self) -> list[Event]:
        statement = select(EventModel).options(
            selectinload(EventModel.tables),
            selectinload(EventModel.guests),
        )
        models = self.session.scalars(statement).all()
        return [self._to_domain(model) for model in models]

    def get(self, event_id: str) -> Event | None:
        statement = (
            select(EventModel)
            .where(EventModel.id == event_id)
            .options(selectinload(EventModel.tables), selectinload(EventModel.guests))
        )
        model = self.session.scalar(statement)
        if model is None:
            return None
        return self._to_domain(model)

    def delete(self, event_id: str) -> bool:
        model = self.session.get(EventModel, event_id)
        if model is None:
            return False
        self.session.delete(model)
        self.session.commit()
        return True

    def save(self, event: Event) -> Event:
        existing_model = self.session.get(EventModel, event.id)
        if existing_model is None:
            model = self._to_model(event)
            self.session.add(model)
        else:
            existing_model.name = event.name
            existing_model.date = event.date
            existing_model.default_table_capacity = event.default_table_capacity
            existing_model.tables = [
                TableModel(
                    id=EventRepository._db_scoped_id(event.id, table.id),
                    event_id=event.id,
                    number=table.number,
                    capacity=table.capacity,
                    position_x=table.position_x,
                    position_y=table.position_y,
                    table_kind=table.kind.value,
                    rotation_degrees=table.rotation_degrees,
                )
                for table in event.tables.values()
            ]
            existing_model.guests = [
                GuestModel(
                    id=EventRepository._db_scoped_id(event.id, guest.id),
                    event_id=event.id,
                    name=guest.name,
                    guest_type=guest.guest_type.value,
                    confirmed=guest.confirmed,
                    intolerance=guest.intolerance,
                    menu=guest.menu.value,
                    group_id=guest.group_id,
                    table_id=guest.table_id,
                    seat_index=guest.seat_index,
                )
                for guest in event.guests.values()
            ]
            model = existing_model

        self.session.commit()
        self.session.refresh(model)
        return self._to_domain(model)

    def list_sessions(self, event_id: str) -> list[dict[str, str]]:
        statement = select(SavedSessionModel).where(SavedSessionModel.event_id == event_id).order_by(SavedSessionModel.name.asc())
        models = self.session.scalars(statement).all()
        return [{"id": model.id, "name": model.name, "created_at": model.created_at} for model in models]

    def save_session(self, event: Event, name: str) -> dict[str, str]:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("El nombre de la sesión es obligatorio.")

        statement = select(SavedSessionModel).where(
            SavedSessionModel.event_id == event.id,
            SavedSessionModel.name == normalized_name,
        )
        existing_model = self.session.scalar(statement)
        snapshot_json = json.dumps(self._event_to_snapshot(event), ensure_ascii=True)

        if existing_model is None:
            existing_model = SavedSessionModel(
                id=f"session-{uuid4().hex[:12]}",
                event_id=event.id,
                name=normalized_name,
                created_at=datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                snapshot_json=snapshot_json,
            )
            self.session.add(existing_model)
        else:
            existing_model.snapshot_json = snapshot_json

        self.session.commit()
        return {"id": existing_model.id, "name": existing_model.name, "created_at": existing_model.created_at}

    def load_session(self, event_id: str, session_id: str) -> Event:
        model = self.session.scalar(
            select(SavedSessionModel).where(
                SavedSessionModel.event_id == event_id,
                SavedSessionModel.id == session_id,
            )
        )
        if model is None:
            raise ValueError(f"No existe la sesión '{session_id}'.")

        return self._snapshot_to_event(json.loads(model.snapshot_json))

    def delete_session(self, event_id: str, session_id: str) -> bool:
        model = self.session.scalar(
            select(SavedSessionModel).where(
                SavedSessionModel.event_id == event_id,
                SavedSessionModel.id == session_id,
            )
        )
        if model is None:
            return False

        self.session.delete(model)
        self.session.commit()
        return True

    def export_session(self, event_id: str, session_id: str) -> dict[str, object]:
        model = self.session.scalar(
            select(SavedSessionModel).where(
                SavedSessionModel.event_id == event_id,
                SavedSessionModel.id == session_id,
            )
        )
        if model is None:
            raise ValueError(f"No existe la sesión '{session_id}'.")

        return {
            "version": "1",
            "session": {
                "id": model.id,
                "name": model.name,
                "created_at": model.created_at,
            },
            "snapshot": json.loads(model.snapshot_json),
        }

    def import_session(self, event_id: str, backup: dict[str, object]) -> Event:
        session_data = backup.get("session")
        snapshot_data = backup.get("snapshot")
        if not isinstance(session_data, dict) or not isinstance(snapshot_data, dict):
            raise ValueError("El fichero de sesión no tiene un formato válido.")

        normalized_name = str(session_data.get("name", "")).strip()
        if not normalized_name:
            raise ValueError("El fichero de sesión no incluye un nombre válido.")

        normalized_created_at = str(session_data.get("created_at", "")).strip() or datetime.now(UTC).replace(
            microsecond=0
        ).isoformat().replace("+00:00", "Z")

        normalized_snapshot = copy.deepcopy(snapshot_data)
        normalized_snapshot["id"] = event_id
        imported_event = self._snapshot_to_event(normalized_snapshot)
        saved_event = self.save(imported_event)

        statement = select(SavedSessionModel).where(
            SavedSessionModel.event_id == event_id,
            SavedSessionModel.name == normalized_name,
        )
        existing_model = self.session.scalar(statement)
        snapshot_json = json.dumps(self._event_to_snapshot(saved_event), ensure_ascii=True)

        if existing_model is None:
            existing_model = SavedSessionModel(
                id=f"session-{uuid4().hex[:12]}",
                event_id=event_id,
                name=normalized_name,
                created_at=normalized_created_at,
                snapshot_json=snapshot_json,
            )
            self.session.add(existing_model)
        else:
            existing_model.created_at = normalized_created_at
            existing_model.snapshot_json = snapshot_json

        self.session.commit()
        return saved_event

    @staticmethod
    def _to_model(event: Event) -> EventModel:
        return EventModel(
            id=event.id,
            name=event.name,
            date=event.date,
            default_table_capacity=event.default_table_capacity,
            tables=[
                TableModel(
                    id=EventRepository._db_scoped_id(event.id, table.id),
                    event_id=event.id,
                    number=table.number,
                    capacity=table.capacity,
                    position_x=table.position_x,
                    position_y=table.position_y,
                    table_kind=table.kind.value,
                    rotation_degrees=table.rotation_degrees,
                )
                for table in event.tables.values()
            ],
            guests=[
                GuestModel(
                    id=EventRepository._db_scoped_id(event.id, guest.id),
                    event_id=event.id,
                    name=guest.name,
                    guest_type=guest.guest_type.value,
                    confirmed=guest.confirmed,
                    intolerance=guest.intolerance,
                    menu=guest.menu.value,
                    group_id=guest.group_id,
                    table_id=guest.table_id,
                    seat_index=guest.seat_index,
                )
                for guest in event.guests.values()
            ],
        )

    @staticmethod
    def _to_domain(model: EventModel) -> Event:
        event = Event(
            id=model.id,
            name=model.name,
            date=model.date,
            default_table_capacity=model.default_table_capacity,
        )
        event.tables = {
            EventRepository._public_id(model.id, table.id): Table(
                id=EventRepository._public_id(model.id, table.id),
                number=table.number,
                capacity=table.capacity,
                position_x=table.position_x,
                position_y=table.position_y,
                kind=TableKind(getattr(table, "table_kind", "round")),
                rotation_degrees=float(getattr(table, "rotation_degrees", 0.0)),
            )
            for table in model.tables
        }
        event._ensure_couple_table()
        event.guests = {
            EventRepository._public_id(model.id, guest.id): Guest(
                id=EventRepository._public_id(model.id, guest.id),
                name=guest.name,
                guest_type=GuestType(guest.guest_type),
                confirmed=guest.confirmed,
                intolerance=guest.intolerance,
                menu=GuestMenu(guest.menu),
                group_id=guest.group_id,
                table_id=guest.table_id,
                seat_index=guest.seat_index,
            )
            for guest in model.guests
        }
        return event

    @staticmethod
    def _db_scoped_id(event_id: str, entity_id: str) -> str:
        return f"{event_id}:{entity_id}"

    @staticmethod
    def _public_id(event_id: str, db_id: str) -> str:
        prefix = f"{event_id}:"
        if db_id.startswith(prefix):
            return db_id[len(prefix) :]
        return db_id

    @staticmethod
    def _event_to_snapshot(event: Event) -> dict[str, object]:
        return {
            "id": event.id,
            "name": event.name,
            "date": event.date,
            "default_table_capacity": event.default_table_capacity,
            "tables": [
                {
                    "id": table.id,
                    "number": table.number,
                    "capacity": table.capacity,
                    "position_x": table.position_x,
                    "position_y": table.position_y,
                    "table_kind": table.kind.value,
                    "rotation_degrees": table.rotation_degrees,
                }
                for table in sorted(event.tables.values(), key=lambda current: current.number)
            ],
            "guests": [
                {
                    "id": guest.id,
                    "name": guest.name,
                    "guest_type": guest.guest_type.value,
                    "confirmed": guest.confirmed,
                    "intolerance": guest.intolerance,
                    "menu": guest.menu.value,
                    "group_id": guest.group_id,
                    "table_id": guest.table_id,
                    "seat_index": guest.seat_index,
                }
                for guest in sorted(event.guests.values(), key=lambda current: current.name.casefold())
            ],
        }

    @staticmethod
    def _snapshot_to_event(snapshot: dict[str, object]) -> Event:
        event = Event(
            id=str(snapshot["id"]),
            name=str(snapshot["name"]),
            date=snapshot.get("date"),
            default_table_capacity=int(snapshot["default_table_capacity"]),
        )
        event.tables = {
            str(table["id"]): Table(
                id=str(table["id"]),
                number=int(table["number"]),
                capacity=int(table["capacity"]),
                position_x=float(table["position_x"]),
                position_y=float(table["position_y"]),
                kind=TableKind(str(table.get("table_kind", "couple" if str(table["id"]) == Event.COUPLE_TABLE_ID else "round"))),
                rotation_degrees=float(table.get("rotation_degrees", 0.0)),
            )
            for table in snapshot["tables"]
        }
        event._ensure_couple_table()
        event.guests = {
            str(guest["id"]): Guest(
                id=str(guest["id"]),
                name=str(guest["name"]),
                guest_type=GuestType(str(guest["guest_type"])),
                confirmed=bool(guest.get("confirmed", False)),
                intolerance=str(guest.get("intolerance", "")),
                menu=GuestMenu(str(guest.get("menu", "desconocido"))),
                group_id=guest.get("group_id"),
                table_id=guest.get("table_id"),
                seat_index=guest.get("seat_index"),
            )
            for guest in snapshot["guests"]
        }
        return event
