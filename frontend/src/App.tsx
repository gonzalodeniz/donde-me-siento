import { DragEvent, FormEvent, Fragment, KeyboardEvent as ReactKeyboardEvent, startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  assignGuest,
  createTablesBatch,
  createGuest,
  deleteSession,
  deleteGuest,
  deleteTable,
  duplicateTable,
  fetchSessions,
  fetchWorkspace,
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
import type { Guest, SavedSession, Workspace } from "./types";

const TOKEN_STORAGE_KEY = "dms.auth.token";
const LISTS_PANEL_WIDTH_STORAGE_KEY = "dms.ui.listsPanelWidth";
const RAIL_PANEL_WIDTH_STORAGE_KEY = "dms.ui.railPanelWidth";
const LISTS_PANEL_OPEN_STORAGE_KEY = "dms.ui.listsPanelOpen";
const LOGIN_NAMES = ["raquel", "héctor"] as const;
const LISTS_PANEL_MIN_WIDTH = 280;
const LISTS_PANEL_MAX_WIDTH = 760;
const CANVAS_MIN_MAIN_WIDTH = 260;
const RAIL_PANEL_MIN_WIDTH = 360;
const RAIL_PANEL_MAX_WIDTH = 760;
const SHELL_MIN_MAIN_WIDTH = 720;
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
type GuestEditableField = "name" | "type" | "group" | "table";

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

function matchesGuestSearch(guest: Guest, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return true;
  }

  const searchableFields = [
    guest.name,
    guest.group_id ?? "",
    guest.guest_type,
    guest.table_id ?? "",
    formatGuestTypeLabel(guest.guest_type),
  ];

  return searchableFields.some((field) => normalizeSearchText(field).includes(query));
}

function BabyBottleIcon() {
  return (
    <svg aria-hidden="true" className="guest-signal__icon" viewBox="0 0 24 24">
      <path d="M9 2.75h6v2.1l-1.2.95v1.3l2.8 2.8V20a1.25 1.25 0 0 1-1.25 1.25h-6.7A1.25 1.25 0 0 1 7.4 20V9.9l2.8-2.8V5.8L9 4.85Z" />
      <path d="M10 5.75h4" />
      <path d="M9.8 12.1h4.4" />
      <path d="M9.8 15.4h4.4" />
    </svg>
  );
}

function GuestSignal({ guest }: { guest: Guest }) {
  if (guest.guest_type !== "nino") {
    return null;
  }

  return (
    <span aria-label="Invitado infantil" className="guest-signal" title="Invitado infantil">
      <BabyBottleIcon />
    </span>
  );
}

export function App() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const [username, setUsername] = useState<string>(() => randomLoginName());
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestType, setGuestType] = useState("adulto");
  const [guestGroupId, setGuestGroupId] = useState("");
  const [guestSearchQuery, setGuestSearchQuery] = useState("");
  const [tableBatchCount, setTableBatchCount] = useState("8");
  const [tableBatchCapacity, setTableBatchCapacity] = useState("8");
  const [sessionName, setSessionName] = useState("");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [isResetSessionPending, setIsResetSessionPending] = useState(false);
  const [guestFormError, setGuestFormError] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editingGuestField, setEditingGuestField] = useState<GuestEditableField>("name");
  const [editingGuestName, setEditingGuestName] = useState("");
  const [editingGuestType, setEditingGuestType] = useState("adulto");
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
  const [isResizingListsPanel, setIsResizingListsPanel] = useState(false);
  const [sectionNotices, setSectionNotices] = useState<Record<SectionKey, SectionNotice | null>>({
    guests: null,
    tables: null,
  });
  const [visibleToasts, setVisibleToasts] = useState<Record<SectionKey, boolean>>({
    guests: false,
    tables: false,
  });
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
  const occupancyTables = useMemo(
    () =>
      [...(workspace?.tables ?? [])].sort((left, right) => {
        const leftRatio = left.capacity === 0 ? 0 : left.occupied / left.capacity;
        const rightRatio = right.capacity === 0 ? 0 : right.occupied / right.capacity;
        return rightRatio - leftRatio;
      }),
    [workspace],
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
  const tableNumberById = useMemo(
    () => new Map((workspace?.tables ?? []).map((table) => [table.id, table.number])),
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
  const guestSectionBusy =
    loadingWorkspace ||
    submittingAction === "create-guest" ||
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
    localStorage.setItem(LISTS_PANEL_WIDTH_STORAGE_KEY, String(listsPanelWidth));
  }, [listsPanelWidth]);

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
    setEditingGuestGroupId(guest.group_id ?? "");
  }

  function cancelGuestEdit() {
    setEditingGuestId(null);
    setEditingGuestName("");
    setEditingGuestType("adulto");
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
    const hasChanges =
      normalizedGuestName !== currentGuest.name ||
      editingGuestType !== currentGuest.guest_type ||
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
      setSectionNotice("tables", "success", "La mesa se ha recolocado en el plano.");
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

    const normalizedGuestName = normalizeText(guestName);
    if (!normalizedGuestName) {
      setGuestFormError("Introduce el nombre del invitado antes de guardarlo.");
      return;
    }
    setGuestFormError(null);

    const created = await runWorkspaceAction(
      "create-guest",
      "guests",
      () =>
        createGuest(token, {
          name: normalizedGuestName,
          guest_type: guestType,
          group_id: normalizeText(guestGroupId) || null,
        }),
      "Invitado anadido al workspace.",
    );
    if (created) {
      setGuestName("");
      setGuestType("adulto");
      setGuestGroupId("");
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

  function isActionRunning(actionKey: string) {
    return submittingAction === actionKey;
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
            <h1 className="rail__title">Diseño del Salón</h1>
          </div>

          <section className="events-panel">
            <div className="rail-section">
              <div className="rail-section__header">
                <div>
                  <p className="eyebrow eyebrow--compact">{selectedTable ? "Mesa seleccionada" : "Preparación"}</p>
                  <h2>{selectedTable ? `Mesa ${selectedTable.number}` : "Configuración maestra"}</h2>
                </div>
              </div>
              {selectedTable ? (
                <div className="rail-table-settings rail-table-settings--selected">
                  <div className="rail-table-settings__meta">
                    <span>Mesa {selectedTable.number}</span>
                    <strong>{selectedTable.occupied} sentados</strong>
                  </div>
                  <p className="section-copy">
                    Ajusta esta excepción concreta sin tocar la configuración base del resto del salón.
                  </p>
                  <button
                    className="button button--link button--small"
                    onClick={() => setSelectedTableId(null)}
                    type="button"
                  >
                    Volver a configuración maestra
                  </button>
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
                  <p className="section-copy">
                    Prepara un lote inicial o añade varias mesas nuevas con el mismo aforo en una sola acción.
                  </p>
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
                  <p className="rail-table-settings__hint">
                    Después podrás moverlas libremente en el plano y ajustar solo las excepciones mesa a mesa.
                  </p>
                </div>
              )}
            </div>
            <div className="rail-divider" />
            <div className="rail-section">
              <div className="rail-section__header">
                <div>
                  <p className="eyebrow eyebrow--compact">Banquete</p>
                  <h2>Resumen del Banquete</h2>
                </div>
              </div>
              <dl className="banquet-summary">
                <div className="banquet-summary__row">
                  <dt>Invitados sentados</dt>
                  <dd>{workspace?.guests.assigned.length ?? 0}</dd>
                </div>
                <div className="banquet-summary__row banquet-summary__row--accent">
                  <dt>Invitados pendientes</dt>
                  <dd>{pendingGuestsCount}</dd>
                </div>
              </dl>
            </div>
            <div className="rail-divider" />
            <section className={`control-card ${tablesSectionBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={tablesSectionBusy}>
              <div className="list-card__header">
                <h3>Panel de control</h3>
                <span>{workspace?.tables.length ?? 0} mesas</span>
              </div>
              <div className="control-metrics">
                <article className="control-metric">
                  <span>Mesas completas</span>
                  <strong>{fullTablesCount}</strong>
                </article>
                <article className="control-metric control-metric--alert">
                  <span>Mesas con conflicto</span>
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
              <div className="table-summary-list">
                {occupancyTables.map((table) => {
                  const ratio = table.capacity === 0 ? 0 : Math.round((table.occupied / table.capacity) * 100);
                  return (
                    <button
                      key={table.id}
                      className={`table-summary-row ${selectedTableId === table.id ? "table-summary-row--active" : ""} ${table.available === 0 ? "table-summary-row--full" : ""} ${conflictTableIds.has(table.id) ? "table-summary-row--conflict" : ""}`}
                      onClick={() => selectTable(table.id)}
                      type="button"
                    >
                      <div>
                        <strong>Mesa {table.number}</strong>
                        <span>
                          {table.occupied}/{table.capacity} ocupados
                        </span>
                        <div className="table-summary-row__flags">
                          {conflictTableIds.has(table.id) ? <i className="status-flag status-flag--conflict">Conflicto</i> : null}
                          {table.available === 0 ? <i className="status-flag status-flag--full">Completa</i> : null}
                        </div>
                      </div>
                      <div className="table-summary-row__meter">
                        <i style={{ width: `${ratio}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
            <div className="rail-divider" />
            <section className="list-card">
              <div className="list-card__header">
                <h3>Sesiones</h3>
                <span>{savedSessions.length}</span>
              </div>
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
              {savedSessions.length > 0 ? (
                <div className="guest-table-shell guest-table-shell--compact session-library__list">
                  <table className="guest-table session-table">
                    <thead>
                      <tr>
                        <th>Sesión</th>
                        <th>Creada</th>
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
                <button className="button button--primary button--small session-library__new" onClick={() => setIsResetSessionPending(true)} type="button">
                  Nueva sesión
                </button>
              )}
            </section>
          </section>
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
          className={`canvas ${isResizingListsPanel ? "canvas--resizing" : ""}`}
          style={{
            gridTemplateColumns: isListsPanelOpen
              ? `minmax(0, 1fr) 0.85rem minmax(${LISTS_PANEL_MIN_WIDTH}px, ${listsPanelWidth}px)`
              : `minmax(0, 1fr) 0.85rem 2.75rem`,
          }}
        >
          <div className={`canvas__tables ${tablesSectionBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={tablesSectionBusy}>
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
            {workspace?.tables.map((table) => (
              <article
                className={`table-card ${selectedTableId === table.id ? "table-card--selected" : ""} ${table.available === 0 ? "table-card--full" : ""} ${conflictTableIds.has(table.id) ? "table-card--conflict" : ""}`}
                data-testid={`table-card-${table.id}`}
                key={table.id}
                onClick={() => selectTable(table.id)}
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
                <div className="table-card__flags">
                  {conflictTableIds.has(table.id) ? <span className="status-flag status-flag--conflict">Conflicto</span> : null}
                  {table.available === 0 ? <span className="status-flag status-flag--full">Completa</span> : null}
                  {table.available > 0 && table.available <= 2 ? <span className="status-flag status-flag--tight">Poco margen</span> : null}
                </div>
                <p className="table-card__summary">
                  Usa el panel de mesa seleccionada para ajustar capacidad y mover invitados.
                </p>
                <div className="seat-ring">
                  {table.guests.length === 0 ? (
                    <p className="empty-state">Sin invitados asignados.</p>
                  ) : (
                    table.guests.map((guest) => (
                      <div className={`guest-chip ${conflictGuestIds.has(guest.id) ? "guest-chip--conflict" : ""}`} key={guest.id}>
                        <span>{guest.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            )) ?? <p className="empty-state">Aun no hay workspace cargado.</p>}
          </div>

          <div
            aria-hidden={!isListsPanelOpen}
            aria-label="Ajustar ancho de la columna derecha"
            aria-orientation="vertical"
            aria-valuemax={LISTS_PANEL_MAX_WIDTH}
            aria-valuemin={LISTS_PANEL_MIN_WIDTH}
            aria-valuenow={Math.round(listsPanelWidth)}
            className={`canvas__resizer ${isListsPanelOpen ? "" : "canvas__resizer--inactive"}`}
            onKeyDown={isListsPanelOpen ? handleListsPanelResizeKeyDown : undefined}
            onPointerDown={isListsPanelOpen ? startListsPanelResize : undefined}
            role="separator"
            tabIndex={isListsPanelOpen ? 0 : -1}
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
                        type="search"
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
                  <div>
                    <h3>Nuestros Invitados</h3>
                  </div>
                  <span>{(workspace?.guests.unassigned.length ?? 0) + (workspace?.guests.assigned.length ?? 0)}</span>
                </div>
                <section className="guest-salon__section">
                  <div className="guest-salon__section-header">
                    <div>
                      <h4>Por asignar</h4>
                      <p>Formato compacto para trabajar con listados largos.</p>
                    </div>
                    <span>
                      {filteredUnassignedGuests.length}/{workspace?.guests.unassigned.length ?? 0}
                    </span>
                  </div>
                  <div
                    className={`guest-table-shell ${isUnassignedDropActive ? "guest-table-shell--drop-active" : ""}`}
                    onDragLeave={handleUnassignedDragLeave}
                    onDragOver={handleUnassignedDragOver}
                    onDrop={handleUnassignedDrop}
                  >
                    {filteredUnassignedGuests.length > 0 ? (
                      <table className="guest-table">
                        <thead>
                          <tr>
                            <th>Invitado</th>
                            <th>Tipo</th>
                            <th>Agrupación</th>
                            <th>Mesa</th>
                            <th aria-label="Eliminar invitado" className="guest-table__action-column" />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUnassignedGuests.map((guest) => (
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
                  ) : (
                    <p className="empty-state empty-state--paper">
                      {guestSearchQuery ? "No encontramos a nadie con esa búsqueda." : "Todo el mundo tiene ya su lugar reservado."}
                    </p>
                  )}
                  </div>
                </section>
                <details className="guest-composer">
                  <summary className="guest-collapse__summary guest-collapse__summary--muted">
                    <div>
                      <h4>Añadir invitado</h4>
                      <p>Solo si necesitas incorporar a alguien manualmente.</p>
                    </div>
                  </summary>
                  <form className="stack-form stack-form--guest-salon" onSubmit={handleGuestCreate}>
                    <label className="mini-field">
                      <span>Nombre</span>
                      <input
                        data-testid="guest-name-input"
                        value={guestName}
                        aria-invalid={Boolean(guestFormError)}
                        onChange={(event) => setGuestName(event.target.value)}
                      />
                    </label>
                    <div className="mini-grid">
                      <label className="mini-field">
                        <span>Tipo</span>
                        <select value={guestType} onChange={(event) => setGuestType(event.target.value)}>
                          <option value="adulto">adulto</option>
                          <option value="adolescente">adolescente</option>
                          <option value="nino">nino</option>
                        </select>
                      </label>
                      <label className="mini-field">
                        <span>Agrupacion</span>
                        <input placeholder="opcional" value={guestGroupId} onChange={(event) => setGuestGroupId(event.target.value)} />
                      </label>
                    </div>
                    {guestFormError ? <p className="inline-feedback inline-feedback--error">{guestFormError}</p> : null}
                    <button className="button button--primary button--small" disabled={isActionRunning("create-guest")} type="submit">
                      {isActionRunning("create-guest") ? "Guardando..." : "Añadir invitado"}
                    </button>
                  </form>
                </details>
              </div>
            </section>

            <section className="list-card list-card--guests">
              <div className="list-card__header list-card__header--guests">
                <div>
                  <h3>Invitados ubicados</h3>
                </div>
                <span>
                  {filteredAssignedGuests.length}/{workspace?.guests.assigned.length ?? 0}
                </span>
              </div>
              <section className="guest-salon__section guest-salon__section--standalone">
                <div className="guest-salon__section-header">
                  <div>
                    <h4>Ya ubicados</h4>
                    <p>Vista densa para revisar rápidamente mesa, familia y acciones.</p>
                  </div>
                </div>
                <div className="guest-table-shell guest-table-shell--compact">
                  {filteredAssignedGuests.length > 0 ? (
                    <table className="guest-table guest-table--placed">
                      <thead>
                        <tr>
                          <th>Invitado</th>
                          <th>Tipo</th>
                          <th>Agrupación</th>
                          <th>Mesa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssignedGuests.map((guest) => {
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
                  ) : (
                    <p className="empty-state empty-state--paper">
                      {guestSearchQuery ? "No hay invitados ubicados con esa búsqueda." : "Todavía no hay invitados sentados."}
                    </p>
                  )}
                </div>
              </section>
            </section>

            <section className="list-card">
              <div className="list-card__header">
                <h3>Conflictos activos</h3>
                <span>{groupedConflictCount}</span>
              </div>
              <div className="guest-list">
                {workspace && groupedConflictCount > 0 ? (
                  Object.entries(workspace.validation.grouping_conflicts).map(([groupId, guestIds]) => (
                    <article className="conflict-row" key={groupId}>
                      <strong>Agrupacion {groupId}</strong>
                      <span>{guestIds.join(", ")}</span>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">Sin conflictos de agrupacion.</p>
                )}
              </div>
            </section>

              </>
            ) : null}
          </div>
        </section>

      </main>
    </div>
  );
}
