# Plan de implementación

## Resumen ejecutivo

Este plan define cómo llevar Donde-me-siento desde su visión de producto hasta una primera entrega operativa, priorizando un MVP que permita crear eventos, configurar mesas, gestionar invitados, validar conflictos y persistir el trabajo sobre una arquitectura cliente-servidor con almacenamiento en disco. La secuencia propuesta reduce riesgo técnico en el plano interactivo y asegura que cada fase entregue una capacidad completa y usable.

## Stack tecnológico propuesto

### Frontend

**React + TypeScript**

Se ajusta bien al backlog MVP porque el producto exige una UI altamente reactiva entre listas, plano y panel de control (TT-05, TT-06, TT-11), además de una base mantenible para evolucionar a exportación, versiones y colaboración en fases posteriores.

### Backend

**Python + FastAPI + SQLAlchemy**

Es la opción más adecuada para introducir persistencia real en backend sin penalizar velocidad de desarrollo del MVP. FastAPI permite exponer APIs tipadas y sencillas para autenticación, eventos, invitados y asignaciones; SQLAlchemy facilita aislar el dominio del almacenamiento concreto y deja la puerta abierta a crecer en complejidad sin rehacer la capa de acceso a datos.

### Base de datos

**SQLite**

Para un producto con menos de 200 usuarios y sin colaboración simultánea intensiva en tiempo real, SQLite es una opción adecuada: mantiene persistencia en disco, simplifica despliegue y reduce coste operativo. Su principal límite aparece cuando hay muchas escrituras concurrentes o necesidad de escalar a varios procesos/nodos compartiendo la misma base de datos.

### Gestión de estado

**Zustand con slices por dominio**

Permite modelar de forma simple y predecible el estado global de eventos, mesas, invitados, asignaciones y conflictos requerido por TT-11, sin el sobrecoste ceremonial de Redux. Encaja especialmente bien con actualizaciones frecuentes por drag & drop y validación inmediata tras cada cambio (TT-04).

### Persistencia

**API REST + SQLite con persistencia en disco**

TT-07 debe implementarse contra un backend que persista eventos, invitados, asignaciones y versiones en SQLite sobre disco. El frontend trabajará con contratos HTTP claros y una capa de repositorio desacoplada para no depender del detalle de transporte. Así se garantiza guardado fiable fuera del navegador, recuperación entre sesiones y una base suficiente para el volumen esperado del MVP.

### Testing

**Vitest + React Testing Library + Playwright + Pytest**

Vitest cubre lógica de dominio y validación (TT-04, TT-11) con arranque rápido dentro del stack de Vite. React Testing Library valida flujos de UI críticos como login, asignaciones y listas. Pytest cubre API, reglas de negocio en backend y persistencia. Playwright cubre los recorridos de mayor riesgo del MVP: autenticación, creación de evento, drag & drop y guardado/carga.

### Build

**Vite**

Es la opción más directa para una SPA en React con TypeScript, minimiza tiempo de arranque del proyecto (TT-10) y simplifica la integración con Vitest, assets del plano y futura generación de builds de exportación.

## Estructura de carpetas del proyecto

```text
/
├── reports/
│   └── implementation_plan.md
├── scrum/
│   ├── product_backlog.md
│   ├── product_goal.md
│   └── vision_producto.md
├── public/
│   └── favicon.svg
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── router/
│   │   │   ├── providers/
│   │   │   └── store/
│   │   ├── domains/
│   │   │   ├── auth/
│   │   │   │   ├── components/
│   │   │   │   ├── services/
│   │   │   │   ├── store/
│   │   │   │   └── types/
│   │   │   ├── events/
│   │   │   │   ├── components/
│   │   │   │   ├── services/
│   │   │   │   ├── store/
│   │   │   │   └── types/
│   │   │   ├── guests/
│   │   │   │   ├── components/
│   │   │   │   ├── services/
│   │   │   │   ├── store/
│   │   │   │   └── types/
│   │   │   ├── seating/
│   │   │   │   ├── components/
│   │   │   │   ├── services/
│   │   │   │   ├── store/
│   │   │   │   └── types/
│   │   │   └── export/
│   │   │       ├── components/
│   │   │       ├── services/
│   │   │       └── types/
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── styles/
│   │   │   ├── types/
│   │   │   └── utils/
│   │   ├── pages/
│   │   │   ├── login/
│   │   │   ├── events/
│   │   │   └── workspace/
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── e2e/
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── playwright.config.ts
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── domains/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── schemas/
│   │   └── services/
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── pyproject.toml
│   └── alembic.ini
└── docker-compose.yml
```

## Fases de implementación

### Fase 1 · MVP operativo

#### Objetivo de la fase

Entregar una aplicación usable de extremo a extremo que permita autenticarse, crear y recuperar eventos, configurar el salón, gestionar invitados, asignarlos a mesas desde lista o mediante drag & drop, visualizar conflictos y guardar el estado completo en backend con persistencia en disco.

#### Ítems del backlog incluidos

TT-09, TT-10, TT-11, TT-12, TT-01, TT-02, TT-03, TT-04, TT-05, TT-06, TT-07, CU-01, CU-02, CU-03, CU-04, CU-05, CU-06, CU-07, CU-08, CU-09, CU-12, CU-13, CU-14, CU-15, CU-16, CU-17, CU-18, CU-19, CU-20, CU-21, CU-22, CU-23.

#### Entregable al final de la fase

Una SPA autenticada conectada a un backend API que permite gestionar múltiples eventos persistidos en SQLite, con plano interactivo actualizado en tiempo real, panel de aforo, validación de agrupaciones y flujos completos de guardar, cargar y eliminar eventos.

#### Criterio de entrada a la siguiente fase

El MVP debe pasar pruebas unitarias de validación, pruebas de integración de persistencia y al menos un flujo E2E estable para login, creación de evento, asignación por drag & drop y recuperación del evento guardado.

### Fase 2 · v2 de eficiencia operativa

#### Objetivo de la fase

Reducir trabajo manual del organizador y preparar la salida operativa final del evento mediante importación, control de asistencia, exportación y manejo de versiones.

#### Ítems del backlog incluidos

CU-10, CU-11, CU-24, CU-25, CU-26, CU-27, TT-08.

#### Entregable al final de la fase

Módulo de importación de invitados, estados de asistencia visibles en listas y aforo, capacidad de guardar versiones del mismo evento y exportación/imprensión de plano y listados listos para entregar.

#### Criterio de entrada a la siguiente fase

La importación debe tolerar errores de formato con mensajes claros, las exportaciones deben ser reproducibles y las versiones deben poder compararse y cargarse sin corromper el estado del evento principal.

### Fase 3 · v3 de escalado funcional

#### Objetivo de la fase

Evolucionar el producto hacia automatización avanzada, colaboración y reutilización de configuraciones de salón.

#### Ítems del backlog incluidos

No existen ítems `CU-XX` o `TT-XX` definidos para v3 en `scrum/product_backlog.md`. El `product_goal.md` sí marca como alcance v3 la optimización automática por restricciones, colaboración multiusuario, plantillas de salón, compartir resultados con terceros y analytics, pero antes de implementar esta fase hay que desglosar esos objetivos en backlog ejecutable.

#### Entregable al final de la fase

Backlog v3 refinado y priorizado, con historias y tareas técnicas estimables; solo después debe iniciarse la construcción de la funcionalidad v3.

#### Criterio de entrada a la siguiente fase

Definición explícita de historias v3 con criterios de aceptación, validación del modelo de permisos para colaboración y decisión de escalado de la arquitectura backend ya implantada en MVP/v2.

## Orden de implementación dentro del MVP

1. **TT-09 · Definir stack tecnológico y estructura del proyecto**. Requiere: sin dependencias previas.
2. **TT-10 · Configurar entorno de desarrollo**. Requiere: TT-09.
3. **TT-12 · Diseño visual base y sistema de componentes**. Requiere: TT-09, TT-10.
4. **TT-02 · Modelo de datos del evento y configuración del salón**. Requiere: TT-09.
5. **TT-03 · Modelo de datos de invitados**. Requiere: TT-02.
6. **TT-11 · Diseño del sistema de estado global**. Requiere: TT-02, TT-03.
7. **TT-01 · Implementar sistema de autenticación básico**. Requiere: TT-09, TT-10.
8. **CU-01 · Login de usuario**. Requiere: TT-01.
9. **TT-07 · Capa de persistencia de eventos**. Requiere: TT-02, TT-03, TT-11.
10. **CU-02 · Crear evento**. Requiere: TT-02, TT-07, TT-11, CU-01.
11. **CU-03 · Configurar número de mesas**. Requiere: TT-02, TT-11, CU-02.
12. **CU-04 · Configurar capacidad por defecto de las mesas**. Requiere: TT-02, TT-11, CU-02.
13. **CU-06 · Añadir invitado**. Requiere: TT-03, TT-11, CU-02.
14. **CU-07 · Editar y eliminar invitado**. Requiere: CU-06.
15. **CU-08 · Definir agrupación entre invitados**. Requiere: TT-03, CU-06, CU-07.
16. **CU-09 · Visualizar listas de invitados con y sin asiento**. Requiere: TT-03, TT-11, CU-06.
17. **TT-04 · Motor de validación de restricciones**. Requiere: TT-02, TT-03, TT-11, CU-08.
18. **TT-05 · Componente de plano interactivo SVG/Canvas**. Requiere: TT-12, TT-11, CU-03, CU-04, CU-09.
19. **CU-17 · Visualizar plano del salón con mesas redondas**. Requiere: TT-05, CU-03, CU-04.
20. **CU-12 · Asignar invitado a mesa escribiendo el número de mesa**. Requiere: TT-11, TT-04, CU-09, CU-17.
21. **CU-13 · Asignar invitado a mesa por arrastrar y soltar**. Requiere: TT-05, TT-04, CU-09, CU-17, CU-12.
22. **CU-14 · Quitar asiento a un invitado**. Requiere: CU-12 o CU-13.
23. **CU-15 · Detectar y advertir conflictos de agrupación**. Requiere: TT-04, CU-08, CU-12.
24. **CU-16 · Detectar aforo superado**. Requiere: TT-04, CU-12.
25. **CU-18 · Actualizar plano en tiempo real al asignar o quitar invitados**. Requiere: TT-05, TT-11, CU-12, CU-14.
26. **CU-19 · Mostrar advertencias visuales de conflicto en el plano**. Requiere: TT-05, TT-04, CU-15.
27. **TT-06 · Componente de panel de control**. Requiere: TT-11, TT-12, CU-03, CU-04.
28. **CU-20 · Ver resumen de mesas y aforo en el panel de control**. Requiere: TT-06, CU-16.
29. **CU-05 · Ajustar capacidad individual de cada mesa**. Requiere: TT-06, TT-04, CU-20.
30. **CU-21 · Guardar el estado del evento**. Requiere: TT-07, CU-02, CU-06, CU-12.
31. **CU-22 · Cargar un evento guardado**. Requiere: TT-07, CU-21, CU-17, CU-20.
32. **CU-23 · Eliminar un evento guardado**. Requiere: TT-07, CU-22.

## Riesgos y decisiones técnicas pendientes

### 1. Drag & drop sobre SVG con reactividad y validación inmediata

**Riesgo**: la combinación de drag & drop, renderizado circular y refresco inmediato del estado puede introducir fallos visuales o asignaciones inconsistentes.

**Impacto estimado**: alto, porque afecta a CU-13, CU-17, CU-18 y CU-19, que son parte central de la propuesta de valor.

**Mitigación propuesta**: implementar primero la asignación por número de mesa (CU-12) como camino funcional base, aislar la lógica de asignación en servicios de dominio y añadir tests E2E específicos para drag & drop antes de cerrar la fase MVP.

### 2. Consistencia entre experiencia reactiva y persistencia remota

**Riesgo**: si la UI depende de actualizaciones optimistas mal resueltas o contratos API poco claros, pueden aparecer divergencias entre el estado en pantalla y el estado persistido en backend.

**Impacto estimado**: alto en MVP y v2, porque afecta a guardado, recuperación y confianza operativa.

**Mitigación propuesta**: definir desde TT-07 una interfaz de repositorio de eventos desacoplada del transporte HTTP y del ORM, usar contratos versionados entre frontend y backend y cubrir operaciones críticas con pruebas de integración API + base de datos.

### 3. Modelado de agrupaciones insuficiente para restricciones futuras

**Riesgo**: el backlog MVP solo habla de agrupaciones, pero `product_goal.md` anticipa restricciones más ricas como no coincidir, preferiblemente juntos, niños con padres y movilidad reducida.

**Impacto estimado**: medio-alto, porque TT-04 puede quedar corto y requerir refactor fuerte en v2/v3.

**Mitigación propuesta**: modelar las agrupaciones actuales como un tipo de restricción dentro de un motor extensible, aunque en MVP solo se active la regla de “misma mesa”.

### 4. Complejidad de exportar el plano manteniendo fidelidad visual

**Riesgo**: si el plano interactivo no nace con una capa de render exportable, TT-08 puede obligar a duplicar lógica visual para PDF o imagen.

**Impacto estimado**: medio en v2.

**Mitigación propuesta**: construir TT-05 sobre un modelo de layout puro, donde posiciones de mesas e invitados puedan renderizarse tanto en pantalla como en exportación.

### 5. Autenticación y gestión de sesión en arquitectura cliente-servidor

**Riesgo**: una autenticación mal resuelta en frontend + backend puede introducir problemas de sesión expirada, rutas desprotegidas o gestión insegura de credenciales.

**Impacto estimado**: medio-alto, porque afecta a CU-01 y al principio de “seguridad por defecto”.

**Mitigación propuesta**: resolver TT-01 con autenticación en backend, contraseñas hasheadas, sesión basada en token seguro o cookie `HttpOnly` y protección de rutas tanto en API como en cliente.

### 6. Gestión de eventos grandes con muchas mesas e invitados

**Riesgo**: el rendimiento del plano y del recálculo de conflictos puede degradarse con eventos de alto volumen.

**Impacto estimado**: medio, visible sobre todo en TT-04, TT-05 y CU-18.

**Mitigación propuesta**: mantener selectores derivados por dominio, recalcular solo mesas e invitados afectados por cada cambio y medir rendimiento con datasets sintéticos antes de cerrar el MVP.

### 7. Falta de backlog v3 detallado

**Riesgo**: iniciar diseño técnico de v3 sin historias concretas puede llevar a sobrediseño prematuro en MVP y v2.

**Impacto estimado**: alto a nivel de planificación y estimación.

**Mitigación propuesta**: cerrar MVP y v2 con puntos de extensión claros, pero no implementar infraestructura de colaboración o analytics hasta que existan CU/TT específicos priorizados.

## Estimación orientativa

### Supuestos de estimación

- Equipo de referencia de 1 desarrollador/a full-stack web senior con apoyo puntual de diseño y revisión.
- Dedicación efectiva de 6 horas productivas por día.
- El MVP y v2 sí incluyen backend propio y base de datos con persistencia en disco.
- No se incluye todavía colaboración multiusuario en tiempo real ni despliegue cloud avanzado.
- La autenticación del MVP se resuelve contra backend propio, no contra un proveedor externo.
- Las estimaciones incluyen desarrollo, pruebas y estabilización básica, pero no periodos largos de discovery adicional.

### Fase 1 · MVP operativo

Estimación: **22 a 28 días/persona**.

Base de cálculo: 4 días para arranque técnico y diseño base (TT-09, TT-10, TT-12), 4 días para modelado y estado (TT-02, TT-03, TT-11), 3 días para autenticación backend y login (TT-01, CU-01), 5 a 6 días para plano, asignaciones y validación (TT-04, TT-05, CU-12 a CU-19), 2 días para panel y capacidad por mesa (TT-06, CU-05, CU-20), 4 a 5 días para API, persistencia y flujos de eventos (TT-07, CU-21 a CU-23), más margen de estabilización.

### Fase 2 · v2 de eficiencia operativa

Estimación: **10 a 14 días/persona**.

Base de cálculo: 2 días para importación de invitados (CU-11), 1 a 2 días para asistencia (CU-10), 2 a 3 días para versiones (CU-24), 4 a 5 días para exportación e impresión y su integración con el plano (TT-08, CU-25, CU-26, CU-27).

### Fase 3 · v3 de escalado funcional

Estimación: **5 a 7 días/persona** para refinamiento y diseño técnico del backlog, **sin incluir implementación funcional**.

Base de cálculo: el backlog actual no define ítems ejecutables para v3; por tanto, la estimación responsable en este momento solo cubre discovery, descomposición en historias, decisiones de arquitectura remota y reestimación posterior.
