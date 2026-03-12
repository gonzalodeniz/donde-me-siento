import type { DragEvent } from "react";

import type { Guest, Workspace } from "../types";

type SeatTarget = {
  tableId: string;
  seatIndex: number;
};

type SeatingPlanProps = {
  workspace: Workspace;
  selectedTableId: string | null;
  activeDropSeat: SeatTarget | null;
  draggedGuestName: string | null;
  onGuestDragEnd: () => void;
  onGuestDragStart: (event: DragEvent<Element>, guestId: string) => void;
  onSelectTable: (tableId: string) => void;
  onSeatDragEnter: (tableId: string, seatIndex: number) => void;
  onSeatDragLeave: (tableId: string, seatIndex: number) => void;
  onSeatDrop: (tableId: string, seatIndex: number, guestId: string | null) => void;
};

type SeatDescriptor = {
  seatIndex: number;
  seatX: number;
  seatY: number;
  guest: Guest | null;
  hasConflict: boolean;
};

function truncateName(name: string) {
  return name.length > 12 ? `${name.slice(0, 12)}…` : name;
}

function buildSeatGuests(tableGuests: Guest[], capacity: number) {
  const orderedGuests = [...tableGuests].sort((left, right) => {
    const leftSeat = left.seat_index ?? Number.MAX_SAFE_INTEGER;
    const rightSeat = right.seat_index ?? Number.MAX_SAFE_INTEGER;
    if (leftSeat !== rightSeat) {
      return leftSeat - rightSeat;
    }
    return left.name.localeCompare(right.name, "es");
  });

  const guestsBySeat = new Map<number, Guest>();
  for (const guest of orderedGuests) {
    if (
      guest.seat_index !== null &&
      guest.seat_index >= 0 &&
      guest.seat_index < capacity &&
      !guestsBySeat.has(guest.seat_index)
    ) {
      guestsBySeat.set(guest.seat_index, guest);
      continue;
    }

    for (let index = 0; index < capacity; index += 1) {
      if (!guestsBySeat.has(index)) {
        guestsBySeat.set(index, guest);
        break;
      }
    }
  }

  return guestsBySeat;
}

export function SeatingPlan({
  workspace,
  selectedTableId,
  activeDropSeat,
  draggedGuestName,
  onGuestDragEnd,
  onGuestDragStart,
  onSelectTable,
  onSeatDragEnter,
  onSeatDragLeave,
  onSeatDrop,
}: SeatingPlanProps) {
  const conflictGuestIds = new Set(
    Object.values(workspace.validation.grouping_conflicts).flatMap((guestIds) => guestIds),
  );

  const minX = Math.min(...workspace.tables.map((table) => table.position_x)) - 160;
  const minY = Math.min(...workspace.tables.map((table) => table.position_y)) - 160;
  const maxX = Math.max(...workspace.tables.map((table) => table.position_x)) + 180;
  const maxY = Math.max(...workspace.tables.map((table) => table.position_y)) + 180;
  const width = maxX - minX;
  const height = maxY - minY;
  const isDraggingGuest = Boolean(draggedGuestName);

  return (
    <section className="plan-card">
      <div className="plan-card__header">
        <div>
          <p className="eyebrow">Plano interactivo</p>
          <h3>Salón y mesas</h3>
          <p className="plan-card__lead">
            {isDraggingGuest
              ? `Desliza a ${draggedGuestName} y suéltalo directamente sobre una silla libre.`
              : "Cada invitado ubicado puede volver a moverse arrastrándolo a cualquier silla libre del salón."}
          </p>
        </div>
        <div className="plan-legend">
          <span className="plan-legend__item">
            <i className="plan-legend__dot plan-legend__dot--conflict" />
            conflicto
          </span>
          <span className="plan-legend__item">
            <i className="plan-legend__dot plan-legend__dot--full" />
            completa
          </span>
          <span className="plan-legend__item">
            <i className="plan-legend__dot plan-legend__dot--active" />
            silla libre
          </span>
        </div>
      </div>

      <div className={`plan-stage ${isDraggingGuest ? "plan-stage--dragging" : ""}`}>
        {isDraggingGuest ? (
          <div className="plan-stage__guide" aria-live="polite">
            <strong>{draggedGuestName}</strong>
            <span>Busca una silla libre resaltada y suelta ahí para recolocar al invitado.</span>
          </div>
        ) : null}
        <svg
          aria-label="Plano del salón"
          className="plan-stage__svg"
          viewBox={`${minX} ${minY} ${width} ${height}`}
          role="img"
        >
          <defs>
            <filter id="tableShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="rgba(87, 49, 24, 0.18)" />
            </filter>
          </defs>

          {workspace.tables.map((table) => {
            const seatCount = Math.max(table.capacity, 1);
            const isSelected = table.id === selectedTableId;
            const isFull = table.available === 0;
            const radius = 52;
            const labelRadius = 98;
            const guestsBySeat = buildSeatGuests(table.guests, seatCount);
            const seats: SeatDescriptor[] = Array.from({ length: seatCount }, (_, index) => {
              const angle = (Math.PI * 2 * index) / seatCount - Math.PI / 2;
              const seatX = table.position_x + Math.cos(angle) * labelRadius;
              const seatY = table.position_y + Math.sin(angle) * labelRadius;
              const guest = guestsBySeat.get(index) ?? null;
              const hasConflict = guest ? conflictGuestIds.has(guest.id) : false;

              return { seatIndex: index, seatX, seatY, guest, hasConflict };
            });

            return (
              <g
                className={`plan-table ${isSelected ? "plan-table--selected" : ""}`}
                data-testid={`plan-table-${table.id}`}
                key={table.id}
                onClick={() => onSelectTable(table.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onSelectTable(table.id);
                  }
                }}
              >
                <circle
                  className={`plan-table__halo ${isFull ? "plan-table__halo--full" : ""}`}
                  cx={table.position_x}
                  cy={table.position_y}
                  r={74}
                />
                <circle
                  className={`plan-table__disc ${isFull ? "plan-table__disc--full" : ""}`}
                  cx={table.position_x}
                  cy={table.position_y}
                  filter="url(#tableShadow)"
                  r={radius}
                />
                <text
                  className="plan-table__number"
                  textAnchor="middle"
                  x={table.position_x}
                  y={table.position_y - 6}
                >
                  {table.number}
                </text>
                <text
                  className="plan-table__capacity"
                  textAnchor="middle"
                  x={table.position_x}
                  y={table.position_y + 16}
                >
                  {table.occupied}/{table.capacity}
                </text>

                {seats.map(({ seatIndex, seatX, seatY, guest, hasConflict }) => {
                  const isDropTarget =
                    activeDropSeat?.tableId === table.id && activeDropSeat.seatIndex === seatIndex;

                  return (
                    <g key={`${table.id}-seat-${seatIndex}`}>
                      <circle
                        className={`plan-seat ${guest ? "plan-seat--occupied" : ""} ${hasConflict ? "plan-seat--conflict" : ""} ${isDropTarget ? "plan-seat--drop" : ""} ${isDraggingGuest && !guest ? "plan-seat--available" : ""}`}
                        cx={seatX}
                        cy={seatY}
                        r={guest ? 24 : 18}
                      />
                      {guest ? (
                        <>
                          <title>{guest.name}</title>
                          <text
                            className={`plan-seat__label ${hasConflict ? "plan-seat__label--conflict" : ""}`}
                            textAnchor="middle"
                            x={seatX}
                            y={seatY + 4}
                          >
                            {truncateName(guest.name)}
                          </text>
                        </>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        <div className="plan-stage__drops">
          {workspace.tables.flatMap((table) => {
            const seatCount = Math.max(table.capacity, 1);
            const labelRadius = 98;
            const guestsBySeat = buildSeatGuests(table.guests, seatCount);

            return Array.from({ length: seatCount }, (_, seatIndex) => {
              const angle = (Math.PI * 2 * seatIndex) / seatCount - Math.PI / 2;
              const seatX = table.position_x + Math.cos(angle) * labelRadius;
              const seatY = table.position_y + Math.sin(angle) * labelRadius;
              const left = ((seatX - minX) / width) * 100;
              const top = ((seatY - minY) / height) * 100;
              const guest = guestsBySeat.get(seatIndex) ?? null;
              const isDropTarget =
                activeDropSeat?.tableId === table.id && activeDropSeat.seatIndex === seatIndex;

              if (guest) {
                return (
                  <button
                    aria-label={`${guest.name} en mesa ${table.number}, silla ${seatIndex + 1}`}
                    className="plan-seat-hit plan-seat-hit--occupied"
                    draggable
                    key={`seat-hit-${table.id}-${seatIndex}`}
                    onClick={() => onSelectTable(table.id)}
                    onDragEnd={onGuestDragEnd}
                    onDragStart={(event) => onGuestDragStart(event, guest.id)}
                    style={{ left: `${left}%`, top: `${top}%` }}
                    type="button"
                  />
                );
              }

              return (
                <button
                  aria-label={`Silla ${seatIndex + 1} libre en mesa ${table.number}`}
                  className={`plan-seat-hit plan-seat-hit--empty ${isDraggingGuest ? "plan-seat-hit--visible" : ""} ${isDropTarget ? "plan-seat-hit--active" : ""}`}
                  key={`seat-hit-${table.id}-${seatIndex}`}
                  onClick={() => onSelectTable(table.id)}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    onSeatDragEnter(table.id, seatIndex);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    onSeatDragLeave(table.id, seatIndex);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    onSeatDragEnter(table.id, seatIndex);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    onSeatDrop(table.id, seatIndex, event.dataTransfer.getData("text/plain") || null);
                  }}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  type="button"
                >
                  {isDraggingGuest ? (
                    <span className="plan-seat-hit__label">
                      {isDropTarget ? "Soltar aquí" : `Mesa ${table.number}`}
                    </span>
                  ) : null}
                </button>
              );
            });
          })}
        </div>
      </div>
    </section>
  );
}
