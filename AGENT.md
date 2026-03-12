# AGENT.md

## Objetivo del proyecto

Construir el MVP de Donde me siento: una aplicacion cliente-servidor con workspace unico para gestionar invitados, asignarlos a mesas, validar conflictos y servir una UI operativa.

## Estado actual

El repositorio ya incluye una base funcional de Fase 1:

- backend FastAPI con autenticacion basica;
- persistencia SQLite con SQLAlchemy;
- dominio de seating para workspace, mesas e invitados;
- API protegida para workspace, invitados, asignaciones, validacion y mesas;
- frontend React + Vite + TypeScript consumiendo el endpoint agregado del workspace;
- tests backend con cobertura superior al 80%.

## Convenciones recomendadas

- Idioma principal de codigo auxiliar, documentacion y textos funcionales: espanol.
- Mantener separacion clara entre dominio, persistencia, servicios y transporte HTTP.
- Tratar `GET /api/workspace` como contrato principal para carga inicial del frontend.
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
- workspace unico: carga y persistencia automatica;
- invitados: crear, editar y eliminar;
- asignaciones: asignar y desasignar invitados a mesas;
- mesas: resumen y ajuste de capacidad individual;
- validacion: conflictos de agrupacion y resumen de aforo;
- workspace: estado agregado listo para UI.

Todos los endpoints del workspace requieren Bearer token.

## Frontend disponible

El frontend en `frontend/`:

- muestra una pantalla de acceso independiente antes de autenticar;
- entra directamente en la app principal tras iniciar sesion;
- deja el cierre de sesion como accion discreta dentro del workspace;
- usa `GET /api/workspace` como fuente principal del estado inicial;
- pinta metricas, mesas, invitados sin asignar y conflictos de agrupacion.

## Credenciales locales

- Usuario: `raquel` / Contrasena: `héctor`
- Usuario: `héctor` / Contrasena: `raquel`

Variables de entorno soportadas:

- `DMS_DATABASE_URL`
- `DMS_DATA_DIR`

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

1. Eliminar restos documentales y tecnicos de multievento si aparecen.
2. Mantener estable el flujo completo del workspace unico.
3. Añadir reseteo controlado del workspace solo si el backlog lo vuelve necesario.
4. Extender exportacion y operaciones avanzadas sin reintroducir gestion de eventos.
