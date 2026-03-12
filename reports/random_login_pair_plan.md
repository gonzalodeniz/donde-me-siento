# Plan para login con pareja fija y usuario aleatorio

## Objetivo

Sustituir el login abierto actual por un acceso cerrado con dos identidades posibles:

- `raquel` con contrasena `hector`
- `hector` con contrasena `raquel`

El usuario visible en la interfaz no sera editable y aparecera automaticamente de forma aleatoria.

## Orden de ejecucion

1. Actualizar `scrum/` para reflejar:
   - login restringido a dos identidades;
   - usuario mostrado automaticamente;
   - contrasena cruzada entre ambos nombres.
2. Modificar frontend:
   - eliminar edicion manual del usuario;
   - escoger `raquel` o `hector` al azar al abrir la pantalla de login;
   - rellenar solo contrasena;
   - mantener compatibilidad con cierre de sesion y nuevo intento.
3. Modificar backend:
   - asegurar existencia de los dos usuarios permitidos;
   - aceptar solo las combinaciones cruzadas;
   - bloquear cualquier otro usuario aunque exista en base de datos.
4. Ajustar tests y documentacion operativa.

## Riesgos

- Hay tests y textos que siguen asumiendo `admin/admin1234`.
- Si la base ya contiene usuarios anteriores, el backend debe ignorarlos en login.
- El E2E debe leer el usuario mostrado y derivar la contrasena correcta para no depender del azar.

## Verificacion

- `pytest -q`
- `cd frontend && npm run build`
- `cd frontend && npm run test:e2e`
