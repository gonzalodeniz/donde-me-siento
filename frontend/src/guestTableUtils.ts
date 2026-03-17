import { formatGuestTypeLabel, formatMenuLabel, sortRows, type SortState } from "./appUtils";
import type { Guest, WorkspaceTable } from "./types";

export type ConflictReviewRow = {
  rowId: string;
  guestId: string;
  groupId: string;
  guest: Guest | null;
  guestName: string;
  tableLabel: string;
};

export function buildConflictReviewRows(
  groupingConflicts: Record<string, string[]>,
  guestById: Map<string, Guest>,
  tableLabelById: Map<string, string>,
) {
  return Object.entries(groupingConflicts)
    .flatMap(([groupId, guestIds]) =>
      guestIds.map((guestId) => {
        const guest = guestById.get(guestId);
        const tableLabel = guest?.table_id ? tableLabelById.get(guest.table_id) : null;

        return {
          rowId: `${groupId}-${guestId}`,
          guestId,
          groupId,
          guest: guest ?? null,
          guestName: guest?.name ?? guestId,
          tableLabel: tableLabel ?? "Sin mesa",
        };
      }),
    )
    .sort((left, right) => {
      const groupComparison = left.groupId.localeCompare(right.groupId, "es");
      if (groupComparison !== 0) {
        return groupComparison;
      }

      return left.guestName.localeCompare(right.guestName, "es");
    });
}

function getGuestSortValue(guest: Guest, column: string, tableById: Map<string, WorkspaceTable>) {
  switch (column) {
    case "confirmed":
      return guest.confirmed;
    case "type":
      return formatGuestTypeLabel(guest.guest_type);
    case "intolerance":
      return guest.intolerance || "zzz";
    case "menu":
      return formatMenuLabel(guest.menu);
    case "group":
      return guest.group_id ?? "zzz";
    case "table":
      return guest.table_id ? (tableById.get(guest.table_id)?.number ?? 0) : -1;
    case "seat":
      return guest.seat_index ?? Number.MAX_SAFE_INTEGER;
    case "name":
    default:
      return guest.name;
  }
}

export function sortGuestRows(guests: Guest[], sort: SortState, tableById: Map<string, WorkspaceTable>) {
  return sortRows(guests, sort, (guest, column) => getGuestSortValue(guest, column, tableById));
}

export function sortConflictRows(rows: ConflictReviewRow[], sort: SortState) {
  return sortRows(rows, sort, (row, column) => {
    switch (column) {
      case "intolerance":
        return row.guest?.intolerance || "zzz";
      case "menu":
        return row.guest ? formatMenuLabel(row.guest.menu) : "desconocido";
      case "group":
        return row.groupId;
      case "table":
        return row.tableLabel;
      case "name":
      default:
        return row.guestName;
    }
  });
}
