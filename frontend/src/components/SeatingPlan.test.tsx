import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeatingPlan } from "./SeatingPlan";
import type { Workspace } from "../types";

function buildWorkspace(): Workspace {
  return {
    event_id: "workspace-main",
    name: "Workspace principal",
    date: null,
    default_table_capacity: 8,
    tables: [
      {
        id: "table-couple",
        number: 0,
        capacity: 2,
        position_x: 600,
        position_y: 90,
        table_kind: "couple",
        rotation_degrees: 0,
        occupied: 0,
        available: 2,
        guests: [],
      },
      {
        id: "table-1",
        number: 1,
        capacity: 2,
        position_x: 180,
        position_y: 180,
        table_kind: "round",
        rotation_degrees: 0,
        occupied: 1,
        available: 1,
        guests: [
          {
            id: "guest-1",
            name: "Ana María",
            guest_type: "adulto",
            confirmed: true,
            intolerance: "",
            menu: "carne",
            group_id: "Familia 1",
            table_id: "table-1",
            seat_index: 0,
          },
        ],
      },
    ],
    guests: {
      assigned: [
        {
          id: "guest-1",
          name: "Ana María",
          guest_type: "adulto",
          confirmed: true,
          intolerance: "",
          menu: "carne",
          group_id: "Familia 1",
          table_id: "table-1",
          seat_index: 0,
        },
      ],
      unassigned: [],
    },
    validation: {
      grouping_conflicts: {},
      tables: [],
      assigned_guests: 1,
      unassigned_guests: 0,
    },
  };
}

function renderSeatingPlan(overrides: Partial<ComponentProps<typeof SeatingPlan>> = {}) {
  const props: ComponentProps<typeof SeatingPlan> = {
    workspace: buildWorkspace(),
    selectedTableId: null,
    activeDropSeat: null,
    draggedGuestName: null,
    highlightedGuestIds: [],
    isSearchActive: false,
    onGuestDragEnd: vi.fn(),
    onGuestDragStart: vi.fn(),
    onMoveTable: vi.fn().mockResolvedValue(undefined),
    onSelectTable: vi.fn(),
    onSeatDragEnter: vi.fn(),
    onSeatDragLeave: vi.fn(),
    onSeatDrop: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<SeatingPlan {...props} />),
    props,
  };
}

describe("SeatingPlan", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza el plano y las mesas principales", () => {
    renderSeatingPlan();

    expect(screen.getByText("Salón y mesas")).not.toBeNull();
    expect(screen.getByTestId("plan-table-table-1")).not.toBeNull();
    expect(screen.getByTestId("plan-table-table-couple")).not.toBeNull();
  });

  it("permite cambiar la altura visible con teclado desde el separador inferior", () => {
    renderSeatingPlan();

    const separator = screen.getByRole("separator", { name: "Ajustar altura visible del plano" });
    const initialHeight = Number(separator.getAttribute("aria-valuenow"));

    expect(initialHeight).toBeGreaterThanOrEqual(320);

    fireEvent.keyDown(separator, { key: "ArrowUp" });
    expect(separator.getAttribute("aria-valuenow")).toBe(String(initialHeight - 36));

    fireEvent.keyDown(separator, { key: "ArrowDown" });
    expect(separator.getAttribute("aria-valuenow")).toBe(String(initialHeight));

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator.getAttribute("aria-valuemin")).toBe("320");
    expect(separator.getAttribute("aria-valuenow")).toBe("320");
  });

  it("selecciona la mesa al pulsar sobre un asiento ocupado", () => {
    const { props } = renderSeatingPlan();

    fireEvent.click(screen.getByRole("button", { name: "Ana María en mesa 1, silla 1" }));

    expect(props.onSelectTable).toHaveBeenCalledWith("table-1");
  });

  it("muestra los asientos libres cuando se está arrastrando un invitado", () => {
    renderSeatingPlan({ draggedGuestName: "Invitado suelto" });

    expect(screen.getByRole("button", { name: "Silla 2 libre en mesa 1" })).not.toBeNull();
  });
});
