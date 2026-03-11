# Donde me siento

Aplicacion para gestionar la distribucion de invitados en bodas y eventos, con validacion de conflictos, control de aforo y persistencia del estado del evento.

## Estado actual

Este repositorio contiene el arranque de la Fase 1 del MVP:

- base documental del proyecto;
- estructura inicial del backend;
- modelo de dominio para eventos, mesas e invitados;
- tests unitarios del dominio.

## Stack objetivo

- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI + SQLAlchemy
- Persistencia: SQLite
- Testing: Pytest, Vitest, Playwright

## Estructura actual

```text
.
├── backend/
│   ├── app/
│   │   ├── core/
│   │   └── domains/
│   └── tests/
├── frontend/
│   ├── src/
│   └── package.json
├── reports/
├── scrum/
├── AGENT.md
├── pytest.ini
├── README.md
└── requirements.txt
```

## Primer alcance implementado

El dominio inicial cubre:

- creacion de eventos con nombre y capacidad por defecto;
- generacion de mesas con posicion base para el plano;
- alta, edicion y baja de invitados;
- asignacion y desasignacion de invitados a mesas;
- validacion de aforo por mesa;
- deteccion de conflictos de agrupacion;
- resumen reactivo del estado del evento.

La API actual cubre:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/events`
- `GET /api/events`
- `GET /api/events/{event_id}`
- `DELETE /api/events/{event_id}`
- `POST /api/events/{event_id}/guests`
- `PUT /api/events/{event_id}/guests/{guest_id}`
- `DELETE /api/events/{event_id}/guests/{guest_id}`
- `PUT /api/events/{event_id}/guests/{guest_id}/assignment`
- `DELETE /api/events/{event_id}/guests/{guest_id}/assignment`
- `GET /api/events/{event_id}/tables/summary`
- `PUT /api/events/{event_id}/tables/{table_id}`
- `GET /api/events/{event_id}/validation`
- `GET /api/events/{event_id}/workspace`

Todos los endpoints de eventos requieren autenticacion Bearer.

El frontend en `frontend/` consume `GET /api/events/{event_id}/workspace` como fuente principal de estado inicial del workspace.
Tambien permite:

- anadir, editar y eliminar invitados;
- asignar y desasignar invitados desde la UI;
- ajustar capacidad individual de mesas;
- refrescar el workspace tras cada mutacion sobre backend.

## Credenciales locales por defecto

- Usuario: `admin`
- Contrasena: `admin1234`

Se pueden cambiar con:

- `DMS_DEFAULT_ADMIN_USERNAME`
- `DMS_DEFAULT_ADMIN_PASSWORD`

## Preparacion del entorno

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Ejecutar tests

```bash
pytest
pytest --cov=backend/app --cov-report=term-missing
```

## Ejecutar backend y frontend

En dos terminales distintas:

```bash
make run-backend
make run-frontend
```

Vite queda configurado con proxy a `http://127.0.0.1:8000` para las rutas `/api`.

## Siguientes pasos recomendados

1. Añadir `backend/app/main.py` con la API FastAPI y endpoint de salud.
2. Incorporar esquemas y repositorios para persistencia en SQLite.
3. Implementar autenticacion basica y primeros endpoints de eventos.
4. Conectar el frontend una vez esten cerrados los contratos de API.
