import { ChangeEvent, DragEvent, FormEvent, Fragment, KeyboardEvent as ReactKeyboardEvent, startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  assignGuest,
  createTablesBatch,
  createGuest,
  deleteSession,
  deleteGuest,
  deleteTable,
  downloadWorkspaceReport,
  duplicateTable,
  exportSession,
  fetchSessions,
  fetchWorkspace,
  importGuests,
  importSession,
  loadSession,
  login,
  resetWorkspace,
  saveSession,
  unassignGuest,
  updateGuest,
  updateTableCapacity,
  updateTablePosition,
} from "./api";
import { SeatingPlan } from "./components/SeatingPlan";
import type { Guest, SavedSession, SessionBackup, Workspace } from "./types";

const TOKEN_STORAGE_KEY = "dms.auth.token";
const LISTS_PANEL_WIDTH_STORAGE_KEY = "dms.ui.listsPanelWidth";
const RAIL_PANEL_WIDTH_STORAGE_KEY = "dms.ui.railPanelWidth";
const LISTS_PANEL_OPEN_STORAGE_KEY = "dms.ui.listsPanelOpen";
const CENTER_PANEL_OPEN_STORAGE_KEY = "dms.ui.centerPanelOpen";
const LOGIN_NAMES = ["raquel", "héctor"] as const;
const LISTS_PANEL_MIN_WIDTH = 280;
const LISTS_PANEL_MAX_WIDTH = 760;
const CANVAS_MIN_MAIN_WIDTH = 260;
const RAIL_PANEL_MIN_WIDTH = 360;
const RAIL_PANEL_MAX_WIDTH = 760;
const SHELL_MIN_MAIN_WIDTH = 720;
const GUEST_TABLE_PAGE_SIZE = 20;
type SectionTone = "success" | "error" | "info";
type SectionKey = "guests" | "tables";
type SectionNotice = {
  tone: SectionTone;
  message: string;
};
type SeatTarget = {
  tableId: string;
  seatIndex: number;
};
type TablePosition = {
  position_x: number;
  position_y: number;
};
type GuestEditableField = "name" | "confirmed" | "type" | "intolerance" | "menu" | "group" | "table";
type PanelKey = "salon" | "summary" | "sessions" | "unassigned" | "assigned" | "conflicts" | "guestImport";
type GuestTablePageKey = "unassigned" | "assigned" | "conflicts";
type GuestDraft = {
  name: string;
  guest_type: string;
  confirmed: boolean;
  intolerance: string;
  menu: string;
};
type ImportedGuestDraft = {
  name: string;
  guest_type: string;
  confirmed: boolean;
  intolerance: string;
  menu: string;
  group_id: string | null;
};
type GuestImportPreview = {
  fileName: string;
  guests: ImportedGuestDraft[];
};

const REQUIRED_GUEST_CSV_COLUMNS = ["nombre", "asistencia", "tipo", "familia"] as const;

function createEmptyGuestDraft(): GuestDraft {
  return {
    name: "",
    guest_type: "adulto",
    confirmed: true,
    intolerance: "",
    menu: "desconocido",
  };
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getGuestTableTotalPages(totalItems: number) {
  return Math.max(1, Math.ceil(totalItems / GUEST_TABLE_PAGE_SIZE));
}

function paginateGuestTableRows<T>(items: T[], page: number) {
  const totalItems = items.length;
  const totalPages = getGuestTableTotalPages(totalItems);
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * GUEST_TABLE_PAGE_SIZE;

  return {
    rows: items.slice(startIndex, startIndex + GUEST_TABLE_PAGE_SIZE),
    currentPage,
    totalPages,
    startItem: totalItems === 0 ? 0 : startIndex + 1,
    endItem: Math.min(startIndex + GUEST_TABLE_PAGE_SIZE, totalItems),
    totalItems,
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      if (insideQuotes && line[index + 1] === "\"") {
        currentValue += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(currentValue);
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue);
  return values.map((value) => value.trim());
}

function parseGuestCsvAttendance(rawValue: string, lineNumber: number) {
  const normalizedValue = normalizeSearchText(rawValue);
  if (normalizedValue === "confirmado" || normalizedValue === "si" || normalizedValue === "true") {
    return true;
  }
  if (
    normalizedValue === "no confirmado" ||
    normalizedValue === "pendiente" ||
    normalizedValue === "no" ||
    normalizedValue === "false"
  ) {
    return false;
  }

  throw new Error(`Línea ${lineNumber}: valor de asistencia no válido: "${rawValue || "vacío"}".`);
}

function parseGuestCsvType(rawValue: string, lineNumber: number) {
  const normalizedValue = normalizeSearchText(rawValue);
  if (normalizedValue === "adulto" || normalizedValue === "adolescente" || normalizedValue === "nino") {
    return normalizedValue;
  }

  throw new Error(`Línea ${lineNumber}: tipo de invitado no válido: "${rawValue || "vacío"}".`);
}

function parseGuestCsvMenu(rawValue: string, lineNumber: number) {
  const normalizedValue = normalizeSearchText(rawValue);
  if (!normalizedValue) {
    return "desconocido";
  }

  if (
    normalizedValue === "desconocido" ||
    normalizedValue === "carne" ||
    normalizedValue === "pescado" ||
    normalizedValue === "vegano"
  ) {
    return normalizedValue;
  }

  throw new Error(`Línea ${lineNumber}: valor de menú no válido: "${rawValue}".`);
}

function parseGuestImportCsv(fileName: string, content: string): GuestImportPreview {
  const rows = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim() !== "");

  if (rows.length < 2) {
    throw new Error("El CSV debe incluir cabecera y al menos un invitado.");
  }

  const headerCells = parseCsvLine(rows[0].line).map((value) => normalizeSearchText(value));
  const missingColumns = REQUIRED_GUEST_CSV_COLUMNS.filter((column) => !headerCells.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Faltan columnas obligatorias en el CSV: ${missingColumns.join(", ")}.`);
  }

  const headerIndexes = Object.fromEntries(
    REQUIRED_GUEST_CSV_COLUMNS.map((column) => [column, headerCells.indexOf(column)]),
  ) as Record<(typeof REQUIRED_GUEST_CSV_COLUMNS)[number], number>;
  const intoleranceColumnIndex = headerCells.indexOf("intolerancia");
  const menuColumnIndex = headerCells.indexOf("menu");

  const guests = rows.slice(1).map(({ line, lineNumber }) => {
    const cells = parseCsvLine(line);
    const name = normalizeText(cells[headerIndexes.nombre] ?? "");
    if (!name) {
      throw new Error(`Línea ${lineNumber}: el nombre del invitado es obligatorio.`);
    }

    const groupId = normalizeText(cells[headerIndexes.familia] ?? "") || null;

    return {
      name,
      confirmed: parseGuestCsvAttendance(cells[headerIndexes.asistencia] ?? "", lineNumber),
      guest_type: parseGuestCsvType(cells[headerIndexes.tipo] ?? "", lineNumber),
      intolerance: normalizeText(intoleranceColumnIndex >= 0 ? (cells[intoleranceColumnIndex] ?? "") : ""),
      menu: parseGuestCsvMenu(menuColumnIndex >= 0 ? (cells[menuColumnIndex] ?? "") : "", lineNumber),
      group_id: groupId,
    };
  });

  if (guests.length === 0) {
    throw new Error("El CSV no contiene invitados válidos para importar.");
  }

  return {
    fileName,
    guests,
  };
}

function randomLoginName() {
  return LOGIN_NAMES[Math.floor(Math.random() * LOGIN_NAMES.length)];
}

function formatGuestTypeLabel(guestType: string) {
  switch (guestType) {
    case "adulto":
      return "Adulto";
    case "adolescente":
      return "Adolescente";
    case "nino":
      return "Niño";
    default:
      return guestType;
  }
}

function formatSessionDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatConfirmedLabel(confirmed: boolean) {
  return confirmed ? "Confirmado" : "Pendiente";
}

function formatMenuLabel(menu: string) {
  switch (menu) {
    case "carne":
      return "Carne";
    case "pescado":
      return "Pescado";
    case "vegano":
      return "Vegano";
    case "desconocido":
    default:
      return "Desconocido";
  }
}

function matchesGuestSearch(guest: Guest, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return true;
  }

  const searchableFields = [
    guest.name,
    guest.group_id ?? "",
    guest.guest_type,
    guest.intolerance,
    guest.menu,
    guest.table_id ?? "",
    formatGuestTypeLabel(guest.guest_type),
    formatMenuLabel(guest.menu),
  ];

  return searchableFields.some((field) => normalizeSearchText(field).includes(query));
}

function GuestSignal({ guest }: { guest: Guest }) {
  return guest.confirmed ? null : <span className="guest-signal" title="Invitado no confirmado">?</span>;
}

export function App() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const sessionImportInputRef = useRef<HTMLInputElement | null>(null);
  const guestImportInputRef = useRef<HTMLInputElement | null>(null);
  const [username, setUsername] = useState<string>(() => randomLoginName());
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guestGroupId, setGuestGroupId] = useState("");
  const [guestDrafts, setGuestDrafts] = useState<GuestDraft[]>(() => [createEmptyGuestDraft()]);
  const [guestSearchQuery, setGuestSearchQuery] = useState("");
  const [tableBatchCount, setTableBatchCount] = useState("8");
  const [tableBatchCapacity, setTableBatchCapacity] = useState("8");
  const [sessionName, setSessionName] = useState("");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [isResetSessionPending, setIsResetSessionPending] = useState(false);
  const [guestFormError, setGuestFormError] = useState<string | null>(null);
  const [guestImportPreview, setGuestImportPreview] = useState<GuestImportPreview | null>(null);
  const [guestImportError, setGuestImportError] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editingGuestField, setEditingGuestField] = useState<GuestEditableField>("name");
  const [editingGuestName, setEditingGuestName] = useState("");
  const [editingGuestType, setEditingGuestType] = useState("adulto");
  const [editingGuestConfirmed, setEditingGuestConfirmed] = useState(false);
  const [editingGuestIntolerance, setEditingGuestIntolerance] = useState("");
  const [editingGuestMenu, setEditingGuestMenu] = useState("desconocido");
  const [editingGuestGroupId, setEditingGuestGroupId] = useState("");
  const [editingGuestError, setEditingGuestError] = useState<string | null>(null);
  const [assignmentValues, setAssignmentValues] = useState<Record<string, string>>({});
  const [selectedTableId, setSelectedTableId] = useState<string | null | undefined>(undefined);
  const [pendingTableRemovalId, setPendingTableRemovalId] = useState<string | null>(null);
  const [pendingGuestRemovalId, setPendingGuestRemovalId] = useState<string | null>(null);
  const [draggedGuestId, setDraggedGuestId] = useState<string | null>(null);
  const [activeDropSeat, setActiveDropSeat] = useState<SeatTarget | null>(null);
  const [isUnassignedDropActive, setIsUnassignedDropActive] = useState(false);
  const [isRailOpen, setIsRailOpen] = useState(true);
  const [railPanelWidth, setRailPanelWidth] = useState<number>(() => {
    const storedWidth = Number(localStorage.getItem(RAIL_PANEL_WIDTH_STORAGE_KEY));

    if (Number.isFinite(storedWidth) && storedWidth >= RAIL_PANEL_MIN_WIDTH && storedWidth <= RAIL_PANEL_MAX_WIDTH) {
      return storedWidth;
    }

    return 420;
  });
  const [isResizingRailPanel, setIsResizingRailPanel] = useState(false);
  const [optimisticTablePositions, setOptimisticTablePositions] = useState<Record<string, TablePosition>>({});
  const [listsPanelWidth, setListsPanelWidth] = useState<number>(() => {
    const storedWidth = Number(localStorage.getItem(LISTS_PANEL_WIDTH_STORAGE_KEY));

    if (Number.isFinite(storedWidth) && storedWidth >= LISTS_PANEL_MIN_WIDTH && storedWidth <= LISTS_PANEL_MAX_WIDTH) {
      return storedWidth;
    }

    return 320;
  });
  const [isListsPanelOpen, setIsListsPanelOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(LISTS_PANEL_OPEN_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });
  const [isCenterPanelOpen, setIsCenterPanelOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(CENTER_PANEL_OPEN_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });
  const [isResizingListsPanel, setIsResizingListsPanel] = useState(false);
  const [sectionNotices, setSectionNotices] = useState<Record<SectionKey, SectionNotice | null>>({
    guests: null,
    tables: null,
  });
  const [visibleToasts, setVisibleToasts] = useState<Record<SectionKey, boolean>>({
    guests: false,
    tables: false,
  });
  const [guestTablePages, setGuestTablePages] = useState<Record<GuestTablePageKey, number>>({
    unassigned: 1,
    assigned: 1,
    conflicts: 1,
  });
  const [collapsedPanels, setCollapsedPanels] = useState<Record<PanelKey, boolean>>({
    salon: false,
    summary: false,
    sessions: false,
    unassigned: false,
    assigned: false,
    conflicts: false,
    guestImport: false,
  });
  const [activeCardDropTableId, setActiveCardDropTableId] = useState<string | null>(null);
  const [hoveredCardGuest, setHoveredCardGuest] = useState<{
    tableId: string;
    name: string;
    guestType: string;
    family: string;
    confirmedLabel: string;
    x: number;
    y: number;
  } | null>(null);
  const deferredGuestSearchQuery = useDeferredValue(guestSearchQuery);

  const groupedConflictCount = useMemo(
    () => Object.keys(workspace?.validation.grouping_conflicts ?? {}).length,
    [workspace],
  );
  const conflictGuestIds = useMemo(
    () => new Set(Object.values(workspace?.validation.grouping_conflicts ?? {}).flatMap((guestIds) => guestIds)),
    [workspace],
  );
  const selectedTable = useMemo(
    () => workspace?.tables.find((table) => table.id === selectedTableId) ?? null,
    [selectedTableId, workspace],
  );
  const draggedGuest = useMemo(
    () =>
      workspace?.guests.unassigned.find((guest) => guest.id === draggedGuestId) ??
      workspace?.guests.assigned.find((guest) => guest.id === draggedGuestId) ??
      null,
    [draggedGuestId, workspace],
  );
  const fullTablesCount = useMemo(
    () => workspace?.tables.filter((table) => table.available === 0).length ?? 0,
    [workspace],
  );
  const pendingGuestsCount = useMemo(
    () => workspace?.guests.unassigned.length ?? 0,
    [workspace],
  );
  const conflictTableIds = useMemo(
    () =>
      new Set(
        workspace?.tables
          .filter((table) => table.guests.some((guest) => conflictGuestIds.has(guest.id)))
          .map((table) => table.id) ?? [],
      ),
    [conflictGuestIds, workspace],
  );
  const allGuests = useMemo(
    () => [...(workspace?.guests.unassigned ?? []), ...(workspace?.guests.assigned ?? [])],
    [workspace],
  );
  const confirmedGuestsCount = useMemo(
    () => allGuests.filter((guest) => guest.confirmed).length,
    [allGuests],
  );
  const unconfirmedGuestsCount = useMemo(
    () => allGuests.length - confirmedGuestsCount,
    [allGuests, confirmedGuestsCount],
  );
  const adultGuestsCount = useMemo(
    () => allGuests.filter((guest) => guest.guest_type === "adulto").length,
    [allGuests],
  );
  const teenGuestsCount = useMemo(
    () => allGuests.filter((guest) => guest.guest_type === "adolescente").length,
    [allGuests],
  );
  const childGuestsCount = useMemo(
    () => allGuests.filter((guest) => guest.guest_type === "nino").length,
    [allGuests],
  );
  const fishMenuGuestsCount = useMemo(
    () => allGuests.filter((guest) => guest.menu === "pescado").length,
    [allGuests],
  );
  const meatMenuGuestsCount = useMemo(
    () => allGuests.filter((guest) => guest.menu === "carne").length,
    [allGuests],
  );
  const vegetarianMenuGuestsCount = useMemo(
    () => allGuests.filter((guest) => guest.menu === "vegano").length,
    [allGuests],
  );
  const unknownMenuGuestsCount = useMemo(
    () => allGuests.filter((guest) => guest.menu === "desconocido").length,
    [allGuests],
  );
  const tableNumberById = useMemo(
    () => new Map((workspace?.tables ?? []).map((table) => [table.id, table.number])),
    [workspace],
  );
  const guestById = useMemo(
    () =>
      new Map(
        [...(workspace?.guests.unassigned ?? []), ...(workspace?.guests.assigned ?? [])].map((guest) => [guest.id, guest]),
      ),
    [workspace],
  );
  const workspaceForPlan = useMemo(() => {
    if (!workspace) {
      return null;
    }

    return {
      ...workspace,
      tables: workspace.tables.map((table) => {
        const optimisticPosition = optimisticTablePositions[table.id];
        return optimisticPosition ? { ...table, ...optimisticPosition } : table;
      }),
    };
  }, [optimisticTablePositions, workspace]);
  const filteredUnassignedGuests = useMemo(
    () =>
      (workspace?.guests.unassigned ?? []).filter((guest) => matchesGuestSearch(guest, deferredGuestSearchQuery)),
    [deferredGuestSearchQuery, workspace],
  );
  const filteredAssignedGuests = useMemo(
    () => (workspace?.guests.assigned ?? []).filter((guest) => matchesGuestSearch(guest, deferredGuestSearchQuery)),
    [deferredGuestSearchQuery, workspace],
  );
  const conflictReviewRows = useMemo(
    () =>
      Object.entries(workspace?.validation.grouping_conflicts ?? {})
        .flatMap(([groupId, guestIds]) =>
          guestIds.map((guestId) => {
            const guest = guestById.get(guestId);
            const tableNumber = guest?.table_id ? tableNumberById.get(guest.table_id) : null;

            return {
              rowId: `${groupId}-${guestId}`,
              guestId,
              groupId,
              guest: guest ?? null,
              guestName: guest?.name ?? guestId,
              tableLabel: tableNumber ? `Mesa ${tableNumber}` : "Sin mesa",
            };
          }),
        )
        .sort((left, right) => {
          const groupComparison = left.groupId.localeCompare(right.groupId, "es");
          if (groupComparison !== 0) {
            return groupComparison;
          }

          return left.guestName.localeCompare(right.guestName, "es");
        }),
    [guestById, tableNumberById, workspace],
  );
  const guestImportStats = useMemo(() => {
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
  }, [guestImportPreview]);
  const paginatedUnassignedGuests = useMemo(
    () => paginateGuestTableRows(filteredUnassignedGuests, guestTablePages.unassigned),
    [filteredUnassignedGuests, guestTablePages.unassigned],
  );
  const paginatedAssignedGuests = useMemo(
    () => paginateGuestTableRows(filteredAssignedGuests, guestTablePages.assigned),
    [filteredAssignedGuests, guestTablePages.assigned],
  );
  const paginatedConflictRows = useMemo(
    () => paginateGuestTableRows(conflictReviewRows, guestTablePages.conflicts),
    [conflictReviewRows, guestTablePages.conflicts],
  );
  const guestSectionBusy =
    loadingWorkspace ||
    submittingAction === "create-guest" ||
    submittingAction === "import-guests-file" ||
    (submittingAction !== null &&
      (submittingAction.startsWith("update-") ||
        submittingAction.startsWith("delete-") ||
        submittingAction.startsWith("assign-")));
  const tablesSectionBusy =
    loadingWorkspace ||
    (submittingAction !== null &&
      (submittingAction.startsWith("capacity-") ||
        submittingAction.startsWith("position-") ||
        submittingAction.startsWith("remove-table-") ||
        submittingAction.startsWith("unassign-") ||
        submittingAction.startsWith("assign-dnd-")));

  useEffect(() => {
    localStorage.setItem(RAIL_PANEL_WIDTH_STORAGE_KEY, String(railPanelWidth));
  }, [railPanelWidth]);

  useEffect(() => {
    localStorage.setItem(LISTS_PANEL_OPEN_STORAGE_KEY, String(isListsPanelOpen));
  }, [isListsPanelOpen]);

  useEffect(() => {
    localStorage.setItem(CENTER_PANEL_OPEN_STORAGE_KEY, String(isCenterPanelOpen));
  }, [isCenterPanelOpen]);

  useEffect(() => {
    localStorage.setItem(LISTS_PANEL_WIDTH_STORAGE_KEY, String(listsPanelWidth));
  }, [listsPanelWidth]);

  useEffect(() => {
    setGuestTablePages((current) => ({
      unassigned: Math.min(current.unassigned, getGuestTableTotalPages(filteredUnassignedGuests.length)),
      assigned: Math.min(current.assigned, getGuestTableTotalPages(filteredAssignedGuests.length)),
      conflicts: Math.min(current.conflicts, getGuestTableTotalPages(conflictReviewRows.length)),
    }));
  }, [filteredAssignedGuests.length, filteredUnassignedGuests.length, conflictReviewRows.length]);

  useEffect(() => {
    setGuestTablePages((current) => ({
      ...current,
      unassigned: 1,
      assigned: 1,
      conflicts: 1,
    }));
  }, [deferredGuestSearchQuery]);

  useEffect(() => {
    const timers: number[] = [];

    (Object.keys(sectionNotices) as SectionKey[]).forEach((section) => {
      if (!sectionNotices[section]) {
        setVisibleToasts((current) => ({ ...current, [section]: false }));
        return;
      }

      setVisibleToasts((current) => ({ ...current, [section]: true }));

      timers.push(
        window.setTimeout(() => {
          setVisibleToasts((current) => ({ ...current, [section]: false }));
        }, 4500),
      );
      timers.push(
        window.setTimeout(() => {
          clearSectionNotice(section);
        }, 5000),
      );
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [sectionNotices]);

  useEffect(() => {
    if (!isResizingRailPanel || !isRailOpen) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const shellRect = shellRef.current?.getBoundingClientRect();
      if (!shellRect) {
        return;
      }

      const maxWidth = Math.min(RAIL_PANEL_MAX_WIDTH, Math.max(RAIL_PANEL_MIN_WIDTH, shellRect.width - SHELL_MIN_MAIN_WIDTH));
      const nextWidth = event.clientX - shellRect.left;
      const clampedWidth = Math.min(Math.max(nextWidth, RAIL_PANEL_MIN_WIDTH), maxWidth);
      setRailPanelWidth(clampedWidth);
    };

    const stopResizing = () => setIsResizingRailPanel(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [isRailOpen, isResizingRailPanel]);

  useEffect(() => {
    if (!isResizingListsPanel || !isListsPanelOpen) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) {
        return;
      }

      const maxWidth = Math.min(LISTS_PANEL_MAX_WIDTH, Math.max(LISTS_PANEL_MIN_WIDTH, canvasRect.width - CANVAS_MIN_MAIN_WIDTH));
      const nextWidth = canvasRect.right - event.clientX;
      const clampedWidth = Math.min(Math.max(nextWidth, LISTS_PANEL_MIN_WIDTH), maxWidth);
      setListsPanelWidth(clampedWidth);
    };

    const stopResizing = () => setIsResizingListsPanel(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [isListsPanelOpen, isResizingListsPanel]);

  useEffect(() => {
    if (!token) {
      setWorkspace(null);
      setSavedSessions([]);
      setGuestImportPreview(null);
      setGuestImportError(null);
      setSectionNotices({ guests: null, tables: null });
      setUsername(randomLoginName());
      setPassword("");
      return;
    }

    const activeToken = token;
    let cancelled = false;
    setLoadingWorkspace(true);

    async function loadWorkspace() {
      try {
        const [nextWorkspace, nextSessions] = await Promise.all([
          fetchWorkspace(activeToken),
          fetchSessions(activeToken),
        ]);
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setWorkspace(nextWorkspace);
          setSavedSessions(nextSessions);
        });
        setSelectedTableId((currentSelected) =>
          currentSelected === undefined ? nextWorkspace.tables[0]?.id ?? null : currentSelected,
        );
        setErrorMessage(null);
        setSectionNotices({ guests: null, tables: null });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el workspace.");
        }
      } finally {
        if (!cancelled) {
          setLoadingWorkspace(false);
        }
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!workspace) {
      setSelectedTableId(undefined);
      setActiveDropSeat(null);
      setDraggedGuestId(null);
      setIsUnassignedDropActive(false);
      setOptimisticTablePositions({});
      setPendingGuestRemovalId(null);
      return;
    }

    setTableBatchCapacity(String(workspace.default_table_capacity));

    const selectedStillExists =
      selectedTableId === null || selectedTableId === undefined
        ? true
        : workspace.tables.some((table) => table.id === selectedTableId);
    if (!selectedStillExists) {
      setSelectedTableId(workspace.tables[0]?.id ?? null);
    }
    if (pendingTableRemovalId && !workspace.tables.some((table) => table.id === pendingTableRemovalId)) {
      setPendingTableRemovalId(null);
    }
    if (
      pendingGuestRemovalId &&
      !workspace.guests.unassigned.some((guest) => guest.id === pendingGuestRemovalId) &&
      !workspace.guests.assigned.some((guest) => guest.id === pendingGuestRemovalId)
    ) {
      setPendingGuestRemovalId(null);
    }
  }, [pendingGuestRemovalId, pendingTableRemovalId, selectedTableId, workspace]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAuth(true);

    try {
      const response = await login(username, password);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
      setToken(response.access_token);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
    } finally {
      setLoadingAuth(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setErrorMessage(null);
    setGuestFormError(null);
    setGuestImportPreview(null);
    setGuestImportError(null);
    setEditingGuestError(null);
    setSectionNotices({ guests: null, tables: null });
    setPendingTableRemovalId(null);
  }

  function clampListsPanelWidth(nextWidth: number) {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const maxWidth = canvasRect
      ? Math.min(LISTS_PANEL_MAX_WIDTH, Math.max(LISTS_PANEL_MIN_WIDTH, canvasRect.width - CANVAS_MIN_MAIN_WIDTH))
      : LISTS_PANEL_MAX_WIDTH;

    return Math.min(Math.max(nextWidth, LISTS_PANEL_MIN_WIDTH), maxWidth);
  }

  function clampRailPanelWidth(nextWidth: number) {
    const shellRect = shellRef.current?.getBoundingClientRect();
    const maxWidth = shellRect
      ? Math.min(RAIL_PANEL_MAX_WIDTH, Math.max(RAIL_PANEL_MIN_WIDTH, shellRect.width - SHELL_MIN_MAIN_WIDTH))
      : RAIL_PANEL_MAX_WIDTH;

    return Math.min(Math.max(nextWidth, RAIL_PANEL_MIN_WIDTH), maxWidth);
  }

  function startRailPanelResize() {
    if (!isRailOpen) {
      return;
    }

    setIsResizingRailPanel(true);
  }

  function handleRailPanelResizeKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();

    if (event.key === "Home") {
      setRailPanelWidth(clampRailPanelWidth(RAIL_PANEL_MIN_WIDTH));
      return;
    }

    if (event.key === "End") {
      setRailPanelWidth(clampRailPanelWidth(RAIL_PANEL_MAX_WIDTH));
      return;
    }

    const step = event.shiftKey ? 24 : 12;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    setRailPanelWidth((current) => clampRailPanelWidth(current + direction * step));
  }

  function startListsPanelResize() {
    if (!isListsPanelOpen) {
      return;
    }
    setIsResizingListsPanel(true);
  }

  function handleListsPanelResizeKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();

    if (event.key === "Home") {
      setListsPanelWidth(clampListsPanelWidth(LISTS_PANEL_MIN_WIDTH));
      return;
    }

    if (event.key === "End") {
      setListsPanelWidth(clampListsPanelWidth(LISTS_PANEL_MAX_WIDTH));
      return;
    }

    const step = event.shiftKey ? 24 : 12;
    const direction = event.key === "ArrowLeft" ? 1 : -1;
    setListsPanelWidth((current) => clampListsPanelWidth(current + direction * step));
  }

  function beginGuestEdit(guest: Guest, field: GuestEditableField = "name") {
    setEditingGuestId(guest.id);
    setEditingGuestField(field);
    setEditingGuestName(guest.name);
    setEditingGuestType(guest.guest_type);
    setEditingGuestConfirmed(guest.confirmed);
    setEditingGuestIntolerance(guest.intolerance);
    setEditingGuestMenu(guest.menu);
    setEditingGuestGroupId(guest.group_id ?? "");
  }

  function cancelGuestEdit() {
    setEditingGuestId(null);
    setEditingGuestName("");
    setEditingGuestType("adulto");
    setEditingGuestConfirmed(false);
    setEditingGuestIntolerance("");
    setEditingGuestMenu("desconocido");
    setEditingGuestGroupId("");
    setEditingGuestError(null);
  }

  function setSectionNotice(section: SectionKey, tone: SectionTone, message: string) {
    setSectionNotices((current) => ({ ...current, [section]: { tone, message } }));
  }

  function clearSectionNotice(section: SectionKey) {
    setSectionNotices((current) => ({ ...current, [section]: null }));
  }

  async function commitGuestEdit() {
    if (!token || !editingGuestId || isActionRunning(`update-${editingGuestId}`)) {
      return;
    }

    const currentGuest =
      workspace?.guests.unassigned.find((guest) => guest.id === editingGuestId) ??
      workspace?.guests.assigned.find((guest) => guest.id === editingGuestId);

    if (!currentGuest) {
      cancelGuestEdit();
      return;
    }

    const normalizedGuestName = normalizeText(editingGuestName);
    if (!normalizedGuestName) {
      setEditingGuestError("El invitado necesita un nombre para guardar cambios.");
      return;
    }

    const normalizedGroupId = normalizeText(editingGuestGroupId) || null;
    const normalizedIntolerance = normalizeText(editingGuestIntolerance);
    const hasChanges =
      normalizedGuestName !== currentGuest.name ||
      editingGuestType !== currentGuest.guest_type ||
      editingGuestConfirmed !== currentGuest.confirmed ||
      normalizedIntolerance !== currentGuest.intolerance ||
      editingGuestMenu !== currentGuest.menu ||
      normalizedGroupId !== currentGuest.group_id;

    if (!hasChanges) {
      cancelGuestEdit();
      return;
    }

    setEditingGuestError(null);

    const updated = await runWorkspaceAction(
      `update-${editingGuestId}`,
      "guests",
      () =>
        updateGuest(editingGuestId, token, {
          name: normalizedGuestName,
          guest_type: editingGuestType,
          confirmed: editingGuestConfirmed,
          intolerance: normalizedIntolerance,
          menu: editingGuestMenu,
          group_id: normalizedGroupId,
        }),
      "Invitado actualizado.",
    );

    if (updated) {
      cancelGuestEdit();
    }
  }

  function handleGuestEditBlur() {
    if (editingGuestField === "table") {
      cancelGuestEdit();
      return;
    }
    void commitGuestEdit();
  }

  function handleGuestEditKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitGuestEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelGuestEdit();
    }
  }

  async function handleTableMove(tableId: string, positionX: number, positionY: number) {
    if (!token) {
      return;
    }
    const nextPosition = { position_x: positionX, position_y: positionY };

    setSubmittingAction(`position-${tableId}`);
    setErrorMessage(null);
    clearSectionNotice("tables");
    setOptimisticTablePositions((current) => ({ ...current, [tableId]: nextPosition }));

    try {
      await updateTablePosition(tableId, positionX, positionY, token);
      await refreshWorkspaceState(token);
    } catch (error) {
      setOptimisticTablePositions((current) => {
        const nextPositions = { ...current };
        delete nextPositions[tableId];
        return nextPositions;
      });
      setSectionNotice(
        "tables",
        "error",
        error instanceof Error ? error.message : "No se pudo completar la accion.",
      );
    } finally {
      setOptimisticTablePositions((current) => {
        const nextPositions = { ...current };
        delete nextPositions[tableId];
        return nextPositions;
      });
      setSubmittingAction(null);
    }
  }

  async function refreshWorkspaceState(activeToken: string) {
    const [nextWorkspace, nextSessions] = await Promise.all([
      fetchWorkspace(activeToken),
      fetchSessions(activeToken),
    ]);
    startTransition(() => {
      setWorkspace(nextWorkspace);
      setSavedSessions(nextSessions);
    });
    setSelectedTableId((currentSelected) =>
      currentSelected === undefined ? nextWorkspace.tables[0]?.id ?? null : currentSelected,
    );
  }

  async function runWorkspaceAction(
    actionKey: string,
    section: SectionKey,
    action: () => Promise<void>,
    message: string,
  ) {
    if (!token) {
      return false;
    }

    setSubmittingAction(actionKey);
    setErrorMessage(null);
    clearSectionNotice(section);

    try {
      await action();
      await refreshWorkspaceState(token);
      setSectionNotice(section, "success", message);
      return true;
    } catch (error) {
      setSectionNotice(
        section,
        "error",
        error instanceof Error ? error.message : "No se pudo completar la accion.",
      );
      return false;
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleGuestCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    const guestsToCreate = guestDrafts
      .map((draft) => ({
        name: normalizeText(draft.name),
        guest_type: draft.guest_type,
        confirmed: draft.confirmed,
        intolerance: normalizeText(draft.intolerance),
        menu: draft.menu,
      }))
      .filter((draft) => draft.name);

    if (guestsToCreate.length === 0) {
      setGuestFormError("Introduce al menos un nombre antes de guardar.");
      return;
    }
    setGuestFormError(null);

    const created = await runWorkspaceAction(
      "create-guest",
      "guests",
      async () => {
        for (const guest of guestsToCreate) {
          await createGuest(token, {
            name: guest.name,
            guest_type: guest.guest_type,
            confirmed: guest.confirmed,
            intolerance: guest.intolerance,
            menu: guest.menu,
            group_id: normalizeText(guestGroupId) || null,
          });
        }
      },
      guestsToCreate.length === 1 ? "Invitado añadido al workspace." : "Familia añadida al workspace.",
    );
    if (created) {
      setGuestGroupId("");
      setGuestDrafts([createEmptyGuestDraft()]);
    }
  }

  function clearGuestImportSelection() {
    setGuestImportPreview(null);
    setGuestImportError(null);
    if (guestImportInputRef.current) {
      guestImportInputRef.current.value = "";
    }
  }

  async function handleGuestImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsedImport = parseGuestImportCsv(file.name, await file.text());
      setGuestImportPreview(parsedImport);
      setGuestImportError(null);
    } catch (error) {
      setGuestImportPreview(null);
      setGuestImportError(error instanceof Error ? error.message : "No se pudo leer el fichero CSV.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleGuestImportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    if (!guestImportPreview) {
      setGuestImportError("Selecciona un fichero CSV válido antes de importar.");
      return;
    }

    setGuestImportError(null);

    const imported = await runWorkspaceAction(
      "import-guests-file",
      "guests",
      () => importGuests(token, guestImportPreview.guests),
      guestImportPreview.guests.length === 1
        ? "1 invitado importado desde el CSV."
        : `${guestImportPreview.guests.length} invitados importados desde el CSV.`,
    );

    if (imported) {
      clearGuestImportSelection();
    }
  }

  async function handleTableBatchCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    const count = Number(tableBatchCount);
    const capacity = Number(tableBatchCapacity);
    if (!Number.isInteger(count) || count <= 0) {
      setSectionNotice("tables", "error", "Indica cuántas mesas quieres añadir.");
      return;
    }
    if (!Number.isInteger(capacity) || capacity <= 0) {
      setSectionNotice("tables", "error", "Indica cuántos asientos tendrá cada mesa.");
      return;
    }

    const created = await runWorkspaceAction(
      `create-table-batch-${count}-${capacity}`,
      "tables",
      () => createTablesBatch(token, { count, capacity }),
      count === 1 ? "Se ha añadido una mesa nueva al salón." : `Se han añadido ${count} mesas al salón.`,
    );

    if (created) {
      setSelectedTableId(null);
    }
  }

  async function handleSaveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    const normalizedSessionName = normalizeText(sessionName);
    if (!normalizedSessionName) {
      setSectionNotice("tables", "error", "Pon un nombre a la sesión antes de guardarla.");
      return;
    }

    const saved = await runWorkspaceAction(
      `save-session-${normalizedSessionName}`,
      "tables",
      async () => {
        await saveSession(normalizedSessionName, token);
      },
      `Sesión "${normalizedSessionName}" guardada.`,
    );

    if (saved) {
      setSessionName("");
    }
  }

  async function handleDownloadReport() {
    if (!token) {
      return;
    }

    setSubmittingAction("download-report");
    clearSectionNotice("tables");

    try {
      const blob = await downloadWorkspaceReport(token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "donde-me-siento-informe.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSectionNotice("tables", "success", "Informe PDF preparado para imprimir.");
    } catch (error) {
      setSectionNotice("tables", "error", error instanceof Error ? error.message : "No se pudo generar el PDF.");
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleSessionExport(session: SavedSession) {
    if (!token) {
      return;
    }

    setSubmittingAction(`export-session-${session.id}`);
    clearSectionNotice("tables");

    try {
      const backup = await exportSession(session.id, token);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName =
        session.name.replace(/[^\p{L}\p{N}\-_]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "sesion";
      link.href = url;
      link.download = `${safeName}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSectionNotice("tables", "success", `Sesión "${session.name}" descargada.`);
    } catch (error) {
      setSectionNotice("tables", "error", error instanceof Error ? error.message : "No se pudo completar la accion.");
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleSessionFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) {
      return;
    }

    setSubmittingAction("import-session-file");
    clearSectionNotice("tables");

    try {
      const backup = JSON.parse(await file.text()) as SessionBackup;
      await importSession(backup, token);
      await refreshWorkspaceState(token);
      setSectionNotice("tables", "success", `Sesión "${backup.session.name}" cargada desde fichero.`);
    } catch (error) {
      setSectionNotice("tables", "error", error instanceof Error ? error.message : "No se pudo importar la sesión.");
    } finally {
      event.target.value = "";
      setSubmittingAction(null);
    }
  }

  function isActionRunning(actionKey: string) {
    return submittingAction === actionKey;
  }

  function togglePanel(panel: PanelKey) {
    setCollapsedPanels((current) => ({ ...current, [panel]: !current[panel] }));
  }

  function setGuestTablePage(panel: GuestTablePageKey, page: number) {
    setGuestTablePages((current) => ({ ...current, [panel]: page }));
  }

  function updateGuestDraft(index: number, nextDraft: GuestDraft) {
    setGuestDrafts((current) => {
      const nextDrafts = current.map((draft, currentIndex) => (currentIndex === index ? nextDraft : draft));
      const hasTrailingEmptyDraft = nextDrafts[nextDrafts.length - 1]?.name.trim() === "";

      if (!hasTrailingEmptyDraft) {
        nextDrafts.push(createEmptyGuestDraft());
      }

      while (
        nextDrafts.length > 1 &&
        nextDrafts[nextDrafts.length - 1].name.trim() === "" &&
        nextDrafts[nextDrafts.length - 2].name.trim() === ""
      ) {
        nextDrafts.pop();
      }

      return nextDrafts;
    });
  }

  function handleGuestDragStart(event: DragEvent<Element>, guestId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", guestId);
    setDraggedGuestId(guestId);
    clearSectionNotice("tables");
  }

  function handleGuestDragEnd() {
    setDraggedGuestId(null);
    setActiveDropSeat(null);
    setIsUnassignedDropActive(false);
    setActiveCardDropTableId(null);
  }

  function updateHoveredCardGuest(event: React.MouseEvent<HTMLElement>, tableId: string, guest: Guest) {
    const cardElement = event.currentTarget.closest(".table-card");
    if (!(cardElement instanceof HTMLElement)) {
      return;
    }

    const rect = cardElement.getBoundingClientRect();
    setHoveredCardGuest({
      tableId,
      name: guest.name,
      guestType: formatGuestTypeLabel(guest.guest_type),
      family: guest.group_id ?? "Sin familia",
      confirmedLabel: guest.confirmed ? "Confirmado" : "No confirmado",
      x: event.clientX - rect.left + 16,
      y: event.clientY - rect.top + 16,
    });
  }

  function handleSeatDragEnter(tableId: string, seatIndex: number) {
    if (!draggedGuestId) {
      return;
    }
    setActiveDropSeat({ tableId, seatIndex });
    setSelectedTableId(tableId);
  }

  function selectTable(tableId: string) {
    setPendingTableRemovalId(null);
    setSelectedTableId((currentSelected) => (currentSelected === tableId ? null : tableId));
  }

  function handleSeatDragLeave(tableId: string, seatIndex: number) {
    if (activeDropSeat?.tableId === tableId && activeDropSeat.seatIndex === seatIndex) {
      setActiveDropSeat(null);
    }
  }

  function handleSeatDrop(tableId: string, seatIndex: number, droppedGuestIdFromEvent: string | null) {
    const droppedGuestId = droppedGuestIdFromEvent ?? draggedGuestId;
    if (!workspace || !droppedGuestId) {
      return;
    }

    const guest =
      workspace.guests.unassigned.find((currentGuest) => currentGuest.id === droppedGuestId) ??
      workspace.guests.assigned.find((currentGuest) => currentGuest.id === droppedGuestId);
    setDraggedGuestId(null);
    setActiveDropSeat(null);

    if (!guest) {
      return;
    }

    void runWorkspaceAction(
      `assign-dnd-${droppedGuestId}`,
      "tables",
      () => assignGuest(droppedGuestId, tableId, seatIndex, token ?? ""),
      `${guest.name} colocado mediante arrastrar y soltar.`,
    );
  }

  function handleTableCardDragOver(event: DragEvent<HTMLElement>, tableId: string) {
    if (!draggedGuestId) {
      return;
    }

    event.preventDefault();
    setActiveDropSeat(null);
    setSelectedTableId(tableId);
    if (activeCardDropTableId !== tableId) {
      setActiveCardDropTableId(tableId);
    }
  }

  function handleTableCardDragLeave(event: DragEvent<HTMLElement>, tableId: string) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setActiveCardDropTableId((current) => (current === tableId ? null : current));
  }

  function handleTableCardDrop(event: DragEvent<HTMLElement>, tableId: string) {
    event.preventDefault();
    const droppedGuestId = event.dataTransfer.getData("text/plain") || draggedGuestId;
    if (!workspace || !droppedGuestId) {
      return;
    }

    const guest =
      workspace.guests.unassigned.find((currentGuest) => currentGuest.id === droppedGuestId) ??
      workspace.guests.assigned.find((currentGuest) => currentGuest.id === droppedGuestId);

    setDraggedGuestId(null);
    setActiveCardDropTableId(null);
    setActiveDropSeat(null);

    if (!guest || guest.table_id === tableId) {
      return;
    }

    void runWorkspaceAction(
      `assign-dnd-card-${droppedGuestId}`,
      "tables",
      () => assignGuest(droppedGuestId, tableId, null, token ?? ""),
      `${guest.name} movido a otra mesa.`,
    );
  }

  function handleUnassignedDragOver(event: DragEvent<HTMLElement>) {
    if (!draggedGuestId) {
      return;
    }

    event.preventDefault();
    if (!isUnassignedDropActive) {
      setIsUnassignedDropActive(true);
    }
    setActiveDropSeat(null);
  }

  function handleUnassignedDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsUnassignedDropActive(false);
  }

  function handleUnassignedDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const droppedGuestId = event.dataTransfer.getData("text/plain") || draggedGuestId;
    if (!workspace || !droppedGuestId) {
      return;
    }

    const guest = workspace.guests.assigned.find((currentGuest) => currentGuest.id === droppedGuestId);
    setDraggedGuestId(null);
    setActiveDropSeat(null);
    setIsUnassignedDropActive(false);

    if (!guest) {
      return;
    }

    void runWorkspaceAction(
      `unassign-dnd-${droppedGuestId}`,
      "guests",
      () => unassignGuest(droppedGuestId, token ?? ""),
      `${guest.name} vuelve a estar pendiente de ubicación.`,
    );
  }

  function handleGuestAssignmentSelection(guest: Guest, nextTableId: string) {
    setAssignmentValues((current) => ({ ...current, [guest.id]: nextTableId }));

    if (!nextTableId) {
      if (guest.table_id === null) {
        return;
      }

      void runWorkspaceAction(
        `unassign-select-${guest.id}`,
        "guests",
        () => unassignGuest(guest.id, token ?? ""),
        `${guest.name} vuelve a estar pendiente de ubicación.`,
      );
      return;
    }

    void runWorkspaceAction(
      `assign-${guest.id}`,
      "guests",
      () => assignGuest(guest.id, nextTableId, null, token ?? ""),
        `${guest.name} asignado correctamente.`,
    );
  }

  function handleAssignedGuestTableSelection(guest: Guest, nextTableId: string) {
    setAssignmentValues((current) => ({ ...current, [guest.id]: nextTableId }));
    handleGuestAssignmentSelection(guest, nextTableId);
    cancelGuestEdit();
  }

  if (!token) {
    return (
      <main className="login-screen">
        <div className="login-screen__glow login-screen__glow--one" />
        <div className="login-screen__glow login-screen__glow--two" />
        <section className="login-screen__panel">
          <p className="eyebrow">Solo para los novios</p>
          <h1 className="login-screen__title">dónde me siento</h1>
          <p className="login-screen__copy">
            Diseña el espacio donde tus seres queridos
            <br />
            compartirán nuestra gran historia.
          </p>
          <form className="auth-card auth-card--standalone" onSubmit={handleLogin}>
            <label className="field field--readonly">
              <span>
                Tu vida
              </span>
              <input aria-readonly="true" readOnly value={username} />
            </label>
            <label className="field">
              <span>Tu llave</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {errorMessage ? <div className="inline-notice inline-notice--error">{errorMessage}</div> : null}
            <button className="button button--primary" disabled={loadingAuth} type="submit">
              {loadingAuth ? "Entrando..." : "Repartir amor en las mesas"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`shell ${isRailOpen ? "" : "shell--rail-collapsed"} ${isResizingRailPanel ? "shell--resizing" : ""}`}
      style={isRailOpen ? { gridTemplateColumns: `minmax(${RAIL_PANEL_MIN_WIDTH}px, ${railPanelWidth}px) 0.85rem minmax(0, 1fr)` } : undefined}
    >
      <div className="shell__backdrop shell__backdrop--one" />
      <div className="shell__backdrop shell__backdrop--two" />
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__title">dónde me siento</span>
        </div>
        <div className="topbar__center">
          <span className="topbar__couple">Héctor & Raquel</span>
        </div>
        <div className="topbar__session">
          <button
            aria-label="Descargar informe en PDF"
            className="button button--ghost button--small button--icon topbar__icon-button"
            disabled={isActionRunning("download-report")}
            onClick={() => void handleDownloadReport()}
            type="button"
          >
            <svg aria-hidden="true" className="button__icon" viewBox="0 0 24 24">
              <path d="M7.75 8.25V5.9a1.65 1.65 0 0 1 1.65-1.65h5.2a1.65 1.65 0 0 1 1.65 1.65v2.35" />
              <path d="M6.25 9.25h11.5A1.75 1.75 0 0 1 19.5 11v4a1.75 1.75 0 0 1-1.75 1.75H6.25A1.75 1.75 0 0 1 4.5 15v-4a1.75 1.75 0 0 1 1.75-1.75Z" />
              <path d="M8.5 14.75h7" />
              <path d="M8.25 16.75v2h7.5v-2" />
            </svg>
          </button>
          <button className="button button--link button--small" onClick={handleLogout} type="button">
            Salir
          </button>
        </div>
      </header>
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {(Object.entries(sectionNotices) as [SectionKey, SectionNotice | null][]).map(([section, notice]) =>
          notice ? (
            <div
              className={`toast toast--${notice.tone} ${visibleToasts[section] ? "toast--visible" : ""}`}
              key={section}
              role="status"
            >
              {notice.message}
            </div>
          ) : null,
        )}
      </div>
      <aside className={`rail ${isRailOpen ? "" : "rail--collapsed"}`}>
        <div className="rail__inner">
          <div className="rail__masthead">
            <button
              aria-expanded={isRailOpen}
              className="rail__toggle"
              onClick={() => setIsRailOpen((current) => !current)}
              type="button"
            >
              <span aria-hidden="true" className="rail__toggle-triangle">
                {isRailOpen ? "◀" : "▶"}
              </span>
            </button>
          </div>

          <div className="rail-panels">
            <section className="list-card rail-card">
              <div className="rail-section">
              <div className="rail-section__header">
                <button className="panel-toggle" onClick={() => togglePanel("salon")} type="button">
                  <div>
                    <p className="eyebrow eyebrow--compact">Preparación</p>
                    <h2>Crea tu salón</h2>
                  </div>
                  <span aria-hidden="true" className={`panel-toggle__chevron ${collapsedPanels.salon ? "panel-toggle__chevron--collapsed" : ""}`}>▾</span>
                </button>
              </div>
              {!collapsedPanels.salon ? (selectedTable ? (
                <div className="rail-table-settings rail-table-settings--selected">
                  <div className="rail-table-settings__meta">
                    <span>Mesa {selectedTable.number}</span>
                    <strong>{selectedTable.occupied} sentados</strong>
                  </div>
                  <div className="stepper" aria-label="Asientos">
                    <button
                      className="stepper__button"
                      disabled={
                        isActionRunning(`capacity-${selectedTable.id}`) || selectedTable.capacity <= selectedTable.occupied
                      }
                      onClick={() =>
                        void runWorkspaceAction(
                          `capacity-${selectedTable.id}`,
                          "tables",
                          () => updateTableCapacity(selectedTable.id, selectedTable.capacity - 1, token ?? ""),
                          `Los asientos de la mesa ${selectedTable.number} se han ajustado.`,
                        )
                      }
                      type="button"
                    >
                      -
                    </button>
                    <div className="stepper__value stepper__value--stacked">
                      <span className="stepper__caption">Asientos</span>
                      <strong>{selectedTable.capacity}</strong>
                    </div>
                    <button
                      className="stepper__button"
                      disabled={isActionRunning(`capacity-${selectedTable.id}`)}
                      onClick={() =>
                        void runWorkspaceAction(
                          `capacity-${selectedTable.id}`,
                          "tables",
                          () => updateTableCapacity(selectedTable.id, selectedTable.capacity + 1, token ?? ""),
                          `Los asientos de la mesa ${selectedTable.number} se han ajustado.`,
                        )
                      }
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="button button--ghost button--small"
                    disabled={isActionRunning(`duplicate-table-${selectedTable.id}`)}
                    onClick={() =>
                      void runWorkspaceAction(
                        `duplicate-table-${selectedTable.id}`,
                        "tables",
                        () => duplicateTable(selectedTable.id, token ?? ""),
                        `La mesa ${selectedTable.number} se ha duplicado.`,
                      )
                    }
                    type="button"
                  >
                    {isActionRunning(`duplicate-table-${selectedTable.id}`) ? "Duplicando..." : "Duplicar mesa"}
                  </button>
                  {pendingTableRemovalId === selectedTable.id ? (
                    <div className="rail-table-settings__confirm rail-table-settings__confirm--danger">
                      <p>Se eliminará la mesa vacía y la numeración se ajustará automáticamente.</p>
                      <button
                        className="button button--quiet button--small"
                        onClick={() => setPendingTableRemovalId(null)}
                        type="button"
                      >
                        Cancelar
                      </button>
                      <button
                        className="button button--ghost button--small"
                        disabled={isActionRunning(`remove-table-${selectedTable.id}`)}
                        onClick={() =>
                          void runWorkspaceAction(
                            `remove-table-${selectedTable.id}`,
                            "tables",
                            async () => {
                              await deleteTable(selectedTable.id, token ?? "");
                              setPendingTableRemovalId(null);
                            },
                            `La mesa ${selectedTable.number} se ha retirado del salón.`,
                          )
                        }
                        type="button"
                      >
                        {isActionRunning(`remove-table-${selectedTable.id}`) ? "Eliminando..." : "Confirmar eliminación"}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button--quiet button--small button--danger-soft"
                      onClick={() => setPendingTableRemovalId(selectedTable.id)}
                      type="button"
                    >
                      Eliminar mesa
                    </button>
                  )}
                </div>
              ) : (
                <div className="rail-table-settings rail-table-settings--planner">
                  <form className="rail-batch-form" onSubmit={handleTableBatchCreate}>
                    <label className="mini-field">
                      <span>¿Cuántas mesas quieres añadir?</span>
                      <input
                        inputMode="numeric"
                        min="1"
                        onChange={(event) => setTableBatchCount(event.target.value)}
                        type="number"
                        value={tableBatchCount}
                      />
                    </label>
                    <label className="mini-field">
                      <span>¿Cuántos asientos por mesa?</span>
                      <input
                        inputMode="numeric"
                        min="1"
                        onChange={(event) => setTableBatchCapacity(event.target.value)}
                        type="number"
                        value={tableBatchCapacity}
                      />
                    </label>
                    <button
                      className="button button--primary button--small"
                      disabled={isActionRunning(`create-table-batch-${Number(tableBatchCount)}-${Number(tableBatchCapacity)}`)}
                      type="submit"
                    >
                      {isActionRunning(`create-table-batch-${Number(tableBatchCount)}-${Number(tableBatchCapacity)}`)
                        ? "Generando..."
                        : `Generar ${tableBatchCount || "0"} mesas`}
                    </button>
                  </form>
                </div>
              )) : null}
              </div>
            </section>

            <section className={`list-card rail-card rail-summary ${tablesSectionBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={tablesSectionBusy}>
              <div className="rail-summary__header">
                <button className="panel-toggle panel-toggle--compact" onClick={() => togglePanel("summary")} type="button">
                  <h4>Resumen del banquete</h4>
                  <span aria-hidden="true" className={`panel-toggle__chevron ${collapsedPanels.summary ? "panel-toggle__chevron--collapsed" : ""}`}>▾</span>
                </button>
              </div>
              {!collapsedPanels.summary ? (
              <>
              <div className="control-metrics control-metrics--summary">
                <article className="control-metric">
                  <span>Total invitados</span>
                  <strong>{(workspace?.guests.unassigned.length ?? 0) + (workspace?.guests.assigned.length ?? 0)}</strong>
                </article>
                <article className="control-metric">
                  <span>Total sentados</span>
                  <strong>{workspace?.guests.assigned.length ?? 0}</strong>
                </article>
                <article className="control-metric">
                  <span>Total sin sentar</span>
                  <strong>{pendingGuestsCount}</strong>
                </article>
              </div>
              <div className="control-metrics">
                <article className="control-metric">
                  <span>Mesas completas</span>
                  <strong>{fullTablesCount}</strong>
                </article>
                <article className="control-metric control-metric--alert">
                  <span>Ubicaciones por revisar</span>
                  <strong>{conflictTableIds.size}</strong>
                </article>
                <article className="control-metric">
                  <span>Ocupacion media</span>
                  <strong>
                    {workspace
                      ? `${Math.round(
                          (workspace.tables.reduce((total, table) => total + table.occupied, 0) /
                            Math.max(workspace.tables.reduce((total, table) => total + table.capacity, 0), 1)) *
                            100,
                        )}%`
                      : "0%"}
                  </strong>
                </article>
              </div>
              <div className="control-metrics">
                <article className="control-metric">
                  <span>Confirmados</span>
                  <strong>{confirmedGuestsCount}</strong>
                </article>
                <article className="control-metric">
                  <span>Sin confirmar</span>
                  <strong>{unconfirmedGuestsCount}</strong>
                </article>
              </div>
              <div className="control-metrics">
                <article className="control-metric">
                  <span>Adultos</span>
                  <strong>{adultGuestsCount}</strong>
                </article>
                <article className="control-metric">
                  <span>Adolescentes</span>
                  <strong>{teenGuestsCount}</strong>
                </article>
                <article className="control-metric">
                  <span>Niños</span>
                  <strong>{childGuestsCount}</strong>
                </article>
              </div>
              <div className="control-metrics">
                <article className="control-metric">
                  <span>Comen pescado</span>
                  <strong>{fishMenuGuestsCount}</strong>
                </article>
                <article className="control-metric">
                  <span>Comen carne</span>
                  <strong>{meatMenuGuestsCount}</strong>
                </article>
                <article className="control-metric">
                  <span>Vegetarianos</span>
                  <strong>{vegetarianMenuGuestsCount}</strong>
                </article>
                <article className="control-metric">
                  <span>Menú desconocido</span>
                  <strong>{unknownMenuGuestsCount}</strong>
                </article>
              </div>
              </>
              ) : null}
            </section>

            <section className="list-card rail-card">
              <div className="list-card__header">
                <button className="panel-toggle panel-toggle--compact" onClick={() => togglePanel("sessions")} type="button">
                  <h3>Sesiones</h3>
                  <span aria-hidden="true" className={`panel-toggle__chevron ${collapsedPanels.sessions ? "panel-toggle__chevron--collapsed" : ""}`}>▾</span>
                </button>
              </div>
              {!collapsedPanels.sessions ? (
              <>
              <form className="session-library" onSubmit={handleSaveSession}>
                <label className="mini-field session-library__field">
                  <span>Guardar distribución actual</span>
                  <input
                    onChange={(event) => setSessionName(event.target.value)}
                    placeholder="Ej. banquete familiar"
                    value={sessionName}
                  />
                </label>
                <button
                  className="button button--primary button--small"
                  disabled={!sessionName.trim() || isActionRunning(`save-session-${normalizeText(sessionName)}`)}
                  type="submit"
                >
                  {isActionRunning(`save-session-${normalizeText(sessionName)}`) ? "Guardando..." : "Guardar sesión"}
                </button>
              </form>
              <input
                accept="application/json,.json"
                className="session-library__file-input"
                onChange={handleSessionFileImport}
                ref={sessionImportInputRef}
                type="file"
              />
              {savedSessions.length > 0 ? (
                <div className="guest-table-shell guest-table-shell--compact session-library__list">
                  <table className="guest-table session-table">
                    <thead>
                      <tr>
                        <th>Sesión</th>
                        <th>Creada</th>
                        <th aria-label="Descargar sesión" className="guest-table__action-column" />
                        <th aria-label="Cargar sesión" className="guest-table__action-column" />
                        <th aria-label="Eliminar sesión" className="guest-table__action-column" />
                      </tr>
                    </thead>
                    <tbody>
                      {savedSessions.map((session) => (
                        <tr className="guest-table__row" key={session.id}>
                          <td>
                            <strong>{session.name}</strong>
                          </td>
                          <td>{formatSessionDate(session.created_at)}</td>
                          <td className="guest-table__action-column">
                            <button
                              className="button button--ghost button--small"
                              disabled={isActionRunning(`export-session-${session.id}`)}
                              onClick={() => void handleSessionExport(session)}
                              type="button"
                            >
                              Descargar
                            </button>
                          </td>
                          <td className="guest-table__action-column">
                            <button
                              className="button button--ghost button--small"
                              disabled={isActionRunning(`load-session-${session.id}`)}
                              onClick={() =>
                                void runWorkspaceAction(
                                  `load-session-${session.id}`,
                                  "tables",
                                  () => loadSession(session.id, token ?? ""),
                                  `Sesión "${session.name}" cargada.`,
                                )
                              }
                              type="button"
                            >
                              Cargar sesión
                            </button>
                          </td>
                          <td className="guest-table__action-column">
                            <button
                              aria-label={`Eliminar sesión ${session.name}`}
                              className="button button--quiet button--small button--icon"
                              disabled={isActionRunning(`delete-session-${session.id}`)}
                              onClick={() =>
                                void runWorkspaceAction(
                                  `delete-session-${session.id}`,
                                  "tables",
                                  () => deleteSession(session.id, token ?? ""),
                                  `Sesión "${session.name}" eliminada.`,
                                )
                              }
                              type="button"
                            >
                              <svg aria-hidden="true" className="button__icon" viewBox="0 0 24 24">
                                <path d="M9 4.75h6" />
                                <path d="M5.75 7.25h12.5" />
                                <path d="M8.25 7.25v10.1A1.4 1.4 0 0 0 9.65 18.75h4.7a1.4 1.4 0 0 0 1.4-1.4V7.25" />
                                <path d="M10 10.25v5.5" />
                                <path d="M14 10.25v5.5" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {isResetSessionPending ? (
                <div className="rail-table-settings__confirm rail-table-settings__confirm--danger">
                  <p className="rail-warning">
                    <svg aria-hidden="true" className="rail-warning__icon" viewBox="0 0 24 24">
                      <path d="M12 4.75 20 18.5H4Z" />
                      <path d="M12 9v4.75" />
                      <path d="M12 16.75h.01" />
                    </svg>
                    <span>¿Crear una nueva sesión vacía?</span>
                  </p>
                  <p>
                    Se <strong>eliminarán</strong> todas las mesas y toda la lista de invitados del workspace actual.
                  </p>
                  <button className="button button--quiet button--small" onClick={() => setIsResetSessionPending(false)} type="button">
                    Cancelar
                  </button>
                  <button
                    className="button button--primary button--small"
                    disabled={isActionRunning("reset-workspace")}
                    onClick={() =>
                      void runWorkspaceAction(
                        "reset-workspace",
                        "tables",
                        async () => {
                          await resetWorkspace(token ?? "");
                          setIsResetSessionPending(false);
                          setSelectedTableId(null);
                        },
                        "Workspace reiniciado para una nueva sesión.",
                      )
                    }
                    type="button"
                  >
                    {isActionRunning("reset-workspace") ? "Reiniciando..." : "Confirmar nueva sesión"}
                  </button>
                </div>
              ) : (
                <div className="session-library__toolbar">
                  <button
                    className="button button--ghost button--small"
                    disabled={isActionRunning("import-session-file")}
                    onClick={() => sessionImportInputRef.current?.click()}
                    type="button"
                  >
                    {isActionRunning("import-session-file") ? "Cargando..." : "Cargar desde fichero"}
                  </button>
                  <button className="button button--primary button--small session-library__new" onClick={() => setIsResetSessionPending(true)} type="button">
                    Nueva sesión
                  </button>
                </div>
              )}
              </>
              ) : null}
            </section>
          </div>
        </div>
      </aside>

      {isRailOpen ? (
        <div
          aria-label="Ajustar ancho de la columna izquierda"
          aria-orientation="vertical"
          aria-valuemax={RAIL_PANEL_MAX_WIDTH}
          aria-valuemin={RAIL_PANEL_MIN_WIDTH}
          aria-valuenow={Math.round(railPanelWidth)}
          className="shell__resizer"
          onKeyDown={handleRailPanelResizeKeyDown}
          onPointerDown={startRailPanelResize}
          role="separator"
          tabIndex={0}
        />
      ) : null}

      <main className="workspace">
        {errorMessage ? <div className="banner banner--error">{errorMessage}</div> : null}
        {loadingWorkspace ? <div className="banner">Actualizando workspace...</div> : null}

        <section
          ref={canvasRef}
          className={`canvas ${isResizingListsPanel ? "canvas--resizing" : ""} ${isCenterPanelOpen ? "" : "canvas--center-collapsed"}`}
          style={{
            gridTemplateColumns: isCenterPanelOpen
              ? (
                  isListsPanelOpen
                    ? `minmax(0, 1fr) 0.85rem minmax(${LISTS_PANEL_MIN_WIDTH}px, ${listsPanelWidth}px)`
                    : `minmax(0, 1fr) 0.85rem 2.75rem`
                )
              : (
                  isListsPanelOpen
                    ? `2.75rem 0 minmax(${LISTS_PANEL_MIN_WIDTH}px, 1fr)`
                    : `2.75rem 0 2.75rem`
                ),
          }}
        >
          {isCenterPanelOpen ? (
            <div className={`canvas__tables ${tablesSectionBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={tablesSectionBusy}>
              <div className="canvas__tables-header">
                <button
                  aria-expanded={isCenterPanelOpen}
                  aria-label="Cerrar paneles centrales"
                  className="canvas__toggle"
                  onClick={() => setIsCenterPanelOpen(false)}
                  type="button"
                >
                  <span aria-hidden="true" className="canvas__toggle-triangle">
                    ◀
                  </span>
                </button>
              </div>
              {workspace ? (
                <SeatingPlan
                  activeDropSeat={activeDropSeat}
                  draggedGuestName={draggedGuest?.name ?? null}
                  highlightedGuestIds={guestSearchQuery.trim() ? filteredAssignedGuests.map((guest) => guest.id) : []}
                  isSearchActive={Boolean(guestSearchQuery.trim()) && Boolean(deferredGuestSearchQuery.trim())}
                  onGuestDragEnd={handleGuestDragEnd}
                  onGuestDragStart={handleGuestDragStart}
                  onMoveTable={handleTableMove}
                  onSelectTable={selectTable}
                  onSeatDragEnter={handleSeatDragEnter}
                  onSeatDragLeave={handleSeatDragLeave}
                  onSeatDrop={handleSeatDrop}
                  selectedTableId={selectedTableId ?? null}
                  workspace={workspaceForPlan ?? workspace}
                />
              ) : null}
              {workspace?.tables.map((table) => {
                const ratio = table.capacity === 0 ? 0 : Math.round((table.occupied / table.capacity) * 100);

                return (
                  <article
                    className={`table-card ${selectedTableId === table.id ? "table-card--selected" : ""} ${table.available === 0 ? "table-card--full" : ""} ${conflictTableIds.has(table.id) ? "table-card--conflict" : ""} ${activeCardDropTableId === table.id ? "table-card--drop-target" : ""}`}
                    data-testid={`table-card-${table.id}`}
                    key={table.id}
                    onClick={() => selectTable(table.id)}
                    onDragLeave={(event) => handleTableCardDragLeave(event, table.id)}
                    onDragOver={(event) => handleTableCardDragOver(event, table.id)}
                    onDrop={(event) => handleTableCardDrop(event, table.id)}
                  >
                    <div className="table-card__header">
                      <div>
                        <span className="table-card__label">Mesa {table.number}</span>
                        <h3>{table.occupied}/{table.capacity} asientos</h3>
                      </div>
                      <span className={`table-card__pill ${table.available === 0 ? "table-card__pill--full" : ""}`}>
                        {table.available} libres
                      </span>
                    </div>
                    <div className="table-card__meter" aria-hidden="true">
                      <i style={{ width: `${ratio}%` }} />
                    </div>
                    <div className="table-card__flags">
                      {conflictTableIds.has(table.id) ? <span className="status-flag status-flag--conflict">Por revisar</span> : null}
                      {table.available === 0 ? <span className="status-flag status-flag--full">Completa</span> : null}
                      {table.available > 0 && table.available <= 2 ? <span className="status-flag status-flag--tight">Poco margen</span> : null}
                    </div>
                    <div className="seat-ring">
                      {table.guests.length === 0 ? (
                        <p className="empty-state">Sin invitados asignados.</p>
                      ) : (
                        table.guests.map((guest) => (
                          <div
                            className={`guest-chip ${guest.guest_type === "adolescente" ? "guest-chip--teen" : ""} ${guest.guest_type === "nino" ? "guest-chip--child" : "guest-chip--adult"} ${conflictGuestIds.has(guest.id) ? "guest-chip--conflict" : ""}`}
                            draggable
                            key={guest.id}
                            onDragEnd={handleGuestDragEnd}
                            onDragStart={(event) => handleGuestDragStart(event, guest.id)}
                            onMouseEnter={(event) => updateHoveredCardGuest(event, table.id, guest)}
                            onMouseLeave={() => setHoveredCardGuest((current) => (current?.tableId === table.id ? null : current))}
                            onMouseMove={(event) => updateHoveredCardGuest(event, table.id, guest)}
                          >
                            <span>{guest.name}</span>
                          </div>
                        ))
                      )}
                    </div>
                    {hoveredCardGuest?.tableId === table.id ? (
                      <div className="table-card__tooltip" style={{ left: `${hoveredCardGuest.x}px`, top: `${hoveredCardGuest.y}px` }}>
                        <strong>{hoveredCardGuest.name}</strong>
                        <span>Tipo: {hoveredCardGuest.guestType}</span>
                        <span>Familia: {hoveredCardGuest.family}</span>
                        <span>Estado: {hoveredCardGuest.confirmedLabel}</span>
                      </div>
                    ) : null}
                  </article>
                );
              }) ?? <p className="empty-state">Aun no hay workspace cargado.</p>}
            </div>
          ) : (
            <div className="canvas__collapsed-strip">
              <button
                aria-expanded={isCenterPanelOpen}
                aria-label="Abrir paneles centrales"
                className="canvas__toggle"
                onClick={() => setIsCenterPanelOpen(true)}
                type="button"
              >
                <span aria-hidden="true" className="canvas__toggle-triangle">
                  ▶
                </span>
              </button>
            </div>
          )}

          <div
            aria-hidden={!isListsPanelOpen || !isCenterPanelOpen}
            aria-label="Ajustar ancho de la columna derecha"
            aria-orientation="vertical"
            aria-valuemax={LISTS_PANEL_MAX_WIDTH}
            aria-valuemin={LISTS_PANEL_MIN_WIDTH}
            aria-valuenow={Math.round(listsPanelWidth)}
            className={`canvas__resizer ${isListsPanelOpen && isCenterPanelOpen ? "" : "canvas__resizer--inactive"}`}
            onKeyDown={isListsPanelOpen && isCenterPanelOpen ? handleListsPanelResizeKeyDown : undefined}
            onPointerDown={isListsPanelOpen && isCenterPanelOpen ? startListsPanelResize : undefined}
            role="separator"
            tabIndex={isListsPanelOpen && isCenterPanelOpen ? 0 : -1}
          />

          <div
            className={`lists-panel ${isListsPanelOpen ? "" : "lists-panel--collapsed"} ${guestSectionBusy ? "section-shell section-shell--busy" : ""}`}
            aria-busy={guestSectionBusy}
          >
            {isListsPanelOpen ? (
              <>
                <section className="list-card list-card--search">
                  <div className="lists-panel__search-row">
                    <label className="guest-search guest-search--panel">
                      <span aria-hidden="true" className="guest-search__icon">
                        <svg viewBox="0 0 24 24">
                          <circle cx="11" cy="11" r="6.5" />
                          <path d="M16 16l4.5 4.5" />
                        </svg>
                      </span>
                      <input
                        onChange={(event) => setGuestSearchQuery(event.target.value)}
                        placeholder="Encuentra a un ser querido..."
                        type="text"
                        value={guestSearchQuery}
                      />
                      <button
                        aria-label="Borrar búsqueda"
                        className="guest-search__clear"
                        disabled={!guestSearchQuery}
                        onClick={() => setGuestSearchQuery("")}
                        type="button"
                      >
                        ×
                      </button>
                    </label>
                    <button
                      aria-expanded={isListsPanelOpen}
                      aria-label="Cerrar panel derecho"
                      className="lists-panel__toggle"
                      onClick={() => setIsListsPanelOpen(false)}
                      type="button"
                    >
                      <span aria-hidden="true" className="lists-panel__toggle-triangle">
                        ▶
                      </span>
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <div className="lists-panel__collapsed-strip">
                <button
                  aria-expanded={isListsPanelOpen}
                  aria-label="Abrir panel derecho"
                  className="lists-panel__toggle"
                  onClick={() => setIsListsPanelOpen(true)}
                  type="button"
                >
                  <span aria-hidden="true" className="lists-panel__toggle-triangle">
                    ◀
                  </span>
                </button>
              </div>
            )}
            {isListsPanelOpen ? (
              <>
            <section className="list-card list-card--guests">
              <div data-testid="unassigned-guests-panel">
                <div className="list-card__header list-card__header--guests">
                  <button className="panel-toggle panel-toggle--compact" onClick={() => togglePanel("unassigned")} type="button">
                    <h3>Invitados sin sentar</h3>
                    <span aria-hidden="true" className={`panel-toggle__chevron ${collapsedPanels.unassigned ? "panel-toggle__chevron--collapsed" : ""}`}>▾</span>
                  </button>
                </div>
                {!collapsedPanels.unassigned ? (
                <>
                <section className="guest-salon__section">
                  <div
                    className={`guest-table-shell ${isUnassignedDropActive ? "guest-table-shell--drop-active" : ""}`}
                    onDragLeave={handleUnassignedDragLeave}
                    onDragOver={handleUnassignedDragOver}
                    onDrop={handleUnassignedDrop}
                  >
                    {(workspace?.guests.unassigned.length ?? 0) > 0 ? (
                      filteredUnassignedGuests.length > 0 ? (
                        <>
                        <table className="guest-table">
                          <thead>
                            <tr>
                              <th>Invitado</th>
                              <th>Asistencia</th>
                              <th>Tipo</th>
                              <th>Intolerancia</th>
                              <th>Menú</th>
                              <th>Familia</th>
                              <th>Mesa</th>
                              <th aria-label="Eliminar invitado" className="guest-table__action-column" />
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedUnassignedGuests.rows.map((guest) => (
                              <Fragment key={guest.id}>
                                <tr
                                  className={`guest-table__row ${conflictGuestIds.has(guest.id) ? "guest-table__row--conflict" : ""} ${draggedGuestId === guest.id ? "guest-table__row--dragging" : ""}`}
                                  data-testid={`unassigned-guest-${guest.id}`}
                                  draggable
                                  onDragEnd={handleGuestDragEnd}
                                  onDragStart={(event) => handleGuestDragStart(event, guest.id)}
                                >
                                  <td>
                                    {editingGuestId === guest.id && editingGuestField === "name" ? (
                                      <input
                                        aria-invalid={Boolean(editingGuestError)}
                                        autoFocus
                                        className="guest-table__input"
                                        onBlur={handleGuestEditBlur}
                                        onChange={(event) => setEditingGuestName(event.target.value)}
                                        onKeyDown={handleGuestEditKeyDown}
                                        value={editingGuestName}
                                      />
                                    ) : (
                                      <button className="guest-name-button" onClick={() => beginGuestEdit(guest, "name")} type="button">
                                        <span className="guest-card__nameplate">
                                          <strong>{guest.name}</strong>
                                          <GuestSignal guest={guest} />
                                        </span>
                                      </button>
                                    )}
                                  </td>
                                  <td>
                                    {editingGuestId === guest.id && editingGuestField === "confirmed" ? (
                                      <select
                                        autoFocus
                                        className="guest-table__select"
                                        onBlur={handleGuestEditBlur}
                                        onChange={(event) => setEditingGuestConfirmed(event.target.value === "true")}
                                        onKeyDown={handleGuestEditKeyDown}
                                        value={String(editingGuestConfirmed)}
                                      >
                                        <option value="true">Confirmado</option>
                                        <option value="false">Pendiente</option>
                                      </select>
                                    ) : (
                                      <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "confirmed")} type="button">
                                        {formatConfirmedLabel(guest.confirmed)}
                                      </button>
                                    )}
                                  </td>
                                  <td>
                                    {editingGuestId === guest.id && editingGuestField === "type" ? (
                                      <select
                                        className="guest-table__select"
                                        onBlur={handleGuestEditBlur}
                                        onChange={(event) => setEditingGuestType(event.target.value)}
                                        onKeyDown={handleGuestEditKeyDown}
                                        value={editingGuestType}
                                      >
                                        <option value="adulto">adulto</option>
                                        <option value="adolescente">adolescente</option>
                                        <option value="nino">nino</option>
                                      </select>
                                    ) : (
                                      <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "type")} type="button">
                                        {formatGuestTypeLabel(guest.guest_type)}
                                      </button>
                                    )}
                                  </td>
                                  <td>
                                    {editingGuestId === guest.id && editingGuestField === "intolerance" ? (
                                      <input
                                        autoFocus
                                        className="guest-table__input"
                                        onBlur={handleGuestEditBlur}
                                        onChange={(event) => setEditingGuestIntolerance(event.target.value)}
                                        onKeyDown={handleGuestEditKeyDown}
                                        value={editingGuestIntolerance}
                                      />
                                    ) : (
                                      <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "intolerance")} type="button">
                                        {guest.intolerance || "Sin intolerancia"}
                                      </button>
                                    )}
                                  </td>
                                  <td>
                                    {editingGuestId === guest.id && editingGuestField === "menu" ? (
                                      <select
                                        autoFocus
                                        className="guest-table__select"
                                        onBlur={handleGuestEditBlur}
                                        onChange={(event) => setEditingGuestMenu(event.target.value)}
                                        onKeyDown={handleGuestEditKeyDown}
                                        value={editingGuestMenu}
                                      >
                                        <option value="desconocido">Desconocido</option>
                                        <option value="carne">Carne</option>
                                        <option value="pescado">Pescado</option>
                                        <option value="vegano">Vegano</option>
                                      </select>
                                    ) : (
                                      <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "menu")} type="button">
                                        {formatMenuLabel(guest.menu)}
                                      </button>
                                    )}
                                  </td>
                                  <td>
                                    {editingGuestId === guest.id && editingGuestField === "group" ? (
                                      <input
                                        className="guest-table__input"
                                        onBlur={handleGuestEditBlur}
                                        onChange={(event) => setEditingGuestGroupId(event.target.value)}
                                        onKeyDown={handleGuestEditKeyDown}
                                        value={editingGuestGroupId}
                                      />
                                    ) : (
                                      <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "group")} type="button">
                                        {guest.group_id ? guest.group_id : "Sin familia"}
                                      </button>
                                    )}
                                  </td>
                                  <td>
                                    {editingGuestId === guest.id && editingGuestField === "table" ? (
                                      <select
                                        autoFocus
                                        className="guest-table__select"
                                        onBlur={handleGuestEditBlur}
                                        onChange={(event) => handleGuestAssignmentSelection(guest, event.target.value)}
                                        onKeyDown={handleGuestEditKeyDown}
                                        value={assignmentValues[guest.id] ?? ""}
                                      >
                                        <option value="">Sin mesa</option>
                                        {workspace?.tables.map((table) => (
                                          <option key={table.id} value={table.id}>
                                            Mesa {table.number}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "table")} type="button">
                                        <span className="guest-row__table guest-row__table--muted">Sin mesa</span>
                                      </button>
                                    )}
                                  </td>
                                  <td className="guest-table__action-column">
                                    <div className="guest-table__actions guest-table__actions--icon-only">
                                      {editingGuestId === guest.id ? (
                                        <span className="guest-table__autosave">
                                          {isActionRunning(`update-${guest.id}`) ? "Guardando..." : "Enter o salir para guardar"}
                                        </span>
                                      ) : pendingGuestRemovalId === guest.id ? (
                                        <div className="guest-table__confirm">
                                          <span>¿Quitar?</span>
                                          <button className="button button--ghost button--small" onClick={() => setPendingGuestRemovalId(null)} type="button">
                                            No
                                          </button>
                                          <button
                                            aria-label={`Confirmar borrado de ${guest.name}`}
                                            className="button button--danger button--small button--icon"
                                            disabled={isActionRunning(`delete-${guest.id}`)}
                                            onClick={() =>
                                              void runWorkspaceAction(
                                                `delete-${guest.id}`,
                                                "guests",
                                                async () => {
                                                  await deleteGuest(guest.id, token ?? "");
                                                  setPendingGuestRemovalId(null);
                                                },
                                                `${guest.name} eliminado.`,
                                              )
                                            }
                                            type="button"
                                          >
                                            <svg aria-hidden="true" className="button__icon" viewBox="0 0 24 24">
                                              <path d="M9 4.75h6" />
                                              <path d="M5.75 7.25h12.5" />
                                              <path d="M8.25 7.25v10.1A1.4 1.4 0 0 0 9.65 18.75h4.7a1.4 1.4 0 0 0 1.4-1.4V7.25" />
                                              <path d="M10 10.25v5.5" />
                                              <path d="M14 10.25v5.5" />
                                            </svg>
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          aria-label={`Eliminar a ${guest.name}`}
                                          className="button button--ghost button--small button--icon"
                                          disabled={isActionRunning(`delete-${guest.id}`)}
                                          onClick={() => setPendingGuestRemovalId(guest.id)}
                                          type="button"
                                        >
                                          <svg aria-hidden="true" className="button__icon" viewBox="0 0 24 24">
                                            <path d="M9 4.75h6" />
                                            <path d="M5.75 7.25h12.5" />
                                            <path d="M8.25 7.25v10.1A1.4 1.4 0 0 0 9.65 18.75h4.7a1.4 1.4 0 0 0 1.4-1.4V7.25" />
                                            <path d="M10 10.25v5.5" />
                                            <path d="M14 10.25v5.5" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                    {editingGuestId === guest.id && editingGuestError ? (
                                      <p className="inline-feedback inline-feedback--error">{editingGuestError}</p>
                                    ) : null}
                                  </td>
                                </tr>
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                        {paginatedUnassignedGuests.totalPages > 1 ? (
                          <div className="guest-table-pagination">
                            <span className="guest-table-pagination__summary">
                              {paginatedUnassignedGuests.startItem}-{paginatedUnassignedGuests.endItem} de {paginatedUnassignedGuests.totalItems}
                            </span>
                            <div className="guest-table-pagination__actions">
                              <button
                                className="button button--ghost button--small"
                                disabled={paginatedUnassignedGuests.currentPage === 1}
                                onClick={() => setGuestTablePage("unassigned", paginatedUnassignedGuests.currentPage - 1)}
                                type="button"
                              >
                                Anterior
                              </button>
                              <span className="guest-table-pagination__status">
                                Página {paginatedUnassignedGuests.currentPage} de {paginatedUnassignedGuests.totalPages}
                              </span>
                              <button
                                className="button button--ghost button--small"
                                disabled={paginatedUnassignedGuests.currentPage === paginatedUnassignedGuests.totalPages}
                                onClick={() => setGuestTablePage("unassigned", paginatedUnassignedGuests.currentPage + 1)}
                                type="button"
                              >
                                Siguiente
                              </button>
                            </div>
                          </div>
                        ) : null}
                        </>
                      ) : (
                        <p className="empty-state empty-state--paper">No encontramos a nadie con esa búsqueda.</p>
                      )
                    ) : (
                      <p className="empty-state empty-state--paper">
                        {isUnassignedDropActive ? "Suelta aquí para dejar al invitado sin mesa." : "No hay invitados sin sentar."}
                      </p>
                    )}
                  </div>
                </section>
                <details className="guest-composer">
                  <summary className="guest-collapse__summary guest-collapse__summary--muted">
                    <div>
                      <p>
                        <span className="guest-composer__trigger">Añadir invitado</span>
                      </p>
                    </div>
                  </summary>
                  <form className="stack-form stack-form--guest-salon" onSubmit={handleGuestCreate}>
                    <label className="mini-field">
                      <span>Familia</span>
                      <input placeholder="opcional" value={guestGroupId} onChange={(event) => setGuestGroupId(event.target.value)} />
                    </label>
                    <div className="guest-family-form">
                      {guestDrafts.map((draft, index) => (
                        <div className="mini-grid guest-family-form__row" key={index}>
                          <label className="mini-field">
                            <span>{index === 0 ? "Nombre" : `Nombre ${index + 1}`}</span>
                            <input
                              data-testid={index === 0 ? "guest-name-input" : undefined}
                              value={draft.name}
                              aria-invalid={Boolean(guestFormError)}
                              onChange={(event) =>
                                updateGuestDraft(index, {
                                  ...draft,
                                  name: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="mini-field">
                            <span>Tipo</span>
                            <select
                              value={draft.guest_type}
                              onChange={(event) =>
                                updateGuestDraft(index, {
                                  ...draft,
                                  guest_type: event.target.value,
                                })
                              }
                            >
                              <option value="adulto">adulto</option>
                              <option value="adolescente">adolescente</option>
                              <option value="nino">nino</option>
                            </select>
                          </label>
                          <label className="mini-field">
                            <span>Intolerancia</span>
                            <input
                              placeholder="opcional"
                              value={draft.intolerance}
                              onChange={(event) =>
                                updateGuestDraft(index, {
                                  ...draft,
                                  intolerance: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="mini-field">
                            <span>Menú</span>
                            <select
                              value={draft.menu}
                              onChange={(event) =>
                                updateGuestDraft(index, {
                                  ...draft,
                                  menu: event.target.value,
                                })
                              }
                            >
                              <option value="desconocido">desconocido</option>
                              <option value="carne">carne</option>
                              <option value="pescado">pescado</option>
                              <option value="vegano">vegano</option>
                            </select>
                          </label>
                          <label className="mini-field mini-field--checkbox">
                            <span>Confirmado</span>
                            <input
                              checked={draft.confirmed}
                              onChange={(event) =>
                                updateGuestDraft(index, {
                                  ...draft,
                                  confirmed: event.target.checked,
                                })
                              }
                              type="checkbox"
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                    {guestFormError ? <p className="inline-feedback inline-feedback--error">{guestFormError}</p> : null}
                    <button className="button button--primary button--small" disabled={isActionRunning("create-guest")} type="submit">
                      {isActionRunning("create-guest") ? "Guardando..." : "Añadir invitado"}
                    </button>
                  </form>
                </details>
                </>
                ) : null}
              </div>
            </section>

            <section className="list-card list-card--guests">
              <div className="list-card__header list-card__header--guests">
                <button className="panel-toggle panel-toggle--compact" onClick={() => togglePanel("assigned")} type="button">
                  <h3>Invitados ubicados</h3>
                  <span aria-hidden="true" className={`panel-toggle__chevron ${collapsedPanels.assigned ? "panel-toggle__chevron--collapsed" : ""}`}>▾</span>
                </button>
              </div>
              {!collapsedPanels.assigned ? (
              <section className="guest-salon__section guest-salon__section--standalone">
                <div className="guest-salon__section-header">
                  <div>
                    <h4>Ya ubicados</h4>
                    <p>Vista densa para revisar rápidamente mesa, familia y acciones.</p>
                  </div>
                </div>
                <div className="guest-table-shell guest-table-shell--compact">
                  {filteredAssignedGuests.length > 0 ? (
                    <>
                    <table className="guest-table guest-table--placed">
                      <thead>
                        <tr>
                          <th>Invitado</th>
                          <th>Asistencia</th>
                          <th>Tipo</th>
                          <th>Intolerancia</th>
                          <th>Menú</th>
                          <th>Familia</th>
                          <th>Mesa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedAssignedGuests.rows.map((guest) => {
                          const tableNumber = guest.table_id ? tableNumberById.get(guest.table_id) : null;

                          return (
                            <Fragment key={guest.id}>
                              <tr
                                className={`guest-table__row guest-table__row--placed ${conflictGuestIds.has(guest.id) ? "guest-table__row--conflict" : ""}`}
                              >
                                <td>
                                  {editingGuestId === guest.id && editingGuestField === "name" ? (
                                    <input
                                      aria-invalid={Boolean(editingGuestError)}
                                      autoFocus
                                      className="guest-table__input"
                                      onBlur={handleGuestEditBlur}
                                      onChange={(event) => setEditingGuestName(event.target.value)}
                                      onKeyDown={handleGuestEditKeyDown}
                                      value={editingGuestName}
                                    />
                                  ) : (
                                    <button className="guest-name-button" onClick={() => beginGuestEdit(guest, "name")} type="button">
                                      <span className="guest-card__nameplate">
                                        <strong>{guest.name}</strong>
                                        <GuestSignal guest={guest} />
                                      </span>
                                    </button>
                                  )}
                                </td>
                                <td>
                                  {editingGuestId === guest.id && editingGuestField === "confirmed" ? (
                                    <select
                                      autoFocus
                                      className="guest-table__select"
                                      onBlur={handleGuestEditBlur}
                                      onChange={(event) => setEditingGuestConfirmed(event.target.value === "true")}
                                      onKeyDown={handleGuestEditKeyDown}
                                      value={String(editingGuestConfirmed)}
                                    >
                                      <option value="true">Confirmado</option>
                                      <option value="false">Pendiente</option>
                                    </select>
                                  ) : (
                                    <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "confirmed")} type="button">
                                      {formatConfirmedLabel(guest.confirmed)}
                                    </button>
                                  )}
                                </td>
                                <td>
                                  {editingGuestId === guest.id && editingGuestField === "type" ? (
                                    <select
                                      className="guest-table__select"
                                      onBlur={handleGuestEditBlur}
                                      onChange={(event) => setEditingGuestType(event.target.value)}
                                      onKeyDown={handleGuestEditKeyDown}
                                      value={editingGuestType}
                                    >
                                      <option value="adulto">adulto</option>
                                      <option value="adolescente">adolescente</option>
                                      <option value="nino">nino</option>
                                    </select>
                                  ) : (
                                    <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "type")} type="button">
                                      {formatGuestTypeLabel(guest.guest_type)}
                                    </button>
                                  )}
                                </td>
                                <td>
                                  {editingGuestId === guest.id && editingGuestField === "intolerance" ? (
                                    <input
                                      autoFocus
                                      className="guest-table__input"
                                      onBlur={handleGuestEditBlur}
                                      onChange={(event) => setEditingGuestIntolerance(event.target.value)}
                                      onKeyDown={handleGuestEditKeyDown}
                                      value={editingGuestIntolerance}
                                    />
                                  ) : (
                                    <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "intolerance")} type="button">
                                      {guest.intolerance || "Sin intolerancia"}
                                    </button>
                                  )}
                                </td>
                                <td>
                                  {editingGuestId === guest.id && editingGuestField === "menu" ? (
                                    <select
                                      autoFocus
                                      className="guest-table__select"
                                      onBlur={handleGuestEditBlur}
                                      onChange={(event) => setEditingGuestMenu(event.target.value)}
                                      onKeyDown={handleGuestEditKeyDown}
                                      value={editingGuestMenu}
                                    >
                                      <option value="desconocido">Desconocido</option>
                                      <option value="carne">Carne</option>
                                      <option value="pescado">Pescado</option>
                                      <option value="vegano">Vegano</option>
                                    </select>
                                  ) : (
                                    <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "menu")} type="button">
                                      {formatMenuLabel(guest.menu)}
                                    </button>
                                  )}
                                </td>
                                <td>
                                  {editingGuestId === guest.id && editingGuestField === "group" ? (
                                    <input
                                      className="guest-table__input"
                                      onBlur={handleGuestEditBlur}
                                      onChange={(event) => setEditingGuestGroupId(event.target.value)}
                                      onKeyDown={handleGuestEditKeyDown}
                                      value={editingGuestGroupId}
                                    />
                                  ) : (
                                    <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "group")} type="button">
                                      {guest.group_id ? guest.group_id : "Sin agrupación"}
                                    </button>
                                  )}
                                </td>
                                <td>
                                  {pendingGuestRemovalId === guest.id ? (
                                    <div className="guest-table__confirm guest-table__confirm--inline">
                                      <span>¿Quitar?</span>
                                      <button className="button button--ghost button--small" onClick={() => setPendingGuestRemovalId(null)} type="button">
                                        No
                                      </button>
                                      <button
                                        aria-label={`Confirmar borrado de ${guest.name}`}
                                        className="button button--danger button--small button--icon"
                                        disabled={isActionRunning(`delete-${guest.id}`)}
                                        onClick={() =>
                                          void runWorkspaceAction(
                                            `delete-${guest.id}`,
                                            "guests",
                                            async () => {
                                              await deleteGuest(guest.id, token ?? "");
                                              setPendingGuestRemovalId(null);
                                            },
                                            `${guest.name} eliminado.`,
                                          )
                                        }
                                        type="button"
                                      >
                                        <svg aria-hidden="true" className="button__icon" viewBox="0 0 24 24">
                                          <path d="M9 4.75h6" />
                                          <path d="M5.75 7.25h12.5" />
                                          <path d="M8.25 7.25v10.1A1.4 1.4 0 0 0 9.65 18.75h4.7a1.4 1.4 0 0 0 1.4-1.4V7.25" />
                                          <path d="M10 10.25v5.5" />
                                          <path d="M14 10.25v5.5" />
                                        </svg>
                                      </button>
                                    </div>
                                  ) : editingGuestId === guest.id && editingGuestField === "table" ? (
                                    <select
                                      autoFocus
                                      className="guest-table__select"
                                      onBlur={handleGuestEditBlur}
                                      onChange={(event) => handleAssignedGuestTableSelection(guest, event.target.value)}
                                      onKeyDown={handleGuestEditKeyDown}
                                      value={assignmentValues[guest.id] ?? guest.table_id ?? ""}
                                    >
                                      <option value="">Elegir mesa</option>
                                      {workspace?.tables.map((table) => (
                                        <option key={table.id} value={table.id}>
                                          Mesa {table.number}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div className="guest-table__cell-inline">
                                      <button className="guest-cell-button" onClick={() => beginGuestEdit(guest, "table")} type="button">
                                        <span className="guest-row__table">{tableNumber ? `Mesa ${tableNumber}` : "Mesa asignada"}</span>
                                      </button>
                                      <button
                                        aria-label={`Eliminar a ${guest.name}`}
                                        className="button button--ghost button--small button--icon"
                                        disabled={isActionRunning(`delete-${guest.id}`)}
                                        onClick={() => setPendingGuestRemovalId(guest.id)}
                                        type="button"
                                      >
                                        <svg aria-hidden="true" className="button__icon" viewBox="0 0 24 24">
                                          <path d="M9 4.75h6" />
                                          <path d="M5.75 7.25h12.5" />
                                          <path d="M8.25 7.25v10.1A1.4 1.4 0 0 0 9.65 18.75h4.7a1.4 1.4 0 0 0 1.4-1.4V7.25" />
                                          <path d="M10 10.25v5.5" />
                                          <path d="M14 10.25v5.5" />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                    {paginatedAssignedGuests.totalPages > 1 ? (
                      <div className="guest-table-pagination">
                        <span className="guest-table-pagination__summary">
                          {paginatedAssignedGuests.startItem}-{paginatedAssignedGuests.endItem} de {paginatedAssignedGuests.totalItems}
                        </span>
                        <div className="guest-table-pagination__actions">
                          <button
                            className="button button--ghost button--small"
                            disabled={paginatedAssignedGuests.currentPage === 1}
                            onClick={() => setGuestTablePage("assigned", paginatedAssignedGuests.currentPage - 1)}
                            type="button"
                          >
                            Anterior
                          </button>
                          <span className="guest-table-pagination__status">
                            Página {paginatedAssignedGuests.currentPage} de {paginatedAssignedGuests.totalPages}
                          </span>
                          <button
                            className="button button--ghost button--small"
                            disabled={paginatedAssignedGuests.currentPage === paginatedAssignedGuests.totalPages}
                            onClick={() => setGuestTablePage("assigned", paginatedAssignedGuests.currentPage + 1)}
                            type="button"
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    ) : null}
                    </>
                  ) : (
                    <p className="empty-state empty-state--paper">
                      {guestSearchQuery ? "No hay invitados ubicados con esa búsqueda." : "Todavía no hay invitados sentados."}
                    </p>
                  )}
                </div>
              </section>
              ) : null}
            </section>

            <section className="list-card">
              <div className="list-card__header">
                <button className="panel-toggle panel-toggle--compact" onClick={() => togglePanel("conflicts")} type="button">
                  <h3>Ubicaciones por revisar</h3>
                  <span aria-hidden="true" className={`panel-toggle__chevron ${collapsedPanels.conflicts ? "panel-toggle__chevron--collapsed" : ""}`}>▾</span>
                </button>
              </div>
              {!collapsedPanels.conflicts ? (
              <section className="guest-salon__section guest-salon__section--standalone">
                <div className="guest-salon__section-header">
                  <div>
                    <p>Invitados con asientos que deben ser revisados</p>
                  </div>
                </div>
                <div className="guest-table-shell guest-table-shell--compact">
                  {workspace && groupedConflictCount > 0 ? (
                    <>
                    <table className="guest-table guest-table--placed">
                      <thead>
                        <tr>
                          <th>Invitado</th>
                          <th>Intolerancia</th>
                          <th>Menú</th>
                          <th>Familia</th>
                          <th>Mesa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedConflictRows.rows.map((row) => (
                          <tr className="guest-table__row guest-table__row--conflict" key={row.rowId}>
                            <td>
                              {row.guest ? (
                                <button className="guest-name-button" onClick={() => beginGuestEdit(row.guest!, "name")} type="button">
                                  <strong>{row.guestName}</strong>
                                </button>
                              ) : (
                                <strong>{row.guestName}</strong>
                              )}
                            </td>
                            <td>
                              {row.guest ? (
                                editingGuestId === row.guest.id && editingGuestField === "intolerance" ? (
                                  <input
                                    autoFocus
                                    className="guest-table__input"
                                    onBlur={handleGuestEditBlur}
                                    onChange={(event) => setEditingGuestIntolerance(event.target.value)}
                                    onKeyDown={handleGuestEditKeyDown}
                                    value={editingGuestIntolerance}
                                  />
                                ) : (
                                  <button className="guest-cell-button" onClick={() => beginGuestEdit(row.guest!, "intolerance")} type="button">
                                    {row.guest.intolerance || "Sin intolerancia"}
                                  </button>
                                )
                              ) : (
                                "Sin intolerancia"
                              )}
                            </td>
                            <td>
                              {row.guest ? (
                                editingGuestId === row.guest.id && editingGuestField === "menu" ? (
                                  <select
                                    autoFocus
                                    className="guest-table__select"
                                    onBlur={handleGuestEditBlur}
                                    onChange={(event) => setEditingGuestMenu(event.target.value)}
                                    onKeyDown={handleGuestEditKeyDown}
                                    value={editingGuestMenu}
                                  >
                                    <option value="desconocido">Desconocido</option>
                                    <option value="carne">Carne</option>
                                    <option value="pescado">Pescado</option>
                                    <option value="vegano">Vegano</option>
                                  </select>
                                ) : (
                                  <button className="guest-cell-button" onClick={() => beginGuestEdit(row.guest!, "menu")} type="button">
                                    {formatMenuLabel(row.guest.menu)}
                                  </button>
                                )
                              ) : (
                                "Desconocido"
                              )}
                            </td>
                            <td>{row.groupId}</td>
                            <td>{row.tableLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {paginatedConflictRows.totalPages > 1 ? (
                      <div className="guest-table-pagination">
                        <span className="guest-table-pagination__summary">
                          {paginatedConflictRows.startItem}-{paginatedConflictRows.endItem} de {paginatedConflictRows.totalItems}
                        </span>
                        <div className="guest-table-pagination__actions">
                          <button
                            className="button button--ghost button--small"
                            disabled={paginatedConflictRows.currentPage === 1}
                            onClick={() => setGuestTablePage("conflicts", paginatedConflictRows.currentPage - 1)}
                            type="button"
                          >
                            Anterior
                          </button>
                          <span className="guest-table-pagination__status">
                            Página {paginatedConflictRows.currentPage} de {paginatedConflictRows.totalPages}
                          </span>
                          <button
                            className="button button--ghost button--small"
                            disabled={paginatedConflictRows.currentPage === paginatedConflictRows.totalPages}
                            onClick={() => setGuestTablePage("conflicts", paginatedConflictRows.currentPage + 1)}
                            type="button"
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    ) : null}
                    </>
                  ) : (
                    <p className="empty-state empty-state--paper">No hay ubicaciones por revisar.</p>
                  )}
                </div>
              </section>
              ) : null}
            </section>

            <section className="list-card">
              <div className="list-card__header">
                <button className="panel-toggle panel-toggle--compact" onClick={() => togglePanel("guestImport")} type="button">
                  <h3>Cargar invitados desde fichero</h3>
                  <span aria-hidden="true" className={`panel-toggle__chevron ${collapsedPanels.guestImport ? "panel-toggle__chevron--collapsed" : ""}`}>▾</span>
                </button>
              </div>
              {!collapsedPanels.guestImport ? (
              <form className="stack-form stack-form--guest-salon guest-import-panel" onSubmit={handleGuestImportSubmit}>
                <input
                  accept=".csv,text/csv"
                  className="session-library__file-input"
                  onChange={handleGuestImportFileChange}
                  ref={guestImportInputRef}
                  type="file"
                />
                <p className="guest-import-panel__lead">
                  Importa un CSV con las columnas <code>nombre</code>, <code>asistencia</code>, <code>tipo</code> y <code>familia</code>. Las columnas <code>intolerancia</code> y <code>menu</code> son opcionales.
                </p>
                <div className="guest-import-panel__actions">
                  <button className="button button--ghost button--small" onClick={() => guestImportInputRef.current?.click()} type="button">
                    {guestImportPreview ? "Cambiar fichero" : "Seleccionar fichero CSV"}
                  </button>
                  {guestImportPreview ? (
                    <button className="button button--quiet button--small" onClick={clearGuestImportSelection} type="button">
                      Quitar fichero
                    </button>
                  ) : null}
                  <button
                    className="button button--primary button--small"
                    disabled={!guestImportPreview || isActionRunning("import-guests-file")}
                    type="submit"
                  >
                    {isActionRunning("import-guests-file") ? "Importando..." : "Importar invitados"}
                  </button>
                </div>
                {guestImportError ? <p className="inline-feedback inline-feedback--error">{guestImportError}</p> : null}
                {guestImportPreview && guestImportStats ? (
                  <>
                    <div className="guest-import-panel__file">
                      <strong>{guestImportPreview.fileName}</strong>
                      <span>{guestImportStats.total} invitados listos para importar.</span>
                    </div>
                    <div className="control-metrics guest-import-panel__metrics">
                      <article className="control-metric">
                        <span>Total</span>
                        <strong>{guestImportStats.total}</strong>
                      </article>
                      <article className="control-metric">
                        <span>Confirmados</span>
                        <strong>{guestImportStats.confirmed}</strong>
                      </article>
                      <article className="control-metric">
                        <span>Pendientes</span>
                        <strong>{guestImportStats.pending}</strong>
                      </article>
                      <article className="control-metric">
                        <span>Familias</span>
                        <strong>{guestImportStats.families}</strong>
                      </article>
                    </div>
                    <p className="guest-import-panel__preview-note">
                      Vista previa de los primeros {guestImportStats.previewRows.length} invitados del CSV.
                    </p>
                    <div className="guest-table-shell guest-table-shell--compact">
                      <table className="guest-table guest-import-panel__table">
                        <thead>
                          <tr>
                            <th>Invitado</th>
                            <th>Asistencia</th>
                            <th>Tipo</th>
                            <th>Intolerancia</th>
                            <th>Menú</th>
                            <th>Familia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {guestImportStats.previewRows.map((guest, index) => (
                            <tr className="guest-table__row" key={`${guest.name}-${guest.group_id ?? "sin-familia"}-${index}`}>
                              <td>
                                <strong>{guest.name}</strong>
                              </td>
                              <td>{formatConfirmedLabel(guest.confirmed)}</td>
                              <td>{formatGuestTypeLabel(guest.guest_type)}</td>
                              <td>{guest.intolerance || "Sin intolerancia"}</td>
                              <td>{formatMenuLabel(guest.menu)}</td>
                              <td>{guest.group_id ?? "Sin familia"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="empty-state empty-state--paper">
                    Selecciona un fichero CSV como <code>invitados.csv</code> para crear invitados en lote.
                  </p>
                )}
              </form>
              ) : null}
            </section>

              </>
            ) : null}
          </div>
        </section>

      </main>
    </div>
  );
}
