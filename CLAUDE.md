# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Start the server on http://localhost:3000
```

No build step, no lint, no test suite. The app runs directly with Node.js.

**Runtime requirement**: `adb` must be installed and available in the system PATH for any device operations to work.

## Architecture

A minimal two-file web app that wraps ADB commands in a browser UI:

- **`server.js`** — Express server. Shells out to `adb` via `child_process.exec`. The three mutation endpoints (`/api/connect`, `/api/execute`, `/api/revert`) stream results back to the client using Server-Sent Events (SSE). Each command runs sequentially with a 10-second timeout. The `/api/status` endpoint is a non-streaming GET used at page load.

- **`public/index.html`** — Single-file frontend (inline CSS + vanilla JS, no framework). Consumes the SSE stream by reading `ReadableStream` chunks directly, parsing `data: {...}\n\n` frames manually.

## Device registry and usage history

Because more than one physical device of the same model can be used with this tool, `server.js` persists per-device state to disk under `data/` (gitignored — contains another person's usage data):

- `data/devices.json` — registry keyed by ADB serial: `{ owner, model, firstSeen, lastSeen }`. `owner` is set manually via `POST /api/devices/:serial/name` (the frontend prompts for it after a successful `/api/connect`) and is `null` until named.
- `data/history.jsonl` — append-only, one JSON object per line. A new entry is written every time `/api/connect` finds a connected device, capturing a usage snapshot (`batteryLevel`, `memTotalMB`/`memFreeMB`/`memAvailableMB` parsed from `/proc/meminfo`, `storage` parsed from `df /data`) alongside the serial/owner/model at that moment. `GET /api/history` reads and returns this file (optionally filtered by `?serial=`, capped by `?limit=`, default 50, newest first) for the frontend's "Historial de Mantenimiento" card.

`getUsageSnapshot(serial)` runs its three `adb -s <serial> shell ...` reads in parallel via `Promise.all`; it's called synchronously inside the `/api/connect` device loop, so connecting with multiple devices attached takes proportionally longer.

## Key design detail: duplicated COMMANDS object

The `COMMANDS` object (mapping category keys like `fps`, `hitbox`, `hz90`, `network` to arrays of ADB shell commands) is defined **twice**:
- In `server.js` — used for execution and the hardcoded `revert` preset
- In `public/index.html` (the `<script>` block) — used only for the client-side command preview and copy feature

If you change a command in one place, update the other. The `revert` preset only exists server-side; the frontend calls `/api/revert` and never constructs those commands itself.

## SSE protocol

Events sent from server to client follow this sequence:

```
{ type: 'start', total: N }
{ type: 'progress', index: i, cmd: '...' }   // before each command
{ type: 'result', index: i, cmd, success, output, error }  // after each command
{ type: 'done', total: N }
```
