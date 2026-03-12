# Plan para eliminar la funcionalidad de eventos

## Objetivo

Retirar del producto y de la implementacion toda la gestion de multiples eventos para operar siempre sobre un unico workspace persistente.

## Alcance

1. Actualizar artefactos funcionales en `scrum/` para reflejar:
   - evento unico y fijo;
   - desaparicion de crear/cargar/eliminar eventos;
   - simplificacion del flujo principal.
2. Eliminar del frontend:
   - rail de creacion y gestion de eventos;
   - carga de listas de eventos;
   - confirmacion de borrado de eventos;
   - dependencias de `selectedEventId`.
3. Simplificar backend:
   - retirar endpoints CRUD de eventos;
   - exponer rutas directas para `workspace`, `guests`, `tables` y `validation`;
   - garantizar la existencia del workspace unico al arrancar o al primer acceso.
4. Ajustar tests y documentacion:
   - tests de integracion del backend sobre workspace unico;
   - E2E del frontend sin flujo de creacion de evento;
   - README y AGENT alineados con el nuevo modelo.

## Decisiones tecnicas

- Se mantiene el agregado de dominio `Event` como contenedor interno del workspace.
- El backend tratara ese agregado como singleton persistido.
- El frontend consumira un contrato unico:
  - `GET /api/workspace`
  - `POST /api/guests`
  - `PUT /api/guests/{guest_id}`
  - `DELETE /api/guests/{guest_id}`
  - `PUT /api/guests/{guest_id}/assignment`
  - `DELETE /api/guests/{guest_id}/assignment`
  - `GET /api/validation`
  - `GET /api/tables/summary`
  - `PUT /api/tables/{table_id}`

## Riesgos

- Tests y E2E antiguos pueden quedar acoplados al rail de eventos o a `/api/events/...`.
- La persistencia existente puede contener varios eventos historicos; hay que definir una estrategia de seleccion del workspace unico.
- Parte de la documentacion actual describe capacidades de multievento y quedara obsoleta si no se actualiza.

## Orden de ejecucion

1. Ajustar `scrum/`.
2. Eliminar gestion de eventos del frontend.
3. Simplificar API y servicio backend.
4. Reescribir tests.
5. Actualizar documentacion operativa.
