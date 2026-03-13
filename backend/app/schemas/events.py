"""Esquemas Pydantic para el workspace unico."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from backend.app.domains.seating import Event


class GuestCreate(BaseModel):
    """Payload de invitado al crear o restaurar el workspace."""

    id: str | None = Field(default=None, min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    guest_type: str = Field(min_length=1, max_length=32)
    group_id: str | None = Field(default=None, max_length=64)
    table_id: str | None = Field(default=None, max_length=64)
    seat_index: int | None = Field(default=None, ge=0)

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
    seat_index: int | None


class EventResponse(BaseModel):
    """Evento serializado para la API."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    date: str | None
    default_table_capacity: int
    tables: list[TableResponse]
    guests: list[GuestResponse]

class GuestUpdate(BaseModel):
    """Payload para actualizar un invitado."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    guest_type: str | None = Field(default=None, min_length=1, max_length=32)
    group_id: str | None = Field(default=None, max_length=64)


class GuestAssignmentRequest(BaseModel):
    """Payload para asignar un invitado a una mesa."""

    table_id: str = Field(min_length=1, max_length=64)
    seat_index: int | None = Field(default=None, ge=0)


class TableCapacityUpdate(BaseModel):
    """Payload para ajustar la capacidad de una mesa."""

    capacity: int = Field(gt=0)


class TablePositionUpdate(BaseModel):
    """Payload para recolocar una mesa dentro del plano."""

    position_x: float
    position_y: float


class TableBatchCreateRequest(BaseModel):
    """Payload para crear varias mesas de una vez."""

    count: int = Field(gt=0, le=50)
    capacity: int = Field(gt=0, le=24)


class DefaultTableCapacityUpdate(BaseModel):
    """Payload para ajustar el aforo por defecto de mesas nuevas."""

    capacity: int = Field(gt=0)


class SessionCreateRequest(BaseModel):
    """Payload para guardar un snapshot del salón."""

    name: str = Field(min_length=1, max_length=255)


class SessionResponse(BaseModel):
    """Sesión guardada disponible para cargar."""

    id: str
    name: str
    created_at: str


class TableSummaryResponse(BaseModel):
    """Resumen de una mesa para panel y validacion."""

    table_id: str
    table_number: int
    capacity: int
    occupied: int
    available: int


class ValidationResponse(BaseModel):
    """Estado de validacion del workspace listo para frontend."""

    grouping_conflicts: dict[str, list[str]]
    tables: list[TableSummaryResponse]
    assigned_guests: int
    unassigned_guests: int


class GuestListsResponse(BaseModel):
    """Listas de invitados separadas para el workspace."""

    assigned: list[GuestResponse]
    unassigned: list[GuestResponse]


class WorkspaceTableResponse(BaseModel):
    """Mesa enriquecida con invitados para el workspace del frontend."""

    id: str
    number: int
    capacity: int
    position_x: float
    position_y: float
    occupied: int
    available: int
    guests: list[GuestResponse]


class WorkspaceResponse(BaseModel):
    """Estado agregado del workspace listo para pintar la UI."""

    event_id: str
    name: str
    date: str | None
    default_table_capacity: int
    tables: list[WorkspaceTableResponse]
    guests: GuestListsResponse
    validation: ValidationResponse


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
                seat_index=guest.seat_index,
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


def build_workspace_response(event: Event) -> WorkspaceResponse:
    """Compone la vista agregada del workspace para el frontend."""

    validation = build_validation_response(event)
    assigned_guests = [
        GuestResponse(
            id=guest.id,
            name=guest.name,
            guest_type=guest.guest_type.value,
            group_id=guest.group_id,
            table_id=guest.table_id,
            seat_index=guest.seat_index,
        )
        for guest in event.guests_with_table()
    ]
    unassigned_guests = [
        GuestResponse(
            id=guest.id,
            name=guest.name,
            guest_type=guest.guest_type.value,
            group_id=guest.group_id,
            table_id=guest.table_id,
            seat_index=guest.seat_index,
        )
        for guest in event.guests_without_table()
    ]

    tables: list[WorkspaceTableResponse] = []
    validation_by_table = {table.table_id: table for table in validation.tables}
    for table in sorted(event.tables.values(), key=lambda current: current.number):
        table_validation = validation_by_table[table.id]
        seated_guests = [
            GuestResponse(
                id=guest.id,
                name=guest.name,
                guest_type=guest.guest_type.value,
                group_id=guest.group_id,
                table_id=guest.table_id,
                seat_index=guest.seat_index,
            )
            for guest in sorted(
                (guest for guest in event.guests.values() if guest.table_id == table.id),
                key=lambda current: (
                    current.seat_index if current.seat_index is not None else 10_000,
                    current.name.casefold(),
                ),
            )
        ]
        tables.append(
            WorkspaceTableResponse(
                id=table.id,
                number=table.number,
                capacity=table.capacity,
                position_x=table.position_x,
                position_y=table.position_y,
                occupied=table_validation.occupied,
                available=table_validation.available,
                guests=seated_guests,
            )
        )

    return WorkspaceResponse(
        event_id=event.id,
        name=event.name,
        date=event.date,
        default_table_capacity=event.default_table_capacity,
        tables=tables,
        guests=GuestListsResponse(assigned=assigned_guests, unassigned=unassigned_guests),
        validation=validation,
    )
