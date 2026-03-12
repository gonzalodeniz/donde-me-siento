# Plan de cambio: pantalla de login separada

## Objetivo

Separar el acceso de la aplicacion principal para que:

- antes de autenticarse solo exista una pantalla de login dedicada;
- el login no comparta espacio con el workspace;
- al iniciar sesion se entre directamente en la app principal;
- el cierre de sesion quede disponible de forma discreta, sin ocupar protagonismo visual.

## Acciones

1. Actualizar `scrum/` para reflejar el nuevo flujo de acceso.
2. Rehacer el frontend con dos estados de pantalla claros:
   - pantalla de acceso;
   - workspace principal autenticado.
3. Eliminar del layout principal cualquier bloque de login o sesion destacada.
4. Mover `Cerrar sesion` a un control secundario y discreto.
5. Ajustar E2E para validar:
   - pantalla inicial de login;
   - entrada en la app sin repetir el cuadro de acceso;
   - persistencia al recargar;
   - vuelta a login al cerrar sesion.
6. Actualizar `AGENT.md` con el nuevo flujo.

## Impacto esperado

- Menos confusion visual en el arranque.
- Jerarquia mas clara entre acceso y trabajo.
- Workspace principal mas limpio y centrado en la operativa.
