import type { Workspace } from "../types";

type SeatingPlanProps = {
  workspace: Workspace;
  selectedTableId: string | null;
  activeDropTableId: string | null;
  draggedGuestName: string | null;
  onSelectTable: (tableId: string) => void;
  onTableDragEnter: (tableId: string) => void;
  onTableDragLeave: (tableId: string) => void;
  onTableDrop: (tableId: string, guestId: string | null) => void;
};

function truncateName(name: string) {
  return name.length > 12 ? `${name.slice(0, 12)}…` : name;
}

export function SeatingPlan({
  workspace,
  selectedTableId,
  activeDropTableId,
  draggedGuestName,
  onSelectTable,
  onTableDragEnter,
  onTableDragLeave,
  onTableDrop,
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
          <h3>Salon y mesas</h3>
          <p className="plan-card__lead">
            {isDraggingGuest
              ? `Suelta a ${draggedGuestName} sobre una mesa resaltada para sentarlo.`
              : "Selecciona una mesa o arrastra un invitado hasta el plano para asignarlo."}
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
            seleccionada
          </span>
        </div>
      </div>

      <div className={`plan-stage ${isDraggingGuest ? "plan-stage--dragging" : ""}`}>
        {isDraggingGuest ? (
          <div className="plan-stage__guide" aria-live="polite">
            <strong>{draggedGuestName}</strong>
            <span>Busca una mesa con anillo cobre y suelta dentro del circulo marcado.</span>
          </div>
        ) : null}
        <svg
          aria-label="Plano del salon"
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
            const isDropTarget = table.id === activeDropTableId;
            const isDragCandidate = isDraggingGuest && !isDropTarget;
            const radius = 52;
            const labelRadius = 98;

            return (
              <g
                className={`plan-table ${isSelected ? "plan-table--selected" : ""} ${isDropTarget ? "plan-table--drop" : ""} ${isDragCandidate ? "plan-table--candidate" : ""}`}
                data-testid={`plan-table-${table.id}`}
                key={table.id}
                onClick={() => onSelectTable(table.id)}
                onDragEnter={(event) => {
                  event.preventDefault();
                  onTableDragEnter(table.id);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  onTableDragLeave(table.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  onTableDragEnter(table.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onTableDrop(table.id, event.dataTransfer.getData("text/plain") || null);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onSelectTable(table.id);
                  }
                }}
              >
                <circle
                  className={`plan-table__halo ${isFull ? "plan-table__halo--full" : ""} ${isDropTarget ? "plan-table__halo--drop" : ""}`}
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
                {isDraggingGuest ? (
                  <text
                    className={`plan-table__dropcopy ${isDropTarget ? "plan-table__dropcopy--active" : ""}`}
                    textAnchor="middle"
                    x={table.position_x}
                    y={table.position_y - 92}
                  >
                    {isDropTarget ? "Soltar aqui" : "Destino"}
                  </text>
                ) : null}

                {Array.from({ length: seatCount }).map((_, index) => {
                  const angle = (Math.PI * 2 * index) / seatCount - Math.PI / 2;
                  const seatX = table.position_x + Math.cos(angle) * labelRadius;
                  const seatY = table.position_y + Math.sin(angle) * labelRadius;
                  const guest = table.guests[index];
                  const hasConflict = guest ? conflictGuestIds.has(guest.id) : false;

                  return (
                    <g key={`${table.id}-seat-${index}`}>
                      <circle
                        className={`plan-seat ${guest ? "plan-seat--occupied" : ""} ${hasConflict ? "plan-seat--conflict" : ""}`}
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
          {workspace.tables.map((table) => {
            const left = ((table.position_x - minX) / width) * 100;
            const top = ((table.position_y - minY) / height) * 100;
            const isSelected = table.id === selectedTableId;
            const isDropTarget = table.id === activeDropTableId;

            return (
              <button
                aria-label={`Mesa ${table.number}`}
                className={`plan-dropzone ${isSelected ? "plan-dropzone--selected" : ""} ${isDropTarget ? "plan-dropzone--active" : ""} ${isDraggingGuest ? "plan-dropzone--visible" : ""}`}
                data-testid={`plan-table-${table.id}`}
                key={`dropzone-${table.id}`}
                onClick={() => onSelectTable(table.id)}
                onDragEnter={(event) => {
                  event.preventDefault();
                  onTableDragEnter(table.id);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  onTableDragLeave(table.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  onTableDragEnter(table.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onTableDrop(table.id, event.dataTransfer.getData("text/plain") || null);
                }}
                style={{ left: `${left}%`, top: `${top}%` }}
                type="button"
              >
                {isDraggingGuest ? (
                  <span className="plan-dropzone__label">{isDropTarget ? "Soltar" : `Mesa ${table.number}`}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
