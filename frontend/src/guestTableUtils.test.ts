import { describe, expect, it } from "vitest";

import { buildConflictReviewRows, sortConflictRows, sortGuestRows } from "./guestTableUtils";
import type { Guest, WorkspaceTable } from "./types";

const tableById = new Map<string, WorkspaceTable>([
  [
    "table-1",
    {
      id: "table-1",
      number: 1,
      capacity: 8,
      position_x: 0,
      position_y: 0,
      table_kind: "round",
      rotation_degrees: 0,
      occupied: 0,
      available: 8,
      guests: [],
    },
  ],
  [
    "table-2",
    {
      id: "table-2",
      number: 2,
      capacity: 8,
      position_x: 0,
      position_y: 0,
      table_kind: "round",
      rotation_degrees: 0,
      occupied: 0,
      available: 8,
      guests: [],
    },
  ],
]);

const guests: Guest[] = [
  {
    id: "guest-1",
    name: "María",
    guest_type: "adulto",
    confirmed: true,
    intolerance: "gluten",
    menu: "pescado",
    group_id: "Familia B",
    table_id: "table-2",
    seat_index: 1,
  },
  {
    id: "guest-2",
    name: "Ana",
    guest_type: "nino",
    confirmed: false,
    intolerance: "",
    menu: "carne",
    group_id: "Familia A",
    table_id: "table-1",
    seat_index: 0,
  },
];

describe("guestTableUtils", () => {
  it("buildConflictReviewRows construye y ordena filas por familia y nombre", () => {
    const rows = buildConflictReviewRows(
      { "Familia B": ["guest-1"], "Familia A": ["guest-2", "guest-x"] },
      new Map(guests.map((guest) => [guest.id, guest])),
      new Map([
        ["table-1", "Mesa 1"],
        ["table-2", "Mesa 2"],
      ]),
    );

    expect(rows).toEqual([
      {
        rowId: "Familia A-guest-2",
        guestId: "guest-2",
        groupId: "Familia A",
        guest: guests[1],
        guestName: "Ana",
        tableLabel: "Mesa 1",
      },
      {
        rowId: "Familia A-guest-x",
        guestId: "guest-x",
        groupId: "Familia A",
        guest: null,
        guestName: "guest-x",
        tableLabel: "Sin mesa",
      },
      {
        rowId: "Familia B-guest-1",
        guestId: "guest-1",
        groupId: "Familia B",
        guest: guests[0],
        guestName: "María",
        tableLabel: "Mesa 2",
      },
    ]);
  });

  it("sortGuestRows ordena invitados por mesa y asiento", () => {
    const sortedByTable = sortGuestRows(guests, { column: "table", direction: "asc" }, tableById);
    const sortedBySeat = sortGuestRows(guests, { column: "seat", direction: "asc" }, tableById);

    expect(sortedByTable.map((guest) => guest.id)).toEqual(["guest-2", "guest-1"]);
    expect(sortedBySeat.map((guest) => guest.id)).toEqual(["guest-2", "guest-1"]);
  });

  it("sortGuestRows ordena por tipo y confirmación usando etiquetas legibles", () => {
    const sortedByType = sortGuestRows(guests, { column: "type", direction: "asc" }, tableById);
    const sortedByConfirmed = sortGuestRows(guests, { column: "confirmed", direction: "asc" }, tableById);

    expect(sortedByType.map((guest) => guest.id)).toEqual(["guest-1", "guest-2"]);
    expect(sortedByConfirmed.map((guest) => guest.id)).toEqual(["guest-2", "guest-1"]);
  });

  it("sortConflictRows ordena por menú, intolerancia y nombre", () => {
    const rows = [
      {
        rowId: "a",
        guestId: "guest-1",
        groupId: "Familia B",
        guest: guests[0],
        guestName: "María",
        tableLabel: "Mesa 2",
      },
      {
        rowId: "b",
        guestId: "guest-2",
        groupId: "Familia A",
        guest: guests[1],
        guestName: "Ana",
        tableLabel: "Mesa 1",
      },
    ];

    expect(sortConflictRows(rows, { column: "menu", direction: "asc" }).map((row) => row.rowId)).toEqual(["b", "a"]);
    expect(sortConflictRows(rows, { column: "intolerance", direction: "asc" }).map((row) => row.rowId)).toEqual(["a", "b"]);
    expect(sortConflictRows(rows, { column: "name", direction: "asc" }).map((row) => row.rowId)).toEqual(["b", "a"]);
  });
});
