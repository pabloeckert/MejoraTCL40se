const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'devices.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.jsonl');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadRegistry() {
  ensureDataDir();
  if (!fs.existsSync(REGISTRY_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveRegistry(registry) {
  ensureDataDir();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

function appendHistory(entry) {
  ensureDataDir();
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n');
}

function parseBatteryLevel(output) {
  const m = /level:\s*(\d+)/.exec(output);
  return m ? parseInt(m[1], 10) : null;
}

function parseMeminfo(output) {
  const total = /MemTotal:\s+(\d+)/.exec(output);
  const free = /MemFree:\s+(\d+)/.exec(output);
  const avail = /MemAvailable:\s+(\d+)/.exec(output);
  return {
    memTotalMB: total ? Math.round(+total[1] / 1024) : null,
    memFreeMB: free ? Math.round(+free[1] / 1024) : null,
    memAvailableMB: avail ? Math.round(+avail[1] / 1024) : null,
  };
}

function parseDf(output) {
  const lines = output.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return null;
  const parts = last.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const usedKB = parseInt(parts[2], 10);
  const usePercent = parseInt(parts[4], 10);
  if (Number.isNaN(usedKB) || Number.isNaN(usePercent)) return null;
  return { usedGB: +(usedKB / 1024 / 1024).toFixed(1), usePercent };
}

async function getUsageSnapshot(serial) {
  const [battery, meminfo, storage] = await Promise.all([
    execPromise(`adb -s ${serial} shell dumpsys battery`),
    execPromise(`adb -s ${serial} shell cat /proc/meminfo`),
    execPromise(`adb -s ${serial} shell df /data`),
  ]);
  return {
    batteryLevel: parseBatteryLevel(battery.output),
    ...parseMeminfo(meminfo.output),
    storage: parseDf(storage.output),
  };
}

const COMMANDS = {
  fps: [
    'adb shell settings put global window_animation_scale 0',
    'adb shell settings put global transition_animation_scale 0',
    'adb shell settings put global animator_duration_scale 0',
    'adb shell settings put global low_power 0',
    'adb shell dumpsys deviceidle disable',
    'adb shell am kill-all',
  ],
  hitbox: [
    'adb shell wm size 540x960',
    'adb shell wm density 320',
  ],
  hz90: [
    'adb shell settings put system peak_refresh_rate 90',
    'adb shell settings put system min_refresh_rate 90',
  ],
  network: [
    'adb shell settings put global wifi_sleep_policy 2',
    'adb shell settings put global tcp_default_init_rwnd 60',
  ],
  revert: [
    'adb shell wm size reset',
    'adb shell wm density reset',
    'adb shell settings put global window_animation_scale 1',
    'adb shell settings put global transition_animation_scale 1',
    'adb shell settings put global animator_duration_scale 1',
    'adb shell settings put system peak_refresh_rate 60',
    'adb shell settings put system min_refresh_rate 60',
  ],
};

function execPromise(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
      resolve({
        cmd,
        success: !error,
        output: (stdout + stderr).trim(),
        error: error ? error.message : null,
      });
    });
  });
}

app.post('/api/connect', async (req, res) => {
  try {
    const result = await execPromise('adb devices -l');
    const lines = result.output.split('\n').filter(l => l.trim() && !l.startsWith('List of'));
    const devices = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const id = parts[0];
      const status = parts[1];
      const modelMatch = line.match(/model:(\S+)/);
      const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : 'Desconocido';
      return { id, status, model };
    }).filter(d => d.status === 'device');

    const registry = loadRegistry();
    const now = new Date().toISOString();

    for (const device of devices) {
      const entry = registry[device.id] || { owner: null, firstSeen: now };
      entry.model = device.model;
      entry.lastSeen = now;
      registry[device.id] = entry;

      const usage = await getUsageSnapshot(device.id);
      device.owner = entry.owner;
      device.usage = usage;

      appendHistory({
        timestamp: now,
        serial: device.id,
        owner: entry.owner,
        model: device.model,
        ...usage,
      });
    }

    saveRegistry(registry);

    res.json({
      success: true,
      devices,
      count: devices.length,
      raw: result.output,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/devices/:serial/name', (req, res) => {
  const { serial } = req.params;
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Falta el nombre' });
  }
  const registry = loadRegistry();
  if (!registry[serial]) {
    return res.status(404).json({ success: false, error: 'Dispositivo no registrado. Conectalo primero.' });
  }
  registry[serial].owner = name.trim();
  saveRegistry(registry);
  res.json({ success: true, serial, owner: registry[serial].owner });
});

app.get('/api/devices', (req, res) => {
  res.json({ success: true, devices: loadRegistry() });
});

app.get('/api/history', (req, res) => {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    return res.json({ success: true, history: [] });
  }
  const { serial, limit } = req.query;
  let history = fs.readFileSync(HISTORY_FILE, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);

  if (serial) history = history.filter(h => h.serial === serial);
  history.reverse();

  const max = limit ? parseInt(limit, 10) : 50;
  res.json({ success: true, history: history.slice(0, max) });
});

app.post('/api/execute', async (req, res) => {
  const { commands } = req.body;
  if (!Array.isArray(commands) || commands.length === 0) {
    return res.status(400).json({ success: false, error: 'No hay comandos para ejecutar' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'start', total: commands.length });

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    send({ type: 'progress', index: i, cmd });
    const result = await execPromise(cmd);
    send({
      type: 'result',
      index: i,
      cmd,
      success: result.success,
      output: result.output,
      error: result.error,
    });
  }

  send({ type: 'done', total: commands.length });
  res.end();
});

app.post('/api/revert', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const cmds = COMMANDS.revert;

  send({ type: 'start', total: cmds.length });

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    send({ type: 'progress', index: i, cmd });
    const result = await execPromise(cmd);
    send({
      type: 'result',
      index: i,
      cmd,
      success: result.success,
      output: result.output,
      error: result.error,
    });
  }

  send({ type: 'done', total: cmds.length });
  res.end();
});

app.get('/api/status', async (req, res) => {
  const adbCheck = await execPromise('adb version');
  if (!adbCheck.success) {
    return res.json({ adbAvailable: false, device: null });
  }

  const devicesResult = await execPromise('adb devices -l');
  const lines = devicesResult.output.split('\n').filter(l => l.trim() && !l.startsWith('List of'));
  const connected = lines.some(l => l.includes(' device'));
  const modelMatch = devicesResult.output.match(/model:(\S+)/);
  const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : null;

  res.json({
    adbAvailable: true,
    device: connected ? { connected: true, model } : null,
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
