// VENDIDO — aplicación: pantallas, conexión y cola de animaciones
import { Board3D } from './board3d.js';
import { GameUI } from './game-ui.js';
import { detectMode, createRoom, joinRoom, createLocal } from './net.js';
import { $, esc, toast, vibrate, store, uid, sleep, fmt } from './util.js';
import { sfx, unlockAudio } from './sfx.js';
import { MAPS, MAP_ORDER, getMap } from '../shared/maps.js';
import { MODES } from '../shared/engine.js';
import { COLORS, normalizeCode } from '../shared/room.js';
import { isPremium, verifyUnlockCode, PREMIUM } from '../shared/premium.js';

const app = {
  pid: store('vendido.pid') || uid(),
  profile: store('vendido.profile') || { name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] },
  mode: null,
  conn: null,
  code: null,
  room: null,
  shownGame: null,
  queue: [],
  busy: false,
  lastSeq: 0,
  clockOffset: 0,
  fast: false,
  installEvt: null,
};
store('vendido.pid', app.pid);
window.vendido = app; // útil para depurar desde la consola

const board = new Board3D($('#scene'));
app.board = board;
board.idle = true;
board.setMap(getMap('metropoli'));
const ui = new GameUI(app);
app.ui = ui;
board.onTileTap = (i) => { if (app.room && app.room.phase !== 'lobby') ui.onTileTap(i); };

// ------------------------------------------------------------------ utilidades de la app
app.send = (msg) => app.conn && app.conn.send(msg);
app.isHost = () => app.room && app.room.hostId === app.pid;
app.serverNow = () => Date.now() + app.clockOffset;
app.unlock = () => unlockAudio();
app.toggleView = () => {
  const v = board.view === '3d' ? '2d' : '3d';
  board.setView(v);
  $('#viewBtn').textContent = v === '3d' ? '3D' : '2D';
  store('vendido.view', v);
};
app.updateInsets = () => {
  const screen = currentScreen();
  if (screen === 'game') {
    const top = $('#hudTop').getBoundingClientRect().bottom;
    const r = $('#dock').getBoundingClientRect();
    const coversCenter = r.left < innerWidth / 2 && r.right > innerWidth / 2;
    // usar el alto máximo visto del panel para que el tablero no brinque entre fases
    const bottom = coversCenter ? innerHeight - r.top : 0;
    app.maxDock = Math.max(app.maxDock || 0, bottom);
    const b = Math.min(app.maxDock, innerHeight * 0.45);
    if (Math.abs((app.lastInsets?.t ?? -1) - top) > 4 || Math.abs((app.lastInsets?.b ?? -1) - b) > 4) {
      app.lastInsets = { t: top, b };
      board.setInsets(top, b);
    }
  } else if (screen === 'lobby' && innerWidth < 760) {
    app.lastInsets = null;
    board.setInsets(0, innerHeight * 0.6);
  } else { app.lastInsets = null; board.setInsets(0, 0); }
};
app.share = async () => {
  if (app.local) { toast('Estás en práctica sin internet. Para jugar con amigos, crea una sala.', 'gold'); return; }
  const url = `${location.origin}${location.pathname}?sala=${app.code}`;
  const text = `¡Juguemos VENDIDO! Entra con el código ${app.code}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'VENDIDO', text, url }); return; }
  } catch { /* cancelado */ }
  try { await navigator.clipboard.writeText(`${text}: ${url}`); toast('Invitación copiada. Pégala en WhatsApp.', 'good'); } catch { toast(`Código: ${app.code}`, 'gold', 5000); }
};
app.installHTML = () => {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return `<div class="rules">
    ${app.installEvt ? '<button class="btn btn-gold btn-big" id="installNow" type="button">Instalar VENDIDO</button>' : ''}
    <h3>iPhone</h3><ul><li>Abre el juego en <b>Safari</b>.</li><li>Toca <b>Compartir</b> (el cuadro con la flecha) y luego <b>Agregar a pantalla de inicio</b>.</li></ul>
    <h3>Android</h3><ul><li>Abre el juego en <b>Chrome</b>.</li><li>Toca el menú <b>⋮</b> y luego <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.</li></ul>
    <h3>Computadora</h3><ul><li>En Chrome o Edge, usa el ícono de instalar en la barra de direcciones.</li></ul>
    <p class="muted">${ios ? 'En iPhone solo Safari puede instalarlo.' : 'Se abre en pantalla completa como una app normal.'}</p>
  </div>`;
};
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.installEvt = e; });
document.addEventListener('click', async (e) => {
  if (e.target.id === 'installNow' && app.installEvt) { app.installEvt.prompt(); app.installEvt = null; ui.closeSheet(); }
  const open = e.target.closest('[data-open]');
  if (open) ui.openSheet(open.dataset.open);
});

// ------------------------------------------------------------------ pantallas
function currentScreen() { return ['home', 'lobby', 'game'].find((s) => !$('#' + s).hidden) || 'home'; }
function show(screen) {
  app.maxDock = 0;
  app.lastInsets = null;
  for (const s of ['home', 'lobby', 'game']) $('#' + s).hidden = s !== screen;
  board.idle = screen !== 'game';
  if (screen !== 'game') { $('#auction').hidden = true; board.setHighlights([]); }
  requestAnimationFrame(() => app.updateInsets());
}

// ------------------------------------------------------------------ inicio
function renderHome() {
  $('#nameInput').value = app.profile.name || '';
  const pick = $('#colorPick');
  pick.innerHTML = COLORS.map((c) => `<button type="button" class="swatch" role="radio" aria-label="Color" aria-checked="${c === app.profile.color}" data-color="${c}" style="background:${c}"></button>`).join('');
  const saved = store('vendido.hostRoom');
  const rb = $('#resumeBtn');
  if (saved && Date.now() - saved.savedAt < 12 * 3600e3 && saved.pid === app.pid && app.mode?.mode === 'p2p') {
    rb.textContent = `Reanudar mi sala ${saved.data.code}`;
    rb.classList.remove('hidden');
  } else rb.classList.add('hidden');
  const q = new URLSearchParams(location.search).get('sala');
  if (q) $('#codeInput').value = normalizeCode(q);
}
$('#colorPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  app.profile.color = b.dataset.color;
  store('vendido.profile', app.profile);
  renderHome();
});
function readProfile() {
  const name = $('#nameInput').value.trim().slice(0, 16);
  if (!name) { $('#homeError').textContent = 'Escribe tu nombre.'; $('#nameInput').focus(); return null; }
  app.profile.name = name;
  store('vendido.profile', app.profile);
  $('#homeError').textContent = '';
  return app.profile;
}
function setBusy(b) { ['#createBtn', '#joinBtn', '#resumeBtn', '#practiceBtn'].forEach((s) => { $(s).disabled = b; }); }
$('#practiceBtn').addEventListener('click', () => {
  unlockAudio();
  const prof = readProfile();
  if (!prof) return;
  const { conn, code } = createLocal(app.pid, prof);
  attach(conn, code, true);
});

const PREVIEW = !!window.VENDIDO_PREVIEW; // versión de prueba sin red (solo práctica)
$('#homeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (PREVIEW) { $('#practiceBtn').click(); return; }
  unlockAudio();
  const prof = readProfile();
  if (!prof) return;
  setBusy(true);
  $('#homeError').textContent = 'Creando sala…';
  try {
    const { conn, code } = await createRoom(app.mode, app.pid, prof);
    attach(conn, code);
  } catch (err) {
    $('#homeError').textContent = err.message || 'No se pudo crear la sala.';
  } finally { setBusy(false); }
});
$('#joinBtn').addEventListener('click', () => joinFromHome());
$('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); joinFromHome(); } });
$('#codeInput').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
async function joinFromHome() {
  unlockAudio();
  const prof = readProfile();
  if (!prof) return;
  const code = normalizeCode($('#codeInput').value);
  if (code.length !== 5) { $('#homeError').textContent = 'El código tiene 5 letras o números.'; return; }
  setBusy(true);
  $('#homeError').textContent = 'Entrando…';
  try {
    const r = await joinRoom(app.mode, code, app.pid, prof);
    attach(r.conn, r.code);
  } catch (err) {
    $('#homeError').textContent = err.message || 'No se pudo entrar.';
  } finally { setBusy(false); }
}
$('#resumeBtn').addEventListener('click', async () => {
  const saved = store('vendido.hostRoom');
  const prof = readProfile();
  if (!saved || !prof) return;
  setBusy(true);
  $('#homeError').textContent = 'Reabriendo tu sala…';
  try {
    const { conn, code } = await createRoom(app.mode, app.pid, prof, saved.data);
    attach(conn, code);
  } catch (err) {
    $('#homeError').textContent = err.message;
  } finally { setBusy(false); }
});

// ------------------------------------------------------------------ conexión
function attach(conn, code, local = false) {
  app.conn = conn;
  app.code = code;
  app.local = local;
  app.shownGame = null;
  app.queue = [];
  app.lastSeq = 0;
  if (!local) store('vendido.session', { code, at: Date.now(), mode: app.mode.mode });
  const q = new URLSearchParams(location.search);
  if (q.get('sala')) { q.delete('sala'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); }
  $('#homeError').textContent = '';
  conn.onMessage(onMessage);
  conn.onStatus((s) => { $('#connBanner').hidden = s !== 'offline'; });
}
app.leave = () => {
  try { app.conn?.close(); } catch { /* */ }
  app.conn = null;
  app.room = null;
  app.shownGame = null;
  store('vendido.session', null);
  board.clearPieces();
  board.idle = true;
  $('#connBanner').hidden = true;
  show('home');
  renderHome();
};

function onMessage(msg) {
  switch (msg.t) {
    case 'room': onRoom(msg.room, msg.game); break;
    case 'error': toast(msg.text, 'warn'); sfx.bad(); if (!app.busy) ui.setBusy(false); break;
    case 'emote': ui.showEmote(msg.pid, msg.e); break;
    case 'kicked': toast('El anfitrión te sacó de la sala.', 'warn'); app.leave(); break;
    case 'gone': toast(msg.text || 'La sala ya no existe.', 'warn'); app.leave(); break;
    default:
  }
}

function onRoom(room, game) {
  const prev = app.room;
  app.room = room;
  if (room.now) app.clockOffset = room.now - Date.now();
  if (room.phase === 'lobby') {
    app.shownGame = null;
    app.queue = [];
    board.clearPieces();
    board.setMap(getMap(room.settings.mapId));
    show('lobby');
    renderLobby();
    if (!prev || prev.phase !== 'lobby') ui.closeSheet();
    return;
  }
  if (currentScreen() !== 'game') {
    show('game');
    ui.closeSheet();
    const v = store('vendido.view');
    if (v && v !== board.view) app.toggleView();
  }
  board.setMap(getMap(game.settings.mapId));
  enqueue(game);
}

// ------------------------------------------------------------------ cola de eventos (animaciones)
function enqueue(game) {
  if (!app.shownGame || game.startedAt !== app.shownGame.startedAt) {
    // primera vez (o reconexión): sin animaciones
    app.shownGame = game;
    app.lastSeq = game.seq;
    app.queue = [];
    board.sync(game, true);
    ui.render();
    if (game.turn.pid === app.pid && !game.over) toast('¡Es tu turno!', 'gold');
    return;
  }
  const evs = game.events.filter((e) => e.seq > app.lastSeq);
  app.lastSeq = Math.max(app.lastSeq, game.seq);
  app.queue.push({ game, evs });
  if (!app.busy) drain();
}
async function drain() {
  app.busy = true;
  try {
    while (app.queue.length) {
      const { game, evs } = app.queue.shift();
      app.fast = app.queue.length > 1;
      board.speed = app.fast ? 2.6 : 1;
      // si hay subastas/pujas, mostrar el estado de inmediato
      if (game.auction || evs.every((e) => ['bid', 'pass', 'tradeOffer', 'tradeReject', 'tradeCancel'].includes(e.type))) {
        app.shownGame = game;
        ui.render();
      }
      if (evs.some((e) => ['dice', 'move', 'card', 'sold'].includes(e.type))) ui.setBusy(true);
      for (const e of evs) {
        try { await playEvent(e, game); } catch (err) { console.error(err); }
      }
      app.shownGame = game;
      board.sync(game);
      ui.render();
    }
  } finally {
    app.busy = false;
    board.speed = 1;
    app.fast = false;
  }
}
async function playEvent(e, game) {
  const me = app.pid;
  switch (e.type) {
    case 'dice':
      sfx.dice();
      await board.rollDice(e.dice);
      break;
    case 'move': {
      if (e.kind === 'train') sfx.train();
      if (e.kind === 'jail') sfx.jail();
      const steps = e.kind === 'walk' || e.kind === 'back' ? e.path.length : 0;
      let k = 0;
      const stepT = steps ? setInterval(() => { if (k++ < steps) sfx.step(); }, 165 / board.speed) : null;
      await board.moveToken(e.pid, e.path, e.kind, game);
      if (stepT) clearInterval(stepT);
      break;
    }
    case 'card':
      await ui.showCard(e);
      break;
    case 'sold': {
      const p = game.players.find((x) => x.id === e.pid);
      board.soldBurst(e.tile, p?.color || '#fff');
      board.sync(game);
      ui.showStamp(e.tile, e.pid, e.price);
      await sleep(app.fast ? 300 : 900);
      break;
    }
    case 'pay':
      ui.moneyFloat(e.from, -e.amount);
      if (e.to) ui.moneyFloat(e.to, e.amount);
      if (e.from === me) sfx.pay(); else if (e.to === me) sfx.coin();
      break;
    case 'receive':
      ui.moneyFloat(e.pid, e.amount);
      if (e.pid === me) sfx.coin();
      break;
    case 'bankCover': {
      const p = game.players.find((x) => x.id === e.pid);
      toast(`🏦 El banco cubrió ${fmt(e.amount, getMap(game.settings.mapId).currency)} de ${p?.name}. Ahora le debe al banco.`, 'warn', 3500);
      break;
    }
    case 'build':
      sfx.build();
      board.sync(game);
      break;
    case 'mortgage':
      board.sync(game);
      break;
    case 'lapDone':
      if (e.pid === me) { toast('🏁 ¡Completaste tu primera vuelta! Ya puedes comprar.', 'good', 3200); sfx.coin(); }
      break;
    case 'turn':
      if (e.pid === me) { sfx.turn(); vibrate([60, 40, 60]); toast('¡Es tu turno!', 'gold', 1800); }
      break;
    case 'bid':
      sfx.bid();
      break;
    case 'auction':
      vibrate(30);
      break;
    case 'tradeOffer':
      if (e.to === me) { toast(`🤝 ${game.players.find((p) => p.id === e.from)?.name} te propone un trato. Ábrelo en Tratos.`, 'gold', 4000); vibrate(40); }
      break;
    case 'trade':
      toast('🤝 Trato cerrado.', 'good');
      board.sync(game);
      break;
    case 'tradeReject':
      break;
    case 'bankrupt': {
      const p = game.players.find((x) => x.id === e.pid);
      toast(`💥 ${p?.name} está en quiebra.`, 'warn', 3500);
      sfx.bad();
      board.sync(game);
      break;
    }
    case 'gameOver':
      sfx.win();
      break;
    default:
  }
}

// ------------------------------------------------------------------ sala de espera
const SETTINGS = [
  { key: 'startMoney', label: 'Dinero inicial', opts: [[1000, '1,000'], [1500, '1,500'], [2000, '2,000'], [2500, '2,500'], [3000, '3,000']], money: true },
  { key: 'creditLimit', label: 'Crédito del banco', hint: 'Cuánto puedes deberle al banco por encima de lo que valen tus bienes antes de quebrar.', opts: [[0, 'Nada'], [500, '500'], [1000, '1,000'], [2000, '2,000'], [-1, 'Sin límite']], money: true },
  { key: 'interest', label: 'Interés por deuda', hint: 'Se cobra cada vez que pasas por la Salida debiendo.', opts: [[0, '0%'], [0.05, '5%'], [0.1, '10%'], [0.2, '20%']] },
  { key: 'maxRounds', label: 'Límite de rondas', hint: 'Al terminar gana quien tenga más patrimonio.', opts: [[0, 'Sin límite'], [15, '15'], [25, '25'], [40, '40'], [60, '60']] },
  { key: 'auctionSeconds', label: 'Tiempo de subasta', opts: [[10, '10 s'], [15, '15 s'], [20, '20 s'], [30, '30 s']] },
  { key: 'freeParkingPot', label: 'Bote en la casilla libre', hint: 'Impuestos y multas se juntan y se los lleva quien caiga ahí.', opts: [[false, 'No'], [true, 'Sí']] },
  { key: 'firstLapToBuy', label: 'Comprar después de la 1ª vuelta', hint: 'Nadie compra (ni puja) hasta pasar una vez por la Salida.', opts: [[true, 'Sí'], [false, 'No']] },
  { key: 'limitedBuildings', label: 'Casas limitadas', hint: 'Regla clásica: el banco solo tiene 32 casas y 12 hoteles.', opts: [[false, 'No'], [true, 'Sí']] },
];
function renderLobby() {
  const r = app.room;
  const host = app.isHost();
  document.body.classList.toggle('is-host', host);
  document.body.classList.toggle('is-guest', !host);
  $('#roomCode').textContent = app.local ? 'Práctica' : r.code;
  $('#shareBtn').hidden = !!app.local;
  const players = r.members.filter((m) => !m.spectator);
  $('#playerCount').textContent = `${players.length} de 8`;
  $('#lobbyPlayers').innerHTML = r.members.map((m) => `
    <li style="${m.connected ? '' : 'opacity:.5'}">
      <span class="dot" style="background:${m.color}"></span>
      <span class="grow">${esc(m.name)}</span>
      ${m.id === r.hostId ? '<span class="tag gold">anfitrión</span>' : ''}
      ${m.id === app.pid ? '<span class="tag">tú</span>' : ''}
      ${m.isBot ? '<span class="tag">bot</span>' : ''}
      ${m.spectator ? '<span class="tag">espectador</span>' : ''}
      ${host && m.id !== app.pid ? `<button class="x" type="button" data-kick="${esc(m.id)}" aria-label="Sacar a ${esc(m.name)}">✕</button>` : ''}
    </li>`).join('') + `<li style="background:none;padding:4px 0;flex-wrap:wrap"><span class="muted" style="margin-right:4px">Tu color:</span>${COLORS.map((c) => {
    const taken = r.members.some((m) => m.id !== app.pid && m.color === c && !m.spectator);
    const mine = r.members.find((m) => m.id === app.pid)?.color === c;
    return `<button type="button" class="swatch" style="width:28px;height:28px;background:${c}" data-mycolor="${c}" aria-checked="${mine}" ${taken ? 'disabled' : ''} aria-label="Color"></button>`;
  }).join('')}</li>`;

  $('#mapPick').innerHTML = MAP_ORDER.map((id) => {
    const m = MAPS[id];
    const locked = isPremium(id) && !r.unlocked;
    return `<button class="map-opt ${locked ? 'locked' : ''}" type="button" role="radio" data-map="${id}" aria-checked="${r.settings.mapId === id}" ${host ? '' : 'disabled'}>
      <span class="strip">${m.groups.map((g) => `<i style="background:${g.color}"></i>`).join('')}</span>
      <b>${m.tiles[39].icon} ${esc(m.name)}</b><small>${esc(m.blurb)}</small>
      ${isPremium(id) ? `<span class="premium-tag">${locked ? `🔒 ${PREMIUM.priceLabel}` : '✓ Premium'}</span>` : ''}</button>`;
  }).join('');
  $('#modePick').innerHTML = Object.entries(MODES).map(([id, md]) => `<button class="mode-opt" type="button" role="radio" data-mode="${id}" aria-checked="${r.settings.mode === id}" ${host ? '' : 'disabled'}><b>${md.name}</b><small>${md.desc}</small></button>`).join('');
  const cur = getMap(r.settings.mapId).currency;
  $('#settingsGrid').innerHTML = SETTINGS.map((s) => `<div class="set-row"><span>${s.label}</span>
    <div class="seg">${s.opts.map(([v, l]) => `<button type="button" data-set="${s.key}" data-val='${JSON.stringify(v)}' aria-pressed="${r.settings[s.key] === v}" ${host ? '' : 'disabled'}>${s.money && typeof v === 'number' && v > 0 ? cur + l : l}</button>`).join('')}</div>
    ${s.hint ? `<small>${s.hint}</small>` : ''}</div>`).join('');
  $('#startBtn').disabled = players.length < 2;
  $('#startBtn').textContent = players.length < 2 ? 'Faltan jugadores (agrega un bot)' : 'Empezar partida';
  $('#waitHost').textContent = `Esperando a que ${esc(r.members.find((m) => m.id === r.hostId)?.name || 'el anfitrión')} empiece…`;
}
$('#lobby').addEventListener('click', (e) => {
  const t = e.target;
  const map = t.closest('[data-map]');
  if (map && app.isHost()) {
    const id = map.dataset.map;
    if (isPremium(id) && !app.room.unlocked) {
      const code = store('vendido.codigo');
      if (code && verifyUnlockCode(code)) app.send({ t: 'settings', settings: { mapId: id }, code });
      else ui.openSheet('unlock', { mapId: id });
      return;
    }
    app.send({ t: 'settings', settings: { mapId: id } });
    return;
  }
  const mode = t.closest('[data-mode]');
  if (mode && app.isHost()) { app.send({ t: 'settings', settings: { mode: mode.dataset.mode } }); return; }
  const set = t.closest('[data-set]');
  if (set && app.isHost()) { app.send({ t: 'settings', settings: { [set.dataset.set]: JSON.parse(set.dataset.val) } }); return; }
  const kick = t.closest('[data-kick]');
  if (kick) { app.send({ t: 'kick', id: kick.dataset.kick }); return; }
  const col = t.closest('[data-mycolor]');
  if (col) { app.profile.color = col.dataset.mycolor; store('vendido.profile', app.profile); app.send({ t: 'profile', color: col.dataset.mycolor }); }
});
$('#addBotBtn').addEventListener('click', () => app.send({ t: 'addBot' }));
$('#startBtn').addEventListener('click', () => { unlockAudio(); app.send({ t: 'start' }); });
$('#shareBtn').addEventListener('click', () => app.share());
$('#leaveBtn').addEventListener('click', () => app.leave());

// ------------------------------------------------------------------ arranque
async function boot() {
  show('home');
  renderHome();
  const v = store('vendido.view');
  if (v === '2d') app.toggleView();
  if (PREVIEW) {
    app.mode = { mode: 'p2p' };
    ['#createBtn', '.or', '.join-row', '[data-open="install"]'].forEach((sel) => { const el = $(sel); if (el) el.hidden = true; });
    $('#practiceBtn').className = 'btn btn-gold btn-big';
    $('#practiceBtn').textContent = 'Jugar contra bots';
    $('#modeNote').textContent = 'Versión de prueba: practica contra bots. Para jugar con amigos por código, usa la versión de tu compu.';
    return;
  }
  app.mode = await detectMode();
  $('#modeNote').textContent = app.mode.mode === 'server'
    ? 'Conectado al servidor de VENDIDO.'
    : 'Modo directo: no necesita servidor. Quien crea la sala debe dejar el juego abierto mientras juegan.';
  renderHome();
  // reconectar si veníamos de una sala
  const ses = store('vendido.session');
  const prof = app.profile;
  if (ses && Date.now() - ses.at < 6 * 3600e3 && prof.name && ses.mode === app.mode.mode) {
    $('#homeError').textContent = `Volviendo a la sala ${ses.code}…`;
    try {
      const saved = store('vendido.hostRoom');
      if (app.mode.mode === 'p2p' && saved && saved.data.code === ses.code && saved.pid === app.pid) {
        const { conn, code } = await createRoom(app.mode, app.pid, prof, saved.data);
        attach(conn, code);
      } else {
        const r = await joinRoom(app.mode, ses.code, app.pid, prof);
        attach(r.conn, r.code);
      }
    } catch (err) {
      store('vendido.session', null);
      $('#homeError').textContent = '';
    }
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
window.addEventListener('resize', () => { app.maxDock = 0; app.lastInsets = null; app.updateInsets(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && app.shownGame) ui.render(); });
