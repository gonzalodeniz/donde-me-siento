"""Modelo de dominio inicial para eventos, mesas e invitados."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class DomainError(ValueError):
    """Error de validacion del dominio."""


class GuestType(StrEnum):
    """Tipos de invitado soportados en el MVP."""

    ADULT = "adulto"
    TEEN = "adolescente"
    CHILD = "nino"


@dataclass(slots=True)
class Table:
    """Mesa del evento."""

    id: str
    number: int
    capacity: int
    position_x: float
    position_y: float

    def __post_init__(self) -> None:
        if self.capacity <= 0:
            raise DomainError("La capacidad de una mesa debe ser mayor que cero.")


@dataclass(slots=True)
class Guest:
    """Invitado del evento."""

    id: str
    name: str
    guest_type: GuestType
    group_id: str | None = None
    table_id: str | None = None
    seat_index: int | None = None

    def __post_init__(self) -> None:
        normalized_name = self.name.strip()
        if not normalized_name:
            raise DomainError("El nombre del invitado es obligatorio.")
        self.name = normalized_name


@dataclass(slots=True)
class Event:
    """Agregado raiz del dominio para gestionar el seating."""

    id: str
    name: str
    default_table_capacity: int
    date: str | None = None
    tables: dict[str, Table] = field(default_factory=dict)
    guests: dict[str, Guest] = field(default_factory=dict)

    def __post_init__(self) -> None:
        normalized_name = self.name.strip()
        if not normalized_name:
            raise DomainError("El nombre del evento es obligatorio.")
        if self.default_table_capacity <= 0:
            raise DomainError("La capacidad por defecto debe ser mayor que cero.")
        self.name = normalized_name

    def create_tables(self, count: int) -> list[Table]:
        if count <= 0:
            raise DomainError("El numero de mesas debe ser mayor que cero.")

        self.tables.clear()
        created_tables: list[Table] = []
        columns = min(count, 4)

        for index in range(count):
            row = index // columns
            column = index % columns
            table = Table(
                id=f"table-{index + 1}",
                number=index + 1,
                capacity=self.default_table_capacity,
                position_x=150.0 + (column * 160.0),
                position_y=150.0 + (row * 160.0),
            )
            self.tables[table.id] = table
            created_tables.append(table)

        return created_tables

    def add_table(self) -> Table:
        next_number = max((table.number for table in self.tables.values()), default=0) + 1
        table = Table(
            id=f"table-{next_number}",
            number=next_number,
            capacity=self.default_table_capacity,
            position_x=self._table_position_x(next_number - 1, next_number),
            position_y=self._table_position_y(next_number - 1, next_number),
        )
        self.tables[table.id] = table
        return table

    def remove_table(self, table_id: str) -> None:
        table = self._get_table(table_id)
        if len(self.tables) == 1:
            raise DomainError("El salón debe conservar al menos una mesa.")
        if self.table_occupancy(table.id) > 0:
            raise DomainError("No se puede retirar una mesa con invitados asignados.")

        remaining_tables = [
            current_table
            for current_table in sorted(self.tables.values(), key=lambda current: current.number)
            if current_table.id != table_id
        ]

        id_map: dict[str, str] = {}
        rebuilt_tables: dict[str, Table] = {}
        for index, current_table in enumerate(remaining_tables):
            new_id = f"table-{index + 1}"
            id_map[current_table.id] = new_id
            rebuilt_tables[new_id] = Table(
                id=new_id,
                number=index + 1,
                capacity=current_table.capacity,
                position_x=self._table_position_x(index, len(remaining_tables)),
                position_y=self._table_position_y(index, len(remaining_tables)),
            )

        for guest in self.guests.values():
            if guest.table_id in id_map:
                guest.table_id = id_map[guest.table_id]

        self.tables = rebuilt_tables

    def update_default_table_capacity(self, capacity: int) -> int:
        if capacity <= 0:
            raise DomainError("La capacidad por defecto debe ser mayor que cero.")
        self.default_table_capacity = capacity
        return self.default_table_capacity

    def add_guest(self, guest: Guest) -> Guest:
        if guest.id in self.guests:
            raise DomainError(f"Ya existe un invitado con id '{guest.id}'.")
        self.guests[guest.id] = guest
        return guest

    def update_guest(
        self,
        guest_id: str,
        *,
        name: str | None = None,
        guest_type: GuestType | None = None,
        group_id: str | None = None,
    ) -> Guest:
        guest = self._get_guest(guest_id)
        if name is not None:
            cleaned_name = name.strip()
            if not cleaned_name:
                raise DomainError("El nombre del invitado es obligatorio.")
            guest.name = cleaned_name
        if guest_type is not None:
            guest.guest_type = guest_type
        guest.group_id = group_id
        return guest

    def remove_guest(self, guest_id: str) -> Guest:
        guest = self._get_guest(guest_id)
        guest.table_id = None
        guest.seat_index = None
        return self.guests.pop(guest_id)

    def assign_guest_to_table(self, guest_id: str, table_id: str, seat_index: int | None = None) -> Guest:
        guest = self._get_guest(guest_id)
        table = self._get_table(table_id)
        target_seat_index = self._resolve_target_seat_index(guest, table, seat_index)

        guest.table_id = table.id
        guest.seat_index = target_seat_index
        return guest

    def unassign_guest(self, guest_id: str) -> Guest:
        guest = self._get_guest(guest_id)
        guest.table_id = None
        guest.seat_index = None
        return guest

    def update_table_capacity(self, table_id: str, capacity: int) -> Table:
        table = self._get_table(table_id)
        if capacity <= 0:
            raise DomainError("La capacidad de la mesa debe ser mayor que cero.")
        if self.table_occupancy(table.id) > capacity:
            raise DomainError("La capacidad no puede ser menor que los invitados asignados.")
        table.capacity = capacity
        return table

    def update_table_position(self, table_id: str, position_x: float, position_y: float) -> Table:
        table = self._get_table(table_id)
        table.position_x = position_x
        table.position_y = position_y
        return table

    def guests_with_table(self) -> list[Guest]:
        return sorted(
            (guest for guest in self.guests.values() if guest.table_id is not None),
            key=lambda guest: (
                guest.table_id or "",
                guest.seat_index if guest.seat_index is not None else 10_000,
                guest.name.casefold(),
            ),
        )

    def guests_without_table(self) -> list[Guest]:
        return sorted(
            (guest for guest in self.guests.values() if guest.table_id is None),
            key=lambda guest: guest.name.casefold(),
        )

    def table_occupancy(self, table_id: str) -> int:
        self._get_table(table_id)
        return sum(1 for guest in self.guests.values() if guest.table_id == table_id)

    def table_summary(self) -> list[dict[str, int | str]]:
        summary: list[dict[str, int | str]] = []
        for table in sorted(self.tables.values(), key=lambda current: current.number):
            occupied = self.table_occupancy(table.id)
            summary.append(
                {
                    "table_id": table.id,
                    "table_number": table.number,
                    "capacity": table.capacity,
                    "occupied": occupied,
                    "available": table.capacity - occupied,
                }
            )
        return summary

    def grouping_conflicts(self) -> dict[str, set[str]]:
        grouped_guests: dict[str, list[Guest]] = {}

        for guest in self.guests.values():
            if guest.group_id is None:
                continue
            grouped_guests.setdefault(guest.group_id, []).append(guest)

        conflicts: dict[str, set[str]] = {}
        for group_id, members in grouped_guests.items():
            table_ids = {member.table_id for member in members if member.table_id is not None}
            if len(table_ids) > 1:
                conflicts[group_id] = {member.id for member in members}

        return conflicts

    def validate_state(self) -> dict[str, object]:
        return {
            "grouping_conflicts": self.grouping_conflicts(),
            "tables": self.table_summary(),
            "assigned_guests": len(self.guests_with_table()),
            "unassigned_guests": len(self.guests_without_table()),
        }

    def _get_guest(self, guest_id: str) -> Guest:
        try:
            return self.guests[guest_id]
        except KeyError as exc:
            raise DomainError(f"No existe el invitado '{guest_id}'.") from exc

    def _resolve_target_seat_index(self, guest: Guest, table: Table, seat_index: int | None) -> int:
        occupied_seats = {
            current_guest.seat_index
            for current_guest in self.guests.values()
            if current_guest.table_id == table.id
            and current_guest.id != guest.id
            and current_guest.seat_index is not None
        }

        if seat_index is None:
            for candidate in range(table.capacity):
                if candidate not in occupied_seats:
                    return candidate
            raise DomainError(f"La mesa {table.number} no tiene asientos libres.")

        if seat_index < 0 or seat_index >= table.capacity:
            raise DomainError(f"La silla seleccionada no existe en la mesa {table.number}.")
        if seat_index in occupied_seats:
            raise DomainError(f"La silla seleccionada de la mesa {table.number} ya está ocupada.")

        return seat_index

    def _get_table(self, table_id: str) -> Table:
        try:
            return self.tables[table_id]
        except KeyError as exc:
            raise DomainError(f"No existe la mesa '{table_id}'.") from exc

    @staticmethod
    def _table_position_x(index: int, count: int) -> float:
        columns = min(count, 4)
        column = index % columns
        return 150.0 + (column * 160.0)

    @staticmethod
    def _table_position_y(index: int, count: int) -> float:
        columns = min(count, 4)
        row = index // columns
        return 150.0 + (row * 160.0)
