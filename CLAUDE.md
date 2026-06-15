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
