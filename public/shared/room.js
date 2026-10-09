// VENDIDO — sala de juego. La misma clase corre en el servidor (Node) o en el
// celular/compu del anfitrión (modo P2P, sin servidor).
import { createGame, applyAction, tick, publicView, DEFAULT_SETTINGS, P } from './engine.js';
import { botAction, botWantsToAct } from './bot.js';
import { MAPS } from './maps.js';
import { isPremium, verifyUnlockCode } from './premium.js';

export const COLORS = ['#ff4d4d', '#2f8cff', '#22c55e', '#ffb020', '#a855f7', '#ff6fb5', '#14c8c8', '#a1784f'];
const BOT_NAMES = ['Don Dinero', 'La Tía Rica', 'El Notario', 'Doña Hipoteca', 'El Licenciado', 'La Inversionista', 'Mr. Renta', 'La Casera'];
export const EMOTES = ['👏', '😂', '😡', '💸', '🔥', '😭', '🤝', '🫡'];
const MAX_PLAYERS = 8;
const AFK_GRACE = 20000; // ms antes de que un bot juegue por alguien desconectado

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(random = Math.random) {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return c;
}
export function normalizeCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}
function cleanName(n) {
  const s = String(n || '').replace(/[<>]/g, '').trim().slice(0, 16);
  return s || 'Jugador';
}

function sanitizeSettings(cur, inc) {
  const out = { ...cur };
  const pick = (k, list) => { if (inc[k] !== undefined && list.includes(inc[k])) out[k] = inc[k]; };
  if (inc.mapId && MAPS[inc.mapId]) out.mapId = inc.mapId;
  pick('mode', ['normal', 'dificil']);
  pick('startMoney', [1000, 1500, 2000, 2500, 3000]);
  pick('creditLimit', [0, 500, 1000, 2000, -1]);
  pick('interest', [0, 0.05, 0.1, 0.2]);
  pick('freeParkingPot', [true, false]);
  pick('maxRounds', [0, 15, 25, 40, 60]);
  pick('auctionSeconds', [10, 15, 20, 30]);
  pick('limitedBuildings', [true, false]);
  pick('firstLapToBuy', [true, false]);
  return out;
}

export class Room {
  constructor({ code, send, now = () => Date.now(), random = Math.random, schedule, cancel, onChange } = {}) {
    this.code = code;
    this.send = send || (() => {});
    this.now = now;
    this.random = random;
    this.schedule = schedule || ((fn, ms) => setTimeout(fn, ms));
    this.cancel = cancel || ((h) => clearTimeout(h));
    this.onChange = onChange || null;
    this.hostId = null;
    this.members = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.game = null;
    this.unlocked = false; // mapas de paga desbloqueados en esta sala
    this.botMem = {};
    this.timer = null;
    this.botTimer = null;
    this.lastActive = now();
    this.version = 0;
  }

  // ---------------------------------------------------------------- miembros
  member(id) { return this.members.find((m) => m.id === id); }
  freeColor(want) {
    const used = new Set(this.members.filter((m) => !m.spectator).map((m) => m.color));
    if (want && COLORS.includes(want) && !used.has(want)) return want;
    return COLORS.find((c) => !used.has(c)) || COLORS[0];
  }
  join(id, profile = {}) {
    this.lastActive = this.now();
    let m = this.member(id);
    if (m) {
      m.connected = true;
      m.disconnectedAt = null;
      if (!this.game) { m.name = cleanName(profile.name || m.name); }
    } else {
      const playing = this.members.filter((x) => !x.spectator).length;
      const spectator = !!this.game || playing >= MAX_PLAYERS;
      m = {
        id, name: cleanName(profile.name), color: spectator ? '#999' : this.freeColor(profile.color),
        isBot: false, connected: true, spectator, joinedAt: this.now(), disconnectedAt: null,
      };
      this.members.push(m);
    }
    if (!this.hostId || !this.member(this.hostId) || this.member(this.hostId).isBot) this.hostId = id;
    this.changed();
    return { ok: true };
  }
  leave(id) {
    const m = this.member(id);
    if (!m) return;
    if (!this.game) {
      this.members = this.members.filter((x) => x.id !== id);
    } else {
      m.connected = false;
      m.disconnectedAt = this.now();
    }
    if (this.hostId === id) {
      const next = this.members.find((x) => !x.isBot && x.connected && !x.spectator) || this.members.find((x) => !x.isBot && x.connected);
      if (next) this.hostId = next.id;
    }
    this.changed();
  }
  connectedHumans() { return this.members.filter((m) => !m.isBot && m.connected).length; }

  // ---------------------------------------------------------------- mensajes
  handle(id, msg) {
    this.lastActive = this.now();
    const m = this.member(id);
    if (!m || !msg || typeof msg !== 'object') return;
    const isHost = id === this.hostId;
    const err = (text) => this.send(id, { t: 'error', text });
    switch (msg.t) {
      case 'profile':
        if (this.game) return;
        m.name = cleanName(msg.name ?? m.name);
        if (msg.color && COLORS.includes(msg.color)) {
          const taken = this.members.some((x) => x.id !== id && x.color === msg.color && !x.spectator);
          if (!taken) m.color = msg.color;
          else err('Ese color ya lo tiene alguien.');
        }
        this.changed();
        return;
      case 'settings': {
        if (!isHost || this.game) return;
        const next = sanitizeSettings(this.settings, msg.settings || {});
        if (isPremium(next.mapId) && !this.unlocked) {
          if (verifyUnlockCode(msg.code)) this.unlocked = true;
          else { err('🔒 Ese tablero es de paga. Desbloquéalo con tu código.'); next.mapId = this.settings.mapId; }
        }
        this.settings = next;
        this.changed();
        return;
      }
      case 'unlock':
        if (!isHost) return;
        if (!verifyUnlockCode(msg.code)) return err('Ese código no es válido. Revisa que esté bien escrito.');
        this.unlocked = true;
        this.changed();
        return;
      case 'addBot': {
        if (!isHost || this.game) return;
        const players = this.members.filter((x) => !x.spectator);
        if (players.length >= MAX_PLAYERS) return err('La sala está llena (8 jugadores).');
        const used = new Set(this.members.map((x) => x.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${players.length + 1}`;
        this.members.push({ id: 'bot-' + Math.floor(this.random() * 1e9).toString(36), name, color: this.freeColor(), isBot: true, connected: true, spectator: false, joinedAt: this.now() });
        this.changed();
        return;
      }
      case 'kick': {
        if (!isHost || this.game || msg.id === id) return;
        const k = this.member(msg.id);
        if (!k) return;
        this.members = this.members.filter((x) => x.id !== msg.id);
        if (!k.isBot) this.send(msg.id, { t: 'kicked' });
        this.changed();
        return;
      }
      case 'start': {
        if (!isHost || this.game) return;
        const players = this.members.filter((x) => !x.spectator);
        if (players.length < 2) return err('Se necesitan al menos 2 jugadores (puedes agregar bots).');
        if (isPremium(this.settings.mapId) && !this.unlocked) return err('🔒 Ese tablero es de paga. Desbloquéalo con tu código o elige otro.');
        this.game = createGame({
          settings: this.settings,
          players: players.map((x) => ({ id: x.id, name: x.name, color: x.color, isBot: x.isBot })),
          seed: Math.floor(this.random() * 2 ** 31),
          now: this.now(),
        });
        this.botMem = {};
        this.changed();
        return;
      }
      case 'act': {
        if (!this.game) return;
        const r = applyAction(this.game, id, msg.action || {}, this.now());
        if (!r.ok) return err(r.error);
        this.changed();
        return;
      }
      case 'lobby': {
        // volver a la sala de espera (revancha)
        if (!isHost || !this.game) return;
        if (!this.game.over && msg.force !== true) return err('La partida sigue en curso.');
        this.game = null;
        this.members = this.members.filter((x) => x.isBot || x.connected);
        this.members.forEach((x) => { if (x.spectator) { x.spectator = false; x.color = this.freeColor(); } });
        this.changed();
        return;
      }
      case 'emote':
        if (!EMOTES.includes(msg.e)) return;
        this.members.forEach((x) => { if (!x.isBot && x.connected) this.send(x.id, { t: 'emote', pid: id, e: msg.e }); });
        return;
      case 'ping':
        this.send(id, { t: 'pong', at: msg.at });
        return;
      default:
    }
  }

  // ---------------------------------------------------------------- difusión
  info(forId) {
    return {
      code: this.code,
      hostId: this.hostId,
      you: forId,
      phase: this.game ? (this.game.over ? 'over' : 'game') : 'lobby',
      members: this.members.map((m) => ({ id: m.id, name: m.name, color: m.color, isBot: m.isBot, connected: m.connected, spectator: m.spectator })),
      settings: this.settings,
      unlocked: this.unlocked,
      v: this.version,
      now: this.now(),
    };
  }
  broadcast() {
    const game = this.game ? publicView(this.game) : null;
    for (const m of this.members) {
      if (m.isBot || !m.connected) continue;
      this.send(m.id, { t: 'room', room: this.info(m.id), game });
    }
  }
  changed() {
    this.version++;
    this.broadcast();
    this.scheduleTimers();
    if (this.onChange) this.onChange(this);
  }

  // ---------------------------------------------------------------- relojes
  scheduleTimers() {
    if (this.timer) { this.cancel(this.timer); this.timer = null; }
    if (this.botTimer) { this.cancel(this.botTimer); this.botTimer = null; }
    const g = this.game;
    if (!g || g.over) return;
    if (g.auction) {
      const ms = Math.max(30, g.auction.endsAt - this.now() + 30);
      this.timer = this.schedule(() => {
        this.timer = null;
        if (this.game && tick(this.game, this.now())) this.changed();
        else this.scheduleTimers();
      }, ms);
    }
    const next = this.nextBotActor();
    if (next) {
      const delay = next.wait ?? (g.auction ? 500 + Math.floor(this.random() * 900) : 750 + Math.floor(this.random() * 400));
      this.botTimer = this.schedule(() => { this.botTimer = null; this.runBot(); }, delay);
    }
  }
  controlledByBot(pid) {
    const m = this.member(pid);
    if (!m) return { yes: true };
    if (m.isBot) return { yes: true };
    if (m.connected) return { yes: false };
    const left = AFK_GRACE - (this.now() - (m.disconnectedAt || 0));
    return left <= 0 ? { yes: true } : { yes: false, wait: left + 50 };
  }
  nextBotActor() {
    const g = this.game;
    const candidates = [];
    if (g.auction) g.players.forEach((p) => candidates.push(p.id));
    else {
      candidates.push(g.turn.pid);
      g.trades.forEach((t) => candidates.push(t.to));
    }
    let waitFor = null;
    for (const pid of candidates) {
      const p = P(g, pid);
      if (!p || p.bankrupt || !botWantsToAct(g, pid)) continue;
      const c = this.controlledByBot(pid);
      if (c.yes) return { pid };
      if (c.wait && (waitFor === null || c.wait < waitFor)) waitFor = c.wait;
    }
    return waitFor !== null ? { pid: null, wait: waitFor } : null;
  }
  runBot() {
    const g = this.game;
    if (!g || g.over) return;
    const pick = this.nextBotActor();
    if (!pick || !pick.pid) { this.scheduleTimers(); return; }
    const pid = pick.pid;
    this.botMem[pid] = this.botMem[pid] || { tried: new Set() };
    const isRealBot = this.member(pid)?.isBot;
    const action = botAction(g, pid, this.random, isRealBot ? this.botMem[pid] : null);
    if (action) {
      const r = applyAction(g, pid, action, this.now());
      if (r.ok) { this.changed(); return; }
      // si el bot se equivoca, no atorar la partida
      const fallback = g.auction ? { type: 'pass' } : g.turn.phase === 'buy' ? { type: 'decline' } : g.turn.phase === 'roll' ? { type: 'roll' } : { type: 'endTurn' };
      if (applyAction(g, pid, fallback, this.now()).ok) { this.changed(); return; }
    }
    this.scheduleTimers();
  }

  // ---------------------------------------------------------------- guardar / restaurar
  toJSON() {
    const mem = Object.fromEntries(Object.entries(this.botMem).map(([k, v]) => [k, [...v.tried]]));
    return { code: this.code, hostId: this.hostId, members: this.members, settings: this.settings, unlocked: this.unlocked, game: this.game, botMem: mem, lastActive: this.lastActive };
  }
  restore(data) {
    this.hostId = data.hostId;
    this.members = (data.members || []).map((m) => ({ ...m, connected: m.isBot ? true : false, disconnectedAt: m.isBot ? null : this.now() }));
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    this.unlocked = !!data.unlocked;
    this.game = data.game || null;
    this.botMem = Object.fromEntries(Object.entries(data.botMem || {}).map(([k, v]) => [k, { tried: new Set(v) }]));
    this.lastActive = data.lastActive || this.now();
    if (this.game && this.game.auction) this.game.auction.endsAt = this.now() + 10000;
  }
  destroy() {
    if (this.timer) this.cancel(this.timer);
    if (this.botTimer) this.cancel(this.botTimer);
  }
}
