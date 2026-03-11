import { DragEvent, FormEvent, useEffect, useMemo, useState, startTransition } from "react";

import {
  assignGuest,
  createEvent,
  createGuest,
  deleteEvent,
  deleteGuest,
  fetchEvents,
  fetchWorkspace,
  login,
  unassignGuest,
  updateGuest,
  updateTableCapacity,
} from "./api";
import { SeatingPlan } from "./components/SeatingPlan";
import type { EventSummary, Guest, Workspace } from "./types";

const TOKEN_STORAGE_KEY = "dms.auth.token";
type SectionTone = "success" | "error" | "info";
type SectionKey = "events" | "guests" | "tables";
type SectionNotice = {
  tone: SectionTone;
  message: string;
};

function metricLabel(total: number, singular: string, plural: string) {
  return `${total} ${total === 1 ? singular : plural}`;
}

function normalizeText(value: string) {
  return value.trim();
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function App() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin1234");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventTableCount, setEventTableCount] = useState("8");
  const [eventDefaultCapacity, setEventDefaultCapacity] = useState("10");
  const [eventFormError, setEventFormError] = useState<string | null>(null);
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
  const [eventPendingDeleteId, setEventPendingDeleteId] = useState<string | null>(null);
  const [sectionNotices, setSectionNotices] = useState<Record<SectionKey, SectionNotice | null>>({
    events: null,
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
  const railBusy =
    loadingAuth ||
    submittingAction === "create-event" ||
    (submittingAction !== null && submittingAction.startsWith("delete-event-"));
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
      setEvents([]);
      setSelectedEventId(null);
      setWorkspace(null);
      setSectionNotices({ events: null, guests: null, tables: null });
      return;
    }

    const activeToken = token;
    let cancelled = false;

    async function loadEvents() {
      try {
        const nextEvents = await fetchEvents(activeToken);
        if (cancelled) {
          return;
        }
        setEvents(nextEvents);
        setSelectedEventId((currentSelected) => currentSelected ?? nextEvents[0]?.id ?? null);
        setErrorMessage(null);
        setSectionNotices((current) => ({ ...current, events: null }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "No se pudieron cargar los eventos.");
      }
    }

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !selectedEventId) {
      setWorkspace(null);
      return;
    }

    const activeToken = token;
    const activeEventId = selectedEventId;
    let cancelled = false;
    setLoadingWorkspace(true);

    async function loadWorkspace() {
      try {
        const nextWorkspace = await fetchWorkspace(activeEventId, activeToken);
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
        setSectionNotices((current) => ({ ...current, guests: null, tables: null }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el workspace.");
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
  }, [selectedEventId, token]);

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
    setEventFormError(null);
    setGuestFormError(null);
    setEditingGuestError(null);
    setSectionNotices({ events: null, guests: null, tables: null });
    setEventPendingDeleteId(null);
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
    setSectionNotices((current) => ({
      ...current,
      [section]: { tone, message },
    }));
  }

  function clearSectionNotice(section: SectionKey) {
    setSectionNotices((current) => ({
      ...current,
      [section]: null,
    }));
  }

  async function refreshWorkspaceState(activeEventId: string, activeToken: string) {
    const [nextEvents, nextWorkspace] = await Promise.all([
      fetchEvents(activeToken),
      fetchWorkspace(activeEventId, activeToken),
    ]);
    startTransition(() => {
      setEvents(nextEvents);
      setWorkspace(nextWorkspace);
      setSelectedEventId(activeEventId);
    });
    setCapacityValues(
      Object.fromEntries(nextWorkspace.tables.map((table) => [table.id, String(table.capacity)])),
    );
    setSelectedTableId((currentSelected) => currentSelected ?? nextWorkspace.tables[0]?.id ?? null);
  }

  async function refreshEventsOnly(activeToken: string) {
    const nextEvents = await fetchEvents(activeToken);
    startTransition(() => {
      setEvents(nextEvents);
    });
    return nextEvents;
  }

  async function runWorkspaceAction(
    actionKey: string,
    section: SectionKey,
    action: () => Promise<void>,
    message: string,
  ) {
    if (!token || !selectedEventId) {
      return;
    }

    const activeToken = token;
    const activeEventId = selectedEventId;
    setSubmittingAction(actionKey);
    setErrorMessage(null);
    clearSectionNotice(section);

    try {
      await action();
      await refreshWorkspaceState(activeEventId, activeToken);
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
    if (!token || !selectedEventId) {
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
        createGuest(selectedEventId, token, {
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
    if (!token || !selectedEventId || !editingGuestId) {
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
        updateGuest(selectedEventId, editingGuestId, token, {
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

  async function handleEventCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    const activeToken = token;
    setSubmittingAction("create-event");
    setErrorMessage(null);
    clearSectionNotice("events");

    const normalizedEventName = normalizeText(eventName);
    const parsedTableCount = parsePositiveInteger(eventTableCount);
    const parsedDefaultCapacity = parsePositiveInteger(eventDefaultCapacity);

    if (!normalizedEventName) {
      setEventFormError("El evento necesita un nombre visible en el rail.");
      setSubmittingAction(null);
      return;
    }

    if (!parsedTableCount || !parsedDefaultCapacity) {
      setEventFormError("Mesas y capacidad base deben ser enteros mayores que cero.");
      setSubmittingAction(null);
      return;
    }

    setEventFormError(null);

    try {
      const createdEvent = await createEvent(activeToken, {
        name: normalizedEventName,
        table_count: parsedTableCount,
        default_table_capacity: parsedDefaultCapacity,
      });
      await refreshEventsOnly(activeToken);
      setSelectedEventId(createdEvent.id);
      setEventName("");
      setEventTableCount("8");
      setEventDefaultCapacity("10");
      setSectionNotice("events", "success", "Evento creado correctamente.");
    } catch (error) {
      setSectionNotice(
        "events",
        "error",
        error instanceof Error ? error.message : "No se pudo crear el evento.",
      );
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleEventDelete(eventId: string) {
    if (!token) {
      return;
    }

    const activeToken = token;
    setSubmittingAction(`delete-event-${eventId}`);
    setErrorMessage(null);
    clearSectionNotice("events");

    try {
      await deleteEvent(eventId, activeToken);
      const nextEvents = await refreshEventsOnly(activeToken);
      const fallbackEventId =
        selectedEventId === eventId
          ? nextEvents[0]?.id ?? null
          : nextEvents.find((currentEvent) => currentEvent.id === selectedEventId)?.id ?? nextEvents[0]?.id ?? null;
      startTransition(() => {
        setSelectedEventId(fallbackEventId);
        if (!fallbackEventId) {
          setWorkspace(null);
        }
      });
      setEventPendingDeleteId(null);
      setSectionNotice("events", "success", "Evento eliminado.");
    } catch (error) {
      setSectionNotice(
        "events",
        "error",
        error instanceof Error ? error.message : "No se pudo eliminar el evento.",
      );
    } finally {
      setSubmittingAction(null);
    }
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
      () => assignGuest(workspace.event_id, droppedGuestId, tableId, token ?? ""),
      `${guest.name} asignado mediante arrastrar y soltar.`,
    );
  }

  return (
    <div className="shell">
      <div className="shell__backdrop shell__backdrop--one" />
      <div className="shell__backdrop shell__backdrop--two" />
      <aside className={`rail ${railBusy ? "section-shell section-shell--busy" : ""}`} aria-busy={railBusy}>
        <p className="eyebrow">Donde me siento</p>
        <h1 className="rail__title">Sala de direccion de seating</h1>
        <p className="rail__copy">
          El frontend consume el workspace agregado del backend como fuente principal de estado.
        </p>

        {!token ? (
          <form className="auth-card" onSubmit={handleLogin}>
            <label className="field">
              <span>Usuario</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="field">
              <span>Contrasena</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="button button--primary" disabled={loadingAuth} type="submit">
              {loadingAuth ? "Entrando..." : "Abrir workspace"}
            </button>
            <p className="hint">Credenciales locales por defecto: admin / admin1234</p>
          </form>
        ) : (
          <div className="session-card">
            <div>
              <p className="session-card__label">Sesion activa</p>
              <p className="session-card__value">Backend autenticado</p>
            </div>
            <button className="button button--ghost" onClick={handleLogout} type="button">
              Cerrar sesion
            </button>
          </div>
        )}

        <section className="events-panel">
          <div className="rail-section rail-section--session">
            <div className="rail-section__header">
              <div>
                <p className="eyebrow eyebrow--compact">Sesion</p>
                <h2>Acceso actual</h2>
              </div>
            </div>
            <p className="section-copy">
              El rail mantiene la sesion abierta y controla el evento activo del workspace.
            </p>
          </div>

          <div className="rail-divider" />

          <div className="rail-section rail-section--create">
            <div className="rail-section__header">
              <div>
                <p className="eyebrow eyebrow--compact">Crear</p>
                <h2>Nuevo evento</h2>
              </div>
              <span className="rail-section__meta">Se abre al instante en el workspace</span>
            </div>
          </div>
          <form className="stack-form stack-form--event" onSubmit={handleEventCreate}>
            <label className="mini-field">
              <span>Nombre del evento</span>
              <input
                data-testid="event-name-input"
                value={eventName}
                aria-invalid={Boolean(eventFormError)}
                onChange={(event) => setEventName(event.target.value)}
              />
            </label>
            <div className="mini-grid">
              <label className="mini-field">
                <span>Mesas</span>
                <input
                  data-testid="event-table-count-input"
                  min={1}
                  type="number"
                  value={eventTableCount}
                  aria-invalid={Boolean(eventFormError)}
                  onChange={(event) => setEventTableCount(event.target.value)}
                />
              </label>
              <label className="mini-field">
                <span>Capacidad base</span>
                <input
                  data-testid="event-default-capacity-input"
                  min={1}
                  type="number"
                  value={eventDefaultCapacity}
                  aria-invalid={Boolean(eventFormError)}
                  onChange={(event) => setEventDefaultCapacity(event.target.value)}
                />
              </label>
            </div>
            {eventFormError ? <p className="inline-feedback inline-feedback--error">{eventFormError}</p> : null}
            <button className="button button--primary button--small" disabled={isActionRunning("create-event")} type="submit">
              {isActionRunning("create-event") ? "Creando..." : "Crear evento"}
            </button>
          </form>

          <div className="rail-divider" />

          <div className="events-panel__header events-panel__header--spaced">
            <div>
              <p className="eyebrow eyebrow--compact">Gestion</p>
              <h2>Eventos existentes</h2>
            </div>
            <span>{metricLabel(events.length, "evento", "eventos")}</span>
          </div>
          {sectionNotices.events ? (
            <div className={`inline-notice inline-notice--${sectionNotices.events.tone}`}>
              {sectionNotices.events.message}
            </div>
          ) : null}
          <div className="events-list">
            {events.length === 0 ? (
              <p className="empty-state">Crea el primer evento para empezar a construir el seating.</p>
            ) : (
              events.map((event) => (
                <article
                  key={event.id}
                  className={`event-card ${selectedEventId === event.id ? "event-card--active" : ""}`}
                >
                  <div className="event-card__topline">
                    <span className="event-card__state">
                      {selectedEventId === event.id ? "En edicion" : "Disponible"}
                    </span>
                    {eventPendingDeleteId === event.id ? (
                      <span className="event-card__warning">Borrado pendiente</span>
                    ) : null}
                  </div>
                  <button
                    className="event-card__button"
                    data-testid={`event-card-${event.id}`}
                    onClick={() => {
                      setSelectedEventId(event.id);
                      setEventPendingDeleteId((current) => (current === event.id ? null : current));
                    }}
                    type="button"
                  >
                    <span className="event-card__name">{event.name}</span>
                    <span className="event-card__meta">
                      {event.table_count} mesas · {event.guest_count} invitados
                    </span>
                  </button>
                  <div className="event-card__actions">
                    {eventPendingDeleteId === event.id ? (
                      <>
                        <p className="event-card__confirm-copy">
                          Esta accion elimina el evento y su seating guardado.
                        </p>
                        <div className="event-card__confirm-actions">
                          <button
                            className="button button--danger button--small"
                            disabled={isActionRunning(`delete-event-${event.id}`)}
                            onClick={() => void handleEventDelete(event.id)}
                            type="button"
                          >
                            {isActionRunning(`delete-event-${event.id}`) ? "Eliminando..." : "Confirmar borrado"}
                          </button>
                          <button
                            className="button button--ghost button--small"
                            onClick={() => setEventPendingDeleteId(null)}
                            type="button"
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        className="button button--quiet button--small"
                        disabled={isActionRunning(`delete-event-${event.id}`)}
                        onClick={() => setEventPendingDeleteId(event.id)}
                        type="button"
                      >
                        Preparar borrado
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="workspace__hero">
          <div>
            <p className="eyebrow">Workspace agregado</p>
            <h2>{workspace?.name ?? "Selecciona un evento"}</h2>
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

        {errorMessage ? <div className="banner banner--error">{errorMessage}</div> : null}
        {loadingWorkspace ? <div className="banner">Actualizando workspace...</div> : null}

        <section className="canvas">
          <div
            className={`canvas__tables ${tablesSectionBusy ? "section-shell section-shell--busy" : ""}`}
            aria-busy={tablesSectionBusy}
          >
            {sectionNotices.tables ? (
              <div className={`inline-notice inline-notice--${sectionNotices.tables.tone} inline-notice--floating`}>
                {sectionNotices.tables.message}
              </div>
            ) : null}
            {workspace ? (
              <SeatingPlan
                activeDropTableId={activeDropTableId}
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
                className={`table-card ${selectedTableId === table.id ? "table-card--selected" : ""}`}
                data-testid={`table-card-${table.id}`}
                key={table.id}
              >
                <div className="table-card__header">
                  <div>
                    <span className="table-card__label">Mesa {table.number}</span>
                    <h3>{table.occupied}/{table.capacity} asientos</h3>
                  </div>
                  <span className="table-card__pill">{table.available} libres</span>
                </div>
                <form
                  className="table-card__controls"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const nextCapacity = Number(capacityValues[table.id] ?? table.capacity);
                    if (!Number.isInteger(nextCapacity) || nextCapacity < table.occupied || nextCapacity <= 0) {
                      setSectionNotice(
                        "tables",
                        "error",
                        `Mesa ${table.number}: la capacidad debe ser un entero y no puede bajar de ${table.occupied}.`,
                      );
                      return;
                    }
                    void runWorkspaceAction(
                      `capacity-${table.id}`,
                      "tables",
                      () => updateTableCapacity(workspace.event_id, table.id, nextCapacity, token ?? ""),
                      `Capacidad de la mesa ${table.number} actualizada.`,
                    );
                  }}
                >
                  <label className="mini-field">
                    <span>Capacidad</span>
                    <input
                      min={1}
                      type="number"
                      value={capacityValues[table.id] ?? String(table.capacity)}
                      onChange={(event) =>
                        setCapacityValues((current) => ({ ...current, [table.id]: event.target.value }))
                      }
                      onFocus={() => setSelectedTableId(table.id)}
                    />
                  </label>
                  <button
                    className="button button--ghost button--small"
                    disabled={isActionRunning(`capacity-${table.id}`)}
                    type="submit"
                  >
                    {isActionRunning(`capacity-${table.id}`) ? "Guardando..." : "Guardar"}
                  </button>
                </form>
                <div className="seat-ring">
                  {table.guests.length === 0 ? (
                    <p className="empty-state">Sin invitados asignados.</p>
                  ) : (
                    table.guests.map((guest) => (
                      <div
                        className={`guest-chip guest-chip--interactive ${conflictGuestIds.has(guest.id) ? "guest-chip--conflict" : ""}`}
                        key={guest.id}
                      >
                        <span>{guest.name}</span>
                        <button
                          className="chip-action"
                          disabled={isActionRunning(`unassign-${guest.id}`)}
                          onClick={() =>
                            void runWorkspaceAction(
                              `unassign-${guest.id}`,
                              "tables",
                              () => unassignGuest(workspace.event_id, guest.id, token ?? ""),
                              `${guest.name} vuelve a la lista sin asignar.`,
                            )
                          }
                          type="button"
                        >
                          Quitar
                        </button>
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
                <article className="control-metric">
                  <span>Ocupacion media</span>
                  <strong>
                    {workspace
                      ? `${Math.round(
                          workspace.tables.reduce((total, table) => total + table.occupied, 0) /
                            Math.max(
                              workspace.tables.reduce((total, table) => total + table.capacity, 0),
                              1,
                            ) *
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
                      className={`table-summary-row ${selectedTableId === table.id ? "table-summary-row--active" : ""}`}
                      onClick={() => setSelectedTableId(table.id)}
                      type="button"
                    >
                      <div>
                        <strong>Mesa {table.number}</strong>
                        <span>
                          {table.occupied}/{table.capacity} ocupados
                        </span>
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
                  <div className="selected-table-panel__hero">
                    <strong>{selectedTable.occupied}/{selectedTable.capacity}</strong>
                    <span>{selectedTable.available} asientos libres</span>
                  </div>
                  <div className="selected-table-panel__guests">
                    {selectedTable.guests.length > 0 ? (
                      selectedTable.guests.map((guest) => (
                        <article
                          className={`selected-guest ${conflictGuestIds.has(guest.id) ? "selected-guest--conflict" : ""}`}
                          key={guest.id}
                        >
                          <strong>{guest.name}</strong>
                          <span>{guest.group_id ? `Agrupacion ${guest.group_id}` : guest.guest_type}</span>
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
                Arrastra un invitado desde esta lista hasta una mesa del plano para asignarlo visualmente.
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
                    <input
                      placeholder="opcional"
                      value={guestGroupId}
                      onChange={(event) => setGuestGroupId(event.target.value)}
                    />
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
                              () =>
                                assignGuest(
                                  workspace.event_id,
                                  guest.id,
                                  assignmentValues[guest.id],
                                  token ?? "",
                                ),
                              `${guest.name} asignado correctamente.`,
                            )
                          }
                          type="button"
                        >
                          Asignar
                        </button>
                        <button
                          className="button button--ghost button--small"
                          onClick={() => beginGuestEdit(guest)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="button button--ghost button--small"
                          disabled={isActionRunning(`delete-${guest.id}`)}
                          onClick={() =>
                            void runWorkspaceAction(
                              `delete-${guest.id}`,
                              "guests",
                              () => deleteGuest(workspace.event_id, guest.id, token ?? ""),
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
              <div className="guest-list">
                {workspace && workspace.guests.assigned.length > 0 ? (
                  workspace.guests.assigned.map((guest) => (
                    <article className="guest-row" key={guest.id}>
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
                <input
                  value={editingGuestName}
                  aria-invalid={Boolean(editingGuestError)}
                  onChange={(event) => setEditingGuestName(event.target.value)}
                />
              </label>
              <div className="mini-grid">
                <label className="mini-field">
                  <span>Tipo</span>
                  <select
                    value={editingGuestType}
                    onChange={(event) => setEditingGuestType(event.target.value)}
                  >
                    <option value="adulto">adulto</option>
                    <option value="adolescente">adolescente</option>
                    <option value="nino">nino</option>
                  </select>
                </label>
                <label className="mini-field">
                  <span>Agrupacion</span>
                  <input
                    value={editingGuestGroupId}
                    onChange={(event) => setEditingGuestGroupId(event.target.value)}
                  />
                </label>
              </div>
              {editingGuestError ? <p className="inline-feedback inline-feedback--error">{editingGuestError}</p> : null}
              <button
                className="button button--primary button--small"
                disabled={isActionRunning(`update-${editingGuestId}`)}
                type="submit"
              >
                {isActionRunning(`update-${editingGuestId}`) ? "Guardando..." : "Guardar cambios"}
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
