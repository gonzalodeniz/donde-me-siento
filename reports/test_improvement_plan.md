# Plan de mejora priorizado de tests

Fecha: 2026-03-17

## Contexto real del repositorio

La revisión externa detectó varios huecos válidos, pero parte del diagnóstico ya está cubierto en el estado actual del código:

- Ya existen tests de sesiones guardadas en [backend/tests/integration/test_events_api.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/tests/integration/test_events_api.py).
- Ya existen tests básicos de PDF en [backend/tests/integration/test_events_api.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/tests/integration/test_events_api.py).
- Ya existen tests de `tables/batch`, `duplicate`, `position` y `workspace/reset` en [backend/tests/integration/test_events_api.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/tests/integration/test_events_api.py).

Por tanto, el plan se centra en huecos reales y no en duplicar cobertura ya presente.

## Objetivos

1. Reforzar tests negativos de seguridad y autorización.
2. Cubrir errores de sesiones y reportes que aún no están ejercitados.
3. Cubrir migraciones ligeras de SQLite en `init_db()`.
4. Dejar preparada una siguiente fase para tests unitarios de frontend, sin tocar funcionalidad productiva.

## Fase 1. Seguridad negativa y servido seguro del frontend

Archivos objetivo:

- [backend/tests/integration/test_auth_api.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/tests/integration/test_auth_api.py)
- [backend/tests/integration/test_frontend_serving.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/tests/integration/test_frontend_serving.py)

Tests a añadir:

- acceso a rutas protegidas con esquema distinto de `Bearer`
- acceso con token inventado o vacío
- logout repetido con token ya invalidado
- path traversal en el servido del frontend (`/assets/../...`)
- intento de acceso a fichero fuera de `frontend-dist`

Verificación:

- `pytest backend/tests/integration/test_auth_api.py backend/tests/integration/test_frontend_serving.py`

## Fase 2. Errores de sesiones y robustez del PDF

Archivos objetivo:

- [backend/tests/integration/test_events_api.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/tests/integration/test_events_api.py)

Tests a añadir:

- guardar sesión con nombre solo de espacios
- cargar/exportar/borrar sesión inexistente
- importar sesión con payload estructuralmente válido pero semánticamente inválido
- PDF con nombres que contengan acentos y paréntesis
- PDF con suficientes invitados para forzar paginación

Verificación:

- `pytest backend/tests/integration/test_events_api.py -k "sessions or report_pdf"`

## Fase 3. Migraciones de SQLite en init_db()

Archivos objetivo:

- [backend/tests/unit/test_db_session.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/tests/unit/test_db_session.py)
- [backend/app/db/session.py](/home/gdeniz/Workspaces/development/donde-me-siento/backend/app/db/session.py) solo como referencia del comportamiento esperado, sin modificar funcionalidad

Tests a añadir:

- base antigua con tabla `guests` sin `seat_index`, `confirmed`, `intolerance` o `menu`
- base antigua con tabla `tables` sin `table_kind` o `rotation_degrees`
- base antigua con `saved_sessions` sin `created_at`
- confirmación de que `init_db()` añade columnas faltantes y rellena `created_at`

Verificación:

- `pytest backend/tests/unit/test_db_session.py`

## Fase 4. Siguiente iteración recomendada

No se implementa en esta tanda salvo que haga falta ampliar alcance:

- introducir `Vitest + React Testing Library`
- extraer utilidades testables de `frontend/src/App.tsx`
- crear tests de componente para [frontend/src/components/SeatingPlan.tsx](/home/gdeniz/Workspaces/development/donde-me-siento/frontend/src/components/SeatingPlan.tsx)

## Orden de ejecución

1. Fase 1
2. Fase 2
3. Fase 3
4. Ejecutar subset de pruebas afectadas
5. Si todo pasa, dejar siguiente tanda lista para frontend unitario
