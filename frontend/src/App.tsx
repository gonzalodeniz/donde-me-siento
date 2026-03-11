import { FormEvent, useEffect, useMemo, useState, startTransition } from "react";

import { fetchEvents, fetchWorkspace, login } from "./api";
import type { EventSummary, Workspace } from "./types";

const TOKEN_STORAGE_KEY = "dms.auth.token";

function metricLabel(total: number, singular: string, plural: string) {
  return `${total} ${total === 1 ? singular : plural}`;
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const groupedConflictCount = useMemo(
    () => Object.keys(workspace?.validation.grouping_conflicts ?? {}).length,
    [workspace],
  );

  useEffect(() => {
    if (!token) {
      setEvents([]);
      setSelectedEventId(null);
      setWorkspace(null);
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
        setErrorMessage(null);
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
  }

  return (
    <div className="shell">
      <div className="shell__backdrop shell__backdrop--one" />
      <div className="shell__backdrop shell__backdrop--two" />
      <aside className="rail">
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
          <div className="events-panel__header">
            <h2>Eventos</h2>
            <span>{metricLabel(events.length, "evento", "eventos")}</span>
          </div>
          <div className="events-list">
            {events.length === 0 ? (
              <p className="empty-state">Inicia sesion y crea un evento en backend para verlo aqui.</p>
            ) : (
              events.map((event) => (
                <button
                  key={event.id}
                  className={`event-card ${selectedEventId === event.id ? "event-card--active" : ""}`}
                  onClick={() => setSelectedEventId(event.id)}
                  type="button"
                >
                  <span className="event-card__name">{event.name}</span>
                  <span className="event-card__meta">
                    {event.table_count} mesas · {event.guest_count} invitados
                  </span>
                </button>
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
        {loadingWorkspace ? <div className="banner">Cargando workspace...</div> : null}

        <section className="canvas">
          <div className="canvas__tables">
            {workspace?.tables.map((table) => (
              <article className="table-card" key={table.id}>
                <div className="table-card__header">
                  <div>
                    <span className="table-card__label">Mesa {table.number}</span>
                    <h3>{table.occupied}/{table.capacity} asientos</h3>
                  </div>
                  <span className="table-card__pill">{table.available} libres</span>
                </div>
                <div className="seat-ring">
                  {table.guests.length === 0 ? (
                    <p className="empty-state">Sin invitados asignados.</p>
                  ) : (
                    table.guests.map((guest) => (
                      <span className="guest-chip" key={guest.id}>
                        {guest.name}
                      </span>
                    ))
                  )}
                </div>
              </article>
            )) ?? <p className="empty-state">Aun no hay workspace cargado.</p>}
          </div>

          <div className="lists-panel">
            <section className="list-card">
              <div className="list-card__header">
                <h3>Sin asignar</h3>
                <span>{workspace?.guests.unassigned.length ?? 0}</span>
              </div>
              <div className="guest-list">
                {workspace?.guests.unassigned.map((guest) => (
                  <article className="guest-row" key={guest.id}>
                    <strong>{guest.name}</strong>
                    <span>{guest.guest_type}</span>
                  </article>
                )) ?? <p className="empty-state">Nada pendiente.</p>}
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
