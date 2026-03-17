import { formatGuestTypeLabel, formatMenuLabel, sortRows, type ImportedGuestDraft, type SortState } from "./appUtils";
import type { SavedSession } from "./types";

export function sortSessions(sessions: SavedSession[], sort: SortState) {
  return sortRows(sessions, sort, (session, column) => {
    if (column === "created_at") {
      return new Date(session.created_at).getTime();
    }
    return session.name;
  });
}

export function sortGuestImportPreviewRows(guests: ImportedGuestDraft[], sort: SortState) {
  return sortRows(guests, sort, (guest, column) => {
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
      case "name":
      default:
        return guest.name;
    }
  }).slice(0, 8);
}
