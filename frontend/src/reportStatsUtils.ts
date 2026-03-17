import type { Guest, Workspace } from "./types";
import type { GuestImportPreview } from "./appUtils";

export type WorkspaceStats = {
  allGuests: Guest[];
  fullTablesCount: number;
  groupedConflictCount: number;
  conflictGuestIds: Set<string>;
  conflictTableIds: Set<string>;
  confirmedGuestsCount: number;
  unconfirmedGuestsCount: number;
  adultGuestsCount: number;
  teenGuestsCount: number;
  childGuestsCount: number;
  fishMenuGuestsCount: number;
  meatMenuGuestsCount: number;
  vegetarianMenuGuestsCount: number;
  unknownMenuGuestsCount: number;
  totalGuestsCount: number;
  seatedGuestsCount: number;
  seatingProgress: number;
  confirmationProgress: number;
  occupancyAverage: number;
};

export type GuestImportStats = {
  total: number;
  confirmed: number;
  pending: number;
  families: number;
  previewRows: GuestImportPreview["guests"];
};

export function buildWorkspaceStats(workspace: Workspace | null): WorkspaceStats {
  const groupingConflicts = workspace?.validation.grouping_conflicts ?? {};
  const conflictGuestIds = new Set(Object.values(groupingConflicts).flatMap((guestIds) => guestIds));
  const allGuests = [...(workspace?.guests.unassigned ?? []), ...(workspace?.guests.assigned ?? [])];
  const confirmedGuestsCount = allGuests.filter((guest) => guest.confirmed).length;
  const totalGuestsCount = allGuests.length;
  const seatedGuestsCount = workspace?.guests.assigned.length ?? 0;

  return {
    allGuests,
    fullTablesCount: workspace?.tables.filter((table) => table.available === 0).length ?? 0,
    groupedConflictCount: Object.keys(groupingConflicts).length,
    conflictGuestIds,
    conflictTableIds: new Set(
      workspace?.tables
        .filter((table) => table.guests.some((guest) => conflictGuestIds.has(guest.id)))
        .map((table) => table.id) ?? [],
    ),
    confirmedGuestsCount,
    unconfirmedGuestsCount: totalGuestsCount - confirmedGuestsCount,
    adultGuestsCount: allGuests.filter((guest) => guest.guest_type === "adulto").length,
    teenGuestsCount: allGuests.filter((guest) => guest.guest_type === "adolescente").length,
    childGuestsCount: allGuests.filter((guest) => guest.guest_type === "nino").length,
    fishMenuGuestsCount: allGuests.filter((guest) => guest.menu === "pescado").length,
    meatMenuGuestsCount: allGuests.filter((guest) => guest.menu === "carne").length,
    vegetarianMenuGuestsCount: allGuests.filter((guest) => guest.menu === "vegano").length,
    unknownMenuGuestsCount: allGuests.filter((guest) => guest.menu === "desconocido").length,
    totalGuestsCount,
    seatedGuestsCount,
    seatingProgress: totalGuestsCount === 0 ? 0 : Math.round((seatedGuestsCount / totalGuestsCount) * 100),
    confirmationProgress: totalGuestsCount === 0 ? 0 : Math.round((confirmedGuestsCount / totalGuestsCount) * 100),
    occupancyAverage: workspace
      ? Math.round(
          (workspace.tables.reduce((total, table) => total + table.occupied, 0) /
            Math.max(workspace.tables.reduce((total, table) => total + table.capacity, 0), 1)) *
            100,
        )
      : 0,
  };
}

export function buildGuestImportStats(guestImportPreview: GuestImportPreview | null): GuestImportStats | null {
  if (!guestImportPreview) {
    return null;
  }

  const confirmedCount = guestImportPreview.guests.filter((guest) => guest.confirmed).length;
  const pendingCount = guestImportPreview.guests.length - confirmedCount;
  const familyCount = new Set(
    guestImportPreview.guests.map((guest) => guest.group_id).filter((groupId): groupId is string => Boolean(groupId)),
  ).size;

  return {
    total: guestImportPreview.guests.length,
    confirmed: confirmedCount,
    pending: pendingCount,
    families: familyCount,
    previewRows: guestImportPreview.guests.slice(0, 8),
  };
}
