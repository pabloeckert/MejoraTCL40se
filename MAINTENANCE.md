# Registro de mantenimiento — TCL 40 SE

Historial de cambios aplicados al dispositivo vía ADB, para poder explicarle al
usuario qué se tocó y revertirlo con precisión si lo pide.

**Dispositivo**: `YD79CE9LGMROBEO7` — modelo `T610K` (TCL 40 SE), Android 13 (SDK 33), chipset `MT6765` (MediaTek Helio P35, GPU PowerVR GE8320).

---

## Sesión 2026-07-13 — Optimización por lag en Roblox

**Motivo**: lag reportado en Roblox, experiencias *Forsaken*, *99 Nights in the Forest* y *Battle Bricks*.

**Diagnóstico previo**: cuello de botella de GPU (Helio P35 es gama muy baja para 3D
moderno) + RAM al 97.8% de uso en idle (3.8GB total, ~1GB en swap) incluso sin
ningún juego abierto. Ver conversación para el detalle completo.

### Estado ANTES de esta sesión (línea base real del dispositivo)

Importante: varias optimizaciones **ya estaban aplicadas de una sesión previa**
(no de hoy). Solo `hitbox` (resolución) estaba en su valor nativo.

| Setting | Valor antes | ¿De sesión previa o nativo? |
|---|---|---|
| `wm size` | `720x1600` (nativo) | Nativo — nunca se había aplicado `hitbox` |
| `wm density` | `320` | Igual en nativo y en preset `hitbox`, no cambia |
| `peak_refresh_rate` / `min_refresh_rate` | `90` / `90` | Ya aplicado antes (preset `hz90`) |
| `window/transition/animator_animation_scale` | `0` / `0` / `0` | Ya aplicado antes (parte de `fps`) |
| `low_power` | `0` | Ya aplicado antes (parte de `fps`) |
| `wifi_sleep_policy` | `2` | Ya aplicado antes (preset `network`) |
| `tcp_default_init_rwnd` | `60` | Ya aplicado antes (preset `network`) |
| `deviceidle` state | `ACTIVE` (no en doze) | — |
| MemFree / MemAvailable | 95.6 MB / 1.76 GB (de 3.8GB) | 97.8% RAM en uso, ~1GB en swap, **idle, sin juego abierto** |
| `/data` (obb) uso | 32.9GB usados / 31% | — |

### Acciones aplicadas HOY (todas via ADB shell, equivalentes a los presets de `server.js`)

**`fps`** (re-aplicado, ya estaba en destino salvo `am kill-all`):
```
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell settings put global low_power 0
adb shell dumpsys deviceidle disable
adb shell am kill-all
```

**`hitbox`** (ÚNICO cambio real de esta sesión):
```
adb shell wm size 540x960
adb shell wm density 320
```

**`hz90`** (re-aplicado, sin cambio real):
```
adb shell settings put system peak_refresh_rate 90
adb shell settings put system min_refresh_rate 90
```

**`network`** (re-aplicado, sin cambio real):
```
adb shell settings put global wifi_sleep_policy 2
adb shell settings put global tcp_default_init_rwnd 60
```

**Limpieza adicional** (no es parte de los presets del repo, se hizo manualmente):
```
adb shell pm trim-caches 1024G
```
Pide a cada app que recorte su caché no esencial (no borra sesiones ni datos de usuario).

### Estado DESPUÉS (verificado)

| Setting | Valor después |
|---|---|
| `wm size` | Physical `720x1600`, **Override `540x960`** |
| `wm density` | `320` (sin cambio) |
| `peak_refresh_rate` | `90` |
| MemFree / MemAvailable | 507 MB / 2.11 GB (subió desde 95.6MB / 1.76GB) |
| `/data` (obb) uso | 21.4GB usados / 20% (bajó desde 32.9GB / 31%, liberó ~11GB de caché de juegos) |

Nota: la caché de assets de juego liberada (~11GB) se re-descargará la próxima
vez que se abran esos experiences — no es pérdida de datos, solo carga inicial
un poco más lenta la primera vez.

### Cómo revertir

⚠️ **El botón/preset "revert" de la app (`/api/revert` en `server.js`) revierte a
los valores de fábrica de Android, NO solo al estado de "antes de hoy".** Como
`fps`, `hz90` y `network` ya estaban aplicados de una sesión anterior, usar el
revert completo de la app deshace **todo**, incluyendo lo que no se tocó hoy:

```
adb shell wm size reset
adb shell wm density reset
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1
adb shell settings put system peak_refresh_rate 60
adb shell settings put system min_refresh_rate 60
```

**Si el usuario solo quiere deshacer lo de HOY** (mantener animaciones
desactivadas, 90Hz y ajustes de red, pero volver la resolución a nativa):
```
adb shell wm size reset
```
(la densidad no cambió, no hace falta tocarla)

**Si el usuario quiere volver 100% a como vino de fábrica**: usar el revert
completo de arriba (botón "Revertir" en la app, o esos comandos manuales).

### ⚠️ INCIDENTE: preset `hitbox` rompió la pantalla de bloqueo

Minutos después de aplicar `wm size 540x960`, el teléfono quedó con **bandas
negras arriba/abajo y la pantalla de bloqueo dejó de responder** — Aarón no
podía desbloquearlo. Causa: el override de resolución rompe el layout del
launcher/lockscreen de este skin OEM (TCL) en este chipset (MT6765).

**Fix aplicado** (funciona vía USB aunque el teléfono esté bloqueado, no
requiere desbloquear):
```
adb shell wm size reset
adb shell wm density reset
```
Confirmado: tras el reset, el teléfono volvió a verse normal y se pudo
desbloquear sin problema.

**Conclusión: NO volver a aplicar el preset `hitbox` (resolución 540x960) en
este dispositivo.** Si en el futuro se quiere aliviar carga de GPU bajando
resolución, probar primero con un valor más conservador (ej. 640x1422, ~10%
menos que nativo) y verificar en el momento que el lockscreen siga
funcionando antes de dar la sesión por cerrada — nunca asumir que quedó bien
sin confirmarlo visualmente en el equipo.

### Nota sobre el aviso de mantenimiento por notificación

Se probó mostrar un aviso vía `adb shell cmd notification post` (sin
instalar ninguna app). El comando se ejecutó sin error pero **Aarón no vio
nada en pantalla** — no sirve tal cual para el recordatorio semanal, hace
falta otro mecanismo (pendiente de resolver).

### Decisión: se descarta el bloqueo/aviso semanal automático

Tras el incidente de `hitbox`, se decidió no automatizar ningún comando
sobre el teléfono sin supervisión (riesgo de dejarlo inutilizable estando
Aarón solo). En su lugar se construyó un **registro de dispositivos +
historial de uso** (nueva funcionalidad en `server.js`/`public/index.html`,
ver `CLAUDE.md` sección "Device registry and usage history"):

- `data/devices.json` — identifica este equipo (serie `YD79CE9LGMROBEO7`) como
  perteneciente a **Aarón**, para distinguirlo del otro TCL 40 SE idéntico de
  otro usuario.
- `data/history.jsonl` — cada vez que se conecta desde la app queda una
  entrada con batería, RAM libre y % de almacenamiento, para tener trazabilidad
  entre sesiones de mantenimiento.
- Probado en vivo: conexión, registro de nombre y lectura de historial
  funcionaron correctamente contra este dispositivo real (ver conversación).

### Cierre de sesión 2026-07-13

Estado final verificado antes de desconectar: `wm size`/`density` nativos
(`720x1600`/`320`, sin override), sin procesos ni comandos ADB en curso,
`adb get-state` → `device`. Seguro desconectar el cable.
