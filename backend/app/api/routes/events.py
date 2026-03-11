"""Rutas HTTP para eventos."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.dependencies import get_current_user, get_event_service
from backend.app.domains.seating import DomainError
from backend.app.schemas.events import (
    EventCreate,
    EventResponse,
    EventSummaryResponse,
    GuestAssignmentRequest,
    GuestCreate,
    GuestResponse,
    GuestUpdate,
    ValidationResponse,
    build_event_response,
    build_validation_response,
)
from backend.app.services.events import EventNotFoundError, EventService


router = APIRouter(prefix="/api/events", tags=["events"], dependencies=[Depends(get_current_user)])


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Crea un evento con sus mesas iniciales."""

    try:
        event = service.create_event(payload)
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.get("", response_model=list[EventSummaryResponse])
async def list_events(service: EventService = Depends(get_event_service)) -> list[EventSummaryResponse]:
    """Lista los eventos persistidos."""

    events = service.list_events()
    return [
        EventSummaryResponse(
            id=event.id,
            name=event.name,
            date=event.date,
            default_table_capacity=event.default_table_capacity,
            table_count=len(event.tables),
            guest_count=len(event.guests),
        )
        for event in events
    ]


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: str, service: EventService = Depends(get_event_service)) -> EventResponse:
    """Recupera el estado completo de un evento."""

    try:
        event = service.get_event(event_id)
    except EventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado") from exc

    return build_event_response(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, service: EventService = Depends(get_event_service)) -> None:
    """Elimina un evento persistido."""

    try:
        service.delete_event(event_id)
    except EventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado") from exc


@router.post("/{event_id}/guests", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_guest(
    event_id: str,
    payload: GuestCreate,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Añade un invitado a un evento."""

    try:
        event = service.add_guest(event_id, payload)
    except EventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado") from exc
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.put("/{event_id}/guests/{guest_id}", response_model=EventResponse)
async def update_guest(
    event_id: str,
    guest_id: str,
    payload: GuestUpdate,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Actualiza un invitado existente."""

    try:
        event = service.update_guest(event_id, guest_id, payload)
    except EventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado") from exc
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.delete("/{event_id}/guests/{guest_id}", response_model=EventResponse)
async def delete_guest(
    event_id: str,
    guest_id: str,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Elimina un invitado del evento."""

    try:
        event = service.delete_guest(event_id, guest_id)
    except EventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado") from exc
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.put("/{event_id}/guests/{guest_id}/assignment", response_model=EventResponse)
async def assign_guest(
    event_id: str,
    guest_id: str,
    payload: GuestAssignmentRequest,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Asigna un invitado a una mesa."""

    try:
        event = service.assign_guest_to_table(event_id, guest_id, payload.table_id)
    except EventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado") from exc
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.delete("/{event_id}/guests/{guest_id}/assignment", response_model=EventResponse)
async def unassign_guest(
    event_id: str,
    guest_id: str,
    service: EventService = Depends(get_event_service),
) -> EventResponse:
    """Quita la asignacion de un invitado."""

    try:
        event = service.unassign_guest(event_id, guest_id)
    except EventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado") from exc
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return build_event_response(event)


@router.get("/{event_id}/validation", response_model=ValidationResponse)
async def get_event_validation(
    event_id: str,
    service: EventService = Depends(get_event_service),
) -> ValidationResponse:
    """Expone el estado de validacion listo para el frontend."""

    try:
        event = service.get_event(event_id)
    except EventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado") from exc

    return build_validation_response(event)
