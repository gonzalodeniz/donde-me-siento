# AGENT.md

## Objetivo del proyecto

Construir el MVP de Donde me siento: una aplicacion cliente-servidor para gestionar eventos y distribuir invitados por mesas con validaciones de capacidad y agrupacion.

## Alcance actual

La base creada en esta iteracion cubre el dominio inicial del backend y la infraestructura minima de testing para avanzar sobre la Fase 1.

## Convenciones recomendadas

- Idioma principal del proyecto y la documentacion: espanol.
- Backend en `backend/app` y tests en `backend/tests`.
- Separar dominio, API, persistencia y servicios para evitar mezclar reglas de negocio con transporte o base de datos.
- Priorizar reglas de negocio testeadas antes de exponer endpoints o montar UI.
- Mantener tipos y nombres de dominio consistentes con el backlog: evento, mesa, invitado, agrupacion, asignacion.

## Estructura recomendada para Fase 1

- `backend/app/core`: configuracion y utilidades transversales.
- `backend/app/domains`: entidades y reglas de negocio.
- `backend/app/schemas`: contratos de entrada y salida de API.
- `backend/app/repositories`: acceso a datos.
- `backend/app/services`: casos de uso orquestados.
- `backend/app/api`: rutas FastAPI.

## Dependencias base

- `fastapi` para API.
- `sqlalchemy` para persistencia.
- `uvicorn` para ejecucion local.
- `pytest` y `pytest-cov` para pruebas y cobertura.

## Comandos utiles

```bash
pytest
pytest --cov=backend/app --cov-report=term-missing
```

## Prioridades inmediatas

1. Exponer el dominio actual mediante FastAPI.
2. Añadir persistencia SQLite para eventos y mesas.
3. Implementar autenticacion basica de organizador.
4. Mantener cobertura superior al 80% sobre el codigo nuevo.
