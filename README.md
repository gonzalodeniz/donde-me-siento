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

## Ejecutar con Docker

La imagen Docker incluida empaqueta:

- frontend compilado con Vite;
- backend FastAPI con Uvicorn;
- FastAPI sirviendo la SPA compilada y la API desde un unico proceso.

Ficheros relevantes:

- Dockerfile: [Dockerfile](/home/gdeniz/Workspaces/development/donde-me-siento/Dockerfile)
- Backend de produccion: [backend/app/main.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/app/main.py)

Construcción de la imagen:

```bash
make docker-build
```

Ejecución del contenedor:

```bash
make docker-run
```

Por defecto se publica la aplicación en `http://127.0.0.1:8080`.

También puedes lanzarla manualmente:

```bash
mkdir -p ./data
docker build -t donde-me-siento:latest .
docker run --rm \
  --name donde-me-siento \
  -p 8080:80 \
  -v "$(pwd)/data:/app/data" \
  donde-me-siento:latest
```

Variables útiles del `Makefile`:

- `DOCKER_IMAGE`: nombre y tag de la imagen. Default `donde-me-siento:latest`
- `DOCKER_CONTAINER`: nombre del contenedor. Default `donde-me-siento`
- `DOCKER_PORT`: puerto publicado en host. Default `8080`
- `DOCKER_DATA_DIR`: directorio local montado en `/app/data`. Default `./data`

Persistencia:

- Debes montar un volumen en `/app/data`

Ese directorio guarda la base de datos SQLite y cualquier dato persistente del backend. Si no lo montas, perderás los datos al eliminar el contenedor.

## Ejecutar con docker compose

Se incluye un despliegue simple con un servicio:

- `app`: ejecuta la imagen `donde-me-siento:latest` y la publica en `8080`

Ficheros incluidos:

- Compose: [docker-compose.yml](/home/gdeniz/Workspaces/development/donde-me-siento/docker-compose.yml)

Antes de levantarlo:

1. Construye la imagen de aplicación:

```bash
make docker-build
```

Arranque:

```bash
make compose-up
```

Parada:

```bash
make compose-down
```

Logs:

```bash
make compose-logs
```

Persistencia con `docker compose`:

- `./data` debe persistirse porque se monta como `/app/data`

Comprobaciones útiles:

```bash
curl -i http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/health
```

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
