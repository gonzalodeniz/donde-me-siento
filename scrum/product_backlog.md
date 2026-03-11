# Product Backlog — Donde-me-siento

Cada ítem sigue el formato:
- **ID**: identificador único
- **Tipo**: `CU` (caso de uso / historia de usuario) o `TT` (tarea técnica)
- **Fase**: MVP / v2 / v3
- **Descripción**
- **Criterios de aceptación** (para CU) o **Resultado esperado** (para TT)

---

## Épica 1 — Autenticación y sesión

### CU-01 · Login de usuario · MVP
**Como** organizador, **quiero** iniciar sesión con usuario y contraseña **para** acceder a la aplicación de forma segura.

Criterios de aceptación:
- Si las credenciales son incorrectas, se muestra un mensaje de error y no se permite el acceso.
- Si las credenciales son correctas, se inicia sesión y se mantiene activa durante toda la sesión del navegador.
- Existe un botón de cierre de sesión visible en todo momento.
- Tras cerrar sesión, no se puede acceder a ninguna pantalla protegida sin volver a autenticarse.

### TT-01 · Implementar sistema de autenticación básico · MVP
Implementar autenticación con usuario/contraseña. Proteger todas las rutas de la aplicación. Gestionar sesión activa y cierre manual. Almacenar credenciales de forma segura (hash + sal).

---

## Épica 2 — Gestión del evento y configuración del salón

### CU-02 · Crear evento · MVP
**Como** organizador, **quiero** crear un nuevo evento indicando su nombre **para** poder gestionar la distribución de invitados de forma independiente para cada celebración.

Criterios de aceptación:
- Se puede crear un evento con nombre.
- El evento queda guardado y es seleccionable desde la pantalla principal.
- Se puede tener más de un evento guardado.

### CU-03 · Configurar número de mesas · MVP
**Como** organizador, **quiero** indicar cuántas mesas habrá en el salón **para** que el plano se genere con la configuración correcta.

Criterios de aceptación:
- Se puede definir el número de mesas al crear o editar el evento.
- El plano refleja inmediatamente el número de mesas configuradas.

### CU-04 · Configurar capacidad por defecto de las mesas · MVP
**Como** organizador, **quiero** indicar un número de asientos por defecto **para** que todas las mesas partan de esa capacidad sin tener que configurarlas una a una.

Criterios de aceptación:
- Se puede indicar un número de asientos por defecto al configurar el evento.
- Todas las mesas nuevas se crean con ese valor.

### CU-05 · Ajustar capacidad individual de cada mesa · MVP
**Como** organizador, **quiero** modificar el número de asientos de una mesa concreta **para** reflejar mesas con capacidad distinta a la estándar.

Criterios de aceptación:
- Desde el panel de control se puede modificar la capacidad de cada mesa individualmente.
- El plano refleja el aforo actualizado de cada mesa.
- No se puede asignar más invitados que el aforo de la mesa; se muestra advertencia si se intenta.

### TT-02 · Modelo de datos del evento y configuración del salón · MVP
Definir la estructura de datos para: evento (nombre, fecha opcional), mesas (id, capacidad, posición en el plano), configuración de capacidad por defecto.

---

## Épica 3 — Gestión de invitados

### CU-06 · Añadir invitado · MVP
**Como** organizador, **quiero** añadir invitados a la lista **para** gestionar quién asistirá al evento.

Criterios de aceptación:
- Se puede añadir un invitado con nombre y tipo (adulto, adolescente, niño).
- El invitado aparece en la lista de invitados sin asignar.

### CU-07 · Editar y eliminar invitado · MVP
**Como** organizador, **quiero** editar o eliminar un invitado **para** mantener la lista actualizada ante cambios.

Criterios de aceptación:
- Se puede editar el nombre y tipo de un invitado.
- Se puede eliminar un invitado; si tenía mesa asignada, el asiento queda libre.

### CU-08 · Definir agrupación entre invitados · MVP
**Como** organizador, **quiero** asociar invitados entre sí indicando que deben sentarse en la misma mesa **para** respetar las relaciones entre ellos.

Criterios de aceptación:
- Se puede crear una agrupación entre dos o más invitados.
- Cada agrupación tiene un identificador visible en las listas.
- Si dos invitados de la misma agrupación están en mesas distintas, se muestra una advertencia visual (rojo o icono) tanto en el plano como en las listas.

### CU-09 · Visualizar listas de invitados con y sin asiento · MVP
**Como** organizador, **quiero** ver en todo momento qué invitados tienen mesa asignada y cuáles no **para** saber el estado real de la distribución.

Criterios de aceptación:
- Existe una lista de invitados sin asignar y otra con asignar, siempre visibles.
- Cada invitado muestra su nombre, tipo e id de agrupación si la tiene.
- Al asignar o quitar asiento, el invitado cambia de lista automáticamente.

### CU-10 · Confirmar asistencia de un invitado · v2
**Como** organizador, **quiero** registrar si un invitado ha confirmado su asistencia **para** gestionar cambios de última hora sin perder la distribución planificada.

Criterios de aceptación:
- Cada invitado tiene un estado de asistencia (pendiente, confirmado, cancelado).
- Los invitados cancelados se marcan visualmente y se excluyen del aforo.

### CU-11 · Importar lista de invitados desde fichero · v2
**Como** organizador, **quiero** importar invitados desde un fichero (CSV u otro formato estándar) **para** no tener que introducirlos manualmente uno a uno.

Criterios de aceptación:
- Se puede cargar un fichero con nombre, tipo e id de agrupación.
- Los invitados importados aparecen en la lista sin asignar.
- Se muestran errores claros si el formato es incorrecto.

### TT-03 · Modelo de datos de invitados · MVP
Definir estructura: invitado (id, nombre, tipo, id_agrupacion, mesa_asignada, estado_asistencia).

---

## Épica 4 — Asignación de invitados a mesas

### CU-12 · Asignar invitado a mesa escribiendo el número de mesa · MVP
**Como** organizador, **quiero** escribir el número de mesa en la lista de un invitado **para** asignarle asiento de forma rápida sin usar el ratón.

Criterios de aceptación:
- Desde la lista se puede introducir el número de mesa de un invitado.
- El invitado pasa a la lista de asignados y aparece en el plano junto a su mesa.
- Si la mesa está llena, se muestra advertencia.

### CU-13 · Asignar invitado a mesa por arrastrar y soltar · MVP
**Como** organizador, **quiero** arrastrar un invitado desde la lista hasta una mesa en el plano **para** asignarle asiento de forma visual e intuitiva.

Criterios de aceptación:
- Se puede arrastrar un invitado desde la lista al plano y soltarlo sobre una mesa.
- El asiento se asigna al soltar; el invitado aparece en el plano y cambia de lista.
- Si la mesa está llena, la operación no se completa y se muestra advertencia.

### CU-14 · Quitar asiento a un invitado · MVP
**Como** organizador, **quiero** quitar el asiento asignado a un invitado **para** liberarlo y reasignarlo o dejarlo sin mesa.

Criterios de aceptación:
- Se puede quitar el asiento desde la lista de asignados o desde el plano.
- El invitado vuelve a la lista de sin asignar y desaparece del plano.

### CU-15 · Detectar y advertir conflictos de agrupación · MVP
**Como** organizador, **quiero** que la aplicación me avise cuando invitados de la misma agrupación estén en mesas distintas **para** poder corregirlo antes de cerrar la distribución.

Criterios de aceptación:
- Cuando se asigna un invitado a una mesa y algún miembro de su agrupación está en otra mesa, ambos se marcan en rojo (plano y listas).
- La advertencia desaparece cuando todos los miembros de la agrupación están en la misma mesa.

### CU-16 · Detectar aforo superado · MVP
**Como** organizador, **quiero** que la aplicación me avise si intento asignar más invitados de los que caben en una mesa **para** no superar su capacidad.

Criterios de aceptación:
- Si se intenta asignar un invitado a una mesa llena, se muestra advertencia y no se permite la asignación.
- El panel de control indica el número de asientos libres y ocupados por mesa.

### TT-04 · Motor de validación de restricciones · MVP
Implementar lógica que evalúe, tras cada cambio de asignación: agrupaciones con miembros en mesas distintas, mesas con aforo superado. Exponer resultado como estado reactivo para que la UI lo refleje sin recargar.

---

## Épica 5 — Plano interactivo del salón

### CU-17 · Visualizar plano del salón con mesas redondas · MVP
**Como** organizador, **quiero** ver un plano del salón con las mesas representadas de forma visual **para** tener una visión global de la distribución.

Criterios de aceptación:
- Las mesas se representan como círculos en el plano.
- Cada mesa muestra su número identificador.
- Los invitados asignados aparecen con su nombre alrededor de la mesa, simulando los asientos.

### CU-18 · Actualizar plano en tiempo real al asignar o quitar invitados · MVP
**Como** organizador, **quiero** que el plano se actualice automáticamente tras cada cambio **para** que siempre refleje el estado actual de la distribución.

Criterios de aceptación:
- Al asignar un invitado, su nombre aparece en el plano sin necesidad de recargar.
- Al quitar un asiento, el nombre desaparece del plano inmediatamente.

### CU-19 · Mostrar advertencias visuales de conflicto en el plano · MVP
**Como** organizador, **quiero** que los invitados con conflicto de agrupación se destaquen visualmente en el plano **para** identificarlos de un vistazo.

Criterios de aceptación:
- Los invitados con conflicto se muestran en rojo o con un icono de advertencia en el plano.
- Al resolver el conflicto, la advertencia desaparece.

### TT-05 · Componente de plano interactivo SVG/Canvas · MVP
Implementar el componente visual del salón: renderizado de mesas redondas, posicionamiento de nombres de invitados alrededor de cada mesa, soporte para drag & drop desde las listas, actualización reactiva ante cambios de estado.

---

## Épica 6 — Panel de control

### CU-20 · Ver resumen de mesas y aforo en el panel de control · MVP
**Como** organizador, **quiero** ver en un panel el número de mesas y el aforo de cada una **para** tener el control del estado del evento sin mirar el plano.

Criterios de aceptación:
- El panel muestra todas las mesas con su capacidad total, asientos ocupados y asientos libres.
- Desde el panel se puede ajustar la capacidad individual de cada mesa.
- El panel se actualiza en tiempo real al hacer cambios.

### TT-06 · Componente de panel de control · MVP
Implementar panel lateral o modal con tabla de mesas: número de mesa, capacidad, ocupación, input para ajustar capacidad. Conectado al estado global de la aplicación.

---

## Épica 7 — Persistencia y gestión de ficheros

### CU-21 · Guardar el estado del evento · MVP
**Como** organizador, **quiero** guardar el estado actual del evento (mesas, invitados, asignaciones) **para** poder continuar más adelante o revisarlo.

Criterios de aceptación:
- Se puede guardar el estado del evento en cualquier momento.
- El guardado incluye: configuración del salón, lista de invitados, agrupaciones, asignaciones.

### CU-22 · Cargar un evento guardado · MVP
**Como** organizador, **quiero** cargar un evento previamente guardado **para** continuar trabajando en él o revisarlo.

Criterios de aceptación:
- Se puede seleccionar y cargar cualquier evento guardado.
- Al cargar, el plano, las listas y el panel de control reflejan el estado guardado.

### CU-23 · Eliminar un evento guardado · MVP
**Como** organizador, **quiero** eliminar un evento guardado que ya no necesito **para** mantener la lista de eventos limpia.

Criterios de aceptación:
- Se puede eliminar un evento desde la lista de eventos guardados.
- Se solicita confirmación antes de borrar.
- El evento eliminado desaparece de la lista.

### CU-24 · Guardar múltiples versiones de un evento · v2
**Como** organizador, **quiero** guardar distintas versiones de la distribución de un mismo evento **para** poder comparar alternativas antes de decidir la definitiva.

Criterios de aceptación:
- Se puede crear una nueva versión a partir del estado actual.
- Cada versión tiene un nombre o marca de tiempo identificativa.
- Se puede cargar cualquier versión guardada.

### TT-07 · Capa de persistencia de eventos · MVP
Implementar almacenamiento local (ficheros JSON o localStorage según arquitectura) para guardar, cargar y eliminar eventos. Definir formato de serialización del estado completo. Gestionar múltiples eventos y versiones.

---

## Épica 8 — Exportación e impresión

### CU-25 · Exportar listado de invitados por mesa · v2
**Como** organizador, **quiero** exportar un listado con los invitados agrupados por mesa **para** entregárselo al personal del salón.

Criterios de aceptación:
- Se genera un documento (PDF o impresión) con una sección por mesa y los nombres de los invitados asignados.
- Los invitados sin asignar aparecen en una sección aparte.

### CU-26 · Exportar listado alfabético de invitados con mesa asignada · v2
**Como** organizador, **quiero** exportar un listado alfabético de todos los invitados con su número de mesa **para** facilitar la consulta en la entrada al evento.

Criterios de aceptación:
- Se genera un documento ordenado alfabéticamente con nombre e invitado y número de mesa.

### CU-27 · Imprimir o exportar el plano del salón · v2
**Como** organizador, **quiero** imprimir o exportar el plano del salón con los invitados asignados **para** entregarlo al salón o usarlo como referencia el día del evento.

Criterios de aceptación:
- Se puede exportar el plano como imagen o PDF.
- El plano exportado incluye los nombres de los invitados y los números de mesa.

### TT-08 · Módulo de exportación e impresión · v2
Implementar generación de PDF o HTML imprimible para: listado por mesa, listado alfabético, plano del salón. Integrar con la librería de renderizado del plano.

---

## Épica 9 — Infraestructura y arquitectura

### TT-09 · Definir stack tecnológico y estructura del proyecto · MVP
Decidir y documentar: framework frontend (React / Vue / otro), gestión de estado global, sistema de persistencia, herramienta de build, estructura de carpetas.

### TT-10 · Configurar entorno de desarrollo · MVP
Configurar repositorio, linter, formatter, tests unitarios básicos, pipeline CI mínimo.

### TT-11 · Diseño del sistema de estado global · MVP
Definir cómo fluye el estado entre componentes: eventos, mesas, invitados, asignaciones, conflictos. Garantizar reactividad en plano, listas y panel de control ante cualquier cambio.

### TT-12 · Diseño visual base y sistema de componentes · MVP
Definir paleta de colores, tipografía, espaciado y componentes reutilizables (botones, listas, inputs, modales, badges de advertencia). Alineado con el principio de experiencia agradable y claridad visual.
