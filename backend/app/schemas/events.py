"""Esquemas Pydantic para eventos."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from backend.app.domains.seating import Event


class GuestCreate(BaseModel):
    """Payload de invitado al crear un evento."""

    id: str | None = Field(default=None, min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    guest_type: str = Field(min_length=1, max_length=32)
    group_id: str | None = Field(default=None, max_length=64)
    table_id: str | None = Field(default=None, max_length=64)


class EventCreate(BaseModel):
    """Payload para crear un evento."""

    name: str = Field(min_length=1, max_length=255)
    date: str | None = Field(default=None, max_length=32)
    default_table_capacity: int = Field(gt=0)
    table_count: int = Field(gt=0, le=100)
    guests: list[GuestCreate] = Field(default_factory=list)


class TableResponse(BaseModel):
    """Mesa serializada para la API."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    number: int
    capacity: int
    position_x: float
    position_y: float


class GuestResponse(BaseModel):
    """Invitado serializado para la API."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    guest_type: str
    group_id: str | None
    table_id: str | None


class EventResponse(BaseModel):
    """Evento serializado para la API."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    date: str | None
    default_table_capacity: int
    tables: list[TableResponse]
    guests: list[GuestResponse]


class EventSummaryResponse(BaseModel):
    """Listado resumido de eventos."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    date: str | None
    default_table_capacity: int
    table_count: int
    guest_count: int


class GuestUpdate(BaseModel):
    """Payload para actualizar un invitado."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    guest_type: str | None = Field(default=None, min_length=1, max_length=32)
    group_id: str | None = Field(default=None, max_length=64)


class GuestAssignmentRequest(BaseModel):
    """Payload para asignar un invitado a una mesa."""

    table_id: str = Field(min_length=1, max_length=64)


class TableSummaryResponse(BaseModel):
    """Resumen de una mesa para panel y validacion."""

    table_id: str
    table_number: int
    capacity: int
    occupied: int
    available: int


class ValidationResponse(BaseModel):
    """Estado de validacion del evento listo para frontend."""

    grouping_conflicts: dict[str, list[str]]
    tables: list[TableSummaryResponse]
    assigned_guests: int
    unassigned_guests: int


def build_event_response(event: Event) -> EventResponse:
    """Convierte el agregado de dominio a la respuesta HTTP."""

    return EventResponse(
        id=event.id,
        name=event.name,
        date=event.date,
        default_table_capacity=event.default_table_capacity,
        tables=[
            TableResponse(
                id=table.id,
                number=table.number,
                capacity=table.capacity,
                position_x=table.position_x,
                position_y=table.position_y,
            )
            for table in sorted(event.tables.values(), key=lambda current: current.number)
        ],
        guests=[
            GuestResponse(
                id=guest.id,
                name=guest.name,
                guest_type=guest.guest_type.value,
                group_id=guest.group_id,
                table_id=guest.table_id,
            )
            for guest in sorted(event.guests.values(), key=lambda current: current.name.casefold())
        ],
    )


def build_validation_response(event: Event) -> ValidationResponse:
    """Convierte el estado de validacion del dominio a respuesta HTTP."""

    validation = event.validate_state()
    return ValidationResponse(
        grouping_conflicts={
            group_id: sorted(guest_ids)
            for group_id, guest_ids in validation["grouping_conflicts"].items()
        },
        tables=[
            TableSummaryResponse(**table_summary)
            for table_summary in validation["tables"]
        ],
        assigned_guests=validation["assigned_guests"],
        unassigned_guests=validation["unassigned_guests"],
    )
