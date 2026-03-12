import { DragEvent, FormEvent, startTransition, useEffect, useMemo, useState } from "react";

import {
  assignGuest,
  createGuest,
  deleteGuest,
  fetchWorkspace,
  login,
  unassignGuest,
  updateGuest,
  updateTableCapacity,
} from "./api";
import { SeatingPlan } from "./components/SeatingPlan";
import type { Guest, Workspace } from "./types";

const TOKEN_STORAGE_KEY = "dms.auth.token";
const LOGIN_NAMES = ["raquel", "héctor"] as const;
type SectionTone = "success" | "error" | "info";
type SectionKey = "guests" | "tables";
type SectionNotice = {
  tone: SectionTone;
  message: string;
};

function normalizeText(value: string) {
  return value.trim();
}

function randomLoginName() {
  return LOGIN_NAMES[Math.floor(Math.random() * LOGIN_NAMES.length)];
}

export function App() {
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
  const [guestFormError, setGuestFormError] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editingGuestName, setEditingGuestName] = useState("");
  const [editingGuestType, setEditingGuestType] = useState("adulto");
  const [editingGuestGroupId, setEditingGuestGroupId] = useState("");
  const [editingGuestError, setEditingGuestError] = useState<string | null>(null);
  const [assignmentValues, setAssignmentValues] = useState<Record<string, string>>({});
  const [capacityValues, setCapacityValues] = useState<Record<string, string>>({});
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [draggedGuestId, setDraggedGuestId] = useState<string | null>(null);
  const [activeDropTableId, setActiveDropTableId] = useState<string | null>(null);
  const [sectionNotices, setSectionNotices] = useState<Record<SectionKey, SectionNotice | null>>({
    guests: null,
    tables: null,
  });

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
  const conflictTableIds = useMemo(
    () =>
      new Set(
        workspace?.tables
          .filter((table) => table.guests.some((guest) => conflictGuestIds.has(guest.id)))
          .map((table) => table.id) ?? [],
      ),
    [conflictGuestIds, workspace],
  );
  const attentionTableCount = useMemo(
    () =>
      workspace?.tables.filter((table) => table.available === 0 || conflictTableIds.has(table.id)).length ?? 0,
    [conflictTableIds, workspace],
  );
  const selectedTableHasConflict = selectedTable
    ? selectedTable.guests.some((guest) => conflictGuestIds.has(guest.id))
    : false;
  const selectedTableIsFull = selectedTable ? selectedTable.available === 0 : false;
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
        submittingAction.startsWith("unassign-") ||
        submittingAction.startsWith("assign-dnd-")));

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
        setCapacityValues(
          Object.fromEntries(nextWorkspace.tables.map((table) => [table.id, String(table.capacity)])),
        );
        setSelectedTableId((currentSelected) => currentSelected ?? nextWorkspace.tables[0]?.id ?? null);
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
      setSelectedTableId(null);
      setActiveDropTableId(null);
      setDraggedGuestId(null);
      return;
    }

    const selectedStillExists = workspace.tables.some((table) => table.id === selectedTableId);
    if (!selectedStillExists) {
      setSelectedTableId(workspace.tables[0]?.id ?? null);
    }
  }, [selectedTableId, workspace]);

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

  function setSectionNotice(section: SectionKey, tone: SectionTone, message: string) {
    setSectionNotices((current) => ({ ...current, [section]: { tone, message } }));
  }

  function clearSectionNotice(section: SectionKey) {
    setSectionNotices((current) => ({ ...current, [section]: null }));
  }

  async function refreshWorkspaceState(activeToken: string) {
    const nextWorkspace = await fetchWorkspace(activeToken);
    startTransition(() => {
      setWorkspace(nextWorkspace);
    });
    setCapacityValues(
      Object.fromEntries(nextWorkspace.tables.map((table) => [table.id, String(table.capacity)])),
    );
    setSelectedTableId((currentSelected) => currentSelected ?? nextWorkspace.tables[0]?.id ?? null);
  }

  async function runWorkspaceAction(
    actionKey: string,
    section: SectionKey,
    action: () => Promise<void>,
    message: string,
  ) {
    if (!token) {
      return;
    }

    setSubmittingAction(actionKey);
    setErrorMessage(null);
    clearSectionNotice(section);

    try {
      await action();
      await refreshWorkspaceState(token);
      setSectionNotice(section, "success", message);
    } catch (error) {
      setSectionNotice(
        section,
        "error",
        error instanceof Error ? error.message : "No se pudo completar la accion.",
      );
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

    await runWorkspaceAction(
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
    setGuestName("");
    setGuestType("adulto");
    setGuestGroupId("");
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

    await runWorkspaceAction(
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
    cancelGuestEdit();
  }

  function isActionRunning(actionKey: string) {
    return submittingAction === actionKey;
  }

  function handleGuestDragStart(event: DragEvent<HTMLElement>, guestId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", guestId);
    setDraggedGuestId(guestId);
    clearSectionNotice("tables");
  }

  function handleGuestDragEnd() {
    setDraggedGuestId(null);
    setActiveDropTableId(null);
  }

  function handleTableDragEnter(tableId: string) {
    if (!draggedGuestId) {
      return;
    }
    setActiveDropTableId(tableId);
    setSelectedTableId(tableId);
  }

  function handleTableDragLeave(tableId: string) {
    if (activeDropTableId === tableId) {
      setActiveDropTableId(null);
    }
  }

  function handleTableDrop(tableId: string, droppedGuestIdFromEvent: string | null) {
    const droppedGuestId = droppedGuestIdFromEvent ?? draggedGuestId;
    if (!workspace || !droppedGuestId) {
      return;
    }

    const guest = workspace.guests.unassigned.find((currentGuest) => currentGuest.id === droppedGuestId);
    setDraggedGuestId(null);
    setActiveDropTableId(null);

    if (!guest) {
      return;
    }

    void runWorkspaceAction(
      `assign-dnd-${droppedGuestId}`,
      "tables",
      () => assignGuest(droppedGuestId, tableId, token ?? ""),
      `${guest.name} asignado mediante arrastrar y soltar.`,
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
    <div className="shell">
      <div className="shell__backdrop shell__backdrop--one" />
      <div className="shell__backdrop shell__backdrop--two" />
      <aside className="rail">
        <p className="eyebrow">Donde me siento</p>
        <h1 className="rail__title">Diseño del Salón</h1>
        <p className="rail__copy">
          El frontend trabaja siempre sobre un unico workspace persistente del backend.
        </p>

        <section className="events-panel">
          <div className="rail-section rail-section--session">
            <div className="rail-section__header">
              <div>
                <p className="eyebrow eyebrow--compact">Workspace</p>
                <h2>{workspace?.name ?? "Cargando workspace"}</h2>
              </div>
            </div>
            <p className="section-copy">
              Siempre trabajas sobre el mismo workspace persistente. No hay selector ni borrado de eventos.
            </p>
          </div>
          <div className="rail-divider" />
          <div className="rail-section">
            <div className="rail-section__header">
              <div>
                <p className="eyebrow eyebrow--compact">Resumen</p>
                <h2>Estado actual</h2>
              </div>
            </div>
            <p className="section-copy">
              {workspace
                ? `${workspace.tables.length} mesas, ${workspace.guests.assigned.length} invitados asignados y ${workspace.guests.unassigned.length} pendientes.`
                : "Recuperando datos del workspace unico."}
            </p>
          </div>
        </section>
      </aside>

      <main className="workspace">
        <div className="workspace__utility">
          <button className="button button--link" onClick={handleLogout} type="button">
            Cerrar sesion
          </button>
        </div>
        <header className="workspace__hero">
          <div>
            <p className="eyebrow">Workspace agregado</p>
            <h2>{workspace?.name ?? "Workspace unico"}</h2>
            <p className="workspace__copy">
              Mesas, invitados y validacion llegan del backend en una sola llamada.
            </p>
          </div>
          <div className="metrics">
            <article className="metric-tile">
              <span>Asignados</span>
              <strong>{workspace?.validation.assigned_guests ?? 0}</strong>
            </article>
            <article className="metric-tile">
              <span>Sin asiento</span>
              <strong>{workspace?.validation.unassigned_guests ?? 0}</strong>
            </article>
            <article className="metric-tile metric-tile--accent">
              <span>Conflictos</span>
              <strong>{groupedConflictCount}</strong>
            </article>
          </div>
        </header>

        {workspace ? (
          <section className="attention-strip" aria-label="Alertas de workspace">
            <article className={`attention-strip__item ${groupedConflictCount > 0 ? "attention-strip__item--alert" : ""}`}>
              <span>Conflictos de agrupacion</span>
              <strong>{groupedConflictCount}</strong>
              <p>{groupedConflictCount > 0 ? "Revisa mesas con invitados marcados en cobre." : "No hay separaciones activas."}</p>
            </article>
            <article className={`attention-strip__item ${fullTablesCount > 0 ? "attention-strip__item--alert" : ""}`}>
              <span>Mesas sin margen</span>
              <strong>{fullTablesCount}</strong>
              <p>{fullTablesCount > 0 ? "No admiten mas invitados sin tocar capacidad." : "Todas mantienen al menos un asiento libre."}</p>
            </article>
            <article className={`attention-strip__item ${attentionTableCount > 0 ? "attention-strip__item--accent" : ""}`}>
              <span>Mesas a revisar</span>
              <strong>{attentionTableCount}</strong>
              <p>{attentionTableCount > 0 ? "El resumen prioriza conflicto y aforo completo." : "El salon esta estable ahora mismo."}</p>
            </article>
          </section>
        ) : null}

        {errorMessage ? <div className="banner banner--error">{errorMessage}</div> : null}
        {loadingWorkspace ? <div className="banner">Actualizando workspace...</div> : null}

        <section className="canvas">
          <div className={`canvas__tables ${tablesSectionBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={tablesSectionBusy}>
            {sectionNotices.tables ? (
              <div className={`inline-notice inline-notice--${sectionNotices.tables.tone} inline-notice--floating`}>
                {sectionNotices.tables.message}
              </div>
            ) : null}
            {workspace ? (
              <SeatingPlan
                activeDropTableId={activeDropTableId}
                draggedGuestName={draggedGuest?.name ?? null}
                onSelectTable={setSelectedTableId}
                onTableDragEnter={handleTableDragEnter}
                onTableDragLeave={handleTableDragLeave}
                onTableDrop={handleTableDrop}
                selectedTableId={selectedTableId}
                workspace={workspace}
              />
            ) : null}
            {workspace?.tables.map((table) => (
              <article
                className={`table-card ${selectedTableId === table.id ? "table-card--selected" : ""} ${table.available === 0 ? "table-card--full" : ""} ${conflictTableIds.has(table.id) ? "table-card--conflict" : ""}`}
                data-testid={`table-card-${table.id}`}
                key={table.id}
                onClick={() => setSelectedTableId(table.id)}
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

          <div className={`lists-panel ${guestSectionBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={guestSectionBusy}>
            <section className="control-card">
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
                      onClick={() => setSelectedTableId(table.id)}
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

            <section className="control-card">
              <div className="list-card__header">
                <h3>Mesa seleccionada</h3>
                <span>{selectedTable ? `Mesa ${selectedTable.number}` : "Sin seleccion"}</span>
              </div>
              {selectedTable ? (
                <div className="selected-table-panel">
                  <div className={`selected-table-panel__hero ${selectedTableHasConflict ? "selected-table-panel__hero--conflict" : ""} ${selectedTableIsFull ? "selected-table-panel__hero--full" : ""}`}>
                    <strong>{selectedTable.occupied}/{selectedTable.capacity}</strong>
                    <span>{selectedTable.available} asientos libres</span>
                  </div>
                  {(selectedTableHasConflict || selectedTableIsFull) ? (
                    <div className="selected-table-panel__alerts">
                      {selectedTableHasConflict ? (
                        <div className="inline-notice inline-notice--error">
                          Esta mesa tiene invitados con conflicto de agrupacion. Revisa la composicion antes de cerrar.
                        </div>
                      ) : null}
                      {selectedTableIsFull ? (
                        <div className="inline-notice inline-notice--info">
                          Esta mesa esta completa. Para seguir asignando aqui necesitas liberar asiento o subir capacidad.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <form
                    className="selected-table-panel__controls"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const nextCapacity = Number(capacityValues[selectedTable.id] ?? selectedTable.capacity);
                      if (!Number.isInteger(nextCapacity) || nextCapacity < selectedTable.occupied || nextCapacity <= 0) {
                        setSectionNotice(
                          "tables",
                          "error",
                          `Mesa ${selectedTable.number}: la capacidad debe ser un entero y no puede bajar de ${selectedTable.occupied}.`,
                        );
                        return;
                      }
                      void runWorkspaceAction(
                        `capacity-${selectedTable.id}`,
                        "tables",
                        () => updateTableCapacity(selectedTable.id, nextCapacity, token ?? ""),
                        `Capacidad de la mesa ${selectedTable.number} actualizada.`,
                      );
                    }}
                  >
                    <label className="mini-field">
                      <span>Capacidad de trabajo</span>
                      <input
                        min={1}
                        type="number"
                        value={capacityValues[selectedTable.id] ?? String(selectedTable.capacity)}
                        onChange={(event) =>
                          setCapacityValues((current) => ({ ...current, [selectedTable.id]: event.target.value }))
                        }
                      />
                    </label>
                    <button
                      className="button button--ghost button--small"
                      disabled={isActionRunning(`capacity-${selectedTable.id}`)}
                      type="submit"
                    >
                      {isActionRunning(`capacity-${selectedTable.id}`) ? "Guardando..." : "Guardar capacidad"}
                    </button>
                  </form>
                  <p className="selected-table-panel__hint">
                    Aqui vive la operativa de mesa: ajustar aforo y devolver invitados a la lista sin asignar.
                  </p>
                  <div className="selected-table-panel__guests">
                    {selectedTable.guests.length > 0 ? (
                      selectedTable.guests.map((guest) => (
                        <article className={`selected-guest ${conflictGuestIds.has(guest.id) ? "selected-guest--conflict" : ""}`} key={guest.id}>
                          <div>
                            <strong>{guest.name}</strong>
                            <span>{guest.group_id ? `Agrupacion ${guest.group_id}` : guest.guest_type}</span>
                          </div>
                          <button
                            className="button button--ghost button--small"
                            disabled={isActionRunning(`unassign-${guest.id}`)}
                            onClick={() =>
                              void runWorkspaceAction(
                                `unassign-${guest.id}`,
                                "tables",
                                () => unassignGuest(guest.id, token ?? ""),
                                `${guest.name} vuelve a la lista sin asignar.`,
                              )
                            }
                            type="button"
                          >
                            {isActionRunning(`unassign-${guest.id}`) ? "Quitando..." : "Quitar de mesa"}
                          </button>
                        </article>
                      ))
                    ) : (
                      <p className="empty-state">La mesa seleccionada todavia no tiene invitados.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="empty-state">Selecciona una mesa desde el plano o el resumen.</p>
              )}
            </section>

            <section className="list-card">
              <div data-testid="unassigned-guests-panel">
                {sectionNotices.guests ? (
                  <div className={`inline-notice inline-notice--${sectionNotices.guests.tone}`}>
                    {sectionNotices.guests.message}
                  </div>
                ) : null}
                <div className="list-card__header">
                  <h3>Sin asignar</h3>
                  <span>{workspace?.guests.unassigned.length ?? 0}</span>
                </div>
                <p className="microcopy">
                  Arrastra un invitado hacia el plano. Cuando entres en modo arrastre, las mesas mostraran su zona de recepcion.
                </p>
                <form className="stack-form" onSubmit={handleGuestCreate}>
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
                    {isActionRunning("create-guest") ? "Guardando..." : "Anadir invitado"}
                  </button>
                </form>
                <div className="guest-list">
                  {workspace && workspace.guests.unassigned.length > 0 ? (
                    workspace.guests.unassigned.map((guest) => (
                      <article
                        className={`guest-card ${conflictGuestIds.has(guest.id) ? "guest-card--conflict" : ""} ${draggedGuestId === guest.id ? "guest-card--dragging" : ""}`}
                        data-testid={`unassigned-guest-${guest.id}`}
                        key={guest.id}
                        draggable
                        onDragEnd={handleGuestDragEnd}
                        onDragStart={(event) => handleGuestDragStart(event, guest.id)}
                      >
                        <div className="guest-card__header">
                          <strong>{guest.name}</strong>
                          <span>{guest.guest_type}</span>
                        </div>
                        {draggedGuestId === guest.id ? (
                          <div className="guest-card__drag-hint">En movimiento: suelta esta tarjeta sobre una mesa.</div>
                        ) : null}
                        <div className="guest-card__meta">
                          <span>{guest.group_id ? `Agrupacion ${guest.group_id}` : "Sin agrupacion"}</span>
                        </div>
                        <div className="guest-card__actions">
                          <select
                            value={assignmentValues[guest.id] ?? ""}
                            onChange={(event) =>
                              setAssignmentValues((current) => ({ ...current, [guest.id]: event.target.value }))
                            }
                          >
                            <option value="">Asignar a mesa</option>
                            {workspace.tables.map((table) => (
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
                                () => assignGuest(guest.id, assignmentValues[guest.id], token ?? ""),
                                `${guest.name} asignado correctamente.`,
                              )
                            }
                            type="button"
                          >
                            Asignar
                          </button>
                          <button className="button button--ghost button--small" onClick={() => beginGuestEdit(guest)} type="button">
                            Editar
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
                      </article>
                    ))
                  ) : (
                    <p className="empty-state">Nada pendiente.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="list-card">
              <div className="list-card__header">
                <h3>Asignados</h3>
                <span>{workspace?.guests.assigned.length ?? 0}</span>
              </div>
              <p className="microcopy">
                Esta lista es solo de lectura. Para liberar un asiento, usa el panel de mesa seleccionada.
              </p>
              <div className="guest-list">
                {workspace && workspace.guests.assigned.length > 0 ? (
                  workspace.guests.assigned.map((guest) => (
                    <article className={`guest-row ${conflictGuestIds.has(guest.id) ? "guest-row--conflict" : ""}`} key={guest.id}>
                      <strong>{guest.name}</strong>
                      <span>{guest.table_id}</span>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">Todavia no hay invitados sentados.</p>
                )}
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

        {editingGuestId ? (
          <section className="editor-card">
            <div className="list-card__header">
              <h3>Editar invitado</h3>
              <button className="button button--ghost button--small" onClick={cancelGuestEdit} type="button">
                Cancelar
              </button>
            </div>
            <form className="stack-form" onSubmit={handleGuestUpdate}>
              <label className="mini-field">
                <span>Nombre</span>
                <input value={editingGuestName} aria-invalid={Boolean(editingGuestError)} onChange={(event) => setEditingGuestName(event.target.value)} />
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
                  <input value={editingGuestGroupId} onChange={(event) => setEditingGuestGroupId(event.target.value)} />
                </label>
              </div>
              {editingGuestError ? <p className="inline-feedback inline-feedback--error">{editingGuestError}</p> : null}
              <button className="button button--primary button--small" disabled={isActionRunning(`update-${editingGuestId}`)} type="submit">
                {isActionRunning(`update-${editingGuestId}`) ? "Guardando..." : "Guardar cambios"}
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
