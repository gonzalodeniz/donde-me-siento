# Plan de implementación: panel lateral de control

## Objetivo

Rediseñar la barra lateral izquierda para que funcione como panel principal de organización del salón con una estética íntima, editorial y no técnica.

## Resultado esperado

La columna izquierda debe sentirse como el estudio privado de un planificador de bodas:

- fondo crema beige suave;
- tipografía serif elegante en marrón oscuro;
- mucho aire entre bloques;
- copy humano y sin lenguaje técnico;
- foco en gestión de mesas, asientos estándar y estado del banquete.

## Bloques funcionales a implementar

### 1. Cabecera

- Mantener `dónde me siento`.
- Mantener `Diseño del Salón`.
- Eliminar textos explicativos técnicos o de contexto de sistema.

### 2. Gestión de Mesas

- Crear un bloque principal con un botón `+ Crear Nuestra Mesa`.
- Añadir iconografía sutil asociada a mesa/asiento.
- Preparar el espacio para una futura acción secundaria de borrado de mesa, sin introducirla visualmente hasta cerrar el flujo de alta.

### 3. Asientos estándar

- Mostrar el título `Asientos estándar`.
- Añadir un control stepper minimalista con menos, valor central y mas.
- Mostrar debajo el texto:
  `Ajusta cuántos invitados se sientan de forma estándar en cada nueva mesa.`
- Conectar el valor al backend o, si aún no existe endpoint específico, definir el contrato necesario.

### 4. Nuestro Banquete

- Sustituir el bloque actual de resumen por una presentación editorial:
  - `Total invitados`
  - `Ya sentados`
  - `Por sentar`
- Resaltar `Por sentar` con terracota suave.
- Eliminar cualquier referencia a workspace, backend, ids o estados técnicos.

## Cambios técnicos necesarios

### Frontend

- Reestructurar la barra lateral actual en componentes o subbloques claros.
- Crear estilos específicos para:
  - botón principal de mesas;
  - stepper minimalista;
  - lista editorial de métricas.
- Revisar espaciado, alineaciones y jerarquía tipográfica.

### Backend

- Verificar si ya existe soporte para:
  - crear mesas;
  - borrar mesas;
  - actualizar aforo estándar por defecto.
- Si no existe, añadir endpoints y servicio para soportar el panel.

### Contratos y estado

- Mantener el `workspace` como fuente de verdad interna.
- Ocultar ese lenguaje en la UI final.
- Decidir si el aforo estándar vive como atributo editable del workspace y si la creación de mesa debe recalcular posiciones del plano.

## Orden recomendado

1. Ajustar contratos backend para crear mesa y cambiar aforo estándar.
2. Añadir cliente API y estado frontend para esas acciones.
3. Rediseñar visualmente la barra lateral.
4. Integrar métricas editoriales y eliminar copy técnico residual.
5. Añadir tests de integración y E2E del nuevo flujo.

## Riesgos

- La creación de mesas puede exigir recalcular posiciones del plano y numeración.
- Cambiar el aforo estándar sin un contrato claro puede dejar incoherencia entre mesas ya creadas y mesas nuevas.
- Un rediseño solo visual sin soporte backend dejaría el botón principal sin valor real.

## Criterios de cierre

- La barra lateral muestra los tres bloques definidos.
- El usuario puede crear una mesa desde la UI.
- El usuario puede ajustar el aforo estándar desde la UI.
- El bloque `Nuestro Banquete` refleja datos reales del workspace sin lenguaje técnico.
- Los tests cubren el nuevo flujo principal del panel.
