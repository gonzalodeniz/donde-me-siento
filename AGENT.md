# AGENT.md

## Objetivo del proyecto

Construir el MVP de Donde me siento: una aplicacion cliente-servidor con workspace unico para gestionar invitados, asignarlos a mesas, validar conflictos y ofrecer una interfaz visual operativa para seating.

## Estado actual

El repositorio ya cubre una Fase 1 funcional:

- backend FastAPI con autenticacion cerrada;
- persistencia SQLite con SQLAlchemy;
- dominio de seating para workspace, mesas e invitados;
- API protegida para workspace, invitados, asignaciones, validacion y mesas;
- frontend React + Vite + TypeScript con pantalla de acceso separada;
- plano interactivo del salon con drag & drop;
- tests backend y E2E operativos.

## Convenciones recomendadas

- Idioma principal de codigo auxiliar, documentacion y textos funcionales: espanol.
- Mantener separacion clara entre dominio, persistencia, servicios y transporte HTTP.
- Tratar `GET /api/workspace` como contrato principal para la carga del frontend.
- Mantener nombres de dominio alineados con backlog y producto: mesa, invitado, agrupacion, asignacion, aforo, workspace.
- Priorizar cambios incrementales cubiertos por tests antes de ampliar UI o API.

## Estructura actual del repositorio

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── dependencies.py
│   │   │   └── routes/
│   │   │       ├── auth.py
│   │   │       └── events.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── security.py
│   │   ├── db/
│   │   │   ├── base.py
│   │   │   └── session.py
│   │   ├── domains/
│   │   │   └── seating.py
│   │   ├── models/
│   │   │   ├── auth.py
│   │   │   └── event.py
│   │   ├── repositories/
│   │   │   ├── auth.py
│   │   │   └── events.py
│   │   ├── schemas/
│   │   │   ├── auth.py
│   │   │   └── events.py
│   │   ├── services/
│   │   │   ├── auth.py
│   │   │   └── events.py
│   │   └── main.py
│   └── tests/
│       ├── integration/
│       ├── unit/
│       └── conftest.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── SeatingPlan.tsx
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   └── types.ts
│   ├── tests/e2e/
│   ├── package.json
│   ├── playwright.config.ts
│   └── vite.config.ts
├── reports/
│   ├── implementation_plan.md
│   ├── login_screen_plan.md
│   ├── random_login_pair_plan.md
│   └── remove_events_plan.md
├── scrum/
│   ├── product_backlog.md
│   ├── product_goal.md
│   └── vision_producto.md
├── Makefile
├── README.md
├── requirements.txt
└── pytest.ini
```

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
- usa un titulo principal `dónde me siento` y copy editorial en el acceso;
- muestra el usuario de forma automatica y no editable;
- entra directamente en la app principal tras iniciar sesion;
- deja el cierre de sesion como accion discreta dentro del workspace;
- usa `GET /api/workspace` como fuente principal del estado inicial;
- pinta metricas, mesas, invitados sin asignar y conflictos de agrupacion;
- soporta asignacion manual y drag & drop sobre el plano.

## Credenciales locales

- Usuario: `raquel` / Contrasena: `héctor`
- Usuario: `héctor` / Contrasena: `raquel`

## Variables de entorno soportadas

- `DMS_DATABASE_URL`
- `DMS_DATA_DIR`
- `VITE_API_PROXY_TARGET`

## Comandos utiles

```bash
pytest
pytest --cov=backend/app --cov-report=term-missing
make run-backend
make run-frontend
make run-app
make build-frontend
make test-e2e
```

## Criterios de trabajo recomendados

- Si se cambia logica de dominio o servicios, ampliar tests backend.
- Si se cambia el contrato de `workspace`, actualizar tipos y cliente en `frontend/src`.
- Si se cambia el copy o la jerarquia del acceso, revisar tambien el E2E.
- Si se anaden endpoints nuevos, reflejarlos tambien en `README.md`.
- Mantener la cobertura backend por encima del 80%.

## Prioridades siguientes

1. Mantener estable el flujo completo del workspace unico.
2. Evitar reintroducir gestion de eventos o multiespacio.
3. Añadir reseteo controlado del workspace solo si el backlog lo vuelve necesario.
4. Extender exportacion y operaciones avanzadas sin romper el contrato actual del frontend.
