"""Rutas HTTP para el workspace unico."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from backend.app.api.dependencies import get_current_user, get_event_service
from backend.app.domains.seating import DomainError
from backend.app.schemas.events import (
    DefaultTableCapacityUpdate,
    EventResponse,
    GuestAssignmentRequest,
    GuestCreate,
    GuestUpdate,
    SessionBackupPayload,
    SessionCreateRequest,
    SessionResponse,
    TableBatchCreateRequest,
    TableCapacityUpdate,
    TablePositionUpdate,
    TableSummaryResponse,
    ValidationResponse,
    WorkspaceResponse,
    build_event_response,
    build_validation_response,
    build_workspace_response,
)
from backend.app.services.events import EventService


router = APIRouter(prefix="/api", tags=["workspace"], dependencies=[Depends(get_current_user)])


@router.get("/workspace", response_model=WorkspaceResponse)
async def get_workspace(service: EventService = Depends(get_event_service)) -> WorkspaceResponse:
    """Devuelve el estado agregado del workspace listo para UI."""

    return build_workspace_response(service.get_workspace())


@router.get("/workspace/report.pdf")
async def download_workspace_report(service: EventService = Depends(get_event_service)) -> Response:
    """Genera un PDF imprimible del estado actual del workspace."""

    pdf_bytes = service.generate_workspace_report_pdf()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="donde-me-siento-informe.pdf"'},
    )


@router.post("/guests", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_guest(
    payload: GuestCreate,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Añade un invitado al workspace."""

    try:
        event = service.add_guest(payload)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.put("/guests/{guest_id}", response_model=EventResponse)
async def update_guest(
    guest_id: str,
    payload: GuestUpdate,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Actualiza un invitado existente."""

    try:
        event = service.update_guest(guest_id, payload)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.delete("/guests/{guest_id}", response_model=EventResponse)
async def delete_guest(
    guest_id: str,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Elimina un invitado del workspace."""

    try:
        event = service.delete_guest(guest_id)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.put("/guests/{guest_id}/assignment", response_model=EventResponse)
async def assign_guest(
    guest_id: str,
    payload: GuestAssignmentRequest,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Asigna un invitado a una mesa."""

    try:
        event = service.assign_guest_to_table(guest_id, payload.table_id, payload.seat_index)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.delete("/guests/{guest_id}/assignment", response_model=EventResponse)
async def unassign_guest(
    guest_id: str,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Quita la asignacion de un invitado."""

    try:
        event = service.unassign_guest(guest_id)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.post("/tables", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_table(service: EventService = Depends(get_event_service)) -> EventResponse:
    """Crea una nueva mesa usando el aforo por defecto activo."""

    try:
        event = service.add_table()
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.post("/tables/batch", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_tables_batch(
    payload: TableBatchCreateRequest,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Crea varias mesas en una sola acción."""

    try:
        event = service.add_tables(payload.count, payload.capacity)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.post("/tables/{table_id}/duplicate", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_table(
    table_id: str,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Duplica una mesa existente con el mismo aforo."""

    try:
        event = service.duplicate_table(table_id)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.delete("/tables/{table_id}", response_model=EventResponse)
async def delete_table(
    table_id: str,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Retira una mesa vacía y recompone la numeración del salón."""

    try:
        event = service.remove_table(table_id)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.get("/validation", response_model=ValidationResponse)
async def get_workspace_validation(service: EventService = Depends(get_event_service)) -> ValidationResponse:
    """Expone el estado de validacion listo para el frontend."""

    return build_validation_response(service.get_workspace())


@router.get("/tables/summary", response_model=list[TableSummaryResponse])
async def get_tables_summary(service: EventService = Depends(get_event_service)) -> list[TableSummaryResponse]:
    """Devuelve el resumen de mesas para el panel de control."""

    return build_validation_response(service.get_workspace()).tables


@router.put("/tables/{table_id}", response_model=EventResponse)
async def update_table_capacity(
    table_id: str,
    payload: TableCapacityUpdate,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Ajusta la capacidad individual de una mesa."""

    try:
        event = service.update_table_capacity(table_id, payload.capacity)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.put("/tables/{table_id}/position", response_model=EventResponse)
async def update_table_position(
    table_id: str,
    payload: TablePositionUpdate,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Reubica manualmente una mesa dentro del plano interactivo."""

    try:
        event = service.update_table_position(table_id, payload.position_x, payload.position_y)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.put("/workspace/default-table-capacity", response_model=EventResponse)
async def update_default_table_capacity(
    payload: DefaultTableCapacityUpdate,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Actualiza el aforo por defecto aplicado a mesas nuevas."""

    try:
        event = service.update_default_table_capacity(payload.capacity)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.post("/workspace/reset", response_model=EventResponse)
async def reset_workspace(service: EventService = Depends(get_event_service)) -> EventResponse:
    """Vacía el salón para iniciar una nueva sesión desde cero."""

    try:
        event = service.reset_workspace()
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(service: EventService = Depends(get_event_service)) -> list[SessionResponse]:
    """Lista las sesiones guardadas del workspace."""

    return [SessionResponse(**session) for session in service.list_sessions()]


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def save_session(
    payload: SessionCreateRequest,
    service: EventService = Depends(get_event_service),
) -> SessionResponse:
    """Guarda la distribución actual como una sesión reutilizable."""

    try:
        return SessionResponse(**service.save_session(payload.name))
    except (DomainError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/load", response_model=EventResponse)
async def load_session(
    session_id: str,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Carga una sesión guardada sobre el workspace actual."""

    try:
        event = service.load_session(session_id)
    except (DomainError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.get("/sessions/{session_id}/export", response_model=SessionBackupPayload)
async def export_session(
    session_id: str,
    service: EventService = Depends(get_event_service),
) -> SessionBackupPayload:
    """Exporta una sesión guardada a un fichero descargable."""

    try:
        return SessionBackupPayload(**service.export_session(session_id))
    except (DomainError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/sessions/import", response_model=EventResponse)
async def import_session(
    payload: SessionBackupPayload,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Importa una sesión desde fichero y la carga en el workspace actual."""

    try:
        event = service.import_session(payload.model_dump())
    except (DomainError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    service: EventService = Depends(get_event_service),
) -> None:
    """Elimina una sesión guardada."""

    if not service.delete_session(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="La sesión no existe.")
