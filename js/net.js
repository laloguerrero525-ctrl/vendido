// VENDIDO — conexión. Dos formas de jugar online:
//  • "servidor": el juego se abre desde el servidor Node (npm start o un hosting). Las salas viven ahí.
//  • "directo" (P2P): el juego se abre como página estática (p. ej. GitHub Pages). El celular del
//    anfitrión hace de servidor y los amigos se conectan a él con el código de sala (WebRTC/PeerJS).
import { Room, makeCode, normalizeCode } from '../shared/room.js';

const PEER_PREFIX = 'vendido-sala-';

// Guarda los mensajes que llegan antes de que la app registre su receptor
function deliver(conn, msg) {
  if (!conn.handlers.size) { (conn.pending ||= []).push(msg); return; }
  conn.handlers.forEach((h) => h(msg));
}
function addHandler(conn, h) {
  conn.handlers.add(h);
  const p = conn.pending || [];
  conn.pending = [];
  p.forEach((m) => h(m));
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src.endsWith(src))) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

export async function detectMode() {
  const q = new URLSearchParams(location.search);
  const forced = q.get('modo');
  if (forced === 'p2p' || forced === 'directo') return { mode: 'p2p' };
  const remote = q.get('servidor') || localStorage.getItem('vendido.servidor') || '';
  if (remote) return { mode: 'server', url: remote.replace(/\/$/, '') };
  if (location.protocol === 'file:') return { mode: 'p2p' };
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch('api/ping', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(to);
    if (r.ok) {
      const j = await r.json();
      if (j && j.ok) return { mode: 'server', url: '' };
    }
  } catch { /* sin servidor */ }
  return { mode: 'p2p' };
}

// ---------------------------------------------------------------------------
// Modo servidor (Socket.IO)
// ---------------------------------------------------------------------------
class ServerConnection {
  constructor(url) {
    this.url = url;
    this.handlers = new Set();
    this.statusHandlers = new Set();
    this.code = null;
    this.join = null;
  }
  async open() {
    await loadScript(this.url ? `${this.url}/socket.io/socket.io.js` : 'vendor/socket.io.min.js');
    // eslint-disable-next-line no-undef
    this.socket = io(this.url || undefined, { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    this.socket.on('msg', (m) => deliver(this, m));
    this.socket.on('connect', () => {
      this.status('online');
      // reconectar a la sala automáticamente
      if (this.code && this.join) this.socket.emit('join', { code: this.code, pid: this.join.pid, profile: this.join.profile }, (r) => { if (!r.ok) deliver(this, { t: 'gone', text: r.error }); });
    });
    this.socket.on('disconnect', () => this.status('offline'));
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('El servidor no responde.')), 8000);
      this.socket.once('connect', () => { clearTimeout(t); res(); });
    });
  }
  status(s) { this.statusHandlers.forEach((h) => h(s)); }
  emit(ev, data) {
    return new Promise((res) => this.socket.emit(ev, data, (r) => res(r)));
  }
  async create(pid, profile) {
    const r = await this.emit('create', { pid, profile });
    if (!r.ok) throw new Error(r.error || 'No se pudo crear la sala.');
    this.code = r.code; this.join = { pid, profile };
    return r.code;
  }
  async enter(code, pid, profile) {
    const r = await this.emit('join', { code, pid, profile });
    if (!r.ok) throw new Error(r.error || 'No se pudo entrar.');
    this.code = r.code; this.join = { pid, profile };
    return r.code;
  }
  send(msg) { this.socket.emit('msg', msg); }
  onMessage(h) { addHandler(this, h); }
  onStatus(h) { this.statusHandlers.add(h); }
  close() { this.code = null; this.socket?.disconnect(); }
  get label() { return 'Servidor'; }
}

// ---------------------------------------------------------------------------
// Modo directo (P2P con PeerJS). El anfitrión corre la sala en su navegador.
// ---------------------------------------------------------------------------
function peerOptions() {
  const q = new URLSearchParams(location.search);
  const host = q.get('peerHost');
  const opts = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  if (host) {
    opts.host = host;
    opts.port = Number(q.get('peerPort') || 9000);
    opts.path = q.get('peerPath') || '/';
    opts.secure = q.get('peerSecure') === '1';
  }
  return opts;
}
function peerError(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'No encontré esa sala. Revisa el código o pide al anfitrión que tenga el juego abierto.';
  if (t === 'unavailable-id') return 'Ese código ya está en uso.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Sin conexión al servicio de salas. Revisa tu internet.';
  if (t === 'browser-incompatible') return 'Tu navegador no soporta el modo directo.';
  return (e && e.message) || 'Error de conexión.';
}

class P2PHost {
  constructor() {
    this.handlers = new Set();
    this.statusHandlers = new Set();
    this.conns = new Map();
    this.room = null;
    this.pid = null;
  }
  async open() { await loadScript('vendor/peerjs.min.js'); }
  status(s) { this.statusHandlers.forEach((h) => h(s)); }
  async create(pid, profile, resumeData = null) {
    this.pid = pid;
    let code = resumeData?.code || makeCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.startPeer(code);
        break;
      } catch (e) {
        if (e.type === 'unavailable-id' && !resumeData) { code = makeCode(); continue; }
        throw new Error(peerError(e));
      }
    }
    this.room = new Room({
      code,
      send: (to, msg) => {
        if (to === this.pid) queueMicrotask(() => deliver(this, msg));
        else { const c = this.conns.get(to); if (c && c.open) c.send(msg); }
      },
      onChange: (r) => this.persist(r),
    });
    if (resumeData) this.room.restore(resumeData);
    this.room.join(pid, profile);
    return code;
  }
  startPeer(code) {
    return new Promise((res, rej) => {
      // eslint-disable-next-line no-undef
      const peer = new Peer(PEER_PREFIX + code, peerOptions());
      let opened = false;
      peer.on('open', () => { opened = true; this.peer = peer; this.status('online'); res(); });
      peer.on('error', (e) => { if (!opened) { peer.destroy(); rej(e); } else if (e.type !== 'peer-unavailable') this.status('offline'); });
      peer.on('disconnected', () => { this.status('offline'); setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500); });
      peer.on('connection', (conn) => this.accept(conn));
    });
  }
  accept(conn) {
    let pid = null;
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;
      if (data.t === 'hello') {
        pid = String(data.pid || '').slice(0, 64);
        if (!pid || pid === this.pid) return conn.close();
        const old = this.conns.get(pid);
        if (old && old !== conn) old.close();
        this.conns.set(pid, conn);
        this.room.join(pid, data.profile || {});
        return;
      }
      if (pid) this.room.handle(pid, data);
    });
    const gone = () => {
      if (pid && this.conns.get(pid) === conn) { this.conns.delete(pid); this.room.leave(pid); }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }
  persist(r) {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      try { localStorage.setItem('vendido.hostRoom', JSON.stringify({ savedAt: Date.now(), pid: this.pid, data: r.toJSON() })); } catch { /* lleno */ }
    }, 600);
  }
  send(msg) { if (this.room) this.room.handle(this.pid, msg); }
  onMessage(h) { addHandler(this, h); }
  onStatus(h) { this.statusHandlers.add(h); }
  close() {
    this.room?.destroy();
    this.conns.forEach((c) => c.close());
    this.peer?.destroy();
    try { localStorage.removeItem('vendido.hostRoom'); } catch { /* */ }
  }
  get label() { return 'Directo (tú eres el anfitrión)'; }
}

class P2PGuest {
  constructor() {
    this.handlers = new Set();
    this.statusHandlers = new Set();
    this.closed = false;
  }
  async open() { await loadScript('vendor/peerjs.min.js'); }
  status(s) { this.statusHandlers.forEach((h) => h(s)); }
  async enter(code, pid, profile) {
    this.code = normalizeCode(code);
    this.pid = pid;
    this.profile = profile;
    await new Promise((res, rej) => {
      // eslint-disable-next-line no-undef
      const peer = new Peer(undefined, peerOptions());
      this.peer = peer;
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; rej(new Error('La sala no respondió. Revisa el código.')); } }, 15000);
      peer.on('open', () => this.connect(() => { if (!done) { done = true; clearTimeout(t); res(); } }));
      peer.on('error', (e) => {
        if (!done) { done = true; clearTimeout(t); rej(new Error(peerError(e))); return; }
        if (e.type === 'peer-unavailable') this.status('offline');
      });
      peer.on('disconnected', () => { if (!this.closed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500); });
    });
    return this.code;
  }
  connect(onOpen) {
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.conn = conn;
    conn.on('open', () => {
      this.status('online');
      conn.send({ t: 'hello', pid: this.pid, profile: this.profile });
      if (onOpen) onOpen();
    });
    conn.on('data', (m) => deliver(this, m));
    conn.on('close', () => {
      if (this.closed) return;
      this.status('offline');
      clearTimeout(this.retry);
      this.retry = setTimeout(() => { if (!this.closed && this.peer && !this.peer.destroyed) this.connect(); }, 2500);
    });
  }
  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  onMessage(h) { addHandler(this, h); }
  onStatus(h) { this.statusHandlers.add(h); }
  close() { this.closed = true; this.peer?.destroy(); }
  get label() { return 'Directo'; }
}

// ---------------------------------------------------------------------------
// Práctica: tú contra bots en este dispositivo, sin internet ni servidor
// ---------------------------------------------------------------------------
class LocalGame {
  constructor() {
    this.handlers = new Set();
    this.statusHandlers = new Set();
  }
  create(pid, profile) {
    this.pid = pid;
    this.room = new Room({
      code: 'LOCAL',
      send: (to, msg) => { if (to === pid) queueMicrotask(() => deliver(this, msg)); },
    });
    this.room.join(pid, profile);
    this.room.handle(pid, { t: 'addBot' });
    this.room.handle(pid, { t: 'addBot' });
    return 'LOCAL';
  }
  send(msg) { this.room?.handle(this.pid, msg); }
  onMessage(h) { addHandler(this, h); }
  onStatus(h) { this.statusHandlers.add(h); }
  close() { this.room?.destroy(); }
  get label() { return 'Práctica sin internet'; }
}
export function createLocal(pid, profile) {
  const c = new LocalGame();
  const code = c.create(pid, profile);
  return { conn: c, code };
}

export async function createRoom(mode, pid, profile, resumeData) {
  if (mode.mode === 'server') {
    const c = new ServerConnection(mode.url);
    await c.open();
    const code = await c.create(pid, profile);
    return { conn: c, code };
  }
  const h = new P2PHost();
  await h.open();
  const code = await h.create(pid, profile, resumeData);
  return { conn: h, code };
}

export async function joinRoom(mode, code, pid, profile) {
  if (mode.mode === 'server') {
    const c = new ServerConnection(mode.url);
    await c.open();
    const real = await c.enter(code, pid, profile);
    return { conn: c, code: real };
  }
  const g = new P2PGuest();
  await g.open();
  const real = await g.enter(code, pid, profile);
  return { conn: g, code: real };
}
