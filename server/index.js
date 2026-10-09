// VENDIDO — servidor multijugador (Express + Socket.IO).
// Sirve el juego y administra las salas por código.
// Inicia con:  npm start   (o el botón ▶ de VS Code)
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room, makeCode, normalizeCode } from '../public/shared/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'salas.json');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.disable('x-powered-by');
app.get('/api/ping', (_req, res) => res.json({ ok: true, mode: 'server', rooms: rooms.size }));
app.use(express.static(PUBLIC, {
  setHeaders(res, file) {
    if (file.endsWith('sw.js') || file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Solo para pruebas: VENDIDO_DEBUG=1 permite modificar una partida (no usar en producción)
if (process.env.VENDIDO_DEBUG === '1') {
  app.post('/api/debug/:code', express.json({ limit: '1mb' }), (req, res) => {
    const r = rooms.get(req.params.code);
    if (!r || !r.game) return res.status(404).json({ ok: false });
    const fn = new Function('g', req.body.js); // eslint-disable-line no-new-func
    fn(r.game);
    r.changed();
    res.json({ ok: true });
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 8000 });

/** @type {Map<string, Room>} */
const rooms = new Map();
/** code -> Map(pid -> socket) */
const sockets = new Map();
let dirty = false;

function createRoom(code) {
  const room = new Room({
    code,
    send: (pid, msg) => {
      const s = sockets.get(code)?.get(pid);
      if (s) s.emit('msg', msg);
    },
    onChange: () => { dirty = true; },
  });
  rooms.set(code, room);
  sockets.set(code, new Map());
  return room;
}

io.on('connection', (socket) => {
  let room = null;
  let pid = null;

  function attach(r, id, profile) {
    room = r;
    pid = String(id || '').slice(0, 64) || 'p' + Math.random().toString(36).slice(2);
    const map = sockets.get(r.code);
    const old = map.get(pid);
    if (old && old.id !== socket.id) old.disconnect(true);
    map.set(pid, socket);
    r.join(pid, profile || {});
  }

  socket.on('create', ({ pid: id, profile } = {}, ack) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    attach(createRoom(code), id, profile);
    if (typeof ack === 'function') ack({ ok: true, code });
  });

  socket.on('join', ({ code, pid: id, profile } = {}, ack) => {
    const c = normalizeCode(code);
    const r = rooms.get(c);
    if (!r) { if (typeof ack === 'function') ack({ ok: false, error: `No existe la sala ${c || ''}. Revisa el código.` }); return; }
    attach(r, id, profile);
    if (typeof ack === 'function') ack({ ok: true, code: c });
  });

  socket.on('msg', (msg) => { if (room && pid) room.handle(pid, msg); });

  socket.on('disconnect', () => {
    if (!room || !pid) return;
    const map = sockets.get(room.code);
    if (map && map.get(pid) === socket) {
      map.delete(pid);
      room.leave(pid);
    }
  });
});

// ------------------------------------------------------------------ guardado
function save() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = [...rooms.values()].map((r) => r.toJSON());
    fs.writeFileSync(SAVE_FILE, JSON.stringify(data));
  } catch (e) { console.error('No se pudo guardar:', e.message); }
}
function load() {
  try {
    const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    for (const d of data) {
      if (Date.now() - (d.lastActive || 0) > 24 * 3600e3) continue;
      const r = createRoom(d.code);
      r.restore(d);
    }
    if (rooms.size) console.log(`Se recuperaron ${rooms.size} sala(s) guardadas.`);
  } catch { /* sin salas guardadas */ }
}
setInterval(save, 5000).unref();
// limpiar salas abandonadas (sin nadie conectado por 2 horas)
setInterval(() => {
  for (const [code, r] of rooms) {
    if (r.connectedHumans() === 0 && Date.now() - r.lastActive > 2 * 3600e3) {
      r.destroy();
      rooms.delete(code);
      sockets.delete(code);
      dirty = true;
    }
  }
}, 60e3).unref();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { dirty = true; save(); process.exit(0); });
}

load();
server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n  🔨 VENDIDO está corriendo\n');
  console.log(`  En esta compu:     http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  En tu celular:     http://${ip}:${PORT}   (misma red Wi-Fi)`);
  console.log('\n  Para detenerlo: Ctrl + C\n');
});
