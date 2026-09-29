# Reporte de auditoría — MejoraTCL40se

Fecha: 2026-09-10

Repo `C:\Github\Herramientas\MejoraTCL40se` — remote `pabloeckert/MejoraTCL40se`, rama `main`, Node.js.

## Resumen ejecutivo

Repo sano. Working tree con 1 commit local sin pushear (de una sesión previa) y archivo de documentación de arquitectura con una modificación sin commitear (antepone el criterio global de modelo/esfuerzo) — nada de eso se tocó, no corresponde commitear/pushear en esta auditoría. `data/devices.json` y `data/history.jsonl` (datos reales del TCL 40 SE de Aarón) están correctamente gitignoreados. Se aplicó `npm audit fix` no-breaking.

## Hallazgos por severidad

- **Alto**: ninguno.
- **Medio**: 2 vulnerabilidades moderadas de npm (`qs`, vía `express` 4.22.2) sin fix no-breaking disponible — requieren bump mayor a Express 5.x.
- **Bajo**: sin ESLint/script de lint configurado (`package.json` solo tiene `start`) — diseño existente del proyecto, no un hallazgo nuevo.

## Verificaciones realizadas

- `git status`: 1 commit ahead de origin (sin pushear) + archivo de documentación modificado sin commitear. `git log -10` normal.
- Búsqueda de secretos: sin resultados.
- `data/` completo gitignoreado (`.gitignore`: `node_modules/`, `data/`) — `devices.json`/`history.jsonl` confirmados no trackeados.
- `MAINTENANCE.md` revisado — documenta bien sesiones ADB reales contra el dispositivo (incluye un incidente real de pantalla de bloqueo roto por el preset `hitbox`, ya resuelto y con nota de "no reaplicar").
- `npm audit` inicial: 3 vulnerabilidades moderadas (`body-parser`, `express`, `qs`). `npm audit fix` resuelve `body-parser`; quedan 2 moderadas de `qs` atadas a `express` 4.22.2 — confirmado que no hay cambio posible sin saltar a Express 5 (breaking). `package.json` sin cambios (rango `^4.18.2` sigue satisfecho); solo cambió `package-lock.json`.
- `node --check server.js`: OK (sin ejecutar el servidor).
- Sin TODO/FIXME relevantes en código propio.

## Acciones tomadas

- `npm audit fix` (non-breaking): actualiza `side-channel`, `qs` (parcial), `hasown`, `body-parser` dentro de `node_modules` + `package-lock.json`. Cambio sin commitear, a revisión del usuario.

## Pendientes que requieren decisión humana

1. Bump mayor de Express (4→5) para cerrar las 2 vulnerabilidades moderadas de `qs` restantes — cambio breaking, no aplicado.
2. Decidir si commitear el commit local pendiente y el cambio de documentación de arquitectura.
3. Opcional: agregar ESLint si se quiere lint automatizado (hoy no hay ninguno).
