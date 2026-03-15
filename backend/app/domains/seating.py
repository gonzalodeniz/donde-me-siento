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


class GuestMenu(StrEnum):
    """Opciones de menú soportadas para cada invitado."""

    UNKNOWN = "desconocido"
    MEAT = "carne"
    FISH = "pescado"
    VEGAN = "vegano"


class TableKind(StrEnum):
    """Tipos de mesa soportados en el salón."""

    ROUND = "round"
    COUPLE = "couple"


@dataclass(slots=True)
class Table:
    """Mesa del evento."""

    id: str
    number: int
    capacity: int
    position_x: float
    position_y: float
    kind: TableKind = TableKind.ROUND
    rotation_degrees: float = 0.0

    def __post_init__(self) -> None:
        if self.capacity <= 0:
            raise DomainError("La capacidad de una mesa debe ser mayor que cero.")
        self.rotation_degrees = self._normalize_rotation(self.rotation_degrees)

    @property
    def is_couple(self) -> bool:
        return self.kind is TableKind.COUPLE

    @property
    def display_name(self) -> str:
        return "mesa de novios" if self.is_couple else f"mesa {self.number}"

    @staticmethod
    def _normalize_rotation(rotation_degrees: float) -> float:
        normalized = float(rotation_degrees) % 360.0
        if normalized > 180.0:
            normalized -= 360.0
        if normalized <= -180.0:
            normalized += 360.0
        return normalized


@dataclass(slots=True)
class Guest:
    """Invitado del evento."""

    id: str
    name: str
    guest_type: GuestType
    confirmed: bool = False
    intolerance: str = ""
    menu: GuestMenu = GuestMenu.UNKNOWN
    group_id: str | None = None
    table_id: str | None = None
    seat_index: int | None = None

    def __post_init__(self) -> None:
        normalized_name = self.name.strip()
        if not normalized_name:
            raise DomainError("El nombre del invitado es obligatorio.")
        self.name = normalized_name
        self.intolerance = self.intolerance.strip()


@dataclass(slots=True)
class Event:
    """Agregado raiz del dominio para gestionar el seating."""

    id: str
    name: str
    default_table_capacity: int
    date: str | None = None
    tables: dict[str, Table] = field(default_factory=dict)
    guests: dict[str, Guest] = field(default_factory=dict)

    GRID_ORIGIN_X = 180.0
    GRID_ORIGIN_Y = 180.0
    GRID_SPACING_X = 280.0
    GRID_SPACING_Y = 280.0
    DUPLICATE_OFFSET = 120.0
    COUPLE_TABLE_ID = "table-couple"
    COUPLE_TABLE_NUMBER = 0
    COUPLE_TABLE_CAPACITY = 2
    COUPLE_TABLE_POSITION_X = 600.0
    COUPLE_TABLE_POSITION_Y = 90.0

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
        self._ensure_couple_table()
        created_tables: list[Table] = []

        for index in range(count):
            table = Table(
                id=f"table-{index + 1}",
                number=index + 1,
                capacity=self.default_table_capacity,
                position_x=self._table_position_x(index, count),
                position_y=self._table_position_y(index, count),
            )
            self.tables[table.id] = table
            created_tables.append(table)

        return created_tables

    def add_table(self) -> Table:
        self._ensure_couple_table()
        next_number = self._next_round_table_number()
        next_index = len(self._round_tables())
        table = Table(
            id=f"table-{next_number}",
            number=next_number,
            capacity=self.default_table_capacity,
            position_x=self._table_position_x(next_index, next_index + 1),
            position_y=self._table_position_y(next_index, next_index + 1),
        )
        self.tables[table.id] = table
        return table

    def add_tables(self, count: int, capacity: int | None = None) -> list[Table]:
        if count <= 0:
            raise DomainError("El numero de mesas debe ser mayor que cero.")

        self._ensure_couple_table()
        next_number = self._next_round_table_number()
        total_count = len(self._round_tables()) + count
        normalized_capacity = capacity if capacity is not None else self.default_table_capacity
        if normalized_capacity <= 0:
            raise DomainError("La capacidad de las mesas debe ser mayor que cero.")

        self.default_table_capacity = normalized_capacity

        created_tables: list[Table] = []
        for offset in range(count):
            index = next_number + offset - 1
            table_number = next_number + offset
            table = Table(
                id=f"table-{table_number}",
                number=table_number,
                capacity=normalized_capacity,
                position_x=self._table_position_x(index, total_count),
                position_y=self._table_position_y(index, total_count),
            )
            self.tables[table.id] = table
            created_tables.append(table)

        return created_tables

    def duplicate_table(self, table_id: str) -> Table:
        source_table = self._get_table(table_id)
        if source_table.is_couple:
            raise DomainError("La mesa de novios no se puede duplicar.")
        duplicated = self.add_tables(1, source_table.capacity)[0]
        duplicated.position_x = source_table.position_x + self.DUPLICATE_OFFSET
        duplicated.position_y = source_table.position_y + self.DUPLICATE_OFFSET
        return duplicated

    def remove_table(self, table_id: str) -> None:
        table = self._get_table(table_id)
        if table.is_couple:
            raise DomainError("La mesa de novios siempre debe permanecer en el salón.")
        if self.table_occupancy(table.id) > 0:
            raise DomainError("No se puede retirar una mesa con invitados asignados.")

        couple_table = self._ensure_couple_table()
        remaining_round_tables = [
            current_table
            for current_table in self._round_tables()
            if current_table.id != table.id
        ]

        id_map: dict[str, str] = {}
        rebuilt_tables: dict[str, Table] = {couple_table.id: couple_table}
        for index, current_table in enumerate(remaining_round_tables):
            new_id = f"table-{index + 1}"
            id_map[current_table.id] = new_id
            rebuilt_tables[new_id] = Table(
                id=new_id,
                number=index + 1,
                capacity=current_table.capacity,
                position_x=current_table.position_x,
                position_y=current_table.position_y,
                kind=current_table.kind,
                rotation_degrees=current_table.rotation_degrees,
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
        confirmed: bool | None = None,
        intolerance: str | None = None,
        menu: GuestMenu | None = None,
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
        if confirmed is not None:
            guest.confirmed = confirmed
        if intolerance is not None:
            guest.intolerance = intolerance.strip()
        if menu is not None:
            guest.menu = menu
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
        if table.is_couple:
            raise DomainError("La mesa de novios siempre tiene exactamente 2 asientos.")
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

    def update_table_transform(
        self,
        table_id: str,
        position_x: float,
        position_y: float,
        rotation_degrees: float | None = None,
    ) -> Table:
        table = self.update_table_position(table_id, position_x, position_y)
        if rotation_degrees is not None:
            table.rotation_degrees = Table._normalize_rotation(rotation_degrees)
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
        self._ensure_couple_table()
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
            raise DomainError(f"La {table.display_name} no tiene asientos libres.")

        if seat_index < 0 or seat_index >= table.capacity:
            raise DomainError(f"La silla seleccionada no existe en la {table.display_name}.")
        if seat_index in occupied_seats:
            raise DomainError(f"La silla seleccionada de la {table.display_name} ya está ocupada.")

        return seat_index

    def _get_table(self, table_id: str) -> Table:
        try:
            return self.tables[table_id]
        except KeyError as exc:
            raise DomainError(f"No existe la mesa '{table_id}'.") from exc

    def _next_round_table_number(self) -> int:
        return max((table.number for table in self._round_tables()), default=0) + 1

    def _round_tables(self) -> list[Table]:
        return sorted(
            (table for table in self.tables.values() if not table.is_couple),
            key=lambda current: current.number,
        )

    def _ensure_couple_table(self) -> Table:
        couple_tables = [table for table in self.tables.values() if table.is_couple or table.id == self.COUPLE_TABLE_ID]
        if len(couple_tables) > 1:
            raise DomainError("Solo puede existir una mesa de novios en el salón.")
        if couple_tables:
            couple_table = couple_tables[0]
            couple_table.id = self.COUPLE_TABLE_ID
            couple_table.number = self.COUPLE_TABLE_NUMBER
            couple_table.capacity = self.COUPLE_TABLE_CAPACITY
            couple_table.kind = TableKind.COUPLE
            couple_table.rotation_degrees = Table._normalize_rotation(couple_table.rotation_degrees)
            self.tables = {
                table.id: table
                for table in [couple_table, *self._round_tables()]
            }
            return couple_table

        couple_table = Table(
            id=self.COUPLE_TABLE_ID,
            number=self.COUPLE_TABLE_NUMBER,
            capacity=self.COUPLE_TABLE_CAPACITY,
            position_x=self.COUPLE_TABLE_POSITION_X,
            position_y=self.COUPLE_TABLE_POSITION_Y,
            kind=TableKind.COUPLE,
        )
        self.tables[couple_table.id] = couple_table
        return couple_table

    @staticmethod
    def _table_position_x(index: int, count: int) -> float:
        columns = min(count, 4)
        column = index % columns
        return Event.GRID_ORIGIN_X + (column * Event.GRID_SPACING_X)

    @staticmethod
    def _table_position_y(index: int, count: int) -> float:
        columns = min(count, 4)
        row = index // columns
        return Event.GRID_ORIGIN_Y + (row * Event.GRID_SPACING_Y)
