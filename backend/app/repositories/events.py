"""Repositorio SQLAlchemy para eventos."""

from __future__ import annotations

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from backend.app.domains.seating import Event, Guest, GuestType, Table
from backend.app.models.event import EventModel, GuestModel, TableModel


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
        if existing_model is not None:
            self.session.delete(existing_model)
            self.session.flush()

        model = self._to_model(event)
        self.session.add(model)
        self.session.commit()
        self.session.refresh(model)
        return self._to_domain(model)

    @staticmethod
    def _to_model(event: Event) -> EventModel:
        return EventModel(
            id=event.id,
            name=event.name,
            date=event.date,
            default_table_capacity=event.default_table_capacity,
            tables=[
                TableModel(
                    id=table.id,
                    event_id=event.id,
                    number=table.number,
                    capacity=table.capacity,
                    position_x=table.position_x,
                    position_y=table.position_y,
                )
                for table in event.tables.values()
            ],
            guests=[
                GuestModel(
                    id=guest.id,
                    event_id=event.id,
                    name=guest.name,
                    guest_type=guest.guest_type.value,
                    group_id=guest.group_id,
                    table_id=guest.table_id,
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
            table.id: Table(
                id=table.id,
                number=table.number,
                capacity=table.capacity,
                position_x=table.position_x,
                position_y=table.position_y,
            )
            for table in model.tables
        }
        event.guests = {
            guest.id: Guest(
                id=guest.id,
                name=guest.name,
                guest_type=GuestType(guest.guest_type),
                group_id=guest.group_id,
                table_id=guest.table_id,
            )
            for guest in model.guests
        }
        return event
