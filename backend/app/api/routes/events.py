"""Rutas HTTP para el workspace unico."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.dependencies import get_current_user, get_event_service
from backend.app.domains.seating import DomainError
from backend.app.schemas.events import (
    DefaultTableCapacityUpdate,
    EventResponse,
    GuestAssignmentRequest,
    GuestCreate,
    GuestUpdate,
    TableCapacityUpdate,
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
        event = service.assign_guest_to_table(guest_id, payload.table_id)
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
