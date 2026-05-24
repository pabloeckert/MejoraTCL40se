const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
