"""Tests unitarios del dominio de seating."""

from __future__ import annotations

import pytest

from backend.app.domains.seating import DomainError, Event, Guest, GuestType, TableKind


@pytest.fixture
def event() -> Event:
    event = Event(id="event-1", name="Boda Ana y Luis", default_table_capacity=2)
    event.create_tables(2)
    event.add_guest(Guest(id="guest-1", name="Ana", guest_type=GuestType.ADULT, group_id="g1"))
    event.add_guest(Guest(id="guest-2", name=" Luis ", guest_type=GuestType.ADULT, group_id="g1"))
    event.add_guest(Guest(id="guest-3", name="Mario", guest_type=GuestType.CHILD))
    return event


def test_event_requires_name() -> None:
    with pytest.raises(DomainError, match="nombre del evento"):
        Event(id="event-1", name="   ", default_table_capacity=8)


def test_create_tables_generates_expected_layout() -> None:
    event = Event(id="event-1", name="Evento", default_table_capacity=8)

    tables = event.create_tables(5)

    assert len(tables) == 5
    assert event.tables[Event.COUPLE_TABLE_ID].kind is TableKind.COUPLE
    assert event.tables[Event.COUPLE_TABLE_ID].capacity == Event.COUPLE_TABLE_CAPACITY
    assert event.tables[Event.COUPLE_TABLE_ID].position_y == Event.COUPLE_TABLE_POSITION_Y
    assert tables[0].position_x == 180.0
    assert tables[0].position_y == 180.0
    assert tables[4].position_y == 460.0


def test_add_table_uses_default_capacity_and_next_slot() -> None:
    event = Event(id="event-1", name="Evento", default_table_capacity=6)
    event.create_tables(4)

    table = event.add_table()

    assert table.id == "table-5"
    assert table.number == 5
    assert table.capacity == 6
    assert table.position_x == 180.0
    assert table.position_y == 460.0


def test_update_default_table_capacity_changes_future_tables_only() -> None:
    event = Event(id="event-1", name="Evento", default_table_capacity=8)
    event.create_tables(1)

    event.update_default_table_capacity(10)
    table = event.add_table()

    assert event.default_table_capacity == 10
    assert event.tables["table-1"].capacity == 8
    assert table.capacity == 10


def test_remove_table_rejects_occupied_or_last_table() -> None:
    event = Event(id="event-1", name="Evento", default_table_capacity=8)
    event.create_tables(2)
    event.add_guest(Guest(id="guest-1", name="Ana", guest_type=GuestType.ADULT))
    event.assign_guest_to_table("guest-1", "table-1")

    with pytest.raises(DomainError, match="mesa con invitados"):
        event.remove_table("table-1")

    event.unassign_guest("guest-1")
    event.remove_table("table-2")
    event.remove_table("table-1")

    with pytest.raises(DomainError, match="mesa de novios"):
        event.remove_table(Event.COUPLE_TABLE_ID)


def test_remove_table_renumbers_remaining_tables() -> None:
    event = Event(id="event-1", name="Evento", default_table_capacity=8)
    event.create_tables(5)

    event.remove_table("table-3")

    assert list(event.tables) == [Event.COUPLE_TABLE_ID, "table-1", "table-2", "table-3", "table-4"]
    assert event.tables["table-3"].number == 3
    assert event.tables["table-4"].position_x == 180.0


def test_duplicate_table_rejects_couple_table() -> None:
    event = Event(id="event-1", name="Evento", default_table_capacity=8)
    event.create_tables(2)

    with pytest.raises(DomainError, match="no se puede duplicar"):
        event.duplicate_table(Event.COUPLE_TABLE_ID)


def test_update_table_transform_stores_rotation() -> None:
    event = Event(id="event-1", name="Evento", default_table_capacity=8)
    event.create_tables(2)

    updated_table = event.update_table_transform(Event.COUPLE_TABLE_ID, 420.0, 72.0, 405.0)

    assert updated_table.position_x == 420.0
    assert updated_table.position_y == 72.0
    assert updated_table.rotation_degrees == 45.0


def test_couple_table_capacity_is_fixed_to_two_seats() -> None:
    event = Event(id="event-1", name="Evento", default_table_capacity=8)
    event.create_tables(2)

    with pytest.raises(DomainError, match="exactamente 2 asientos"):
        event.update_table_capacity(Event.COUPLE_TABLE_ID, 4)


def test_add_guest_rejects_duplicate_ids(event: Event) -> None:
    with pytest.raises(DomainError, match="Ya existe un invitado"):
        event.add_guest(Guest(id="guest-1", name="Repetido", guest_type=GuestType.TEEN))


def test_update_guest_updates_all_supported_fields(event: Event) -> None:
    guest = event.update_guest(
        "guest-3",
        name="Mario Junior",
        guest_type=GuestType.TEEN,
        group_id="g2",
    )

    assert guest.name == "Mario Junior"
    assert guest.guest_type is GuestType.TEEN
    assert guest.group_id == "g2"


def test_update_guest_rejects_blank_name(event: Event) -> None:
    with pytest.raises(DomainError, match="nombre del invitado"):
        event.update_guest("guest-1", name="  ")


def test_assign_guest_to_table_updates_assignment(event: Event) -> None:
    guest = event.assign_guest_to_table("guest-1", "table-1")

    assert guest.table_id == "table-1"
    assert event.table_occupancy("table-1") == 1


def test_assign_guest_to_same_table_is_idempotent(event: Event) -> None:
    event.assign_guest_to_table("guest-1", "table-1")

    guest = event.assign_guest_to_table("guest-1", "table-1")

    assert guest.table_id == "table-1"
    assert event.table_occupancy("table-1") == 1


def test_assign_guest_rejects_full_table(event: Event) -> None:
    event.assign_guest_to_table("guest-1", "table-1")
    event.assign_guest_to_table("guest-2", "table-1")

    with pytest.raises(DomainError, match="no tiene asientos libres"):
        event.assign_guest_to_table("guest-3", "table-1")


def test_unassign_guest_clears_assignment(event: Event) -> None:
    event.assign_guest_to_table("guest-1", "table-1")

    guest = event.unassign_guest("guest-1")

    assert guest.table_id is None
    assert event.table_occupancy("table-1") == 0


def test_remove_guest_releases_the_assignment(event: Event) -> None:
    event.assign_guest_to_table("guest-1", "table-1")

    removed_guest = event.remove_guest("guest-1")

    assert removed_guest.id == "guest-1"
    assert "guest-1" not in event.guests
    assert event.table_occupancy("table-1") == 0


def test_update_table_capacity_rejects_value_below_current_occupancy(event: Event) -> None:
    event.assign_guest_to_table("guest-1", "table-1")
    event.assign_guest_to_table("guest-2", "table-1")

    with pytest.raises(DomainError, match="capacidad no puede ser menor"):
        event.update_table_capacity("table-1", 1)


def test_grouping_conflicts_detects_members_split_across_tables(event: Event) -> None:
    event.assign_guest_to_table("guest-1", "table-1")
    event.assign_guest_to_table("guest-2", "table-2")

    conflicts = event.grouping_conflicts()

    assert conflicts == {"g1": {"guest-1", "guest-2"}}


def test_grouping_conflicts_ignores_unassigned_members(event: Event) -> None:
    event.assign_guest_to_table("guest-1", "table-1")

    assert event.grouping_conflicts() == {}


def test_guests_lists_are_sorted_by_name(event: Event) -> None:
    event.assign_guest_to_table("guest-3", "table-1")

    assert [guest.name for guest in event.guests_without_table()] == ["Ana", "Luis"]
    assert [guest.name for guest in event.guests_with_table()] == ["Mario"]


def test_validate_state_returns_summary(event: Event) -> None:
    event.assign_guest_to_table("guest-1", "table-1")
    event.assign_guest_to_table("guest-2", "table-2")

    validation = event.validate_state()

    assert validation["assigned_guests"] == 2
    assert validation["unassigned_guests"] == 1
    assert validation["grouping_conflicts"] == {"g1": {"guest-1", "guest-2"}}
    assert validation["tables"][1]["occupied"] == 1


def test_missing_guest_and_table_raise_domain_error(event: Event) -> None:
    with pytest.raises(DomainError, match="No existe el invitado"):
        event.assign_guest_to_table("missing-guest", "table-1")

    with pytest.raises(DomainError, match="No existe la mesa"):
        event.assign_guest_to_table("guest-1", "missing-table")
