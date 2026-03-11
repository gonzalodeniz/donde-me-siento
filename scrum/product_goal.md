# Product Goal

El objetivo del producto es permitir que un organizador de eventos pase de una lista de invitados a una distribución validada, ajustable y lista para compartir, reduciendo tiempo, errores y fricción operativa.

## Flujo de trabajo esperado

Una app útil debe dar soporte al proceso completo, de principio a fin:

1. Crear el evento y configurar el salón (número de mesas, capacidad por mesa).
2. Importar o introducir la lista de invitados.
3. Registrar confirmaciones de asistencia y cambios de última hora.
4. Definir relaciones y restricciones entre invitados.
5. Crear una propuesta inicial de distribución (manual o asistida).
6. Ajustar la distribución arrastrando invitados o editando directamente.
7. Visualizar en todo momento invitados sin asignar y mesas incompletas.
8. Validar conflictos y aforo antes de cerrar la distribución.
9. Guardar versiones para comparar alternativas.
10. Exportar o imprimir el plano y los listados finales.

## Capacidades objetivo

Convertir Donde-me-siento en la herramienta de referencia para la gestión del seating de eventos, que permita:

- configurar el salón con el número de mesas y capacidad por mesa;
- gestionar la lista de invitados con tipo (adulto, adolescente, niño) y estado de asistencia;
- modelar preferencias y restricciones entre invitados (deben ir juntos, preferiblemente juntos, no deben coincidir, niños con padres, movilidad reducida);
- asignar invitados a mesas de forma manual o mediante arrastrar y soltar;
- detectar y advertir automáticamente cuando se violan restricciones o se supera el aforo;
- crear varias versiones de distribución para comparar alternativas;
- exportar e imprimir planos y listados (por mesa, alfabético, para el salón);
- guardar eventos con persistencia fiable en backend y recuperarlos sin pérdida de datos;
- acceder de forma segura mediante autenticación de usuario contra backend.

## Alcance por fases

**MVP**
Crear evento, configurar mesas, gestionar invitados, definir relaciones y restricciones, asignar a mesas (manual y drag & drop), visualizar invitados sin asignar, detectar conflictos, guardado de eventos sobre backend con base de datos y autenticación básica.

**v2**
Importación de invitados desde fichero, exportación e impresión de planos y listados, propuesta inicial automática de distribución, gestión de confirmaciones de asistencia, múltiples versiones/escenarios.

**v3**
Optimización automática por restricciones, colaboración multiusuario, plantillas de salón, compartir resultado con terceros, analytics y estadísticas del evento.

## Métricas de éxito

- Tiempo medio para completar una primera distribución desde cero.
- Número de conflictos detectados automáticamente antes del cierre.
- Porcentaje de invitados asignados sin incidencias al cerrar el evento.
- Número de versiones creadas antes de cerrar la distribución definitiva.
- Tasa de uso de exportación o impresión al finalizar un evento.
