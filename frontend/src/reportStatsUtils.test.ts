import { describe, expect, it } from "vitest";

import { buildGuestImportStats, buildWorkspaceStats } from "./reportStatsUtils";
import type { Workspace } from "./types";

function buildWorkspace(): Workspace {
  return {
    event_id: "workspace-main",
    name: "Workspace principal",
    date: null,
    default_table_capacity: 8,
    tables: [
      {
        id: "table-1",
        number: 1,
        capacity: 4,
        position_x: 0,
        position_y: 0,
        table_kind: "round",
        rotation_degrees: 0,
        occupied: 4,
        available: 0,
        guests: [
          {
            id: "guest-1",
            name: "Ana",
            guest_type: "adulto",
            confirmed: true,
            intolerance: "",
            menu: "carne",
            group_id: "Familia A",
            table_id: "table-1",
            seat_index: 0,
          },
        ],
      },
      {
        id: "table-2",
        number: 2,
        capacity: 6,
        position_x: 0,
        position_y: 0,
        table_kind: "round",
        rotation_degrees: 0,
        occupied: 2,
        available: 4,
        guests: [
          {
            id: "guest-2",
            name: "Luis",
            guest_type: "adolescente",
            confirmed: false,
            intolerance: "gluten",
            menu: "pescado",
            group_id: "Familia B",
            table_id: "table-2",
            seat_index: 1,
          },
        ],
      },
    ],
    guests: {
      assigned: [
        {
          id: "guest-1",
          name: "Ana",
          guest_type: "adulto",
          confirmed: true,
          intolerance: "",
          menu: "carne",
          group_id: "Familia A",
          table_id: "table-1",
          seat_index: 0,
        },
        {
          id: "guest-2",
          name: "Luis",
          guest_type: "adolescente",
          confirmed: false,
          intolerance: "gluten",
          menu: "pescado",
          group_id: "Familia B",
          table_id: "table-2",
          seat_index: 1,
        },
      ],
      unassigned: [
        {
          id: "guest-3",
          name: "Marta",
          guest_type: "nino",
          confirmed: true,
          intolerance: "",
          menu: "vegano",
          group_id: "Familia B",
          table_id: null,
          seat_index: null,
        },
        {
          id: "guest-4",
          name: "Pablo",
          guest_type: "adulto",
          confirmed: false,
          intolerance: "",
          menu: "desconocido",
          group_id: null,
          table_id: null,
          seat_index: null,
        },
      ],
    },
    validation: {
      grouping_conflicts: {
        "Familia B": ["guest-2", "guest-3"],
      },
      tables: [],
      assigned_guests: 2,
      unassigned_guests: 2,
    },
  };
}

describe("reportStatsUtils", () => {
  it("buildWorkspaceStats calcula conteos, progreso y conflictos", () => {
    const stats = buildWorkspaceStats(buildWorkspace());

    expect(stats.totalGuestsCount).toBe(4);
    expect(stats.seatedGuestsCount).toBe(2);
    expect(stats.confirmedGuestsCount).toBe(2);
    expect(stats.unconfirmedGuestsCount).toBe(2);
    expect(stats.adultGuestsCount).toBe(2);
    expect(stats.teenGuestsCount).toBe(1);
    expect(stats.childGuestsCount).toBe(1);
    expect(stats.meatMenuGuestsCount).toBe(1);
    expect(stats.fishMenuGuestsCount).toBe(1);
    expect(stats.vegetarianMenuGuestsCount).toBe(1);
    expect(stats.unknownMenuGuestsCount).toBe(1);
    expect(stats.fullTablesCount).toBe(1);
    expect(stats.groupedConflictCount).toBe(1);
    expect(stats.conflictGuestIds.has("guest-2")).toBe(true);
    expect(stats.conflictGuestIds.has("guest-3")).toBe(true);
    expect(stats.conflictTableIds.has("table-2")).toBe(true);
    expect(stats.seatingProgress).toBe(50);
    expect(stats.confirmationProgress).toBe(50);
    expect(stats.occupancyAverage).toBe(60);
  });

  it("buildWorkspaceStats devuelve ceros y sets vacíos sin workspace", () => {
    const stats = buildWorkspaceStats(null);

    expect(stats.totalGuestsCount).toBe(0);
    expect(stats.seatingProgress).toBe(0);
    expect(stats.confirmationProgress).toBe(0);
    expect(stats.occupancyAverage).toBe(0);
    expect(stats.conflictGuestIds.size).toBe(0);
    expect(stats.conflictTableIds.size).toBe(0);
  });

  it("buildGuestImportStats resume el preview de importación", () => {
    const stats = buildGuestImportStats({
      fileName: "invitados.csv",
      guests: Array.from({ length: 10 }, (_, index) => ({
        name: `Invitado ${index + 1}`,
        guest_type: index % 2 === 0 ? "adulto" : "nino",
        confirmed: index % 3 === 0,
        intolerance: "",
        menu: "carne",
        group_id: index < 6 ? "Familia A" : "Familia B",
      })),
    });

    expect(stats).not.toBeNull();
    expect(stats?.total).toBe(10);
    expect(stats?.confirmed).toBe(4);
    expect(stats?.pending).toBe(6);
    expect(stats?.families).toBe(2);
    expect(stats?.previewRows).toHaveLength(8);
  });

  it("buildGuestImportStats devuelve null sin preview", () => {
    expect(buildGuestImportStats(null)).toBeNull();
  });
});
