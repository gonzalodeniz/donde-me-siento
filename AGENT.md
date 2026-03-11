# AGENT.md

## Objetivo del proyecto

Construir el MVP de Donde me siento: una aplicacion cliente-servidor para crear eventos, gestionar invitados, asignarlos a mesas, validar conflictos y cargar un workspace listo para el frontend.

## Estado actual

El repositorio ya incluye una base funcional de Fase 1:

- backend FastAPI con autenticacion basica;
- persistencia SQLite con SQLAlchemy;
- dominio de seating para eventos, mesas e invitados;
- API protegida para eventos, invitados, asignaciones, validacion y workspace;
- frontend React + Vite + TypeScript consumiendo el endpoint agregado del workspace;
- tests backend con cobertura superior al 80%.

## Convenciones recomendadas

- Idioma principal de codigo auxiliar, documentacion y textos funcionales: espanol.
- Mantener separacion clara entre dominio, persistencia, servicios y transporte HTTP.
- Tratar `GET /api/events/{event_id}/workspace` como contrato principal para carga inicial del frontend.
- Mantener nombres de dominio alineados con backlog y producto: evento, mesa, invitado, agrupacion, asignacion, aforo, workspace.
- Priorizar cambios incrementales cubiertos por tests antes de ampliar UI o API.

## Estructura actual recomendada

- `backend/app/core`: configuracion y seguridad.
- `backend/app/db`: engine, sesiones y base SQLAlchemy.
- `backend/app/models`: modelos ORM.
- `backend/app/domains`: reglas de negocio de seating.
- `backend/app/repositories`: acceso a datos.
- `backend/app/services`: casos de uso.
- `backend/app/schemas`: contratos HTTP y respuestas agregadas.
- `backend/app/api`: dependencias y rutas FastAPI.
- `backend/tests`: tests unitarios e integracion.
- `frontend/src`: app React, tipos, API client y estilos.

## Backend disponible

La API actual cubre:

- autenticacion: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`;
- eventos: crear, listar, recuperar y eliminar;
- invitados: crear, editar y eliminar;
- asignaciones: asignar y desasignar invitados a mesas;
- mesas: resumen y ajuste de capacidad individual;
- validacion: conflictos de agrupacion y resumen de aforo;
- workspace: estado agregado listo para UI.

Todos los endpoints de eventos requieren Bearer token.

## Frontend disponible

El frontend en `frontend/`:

- inicia sesion contra el backend;
- carga la lista de eventos;
- usa `GET /api/events/{event_id}/workspace` como fuente principal del estado inicial;
- pinta metricas, mesas, invitados sin asignar y conflictos de agrupacion.

## Credenciales locales por defecto

- Usuario: `admin`
- Contrasena: `admin1234`

Variables de entorno soportadas:

- `DMS_DATABASE_URL`
- `DMS_DATA_DIR`
- `DMS_DEFAULT_ADMIN_USERNAME`
- `DMS_DEFAULT_ADMIN_PASSWORD`

## Comandos utiles

```bash
pytest
pytest --cov=backend/app --cov-report=term-missing
make run-backend
make install-frontend
make run-frontend
make build-frontend
```

## Criterios de trabajo recomendados

- Si se cambia logica de dominio o servicios, ampliar tests backend.
- Si se cambia el contrato de `workspace`, actualizar tipos y cliente en `frontend/src`.
- Si se anaden endpoints nuevos, reflejarlos tambien en `README.md`.
- Mantener la cobertura backend por encima del 80%.

## Prioridades siguientes

1. Completar operaciones interactivas del frontend sobre invitados, asignaciones y mesas.
2. Añadir refresco/actualizacion de workspace tras mutaciones desde UI.
3. Preparar la base de estado global del frontend para el workspace.
4. Empezar el plano interactivo del salon y el panel de control visual.
