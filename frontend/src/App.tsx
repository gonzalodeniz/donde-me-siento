import { DragEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  assignGuest,
  createTable,
  createGuest,
  deleteGuest,
  deleteTable,
  fetchWorkspace,
  login,
  updateDefaultTableCapacity,
  updateGuest,
  updateTableCapacity,
  updateTablePosition,
} from "./api";
import { SeatingPlan } from "./components/SeatingPlan";
import type { Guest, Workspace } from "./types";

const TOKEN_STORAGE_KEY = "dms.auth.token";
const LISTS_PANEL_WIDTH_STORAGE_KEY = "dms.ui.listsPanelWidth";
const LOGIN_NAMES = ["raquel", "héctor"] as const;
const LISTS_PANEL_MIN_WIDTH = 280;
const LISTS_PANEL_MAX_WIDTH = 520;
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
  const [guestFormError, setGuestFormError] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editingGuestName, setEditingGuestName] = useState("");
  const [editingGuestType, setEditingGuestType] = useState("adulto");
  const [editingGuestGroupId, setEditingGuestGroupId] = useState("");
  const [editingGuestError, setEditingGuestError] = useState<string | null>(null);
  const [assignmentValues, setAssignmentValues] = useState<Record<string, string>>({});
  const [selectedTableId, setSelectedTableId] = useState<string | null | undefined>(undefined);
  const [pendingTableRemovalId, setPendingTableRemovalId] = useState<string | null>(null);
  const [draggedGuestId, setDraggedGuestId] = useState<string | null>(null);
  const [activeDropSeat, setActiveDropSeat] = useState<SeatTarget | null>(null);
  const [isRailOpen, setIsRailOpen] = useState(true);
  const [optimisticTablePositions, setOptimisticTablePositions] = useState<Record<string, TablePosition>>({});
  const [listsPanelWidth, setListsPanelWidth] = useState<number>(() => {
    const storedWidth = Number(localStorage.getItem(LISTS_PANEL_WIDTH_STORAGE_KEY));

    if (Number.isFinite(storedWidth) && storedWidth >= LISTS_PANEL_MIN_WIDTH && storedWidth <= LISTS_PANEL_MAX_WIDTH) {
      return storedWidth;
    }

    return 320;
  });
  const [isResizingListsPanel, setIsResizingListsPanel] = useState(false);
  const [sectionNotices, setSectionNotices] = useState<Record<SectionKey, SectionNotice | null>>({
    guests: null,
    tables: null,
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
    localStorage.setItem(LISTS_PANEL_WIDTH_STORAGE_KEY, String(listsPanelWidth));
  }, [listsPanelWidth]);

  useEffect(() => {
    if (!isResizingListsPanel) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) {
        return;
      }

      const maxWidth = Math.min(LISTS_PANEL_MAX_WIDTH, Math.max(LISTS_PANEL_MIN_WIDTH, canvasRect.width - 360));
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
  }, [isResizingListsPanel]);

  useEffect(() => {
    if (!token) {
      setWorkspace(null);
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
        const nextWorkspace = await fetchWorkspace(activeToken);
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setWorkspace(nextWorkspace);
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
      setOptimisticTablePositions({});
      return;
    }

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
  }, [pendingTableRemovalId, selectedTableId, workspace]);

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
      ? Math.min(LISTS_PANEL_MAX_WIDTH, Math.max(LISTS_PANEL_MIN_WIDTH, canvasRect.width - 360))
      : LISTS_PANEL_MAX_WIDTH;

    return Math.min(Math.max(nextWidth, LISTS_PANEL_MIN_WIDTH), maxWidth);
  }

  function startListsPanelResize() {
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

  function beginGuestEdit(guest: Guest) {
    setEditingGuestId(guest.id);
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

  function renderInlineGuestEditor(guest: Guest, tableLabel?: string | null) {
    const isSaving = isActionRunning(`update-${guest.id}`);

    return (
      <form
        className={`guest-inline-editor ${tableLabel ? "guest-inline-editor--placed" : ""}`}
        onSubmit={handleGuestUpdate}
      >
        <div className="guest-inline-editor__header">
          <strong>{tableLabel ? `Editar a ${guest.name}` : `Editar ${guest.name}`}</strong>
          {tableLabel ? <span className="guest-row__table">{tableLabel}</span> : null}
        </div>
        <label className="mini-field">
          <span>Nombre</span>
          <input
            aria-invalid={Boolean(editingGuestError)}
            autoFocus
            onChange={(event) => setEditingGuestName(event.target.value)}
            value={editingGuestName}
          />
        </label>
        <div className="mini-grid">
          <label className="mini-field">
            <span>Tipo</span>
            <select value={editingGuestType} onChange={(event) => setEditingGuestType(event.target.value)}>
              <option value="adulto">adulto</option>
              <option value="adolescente">adolescente</option>
              <option value="nino">nino</option>
            </select>
          </label>
          <label className="mini-field">
            <span>Agrupacion</span>
            <input onChange={(event) => setEditingGuestGroupId(event.target.value)} value={editingGuestGroupId} />
          </label>
        </div>
        {editingGuestError ? <p className="inline-feedback inline-feedback--error">{editingGuestError}</p> : null}
        <div className="guest-inline-editor__actions">
          <button className="button button--ghost button--small" onClick={cancelGuestEdit} type="button">
            Cancelar
          </button>
          <button className="button button--primary button--small" disabled={isSaving} type="submit">
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    );
  }

  function setSectionNotice(section: SectionKey, tone: SectionTone, message: string) {
    setSectionNotices((current) => ({ ...current, [section]: { tone, message } }));
  }

  function clearSectionNotice(section: SectionKey) {
    setSectionNotices((current) => ({ ...current, [section]: null }));
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
    const nextWorkspace = await fetchWorkspace(activeToken);
    startTransition(() => {
      setWorkspace(nextWorkspace);
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

  async function handleGuestUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !editingGuestId) {
      return;
    }

    const normalizedGuestName = normalizeText(editingGuestName);
    if (!normalizedGuestName) {
      setEditingGuestError("El invitado necesita un nombre para guardar cambios.");
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
          group_id: normalizeText(editingGuestGroupId) || null,
        }),
      "Invitado actualizado.",
    );
    if (updated) {
      cancelGuestEdit();
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
  }

  function handleSeatDragEnter(tableId: string, seatIndex: number) {
    if (!draggedGuestId) {
      return;
    }
    setActiveDropSeat({ tableId, seatIndex });
    setSelectedTableId(tableId);
  }

  function selectOrClearTable(tableId: string) {
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
    <div className={`shell ${isRailOpen ? "" : "shell--rail-collapsed"}`}>
      <div className="shell__backdrop shell__backdrop--one" />
      <div className="shell__backdrop shell__backdrop--two" />
      <aside className={`rail ${isRailOpen ? "" : "rail--collapsed"}`}>
        <div className="rail__inner">
          <p className="eyebrow">Donde me siento</p>
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
            {sectionNotices.tables ? (
              <div className={`inline-notice inline-notice--${sectionNotices.tables.tone}`}>
                {sectionNotices.tables.message}
              </div>
            ) : null}
            <div className="rail-section">
              <div className="rail-section__header">
                <div>
                  <p className="eyebrow eyebrow--compact">Mesa seleccionada</p>
                  <h2>Ajustes de Mesa seleccionada</h2>
                </div>
              </div>
              {selectedTable ? (
                <div className="rail-table-settings">
                  <div className="rail-table-settings__meta">
                    <span>Mesa {selectedTable.number}</span>
                    <strong>{selectedTable.occupied} sentados</strong>
                  </div>
                  <button
                    className="button button--link button--small"
                    onClick={() => setSelectedTableId(null)}
                    type="button"
                  >
                    Ajustar asientos generales
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
                  {pendingTableRemovalId === selectedTable.id ? (
                    <div className="rail-table-settings__confirm">
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
                        {isActionRunning(`remove-table-${selectedTable.id}`) ? "Quitando..." : "Confirmar retirada"}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button--quiet button--small"
                      onClick={() => setPendingTableRemovalId(selectedTable.id)}
                      type="button"
                    >
                      Quitar mesa
                    </button>
                  )}
                </div>
              ) : (
                <div className="rail-table-settings">
                  <p className="section-copy">Sin mesa seleccionada. Estos asientos se aplicarán a cada mesa nueva.</p>
                  <button
                    className="button button--ghost button--small"
                    disabled={isActionRunning("create-table")}
                    onClick={() =>
                      void runWorkspaceAction(
                        "create-table",
                        "tables",
                        () => createTable(token ?? ""),
                        "Nuestra nueva mesa ya forma parte del salón.",
                      )
                    }
                    type="button"
                  >
                    {isActionRunning("create-table") ? "Creando mesa..." : "Crear Nuestra Mesa"}
                  </button>
                  <div className="stepper" aria-label="Asientos generales">
                    <button
                      className="stepper__button"
                      disabled={isActionRunning("default-table-capacity") || (workspace?.default_table_capacity ?? 1) <= 1}
                      onClick={() =>
                        void runWorkspaceAction(
                          "default-table-capacity",
                          "tables",
                          () => updateDefaultTableCapacity((workspace?.default_table_capacity ?? 1) - 1, token ?? ""),
                          "Los asientos generales para nuevas mesas se han ajustado.",
                        )
                      }
                      type="button"
                    >
                      -
                    </button>
                    <div className="stepper__value stepper__value--stacked">
                      <span className="stepper__caption">Asientos generales</span>
                      <strong>{workspace?.default_table_capacity ?? 0}</strong>
                    </div>
                    <button
                      className="stepper__button"
                      disabled={isActionRunning("default-table-capacity")}
                      onClick={() =>
                        void runWorkspaceAction(
                          "default-table-capacity",
                          "tables",
                          () => updateDefaultTableCapacity((workspace?.default_table_capacity ?? 0) + 1, token ?? ""),
                          "Los asientos generales para nuevas mesas se han ajustado.",
                        )
                      }
                      type="button"
                    >
                      +
                    </button>
                  </div>
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
                      onClick={() => selectOrClearTable(table.id)}
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
          </section>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar__brand" />
          <div className="topbar__center">
            <span className="topbar__couple">Héctor & Raquel</span>
          </div>
          <div className="topbar__session">
            <button className="button button--link button--small" onClick={handleLogout} type="button">
              Salir
            </button>
          </div>
        </header>

        {errorMessage ? <div className="banner banner--error">{errorMessage}</div> : null}
        {loadingWorkspace ? <div className="banner">Actualizando workspace...</div> : null}

        <section
          ref={canvasRef}
          className={`canvas ${isResizingListsPanel ? "canvas--resizing" : ""}`}
          style={{ gridTemplateColumns: `minmax(0, 1fr) 0.85rem minmax(${LISTS_PANEL_MIN_WIDTH}px, ${listsPanelWidth}px)` }}
        >
          <div className={`canvas__tables ${tablesSectionBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={tablesSectionBusy}>
            {workspace ? (
              <SeatingPlan
                activeDropSeat={activeDropSeat}
                draggedGuestName={draggedGuest?.name ?? null}
                onGuestDragEnd={handleGuestDragEnd}
                onGuestDragStart={handleGuestDragStart}
                onMoveTable={handleTableMove}
                onSelectTable={selectOrClearTable}
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
                onClick={() => selectOrClearTable(table.id)}
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
            aria-label="Ajustar ancho de la columna derecha"
            aria-orientation="vertical"
            aria-valuemax={LISTS_PANEL_MAX_WIDTH}
            aria-valuemin={LISTS_PANEL_MIN_WIDTH}
            aria-valuenow={Math.round(listsPanelWidth)}
            className="canvas__resizer"
            onKeyDown={handleListsPanelResizeKeyDown}
            onPointerDown={startListsPanelResize}
            role="separator"
            tabIndex={0}
          />

          <div className={`lists-panel ${guestSectionBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={guestSectionBusy}>
            <section className="list-card list-card--guests">
              <div data-testid="unassigned-guests-panel">
                {sectionNotices.guests ? (
                  <div className={`inline-notice inline-notice--${sectionNotices.guests.tone}`}>
                    {sectionNotices.guests.message}
                  </div>
                ) : null}
                <div className="list-card__header list-card__header--guests">
                  <div>
                    <h3>Nuestros Invitados</h3>
                  </div>
                  <span>{(workspace?.guests.unassigned.length ?? 0) + (workspace?.guests.assigned.length ?? 0)}</span>
                </div>
                <label className="guest-search">
                  <input
                    onChange={(event) => setGuestSearchQuery(event.target.value)}
                    placeholder="Encuentra a un ser querido..."
                    type="search"
                    value={guestSearchQuery}
                  />
                </label>
                <section className="guest-salon__section">
                  <div className="guest-salon__section-header">
                    <div>
                      <h4>Por asignar</h4>
                      <p>Etiquetas listas para llevar al plano.</p>
                    </div>
                    <span>
                      {filteredUnassignedGuests.length}/{workspace?.guests.unassigned.length ?? 0}
                    </span>
                  </div>
                  <div className="guest-list guest-list--paper">
                    {filteredUnassignedGuests.length > 0 ? (
                      filteredUnassignedGuests.map((guest) => (
                      <article
                        className={`guest-card guest-card--paper ${conflictGuestIds.has(guest.id) ? "guest-card--conflict" : ""} ${draggedGuestId === guest.id ? "guest-card--dragging" : ""}`}
                        data-testid={`unassigned-guest-${guest.id}`}
                        key={guest.id}
                        draggable
                        onDragEnd={handleGuestDragEnd}
                        onDragStart={(event) => handleGuestDragStart(event, guest.id)}
                      >
                        {editingGuestId === guest.id ? (
                          renderInlineGuestEditor(guest)
                        ) : (
                          <>
                            <div className="guest-card__header guest-card__header--paper">
                              <div className="guest-card__identity">
                                <button className="guest-name-button" onClick={() => beginGuestEdit(guest)} type="button">
                                  <span className="guest-card__nameplate">
                                    <strong>{guest.name}</strong>
                                    <GuestSignal guest={guest} />
                                  </span>
                                </button>
                                <span>{guest.group_id ? `Agrupación ${guest.group_id}` : "Sin agrupación"}</span>
                              </div>
                              <span className="guest-card__type">{formatGuestTypeLabel(guest.guest_type)}</span>
                            </div>
                            {draggedGuestId === guest.id ? (
                              <div className="guest-card__drag-hint">En movimiento: suelta esta tarjeta sobre una mesa.</div>
                            ) : (
                              <p className="guest-card__dragline">Lista para llevar al salón.</p>
                            )}
                            <div className="guest-card__actions guest-card__actions--paper">
                              <select
                                aria-label={`Elegir mesa para ${guest.name}`}
                                value={assignmentValues[guest.id] ?? ""}
                                onChange={(event) =>
                                  setAssignmentValues((current) => ({ ...current, [guest.id]: event.target.value }))
                                }
                              >
                                <option value="">Elegir mesa</option>
                                {workspace?.tables.map((table) => (
                                  <option key={table.id} value={table.id}>
                                    Mesa {table.number}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="button button--ghost button--small"
                                disabled={!assignmentValues[guest.id] || isActionRunning(`assign-${guest.id}`)}
                                onClick={() =>
                                  void runWorkspaceAction(
                                    `assign-${guest.id}`,
                                    "guests",
                                    () => assignGuest(guest.id, assignmentValues[guest.id], null, token ?? ""),
                                    `${guest.name} asignado correctamente.`,
                                  )
                                }
                                type="button"
                              >
                                Ubicar
                              </button>
                              <button
                                className="button button--ghost button--small"
                                disabled={isActionRunning(`delete-${guest.id}`)}
                                onClick={() =>
                                  void runWorkspaceAction(
                                    `delete-${guest.id}`,
                                    "guests",
                                    () => deleteGuest(guest.id, token ?? ""),
                                    `${guest.name} eliminado.`,
                                  )
                                }
                                type="button"
                              >
                                Eliminar
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ))
                  ) : (
                    <p className="empty-state empty-state--paper">
                      {guestSearchQuery ? "No encontramos a nadie con esa búsqueda." : "Todo el mundo tiene ya su lugar reservado."}
                    </p>
                  )}
                  </div>
                </section>

                <details className="guest-collapse guest-salon__section guest-salon__section--compact">
                  <summary className="guest-collapse__summary">
                    <div>
                      <h4>Ya ubicados</h4>
                      <p>Un bloque discreto para quienes ya tienen mesa.</p>
                    </div>
                    <span>
                      {filteredAssignedGuests.length}/{workspace?.guests.assigned.length ?? 0}
                    </span>
                  </summary>
                  <div className="guest-collapse__content">
                    <div className="guest-list guest-list--compact">
                      {filteredAssignedGuests.length > 0 ? (
                        filteredAssignedGuests.map((guest) => {
                          const tableNumber = guest.table_id ? tableNumberById.get(guest.table_id) : null;

                          return (
                            <article
                              className={`guest-row guest-row--placed ${conflictGuestIds.has(guest.id) ? "guest-row--conflict" : ""}`}
                              key={guest.id}
                            >
                              {editingGuestId === guest.id ? (
                                renderInlineGuestEditor(guest, tableNumber ? `Mesa ${tableNumber}` : "Mesa asignada")
                              ) : (
                                <>
                                  <div className="guest-row__identity">
                                    <button className="guest-name-button" onClick={() => beginGuestEdit(guest)} type="button">
                                      <span className="guest-card__nameplate">
                                        <strong>{guest.name}</strong>
                                        <GuestSignal guest={guest} />
                                      </span>
                                    </button>
                                    <span>{guest.group_id ? `Agrupación ${guest.group_id}` : formatGuestTypeLabel(guest.guest_type)}</span>
                                  </div>
                                  <span className="guest-row__table">{tableNumber ? `Mesa ${tableNumber}` : "Mesa asignada"}</span>
                                </>
                              )}
                            </article>
                          );
                        })
                      ) : (
                        <p className="empty-state empty-state--paper">
                          {guestSearchQuery ? "No hay invitados ubicados con esa búsqueda." : "Todavía no hay invitados sentados."}
                        </p>
                      )}
                    </div>
                  </div>
                </details>

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
          </div>
        </section>

      </main>
    </div>
  );
}
