import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";

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
  highlightedGuestIds: string[];
  isSearchActive: boolean;
  onGuestDragEnd: () => void;
  onGuestDragStart: (event: DragEvent<Element>, guestId: string) => void;
  onMoveTable: (tableId: string, positionX: number, positionY: number) => Promise<void>;
  onSelectTable: (tableId: string) => void;
  onSeatDragEnter: (tableId: string, seatIndex: number) => void;
  onSeatDragLeave: (tableId: string, seatIndex: number) => void;
  onSeatDrop: (tableId: string, seatIndex: number, guestId: string | null) => void;
};

type SeatDescriptor = {
  seatIndex: number;
  seatX: number;
  seatY: number;
  seatRadius: number;
  seatLabel: string;
  seatLabelFontSize: number;
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

function getSeatVisualMetrics(name: string) {
  const seatLabel = truncateName(name);
  const labelLength = seatLabel.length;
  const seatRadius = Math.min(39, Math.max(26, 14 + labelLength * 1.8));
  const seatLabelFontSize = labelLength <= 8 ? 11.5 : labelLength <= 10 ? 10.8 : 10;

  return { seatLabel, seatRadius, seatLabelFontSize };
}

export function SeatingPlan({
  workspace,
  selectedTableId,
  activeDropSeat,
  draggedGuestName,
  highlightedGuestIds,
  isSearchActive,
  onGuestDragEnd,
  onGuestDragStart,
  onMoveTable,
  onSelectTable,
  onSeatDragEnter,
  onSeatDragLeave,
  onSeatDrop,
}: SeatingPlanProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanningStage, setIsPanningStage] = useState(false);
  const [stagePanStart, setStagePanStart] = useState<{
    clientX: number;
    clientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [draggedTable, setDraggedTable] = useState<{
    tableId: string;
    offsetX: number;
    offsetY: number;
    positionX: number;
    positionY: number;
  } | null>(null);
  const [hoveredGuestCard, setHoveredGuestCard] = useState<{
    guestId: string;
    name: string;
    guestType: string;
    family: string;
    x: number;
    y: number;
  } | null>(null);
  const conflictGuestIds = new Set(
    Object.values(workspace.validation.grouping_conflicts).flatMap((guestIds) => guestIds),
  );
  const highlightedGuestIdSet = useMemo(() => new Set(highlightedGuestIds), [highlightedGuestIds]);
  const guestById = useMemo(
    () =>
      new Map(
        [...workspace.guests.assigned, ...workspace.guests.unassigned].map((guest) => [guest.id, guest]),
      ),
    [workspace.guests.assigned, workspace.guests.unassigned],
  );
  const conflictTooltipByGuestId = useMemo(() => {
    const tooltips = new Map<string, string>();

    for (const [groupId, guestIds] of Object.entries(workspace.validation.grouping_conflicts)) {
      const relatedNames = guestIds
        .map((guestId) => guestById.get(guestId)?.name)
        .filter((name): name is string => Boolean(name))
        .sort((left, right) => left.localeCompare(right, "es"));
      const tooltip = `Familia ${groupId}: ${relatedNames.join(", ")}`;

      for (const guestId of guestIds) {
        tooltips.set(guestId, tooltip);
      }
    }

    return tooltips;
  }, [guestById, workspace.validation.grouping_conflicts]);
  const renderedPositions = useMemo(
    () =>
      new Map(
        workspace.tables.map((table) => [
          table.id,
          draggedTable?.tableId === table.id
            ? { positionX: draggedTable.positionX, positionY: draggedTable.positionY }
            : { positionX: table.position_x, positionY: table.position_y },
        ]),
      ),
    [draggedTable, workspace.tables],
  );

  const minX = Math.min(...Array.from(renderedPositions.values(), (table) => table.positionX)) - 160;
  const minY = Math.min(...Array.from(renderedPositions.values(), (table) => table.positionY)) - 160;
  const maxX = Math.max(...Array.from(renderedPositions.values(), (table) => table.positionX)) + 180;
  const maxY = Math.max(...Array.from(renderedPositions.values(), (table) => table.positionY)) + 180;
  const width = maxX - minX;
  const height = maxY - minY;
  const zoomedWidth = Math.max(width * zoomLevel, 640);
  const zoomedHeight = Math.max(height * zoomLevel, 420);
  const isDraggingGuest = Boolean(draggedGuestName);
  const isDraggingTable = Boolean(draggedTable);
  const zoomPercent = Math.round(zoomLevel * 100);

  useEffect(() => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return undefined;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.08 : -0.08;
      setZoomLevel((current) => clampZoom(Number((current + delta).toFixed(2))));
    };

    stageElement.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      stageElement.removeEventListener("wheel", handleNativeWheel);
    };
  }, [height, width]);

  useEffect(() => {
    if (!draggedTable) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextPosition = getSvgCoordinates(event.clientX, event.clientY);
      if (!nextPosition) {
        return;
      }

      setDraggedTable((current) =>
        current
          ? {
              ...current,
              positionX: nextPosition.x - current.offsetX,
              positionY: nextPosition.y - current.offsetY,
            }
          : current,
      );
    };

    const handlePointerUp = () => {
      const activeDrag = draggedTable;
      setDraggedTable(null);
      void onMoveTable(activeDrag.tableId, activeDrag.positionX, activeDrag.positionY);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggedTable, onMoveTable]);

  useEffect(() => {
    if (!stagePanStart) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const viewport = scrollViewportRef.current;
      if (!viewport) {
        return;
      }

      viewport.scrollLeft = stagePanStart.scrollLeft - (event.clientX - stagePanStart.clientX);
      viewport.scrollTop = stagePanStart.scrollTop - (event.clientY - stagePanStart.clientY);
    };

    const stopPanning = () => {
      setStagePanStart(null);
      setIsPanningStage(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPanning, { once: true });
    window.addEventListener("pointercancel", stopPanning, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPanning);
      window.removeEventListener("pointercancel", stopPanning);
    };
  }, [stagePanStart]);

  useEffect(() => {
    if (!isSearchActive || highlightedGuestIdSet.size === 0) {
      return;
    }

    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const matchingSeats = workspace.tables.flatMap((table) => {
      const position = renderedPositions.get(table.id) ?? {
        positionX: table.position_x,
        positionY: table.position_y,
      };
      const seatCount = Math.max(table.capacity, 1);
      const labelRadius = 98;
      const guestsBySeat = buildSeatGuests(table.guests, seatCount);

      return Array.from({ length: seatCount }, (_, seatIndex) => {
        const guest = guestsBySeat.get(seatIndex) ?? null;
        if (!guest || !highlightedGuestIdSet.has(guest.id)) {
          return null;
        }

        const angle = (Math.PI * 2 * seatIndex) / seatCount - Math.PI / 2;
        const seatX = position.positionX + Math.cos(angle) * labelRadius;
        const seatY = position.positionY + Math.sin(angle) * labelRadius;
        const { seatRadius } = getSeatVisualMetrics(guest.name);

        return {
          minX: seatX - seatRadius - 22,
          maxX: seatX + seatRadius + 22,
          minY: seatY - seatRadius - 22,
          maxY: seatY + seatRadius + 22,
        };
      }).filter((seat): seat is { minX: number; maxX: number; minY: number; maxY: number } => seat !== null);
    });

    if (matchingSeats.length === 0) {
      return;
    }

    const bounds = matchingSeats.reduce(
      (current, seat) => ({
        minX: Math.min(current.minX, seat.minX),
        maxX: Math.max(current.maxX, seat.maxX),
        minY: Math.min(current.minY, seat.minY),
        maxY: Math.max(current.maxY, seat.maxY),
      }),
      { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
    );

    const targetWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const targetHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const availableWidth = Math.max(viewport.clientWidth - 48, 1);
    const availableHeight = Math.max(viewport.clientHeight - 48, 1);
    const targetZoom = clampZoom(Math.min(availableWidth / targetWidth, availableHeight / targetHeight));
    const nextZoom = Number(targetZoom.toFixed(2));

    setZoomLevel(nextZoom);

    requestAnimationFrame(() => {
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      viewport.scrollLeft = Math.max(((centerX - minX) * nextZoom) - viewport.clientWidth / 2, 0);
      viewport.scrollTop = Math.max(((centerY - minY) * nextZoom) - viewport.clientHeight / 2, 0);
    });
  }, [highlightedGuestIdSet, isSearchActive, minX, minY, renderedPositions, workspace.tables]);

  function getSvgCoordinates(clientX: number, clientY: number) {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return null;
    }

    const rect = svgElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    return {
      x: minX + ((clientX - rect.left) / rect.width) * width,
      y: minY + ((clientY - rect.top) / rect.height) * height,
    };
  }

  function handleTablePointerDown(
    event: ReactPointerEvent<SVGGElement>,
    tableId: string,
    positionX: number,
    positionY: number,
  ) {
    if (isDraggingGuest || event.button !== 0) {
      return;
    }

    const point = getSvgCoordinates(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    event.preventDefault();
    setDraggedTable({
      tableId,
      offsetX: point.x - positionX,
      offsetY: point.y - positionY,
      positionX,
      positionY,
    });
  }

  function clampZoom(nextZoom: number) {
    return Math.min(Math.max(nextZoom, 0.65), 1.9);
  }

  function applyZoom(nextZoom: number) {
    setZoomLevel(clampZoom(Number(nextZoom.toFixed(2))));
  }

  function zoomIn() {
    setZoomLevel((current) => clampZoom(Number((current + 0.12).toFixed(2))));
  }

  function zoomOut() {
    setZoomLevel((current) => clampZoom(Number((current - 0.12).toFixed(2))));
  }

  function resetZoom() {
    applyZoom(1);
  }

  function fitPlanToView() {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      applyZoom(1);
      return;
    }

    const availableWidth = Math.max(viewport.clientWidth - 24, 1);
    const availableHeight = Math.max(viewport.clientHeight - 24, 1);
    const fittedZoom = Math.min(availableWidth / width, availableHeight / height);
    applyZoom(fittedZoom);
    viewport.scrollTo({ left: 0, top: 0 });
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isDraggingGuest || isDraggingTable || event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(".plan-table") || target.closest(".plan-seat-hit") || target.closest(".plan-stage__zoom-controls")) {
      return;
    }

    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    event.preventDefault();
    setIsPanningStage(true);
    setStagePanStart({
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
  }

  function formatGuestTypeLabel(guestType: Guest["guest_type"]) {
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

  function updateHoveredGuestCardPosition(clientX: number, clientY: number, guest: Guest) {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    const rect = stageElement.getBoundingClientRect();
    setHoveredGuestCard({
      guestId: guest.id,
      name: guest.name,
      guestType: formatGuestTypeLabel(guest.guest_type),
      family: guest.group_id ?? "Sin familia",
      x: clientX - rect.left + 16,
      y: clientY - rect.top + 16,
    });
  }

  return (
    <section className="plan-card">
      <div className="plan-card__header">
        <div>
          <p className="eyebrow">Plano interactivo</p>
          <h3>Salón y mesas</h3>
          <p className="plan-card__lead">
            {isDraggingGuest
              ? `Desliza a ${draggedGuestName} y suéltalo directamente sobre una silla libre.`
              : "Puedes arrastrar cada mesa para colocarla como estará en el salón real. Las sillas se recolocan con ella automáticamente."}
          </p>
        </div>
        <div className="plan-legend">
          <span className="plan-legend__item">
            <i className="plan-legend__dot plan-legend__dot--adult" />
            adulto
          </span>
          <span className="plan-legend__item">
            <i className="plan-legend__dot plan-legend__dot--teen" />
            adolescente
          </span>
          <span className="plan-legend__item">
            <i className="plan-legend__dot plan-legend__dot--child" />
            niño
          </span>
          <span className="plan-legend__item">
            <i className="plan-legend__dot plan-legend__dot--available" />
            silla libre
          </span>
          <span className="plan-legend__item">
            <i className="plan-legend__dot plan-legend__dot--conflict" />
            conflicto
          </span>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`plan-stage ${isDraggingGuest ? "plan-stage--dragging" : ""} ${isPanningStage ? "plan-stage--panning" : ""}`}
      >
        <div className="plan-stage__zoom-controls" aria-label="Controles de zoom del plano">
          <button
            aria-label="Ajustar todas las mesas al plano visible"
            className="plan-stage__zoom-fit"
            onClick={fitPlanToView}
            type="button"
          >
            Ajustar
          </button>
          <button aria-label="Alejar plano" className="plan-stage__zoom-button" onClick={zoomOut} type="button">
            −
          </button>
          <button aria-label="Acercar plano" className="plan-stage__zoom-button" onClick={zoomIn} type="button">
            +
          </button>
          <button aria-label="Restablecer zoom" className="plan-stage__zoom-reset" onClick={resetZoom} type="button">
            {zoomPercent}%
          </button>
        </div>
        {isDraggingGuest ? (
          <div className="plan-stage__guide" aria-live="polite">
            <strong>{draggedGuestName}</strong>
            <span>Busca una silla libre resaltada y suelta ahí para recolocar al invitado.</span>
          </div>
        ) : null}
        <div
          ref={scrollViewportRef}
          className="plan-stage__scroll"
          onPointerDown={handleStagePointerDown}
        >
        <div
          className="plan-stage__viewport"
          style={{ width: `${zoomedWidth}px`, height: `${zoomedHeight}px` }}
        >
          <svg
            aria-label="Plano del salón"
            className="plan-stage__svg"
            ref={svgRef}
            viewBox={`${minX} ${minY} ${width} ${height}`}
            role="img"
            style={{ width: `${zoomedWidth}px`, height: `${zoomedHeight}px` }}
          >
            <defs>
              <filter id="tableShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="rgba(87, 49, 24, 0.18)" />
              </filter>
            </defs>

            {workspace.tables.map((table) => {
            const position = renderedPositions.get(table.id) ?? {
              positionX: table.position_x,
              positionY: table.position_y,
            };
            const seatCount = Math.max(table.capacity, 1);
            const isSelected = table.id === selectedTableId;
            const isFull = table.available === 0;
            const radius = 52;
            const labelRadius = 98;
            const guestsBySeat = buildSeatGuests(table.guests, seatCount);
            const seats: SeatDescriptor[] = Array.from({ length: seatCount }, (_, index) => {
              const angle = (Math.PI * 2 * index) / seatCount - Math.PI / 2;
              const seatX = position.positionX + Math.cos(angle) * labelRadius;
              const seatY = position.positionY + Math.sin(angle) * labelRadius;
              const guest = guestsBySeat.get(index) ?? null;
              const hasConflict = guest ? conflictGuestIds.has(guest.id) : false;
              const { seatLabel, seatRadius, seatLabelFontSize } = guest
                ? getSeatVisualMetrics(guest.name)
                : { seatLabel: "", seatRadius: 18, seatLabelFontSize: 10 };

              return { seatIndex: index, seatX, seatY, seatRadius, seatLabel, seatLabelFontSize, guest, hasConflict };
            });

              return (
                <g
                  className={`plan-table ${isSelected ? "plan-table--selected" : ""} ${draggedTable?.tableId === table.id ? "plan-table--moving" : ""}`}
                  data-testid={`plan-table-${table.id}`}
                  key={table.id}
                  onClick={() => onSelectTable(table.id)}
                  onPointerDown={(event) => handleTablePointerDown(event, table.id, position.positionX, position.positionY)}
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
                  cx={position.positionX}
                  cy={position.positionY}
                  r={74}
                />
                <circle
                  className={`plan-table__disc ${isFull ? "plan-table__disc--full" : ""}`}
                  cx={position.positionX}
                  cy={position.positionY}
                  filter="url(#tableShadow)"
                  r={radius}
                />
                <text
                  className="plan-table__number"
                  textAnchor="middle"
                  x={position.positionX}
                  y={position.positionY - 6}
                >
                  {table.number}
                </text>
                <text
                  className="plan-table__capacity"
                  textAnchor="middle"
                  x={position.positionX}
                  y={position.positionY + 16}
                >
                  {table.occupied}/{table.capacity}
                </text>

                {seats.map(({ seatIndex, seatX, seatY, seatRadius, seatLabel, seatLabelFontSize, guest, hasConflict }) => {
                  const isDropTarget =
                    activeDropSeat?.tableId === table.id && activeDropSeat.seatIndex === seatIndex;
                  const conflictTooltip = guest ? conflictTooltipByGuestId.get(guest.id) : null;
                  const isSearchMatch = guest ? highlightedGuestIdSet.has(guest.id) : false;

                  return (
                    <g key={`${table.id}-seat-${seatIndex}`}>
                      <circle
                        className={`plan-seat ${guest ? "plan-seat--occupied" : ""} ${guest?.guest_type === "adolescente" ? "plan-seat--teen" : ""} ${guest?.guest_type === "nino" ? "plan-seat--child" : ""} ${hasConflict ? "plan-seat--conflict" : ""} ${isSearchMatch ? "plan-seat--search-match" : ""} ${isDropTarget ? "plan-seat--drop" : ""} ${isDraggingGuest && !guest ? "plan-seat--available" : ""}`}
                        cx={seatX}
                        cy={seatY}
                        r={guest ? seatRadius : 18}
                      />
                      {guest ? (
                        <>
                          <title>{conflictTooltip ? `${guest.name}\n${conflictTooltip}` : guest.name}</title>
                          <text
                            className={`plan-seat__label ${guest.guest_type === "adolescente" ? "plan-seat__label--teen" : ""} ${guest.guest_type === "nino" ? "plan-seat__label--child" : ""} ${hasConflict ? "plan-seat__label--conflict" : ""}`}
                            fontSize={seatLabelFontSize}
                            textAnchor="middle"
                            x={seatX}
                            y={seatY + 4}
                          >
                            {seatLabel}
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

          <div className="plan-stage__drops" style={{ width: `${zoomedWidth}px`, height: `${zoomedHeight}px` }}>
            {workspace.tables.flatMap((table) => {
            const position = renderedPositions.get(table.id) ?? {
              positionX: table.position_x,
              positionY: table.position_y,
            };
            const seatCount = Math.max(table.capacity, 1);
            const labelRadius = 98;
            const guestsBySeat = buildSeatGuests(table.guests, seatCount);

              return Array.from({ length: seatCount }, (_, seatIndex) => {
              const angle = (Math.PI * 2 * seatIndex) / seatCount - Math.PI / 2;
              const seatX = position.positionX + Math.cos(angle) * labelRadius;
              const seatY = position.positionY + Math.sin(angle) * labelRadius;
              const left = ((seatX - minX) / width) * 100;
              const top = ((seatY - minY) / height) * 100;
              const guest = guestsBySeat.get(seatIndex) ?? null;
              const isDropTarget =
                activeDropSeat?.tableId === table.id && activeDropSeat.seatIndex === seatIndex;

                if (guest) {
                  const { seatRadius } = getSeatVisualMetrics(guest.name);
                  const hitSize = Math.max(seatRadius * 2 + 16, 84);
                  return (
                    <button
                      aria-label={`${guest.name} en mesa ${table.number}, silla ${seatIndex + 1}`}
                      className="plan-seat-hit plan-seat-hit--occupied"
                      draggable
                      key={`seat-hit-${table.id}-${seatIndex}`}
                      onClick={() => onSelectTable(table.id)}
                      onDragEnd={onGuestDragEnd}
                      onDragStart={(event) => onGuestDragStart(event, guest.id)}
                      onMouseEnter={(event) => updateHoveredGuestCardPosition(event.clientX, event.clientY, guest)}
                      onMouseLeave={() => setHoveredGuestCard(null)}
                      onMouseMove={(event) => updateHoveredGuestCardPosition(event.clientX, event.clientY, guest)}
                      style={{ left: `${left}%`, top: `${top}%`, width: `${hitSize}px`, height: `${hitSize}px` }}
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
          {hoveredGuestCard ? (
            <div
              className="plan-guest-tooltip"
              style={{ left: `${hoveredGuestCard.x}px`, top: `${hoveredGuestCard.y}px` }}
            >
              <strong>{hoveredGuestCard.name}</strong>
              <span>Tipo: {hoveredGuestCard.guestType}</span>
              <span>Familia: {hoveredGuestCard.family}</span>
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </section>
  );
}
