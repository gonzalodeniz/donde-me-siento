# Donde me siento

Aplicacion para gestionar la distribucion de invitados con validacion de conflictos, control de aforo y persistencia sobre un unico workspace.

## Estado actual

Este repositorio contiene el arranque de la Fase 1 del MVP:

- base documental del proyecto;
- estructura inicial del backend;
- modelo de dominio para workspace, mesas e invitados;
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

- generacion de mesas con posicion base para el plano;
- alta, edicion y baja de invitados;
- asignacion y desasignacion de invitados a mesas;
- validacion de aforo por mesa;
- deteccion de conflictos de agrupacion;
- resumen reactivo del estado del workspace.

La API actual cubre:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/workspace`
- `POST /api/guests`
- `PUT /api/guests/{guest_id}`
- `DELETE /api/guests/{guest_id}`
- `PUT /api/guests/{guest_id}/assignment`
- `DELETE /api/guests/{guest_id}/assignment`
- `GET /api/tables/summary`
- `PUT /api/tables/{table_id}`
- `GET /api/validation`

Todos los endpoints del workspace requieren autenticacion Bearer.

El frontend en `frontend/` consume `GET /api/workspace` como fuente principal de estado inicial.
Tambien permite:

- anadir, editar y eliminar invitados;
- asignar y desasignar invitados desde la UI;
- asignar invitados por drag & drop desde la lista al plano del salon;
- ajustar capacidad individual de mesas;
- visualizar un plano interactivo del salon con mesas redondas e invitados alrededor;
- resaltar conflictos de agrupacion y mesas seleccionadas en el plano;
- mostrar un panel de control con resumen de ocupacion por mesa y detalle de la mesa seleccionada;
- refrescar el workspace tras cada mutacion sobre backend.

## Credenciales locales

El login solo admite dos combinaciones fijas:

- Usuario: `raquel` / Contrasena: `héctor`
- Usuario: `héctor` / Contrasena: `raquel`

En la interfaz, el usuario aparece automaticamente y de forma aleatoria entre esos dos nombres. Solo hay que escribir la contrasena opuesta.

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

## Ejecutar E2E

```bash
make install-e2e
make test-e2e
```

El flujo E2E actual cubre: login, alta de invitados, asignacion por drag & drop, recarga del workspace y estados UX de conflicto/aforo.

## Siguientes pasos recomendados

1. Limpiar funcionalidades residuales de multievento que ya no se usan.
2. Preparar una operacion explicita de reseteo de workspace si se necesita en v2.
3. Mantener alineados contratos, tests y documentacion del workspace unico.
