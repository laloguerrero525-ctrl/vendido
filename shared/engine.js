// VENDIDO — motor de reglas (funciona igual en el servidor y en el navegador).
// Todo el estado de la partida vive en un objeto plano serializable (JSON).
import { getMap, STATION_RENT } from './maps.js';

export const DEFAULT_SETTINGS = {
  mapId: 'metropoli',
  mode: 'normal',        // 'normal' | 'dificil'
  startMoney: 1500,
  salary: 200,
  creditLimit: 500,      // cuánto puede quedar a deber al banco más allá de sus bienes (-1 = sin límite)
  interest: 0.1,         // interés sobre la deuda cada vez que pasa por la Salida
  freeParkingPot: false, // impuestos y multas van a un bote en la casilla libre
  maxRounds: 0,          // 0 = sin límite; si hay límite gana el de mayor patrimonio
  auctionSeconds: 15,
  jailFine: 50,
  limitedBuildings: false, // true = el banco solo tiene 32 casas y 12 hoteles (regla clásica)
  firstLapToBuy: true,     // solo se puede comprar después de dar la primera vuelta completa
};

export const MODES = {
  normal: { name: 'Normal', desc: 'Compras todo lo que quieras. Con un color completo construyes casas desde donde estés.' },
  dificil: { name: 'Difícil', desc: 'Solo puedes construir en una propiedad cuando caes en ella (y tienes todo su color).' },
};

const BANK_HOUSES = 32;
const BANK_HOTELS = 12;
const MAX_EVENTS = 80;
const MAX_LOG = 120;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function rand(s) {
  // mulberry32 — determinista para poder repetir partidas en pruebas
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function mapOf(s) { return getMap(s.settings.mapId); }
export function P(s, id) { return s.players.find((p) => p.id === id); }
export function active(s) { return s.players.filter((p) => !p.bankrupt); }
export function money(s, n) {
  const c = mapOf(s).currency;
  const v = Math.round(n);
  return (v < 0 ? '-' : '') + c + Math.abs(v).toLocaleString('es-MX');
}
function ev(s, type, data = {}) {
  s.events.push({ seq: ++s.seq, type, ...data });
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
}
function log(s, text, kind = 'info') {
  s.log.push({ seq: ++s.seq, text, kind });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}
function isBuyable(t) { return t.t === 'prop' || t.t === 'station' || t.t === 'utility'; }

// ---------------------------------------------------------------------------
// Crear partida
// ---------------------------------------------------------------------------
export function createGame({ settings = {}, players, seed = Date.now(), now = Date.now() }) {
  const st = { ...DEFAULT_SETTINGS, ...settings };
  const map = getMap(st.mapId);
  const s = {
    v: 1,
    settings: st,
    rng: seed >>> 0 || 1,
    players: players.map((p) => ({
      id: p.id, name: p.name, color: p.color, isBot: !!p.isBot,
      pos: 0, money: st.startMoney, inJail: false, jailTries: 0, jailCards: [], lapDone: !st.firstLapToBuy,
      bankrupt: false, rank: null,
    })),
    order: [],
    props: {},
    bank: { houses: BANK_HOUSES, hotels: BANK_HOTELS, pot: 0 },
    turn: null,
    round: 1,
    decks: { chance: [], chest: [] },
    auction: null,
    auctionSeq: 0,
    trades: [],
    tradeSeq: 0,
    events: [],
    log: [],
    seq: 0,
    lastCard: null,
    over: false,
    winner: null,
    endReason: null,
    startedAt: now,
  };
  map.tiles.forEach((t) => { if (isBuyable(t)) s.props[t.i] = { owner: null, houses: 0, mortgaged: false }; });
  s.decks.chance = shuffle(s, map.cards.chance.map((_, i) => i));
  s.decks.chest = shuffle(s, map.cards.chest.map((_, i) => i));
  s.order = shuffle(s, s.players.map((p) => p.id));
  s.turn = newTurn(s.order[0]);
  log(s, `Empieza la partida en ${map.name} (modo ${MODES[st.mode]?.name || st.mode}).`, 'big');
  log(s, `Turno de ${P(s, s.order[0]).name}.`, 'turn');
  ev(s, 'turn', { pid: s.order[0] });
  return s;
}

function newTurn(pid) {
  return { pid, phase: 'roll', dice: null, doubles: 0, extra: false, traveled: false, landed: null, pendingBuy: null, rolled: false };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
// ¿Ya puede comprar? (regla de la primera vuelta)
export function canBuyYet(s, p) {
  return !s.settings.firstLapToBuy || p.lapDone !== false;
}

export function ownedTiles(s, pid) {
  return Object.keys(s.props).map(Number).filter((i) => s.props[i].owner === pid);
}
export function ownsGroup(s, pid, g) {
  return mapOf(s).groups[g].tiles.every((i) => s.props[i].owner === pid);
}
function groupHasBuildings(s, g) {
  return mapOf(s).groups[g].tiles.some((i) => s.props[i].houses > 0);
}
function countOwned(s, pid, kind) {
  const m = mapOf(s);
  const list = kind === 'station' ? m.stationTiles : m.utilityTiles;
  return list.filter((i) => s.props[i].owner === pid).length;
}
export function rentFor(s, idx, diceSum = 7, special = null) {
  const m = mapOf(s);
  const t = m.tiles[idx];
  const pr = s.props[idx];
  if (!pr || !pr.owner || pr.mortgaged) return 0;
  if (t.t === 'prop') {
    if (pr.houses > 0) return t.rent[pr.houses];
    return t.rent[0] * (ownsGroup(s, pr.owner, t.g) ? 2 : 1);
  }
  if (t.t === 'station') {
    const n = countOwned(s, pr.owner, 'station');
    return STATION_RENT[n - 1] * (special === 'double' ? 2 : 1);
  }
  if (t.t === 'utility') {
    const n = countOwned(s, pr.owner, 'utility');
    const factor = special === 'util10' ? 10 : n === 2 ? 10 : 4;
    return diceSum * factor;
  }
  return 0;
}
export function liquidationValue(s, pid) {
  const m = mapOf(s);
  let v = 0;
  for (const i of ownedTiles(s, pid)) {
    const t = m.tiles[i];
    const pr = s.props[i];
    if (!pr.mortgaged) v += Math.floor(t.price / 2);
    if (t.t === 'prop') v += Math.floor((pr.houses * t.house) / 2);
  }
  return v;
}
export function netWorth(s, pid) {
  const m = mapOf(s);
  const p = P(s, pid);
  let v = p.money;
  for (const i of ownedTiles(s, pid)) {
    const t = m.tiles[i];
    const pr = s.props[i];
    v += pr.mortgaged ? Math.floor(t.price / 2) : t.price;
    if (t.t === 'prop') v += pr.houses * t.house;
  }
  return v;
}
export function unmortgageCost(t) { return Math.round((t.price / 2) * 1.1); }

// ---------------------------------------------------------------------------
// Dinero, deudas y quiebra
// ---------------------------------------------------------------------------
// Si quien paga no tiene suficiente, el BANCO cubre la diferencia: el que cobra
// recibe completo y el deudor queda en negativo (debe al banco).
function pay(s, from, toId, amount, reason) {
  amount = Math.max(0, Math.round(amount));
  if (!amount || from.bankrupt) return;
  const had = from.money;
  from.money -= amount;
  const to = toId ? P(s, toId) : null;
  if (to) to.money += amount;
  else if (s.settings.freeParkingPot && (reason === 'tax' || reason === 'card' || reason === 'jail')) s.bank.pot += amount;
  ev(s, 'pay', { from: from.id, to: toId || null, amount, reason });
  if (from.money < 0) {
    const covered = Math.min(amount, amount - Math.max(0, had));
    if (to && covered > 0) {
      log(s, `El banco le cubrió ${money(s, covered)} a ${from.name}. Ahora debe ${money(s, -from.money)} al banco.`, 'debt');
      ev(s, 'bankCover', { pid: from.id, to: toId, amount: covered });
    } else if (covered > 0) {
      log(s, `${from.name} queda debiendo ${money(s, -from.money)} al banco.`, 'debt');
    }
    checkDebt(s, from);
  }
}
function receive(s, p, amount) {
  p.money += Math.round(amount);
  ev(s, 'receive', { pid: p.id, amount: Math.round(amount) });
}
function checkDebt(s, p) {
  if (p.money >= 0 || p.bankrupt) return;
  const limit = s.settings.creditLimit;
  if (limit < 0) return;
  const liq = liquidationValue(s, p.id);
  if (p.money + liq < -limit) {
    log(s, `${p.name} debe más de lo que tiene y el banco ya no le presta.`, 'debt');
    bankrupt(s, p, 'deuda');
  }
}
function bankrupt(s, p, reason) {
  if (p.bankrupt) return;
  const m = mapOf(s);
  p.rank = active(s).length;
  p.bankrupt = true;
  p.money = 0;
  p.inJail = false;
  for (const i of ownedTiles(s, p.id)) {
    const pr = s.props[i];
    if (pr.houses === 5) s.bank.hotels++;
    else s.bank.houses += pr.houses;
    pr.owner = null; pr.houses = 0; pr.mortgaged = false;
  }
  for (const c of p.jailCards) s.decks[c.deck].push(c.idx);
  p.jailCards = [];
  s.trades = s.trades.filter((t) => t.from !== p.id && t.to !== p.id);
  if (s.auction) {
    if (s.auction.seller === p.id) {
      // la propiedad volvió al banco: la subasta sigue pero ahora la vende el banco
      s.auction.seller = null;
    }
    if (s.auction.bidder === p.id) { s.auction.bidder = null; s.auction.high = 0; }
  }
  log(s, reason === 'rendirse' ? `${p.name} se rindió. Sus propiedades vuelven al banco.` : `¡${p.name} está en quiebra! Sus propiedades vuelven al banco.`, 'bankrupt');
  ev(s, 'bankrupt', { pid: p.id });
  void m;
  checkGameOver(s);
}
function checkGameOver(s) {
  if (s.over) return;
  const alive = active(s);
  if (alive.length <= 1) {
    s.over = true;
    s.winner = alive[0]?.id || null;
    s.endReason = 'quiebra';
    if (alive[0]) alive[0].rank = 1;
    s.auction = null;
    log(s, alive[0] ? `🏆 ¡${alive[0].name} gana la partida!` : 'Fin de la partida.', 'big');
    ev(s, 'gameOver', { winner: s.winner });
  }
}
function endByRounds(s) {
  const alive = active(s).sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id));
  alive.forEach((p, i) => { p.rank = i + 1; });
  s.over = true;
  s.winner = alive[0]?.id || null;
  s.endReason = 'rondas';
  s.auction = null;
  log(s, `Se acabaron las ${s.settings.maxRounds} rondas. 🏆 ¡${alive[0].name} gana con un patrimonio de ${money(s, netWorth(s, alive[0].id))}!`, 'big');
  ev(s, 'gameOver', { winner: s.winner });
}

// ---------------------------------------------------------------------------
// Movimiento
// ---------------------------------------------------------------------------
function passGo(s, p) {
  if (p.money < 0 && s.settings.interest > 0) {
    const interest = Math.ceil(-p.money * s.settings.interest);
    p.money -= interest;
    log(s, `${p.name} paga ${money(s, interest)} de intereses al banco por su deuda.`, 'debt');
  }
  receive(s, p, s.settings.salary);
  log(s, `${p.name} pasa por ${mapOf(s).tiles[0].name} y cobra ${money(s, s.settings.salary)}.`, 'money');
  if (p.lapDone === false) {
    p.lapDone = true;
    log(s, `🏁 ${p.name} completó su primera vuelta: ya puede comprar.`, 'big');
    ev(s, 'lapDone', { pid: p.id });
  }
  checkDebt(s, p);
}
function walk(s, p, steps) {
  const path = [];
  let pos = p.pos;
  let passed = false;
  for (let k = 0; k < steps; k++) {
    pos = (pos + 1) % 40;
    path.push(pos);
    if (pos === 0) passed = true;
  }
  p.pos = pos;
  ev(s, 'move', { pid: p.id, path, kind: 'walk' });
  if (passed) passGo(s, p);
}
function walkTo(s, p, to, collect = true) {
  const steps = (to - p.pos + 40) % 40;
  if (steps === 0) return;
  if (collect) walk(s, p, steps);
  else {
    const path = [];
    let pos = p.pos;
    for (let k = 0; k < steps; k++) { pos = (pos + 1) % 40; path.push(pos); }
    p.pos = to;
    ev(s, 'move', { pid: p.id, path, kind: 'walk' });
  }
}
function sendToJail(s, p) {
  p.pos = 10;
  p.inJail = true;
  p.jailTries = 0;
  ev(s, 'move', { pid: p.id, path: [10], kind: 'jail' });
  log(s, `${p.name} va a ${mapOf(s).tiles[10].name}.`, 'jail');
  if (s.turn.pid === p.id) { s.turn.extra = false; s.turn.doubles = 0; }
}

function resolveLanding(s, p, special = null) {
  if (p.bankrupt || s.over) return;
  const m = mapOf(s);
  const idx = p.pos;
  const t = m.tiles[idx];
  s.turn.landed = idx;
  if (isBuyable(t)) {
    const pr = s.props[idx];
    if (!pr.owner) {
      if (!canBuyYet(s, p)) {
        log(s, `${p.name} todavía no puede comprar ${t.name}: primero tiene que dar una vuelta completa.`);
        return;
      }
      s.turn.pendingBuy = idx;
      s.turn.phase = 'buy';
      return;
    }
    if (pr.owner === p.id) return;
    if (pr.mortgaged) {
      log(s, `${t.name} está hipotecada: ${p.name} no paga renta.`);
      return;
    }
    let dice = s.turn.dice ? s.turn.dice[0] + s.turn.dice[1] : 7;
    if (t.t === 'utility' && special === 'util10') {
      const a = 1 + Math.floor(rand(s) * 6);
      const b = 1 + Math.floor(rand(s) * 6);
      dice = a + b;
      ev(s, 'dice', { pid: p.id, dice: [a, b], bonus: true });
    }
    const rent = rentFor(s, idx, dice, special);
    const owner = P(s, pr.owner);
    log(s, `${p.name} paga ${money(s, rent)} de renta a ${owner.name} por ${t.name}.`, 'rent');
    pay(s, p, owner.id, rent, 'rent');
    return;
  }
  switch (t.t) {
    case 'tax':
      log(s, `${p.name} paga ${t.name}: ${money(s, t.amount)}.`, 'money');
      pay(s, p, null, t.amount, 'tax');
      return;
    case 'chance':
    case 'chest':
      drawCard(s, p, t.t);
      return;
    case 'gotojail':
      sendToJail(s, p);
      return;
    case 'free':
      if (s.settings.freeParkingPot && s.bank.pot > 0) {
        const pot = s.bank.pot;
        s.bank.pot = 0;
        receive(s, p, pot);
        log(s, `${p.name} se lleva el bote de ${t.name}: ${money(s, pot)}.`, 'money');
      }
      return;
    default:
  }
}

function drawCard(s, p, deck) {
  const m = mapOf(s);
  const d = s.decks[deck];
  if (!d.length) return;
  const ci = d.shift();
  const card = m.cards[deck][ci];
  s.lastCard = { seq: s.seq + 1, deck, id: card.id, text: card.text, pid: p.id };
  ev(s, 'card', { pid: p.id, deck, text: card.text, id: card.id });
  log(s, `${p.name} saca ${m.decks[deck].name}: “${card.text}”`, 'card');
  if (card.fx === 'jailFree') {
    p.jailCards.push({ deck, idx: ci });
    return;
  }
  d.push(ci);
  const others = active(s).filter((o) => o.id !== p.id);
  switch (card.fx) {
    case 'moveTo':
      walkTo(s, p, card.to, true);
      resolveLanding(s, p);
      break;
    case 'nearest': {
      const list = card.kind === 'station' ? m.stationTiles : m.utilityTiles;
      let to = list.find((i) => i > p.pos);
      if (to === undefined) to = list[0];
      walkTo(s, p, to, true);
      resolveLanding(s, p, card.kind === 'station' ? 'double' : 'util10');
      break;
    }
    case 'collect':
      receive(s, p, card.amount);
      break;
    case 'pay':
      pay(s, p, null, card.amount, 'card');
      break;
    case 'back': {
      const path = [];
      let pos = p.pos;
      for (let k = 0; k < card.steps; k++) { pos = (pos + 39) % 40; path.push(pos); }
      p.pos = pos;
      ev(s, 'move', { pid: p.id, path, kind: 'back' });
      resolveLanding(s, p);
      break;
    }
    case 'jail':
      sendToJail(s, p);
      break;
    case 'repairs': {
      let houses = 0;
      let hotels = 0;
      for (const i of ownedTiles(s, p.id)) {
        const h = s.props[i].houses;
        if (h === 5) hotels++;
        else houses += h;
      }
      const total = houses * card.house + hotels * card.hotel;
      if (total > 0) {
        log(s, `${p.name} paga ${money(s, total)} de reparaciones (${houses} casas, ${hotels} hoteles).`, 'money');
        pay(s, p, null, total, 'card');
      } else log(s, `${p.name} no tiene construcciones: no paga nada.`);
      break;
    }
    case 'payEach':
      for (const o of others) { if (!p.bankrupt) pay(s, p, o.id, card.amount, 'card'); }
      break;
    case 'collectEach':
      for (const o of others) pay(s, o, p.id, card.amount, 'card');
      break;
    default:
  }
}

function afterResolvePhase(s) {
  const p = P(s, s.turn.pid);
  if (!p || p.bankrupt) return 'end';
  if (p.inJail) return 'end';
  return s.turn.extra ? 'roll' : 'end';
}

function nextTurn(s) {
  if (s.over) return;
  const ids = s.order;
  let idx = ids.indexOf(s.turn.pid);
  for (let k = 0; k < ids.length; k++) {
    idx = (idx + 1) % ids.length;
    if (idx === 0) {
      s.round++;
      if (s.settings.maxRounds > 0 && s.round > s.settings.maxRounds) { endByRounds(s); return; }
    }
    const p = P(s, ids[idx]);
    if (!p.bankrupt) {
      s.turn = newTurn(p.id);
      log(s, `Turno de ${p.name}.`, 'turn');
      ev(s, 'turn', { pid: p.id });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Subastas
// ---------------------------------------------------------------------------
function startAuction(s, tile, seller, returnPhase, now) {
  const m = mapOf(s);
  s.auction = {
    id: ++s.auctionSeq, tile, seller: seller || null, high: 0, bidder: null,
    endsAt: now + s.settings.auctionSeconds * 1000, passed: [], returnPhase,
  };
  s.turn.phase = 'auction';
  const who = seller ? P(s, seller).name : 'El banco';
  log(s, `🔨 ${who} subasta ${m.tiles[tile].name}.`, 'auction');
  ev(s, 'auction', { tile, seller: seller || null });
  if (auctionCanClose(s)) closeAuction(s);
}
function auctionCanClose(s) {
  const a = s.auction;
  const others = active(s).filter((o) => o.id !== a.seller && o.id !== a.bidder);
  return others.every((o) => a.passed.includes(o.id) || o.money <= a.high || !canBuyYet(s, o));
}
function closeAuction(s) {
  const a = s.auction;
  if (!a) return;
  const m = mapOf(s);
  const t = m.tiles[a.tile];
  s.auction = null;
  if (a.bidder && !P(s, a.bidder).bankrupt) {
    const b = P(s, a.bidder);
    s.props[a.tile].owner = b.id;
    pay(s, b, a.seller, a.high, 'auction');
    log(s, `🔨 ¡VENDIDO! ${t.name} para ${b.name} por ${money(s, a.high)}.`, 'sold');
    ev(s, 'sold', { tile: a.tile, pid: b.id, price: a.high, seller: a.seller });
  } else {
    log(s, `Nadie ofreció por ${t.name}.`, 'auction');
    ev(s, 'auctionEnd', { tile: a.tile });
  }
  s.turn.pendingBuy = null;
  if (s.turn.phase === 'auction') s.turn.phase = a.returnPhase === 'buy' ? afterResolvePhase(s) : a.returnPhase;
  const cur = P(s, s.turn.pid);
  if (cur && cur.bankrupt && !s.over) nextTurn(s);
}

// Avanza el reloj: cierra subastas vencidas. Devuelve true si cambió algo.
export function tick(s, now) {
  if (s.over) return false;
  if (s.auction && now >= s.auction.endsAt) {
    closeAuction(s);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Validaciones (devuelven un mensaje de error o null)
// ---------------------------------------------------------------------------
function myTurn(s, p) { return s.turn.pid === p.id; }
function inAuction(s, tile) { return s.auction && s.auction.tile === tile; }

const CHECK = {
  roll(s, p) {
    if (!myTurn(s, p)) return 'No es tu turno.';
    if (s.turn.phase !== 'roll') return 'Ahora no puedes tirar.';
    return null;
  },
  buy(s, p) {
    if (!myTurn(s, p) || s.turn.phase !== 'buy') return 'No hay nada que comprar.';
    const t = mapOf(s).tiles[s.turn.pendingBuy];
    if (p.money < t.price) return p.money < 0 ? 'Tienes deuda con el banco: no puedes comprar.' : 'No te alcanza.';
    return null;
  },
  decline(s, p) {
    if (!myTurn(s, p) || s.turn.phase !== 'buy') return 'No hay nada que subastar.';
    return null;
  },
  endTurn(s, p) {
    if (!myTurn(s, p)) return 'No es tu turno.';
    if (s.turn.phase !== 'end') return s.turn.phase === 'roll' ? 'Primero tira los dados.' : 'Termina lo pendiente primero.';
    return null;
  },
  payJail(s, p) {
    if (!myTurn(s, p) || s.turn.phase !== 'roll' || !p.inJail) return 'No estás en la cárcel.';
    if (p.money < s.settings.jailFine) return 'No te alcanza para la fianza.';
    return null;
  },
  useJailCard(s, p) {
    if (!myTurn(s, p) || s.turn.phase !== 'roll' || !p.inJail) return 'No estás en la cárcel.';
    if (!p.jailCards.length) return 'No tienes tarjeta para salir.';
    return null;
  },
  travel(s, p, a) {
    if (!myTurn(s, p)) return 'No es tu turno.';
    if (s.turn.phase !== 'roll' && s.turn.phase !== 'end') return 'Ahora no puedes viajar.';
    if (p.inJail) return 'Estás en la cárcel.';
    if (s.turn.traveled) return 'Ya viajaste en esta tirada.';
    const m = mapOf(s);
    const here = m.tiles[p.pos];
    if (here.t !== 'station') return `Tienes que estar en tu ${m.stationWord}.`;
    const ph = s.props[p.pos];
    if (ph.owner !== p.id) return `Esta ${m.stationWord === 'portal' ? 'casilla' : 'estación'} no es tuya.`;
    if (ph.mortgaged) return 'Está hipotecada: no opera.';
    const to = a?.to;
    if (to === undefined) return null;
    if (!m.stationTiles.includes(to) || to === p.pos) return 'Destino inválido.';
    const pt = s.props[to];
    if (pt.owner !== p.id) return 'Solo puedes viajar a tus propias estaciones.';
    if (pt.mortgaged) return 'El destino está hipotecado.';
    return null;
  },
  build(s, p, a) {
    const m = mapOf(s);
    const t = m.tiles[a?.tile];
    if (!t || t.t !== 'prop') return 'Solo se construye en propiedades de color.';
    if (!myTurn(s, p)) return 'Solo puedes construir en tu turno.';
    if (s.turn.phase !== 'roll' && s.turn.phase !== 'end') return 'Ahora no puedes construir.';
    const pr = s.props[t.i];
    if (pr.owner !== p.id) return 'No es tuya.';
    if (!ownsGroup(s, p.id, t.g)) return 'Necesitas todo el color.';
    if (m.groups[t.g].tiles.some((i) => s.props[i].mortgaged)) return 'Hay una propiedad del color hipotecada.';
    if (pr.houses >= 5) return 'Ya tiene hotel.';
    if (p.money < t.house) return p.money < 0 ? 'Tienes deuda con el banco.' : 'No te alcanza.';
    if (s.settings.mode === 'dificil') {
      if (s.turn.landed !== t.i || p.pos !== t.i) return 'Modo difícil: solo construyes donde acabas de caer.';
    } else {
      const min = Math.min(...m.groups[t.g].tiles.map((i) => s.props[i].houses));
      if (pr.houses > min) return 'Construye parejo: primero en las otras del color.';
    }
    if (s.settings.limitedBuildings) {
      if (pr.houses === 4 && s.bank.hotels <= 0) return 'El banco no tiene hoteles.';
      if (pr.houses < 4 && s.bank.houses <= 0) return 'El banco no tiene casas.';
    }
    return null;
  },
  sell(s, p, a) {
    const m = mapOf(s);
    const t = m.tiles[a?.tile];
    if (!t || t.t !== 'prop') return 'Inválido.';
    const pr = s.props[t.i];
    if (pr.owner !== p.id) return 'No es tuya.';
    if (pr.houses <= 0) return 'No tiene construcciones.';
    if (s.settings.mode !== 'dificil') {
      const max = Math.max(...m.groups[t.g].tiles.map((i) => s.props[i].houses));
      if (pr.houses < max) return 'Vende parejo: primero en las que tienen más.';
    }
    return null;
  },
  mortgage(s, p, a) {
    const m = mapOf(s);
    const t = m.tiles[a?.tile];
    if (!t || !isBuyable(t)) return 'Inválido.';
    const pr = s.props[t.i];
    if (pr.owner !== p.id) return 'No es tuya.';
    if (pr.mortgaged) return 'Ya está hipotecada.';
    if (t.t === 'prop' && groupHasBuildings(s, t.g)) return 'Vende primero las casas de ese color.';
    if (inAuction(s, t.i)) return 'Está en subasta.';
    return null;
  },
  unmortgage(s, p, a) {
    const m = mapOf(s);
    const t = m.tiles[a?.tile];
    if (!t || !isBuyable(t)) return 'Inválido.';
    const pr = s.props[t.i];
    if (pr.owner !== p.id) return 'No es tuya.';
    if (!pr.mortgaged) return 'No está hipotecada.';
    if (p.money < unmortgageCost(t)) return 'No te alcanza.';
    return null;
  },
  auctionOwn(s, p, a) {
    const m = mapOf(s);
    const t = m.tiles[a?.tile];
    if (!t || !isBuyable(t)) return 'Inválido.';
    if (!myTurn(s, p)) return 'Solo puedes subastar en tu turno.';
    if (s.turn.phase !== 'roll' && s.turn.phase !== 'end') return 'Ahora no puedes subastar.';
    if (s.props[t.i].owner !== p.id) return 'No es tuya.';
    if (t.t === 'prop' && groupHasBuildings(s, t.g)) return 'Vende primero las casas de ese color.';
    if (s.auction) return 'Ya hay una subasta.';
    if (active(s).length < 2) return 'No hay a quién venderle.';
    return null;
  },
  bid(s, p, a) {
    const au = s.auction;
    if (!au) return 'No hay subasta.';
    if (au.seller === p.id) return 'No puedes pujar por lo tuyo.';
    if (au.bidder === p.id) return 'Vas ganando.';
    if (!canBuyYet(s, p)) return 'Primero da una vuelta completa para poder comprar.';
    const amount = Math.floor(Number(a?.amount));
    if (a && a.amount !== undefined) {
      if (!Number.isFinite(amount) || amount <= au.high) return `Ofrece más de ${money(s, au.high)}.`;
      if (amount > p.money) return 'No te alcanza.';
    } else if (p.money <= au.high) return 'No te alcanza.';
    return null;
  },
  pass(s, p) {
    if (!s.auction) return 'No hay subasta.';
    if (s.auction.seller === p.id) return 'Eres quien vende.';
    if (s.auction.passed.includes(p.id)) return 'Ya pasaste.';
    if (s.auction.bidder === p.id) return 'Vas ganando.';
    return null;
  },
  closeAuction(s, p) {
    if (!s.auction) return 'No hay subasta.';
    if (s.auction.seller !== p.id) return 'Solo quien vende puede cerrar la subasta.';
    if (!s.auction.bidder) return 'Nadie ha ofrecido todavía.';
    return null;
  },
  tradeOffer(s, p, a) { return validateTrade(s, { from: p.id, to: a?.to, give: a?.give, get: a?.get }, true); },
  tradeAccept(s, p, a) {
    const tr = s.trades.find((x) => x.id === a?.id);
    if (!tr || tr.to !== p.id) return 'Esa oferta ya no existe.';
    return validateTrade(s, tr, false);
  },
  tradeReject(s, p, a) {
    const tr = s.trades.find((x) => x.id === a?.id);
    if (!tr || tr.to !== p.id) return 'Esa oferta ya no existe.';
    return null;
  },
  tradeCancel(s, p, a) {
    const tr = s.trades.find((x) => x.id === a?.id);
    if (!tr || tr.from !== p.id) return 'Esa oferta ya no existe.';
    return null;
  },
  resign() { return null; },
};

function normPack(x) {
  return {
    money: Math.max(0, Math.floor(Number(x?.money) || 0)),
    tiles: Array.isArray(x?.tiles) ? [...new Set(x.tiles.map(Number))] : [],
    cards: Math.max(0, Math.floor(Number(x?.cards) || 0)),
  };
}
function validateTrade(s, tr, isNew) {
  const m = mapOf(s);
  const a = P(s, tr.from);
  const b = P(s, tr.to);
  if (!a || !b || a.bankrupt || b.bankrupt || a.id === b.id) return 'Jugador inválido.';
  const give = normPack(tr.give);
  const get = normPack(tr.get);
  if (!give.money && !give.tiles.length && !give.cards && !get.money && !get.tiles.length && !get.cards) return 'La oferta está vacía.';
  const checkTiles = (list, owner) => {
    for (const i of list) {
      const t = m.tiles[i];
      if (!t || !isBuyable(t) || s.props[i].owner !== owner.id) return `${t ? t.name : 'Esa casilla'} no es de ${owner.name}.`;
      if (t.t === 'prop' && groupHasBuildings(s, t.g)) return `Hay casas en el color de ${t.name}: véndelas primero.`;
      if (inAuction(s, i)) return `${t.name} está en subasta.`;
    }
    return null;
  };
  const e1 = checkTiles(give.tiles, a) || checkTiles(get.tiles, b);
  if (give.tiles.length && !canBuyYet(s, b)) return `${b.name} todavía no da su primera vuelta: no puede recibir propiedades.`;
  if (get.tiles.length && !canBuyYet(s, a)) return `${a.name} todavía no da su primera vuelta: no puede recibir propiedades.`;
  if (e1) return e1;
  if (give.money > Math.max(0, a.money)) return `${a.name} no tiene ${money(s, give.money)}.`;
  if (get.money > Math.max(0, b.money)) return `${b.name} no tiene ${money(s, get.money)}.`;
  if (give.cards > a.jailCards.length) return `${a.name} no tiene esas tarjetas.`;
  if (get.cards > b.jailCards.length) return `${b.name} no tiene esas tarjetas.`;
  if (isNew && s.trades.filter((x) => x.from === a.id).length >= 3) return 'Ya tienes 3 ofertas pendientes.';
  return null;
}

// ---------------------------------------------------------------------------
// Ejecutar acciones
// ---------------------------------------------------------------------------
const DO = {
  roll(s, p) {
    const t = s.turn;
    const d1 = 1 + Math.floor(rand(s) * 6);
    const d2 = 1 + Math.floor(rand(s) * 6);
    t.dice = [d1, d2];
    t.rolled = true;
    t.traveled = false;
    t.landed = null;
    const dbl = d1 === d2;
    ev(s, 'dice', { pid: p.id, dice: [d1, d2] });
    log(s, `${p.name} tira ${d1} + ${d2} = ${d1 + d2}${dbl ? ' (¡dobles!)' : ''}.`, 'dice');
    if (p.inJail) {
      if (dbl) {
        p.inJail = false; p.jailTries = 0; t.extra = false;
        log(s, `${p.name} sale de la cárcel con dobles.`, 'jail');
      } else {
        p.jailTries++;
        if (p.jailTries >= 3) {
          log(s, `${p.name} paga la fianza obligatoria de ${money(s, s.settings.jailFine)}.`, 'jail');
          pay(s, p, null, s.settings.jailFine, 'jail');
          p.inJail = false; p.jailTries = 0; t.extra = false;
          if (p.bankrupt) return;
        } else {
          log(s, `${p.name} sigue en la cárcel (intento ${p.jailTries} de 3).`, 'jail');
          t.phase = 'end';
          return;
        }
      }
      walk(s, p, d1 + d2);
      resolveLanding(s, p);
      if (t.phase !== 'buy' && t.phase !== 'auction') t.phase = afterResolvePhase(s);
      return;
    }
    if (dbl) {
      t.doubles++;
      if (t.doubles >= 3) {
        log(s, `¡Tres dobles seguidos! ${p.name} va a la cárcel por exceso de velocidad.`, 'jail');
        sendToJail(s, p);
        t.phase = 'end';
        return;
      }
      t.extra = true;
    } else t.extra = false;
    walk(s, p, d1 + d2);
    resolveLanding(s, p);
    if (t.phase !== 'buy' && t.phase !== 'auction') t.phase = afterResolvePhase(s);
  },
  buy(s, p) {
    const m = mapOf(s);
    const idx = s.turn.pendingBuy;
    const t = m.tiles[idx];
    p.money -= t.price;
    s.props[idx].owner = p.id;
    s.turn.pendingBuy = null;
    log(s, `🔨 ¡VENDIDO! ${p.name} compra ${t.name} por ${money(s, t.price)}.`, 'sold');
    ev(s, 'sold', { tile: idx, pid: p.id, price: t.price, seller: null });
    if (t.t === 'prop' && ownsGroup(s, p.id, t.g)) {
      log(s, `${p.name} completó ${m.groups[t.g].name}. ${s.settings.mode === 'dificil' ? 'Podrá construir cuando caiga en ellas.' : 'Ya puede construir.'}`, 'big');
    }
    if (t.t === 'station' && countOwned(s, p.id, 'station') >= 2) {
      log(s, `${p.name} ya puede viajar entre sus ${m.stationWord === 'portal' ? 'portales' : m.stationWord === 'diligencia' ? 'postas' : 'estaciones'}.`, 'big');
    }
    s.turn.phase = afterResolvePhase(s);
  },
  decline(s, p, a, now) {
    startAuction(s, s.turn.pendingBuy, null, 'buy', now);
    void p;
  },
  endTurn(s) { nextTurn(s); },
  payJail(s, p) {
    pay(s, p, null, s.settings.jailFine, 'jail');
    p.inJail = false; p.jailTries = 0;
    log(s, `${p.name} paga la fianza y sale de la cárcel.`, 'jail');
  },
  useJailCard(s, p) {
    const c = p.jailCards.shift();
    s.decks[c.deck].push(c.idx);
    p.inJail = false; p.jailTries = 0;
    log(s, `${p.name} usa su tarjeta y sale de la cárcel.`, 'jail');
  },
  travel(s, p, a) {
    const m = mapOf(s);
    const path = [];
    let pos = p.pos;
    while (pos !== a.to) { pos = (pos + 1) % 40; path.push(pos); }
    const from = p.pos;
    p.pos = a.to;
    s.turn.traveled = true;
    ev(s, 'move', { pid: p.id, path, kind: 'train', from });
    log(s, `${m.tiles[from].icon} ${p.name} viaja de ${m.tiles[from].name} a ${m.tiles[a.to].name}.`, 'travel');
  },
  build(s, p, a) {
    const t = mapOf(s).tiles[a.tile];
    const pr = s.props[t.i];
    if (pr.houses === 4) { s.bank.hotels--; s.bank.houses += 4; } else s.bank.houses--;
    p.money -= t.house;
    pr.houses++;
    ev(s, 'build', { tile: t.i, houses: pr.houses, pid: p.id });
    log(s, `🏠 ${p.name} construye ${pr.houses === 5 ? 'un hotel' : 'una casa'} en ${t.name}.`, 'build');
  },
  sell(s, p, a) {
    const t = mapOf(s).tiles[a.tile];
    const pr = s.props[t.i];
    const half = Math.floor(t.house / 2);
    if (pr.houses === 5) {
      if (s.bank.houses >= 4 || !s.settings.limitedBuildings) {
        s.bank.houses -= 4; s.bank.hotels++; pr.houses = 4;
        receive(s, p, half);
        log(s, `${p.name} vende el hotel de ${t.name} por ${money(s, half)}.`, 'build');
      } else {
        s.bank.hotels++; pr.houses = 0;
        receive(s, p, half * 5);
        log(s, `${p.name} vende todo en ${t.name} por ${money(s, half * 5)} (el banco no tenía casas).`, 'build');
      }
    } else {
      s.bank.houses++; pr.houses--;
      receive(s, p, half);
      log(s, `${p.name} vende una casa de ${t.name} por ${money(s, half)}.`, 'build');
    }
    ev(s, 'build', { tile: t.i, houses: pr.houses, pid: p.id });
  },
  mortgage(s, p, a) {
    const t = mapOf(s).tiles[a.tile];
    s.props[t.i].mortgaged = true;
    const v = Math.floor(t.price / 2);
    receive(s, p, v);
    ev(s, 'mortgage', { tile: t.i, pid: p.id, mortgaged: true });
    log(s, `${p.name} hipoteca ${t.name} y recibe ${money(s, v)}.`, 'money');
  },
  unmortgage(s, p, a) {
    const t = mapOf(s).tiles[a.tile];
    const c = unmortgageCost(t);
    p.money -= c;
    s.props[t.i].mortgaged = false;
    ev(s, 'mortgage', { tile: t.i, pid: p.id, mortgaged: false });
    log(s, `${p.name} levanta la hipoteca de ${t.name} por ${money(s, c)}.`, 'money');
  },
  auctionOwn(s, p, a, now) { startAuction(s, a.tile, p.id, s.turn.phase, now); },
  bid(s, p, a, now) {
    const au = s.auction;
    const amount = a && a.amount !== undefined ? Math.floor(Number(a.amount)) : au.high + 10;
    au.high = Math.min(amount, p.money);
    au.bidder = p.id;
    au.passed = au.passed.filter((x) => x !== p.id);
    au.endsAt = Math.max(au.endsAt, now + 6000);
    ev(s, 'bid', { pid: p.id, amount: au.high });
    log(s, `${p.name} ofrece ${money(s, au.high)}.`, 'bid');
    if (auctionCanClose(s)) closeAuction(s);
  },
  pass(s, p) {
    s.auction.passed.push(p.id);
    ev(s, 'pass', { pid: p.id });
    log(s, `${p.name} pasa.`, 'bid');
    if (auctionCanClose(s)) closeAuction(s);
  },
  closeAuction(s) { closeAuction(s); },
  tradeOffer(s, p, a, now) {
    const tr = { id: ++s.tradeSeq, from: p.id, to: a.to, give: normPack(a.give), get: normPack(a.get), at: now };
    s.trades.push(tr);
    ev(s, 'tradeOffer', { id: tr.id, from: tr.from, to: tr.to });
    log(s, `🤝 ${p.name} le propone un trato a ${P(s, a.to).name}.`, 'trade');
  },
  tradeAccept(s, p, a) {
    const m = mapOf(s);
    const tr = s.trades.find((x) => x.id === a.id);
    const A = P(s, tr.from);
    const B = P(s, tr.to);
    const give = normPack(tr.give);
    const get = normPack(tr.get);
    A.money -= give.money; B.money += give.money;
    B.money -= get.money; A.money += get.money;
    give.tiles.forEach((i) => { s.props[i].owner = B.id; });
    get.tiles.forEach((i) => { s.props[i].owner = A.id; });
    for (let k = 0; k < give.cards; k++) B.jailCards.push(A.jailCards.shift());
    for (let k = 0; k < get.cards; k++) A.jailCards.push(B.jailCards.shift());
    s.trades = s.trades.filter((x) => x.id !== tr.id);
    ev(s, 'trade', { id: tr.id, from: A.id, to: B.id, tiles: [...give.tiles, ...get.tiles] });
    const names = (l) => l.map((i) => m.tiles[i].name).join(', ');
    const desc = (pk) => [pk.tiles.length ? names(pk.tiles) : null, pk.money ? money(s, pk.money) : null, pk.cards ? `${pk.cards} tarjeta(s) de salida` : null].filter(Boolean).join(' + ') || 'nada';
    log(s, `🤝 Trato cerrado: ${A.name} da ${desc(give)} y recibe ${desc(get)} de ${B.name}.`, 'trade');
    void p;
  },
  tradeReject(s, p, a) {
    const tr = s.trades.find((x) => x.id === a.id);
    s.trades = s.trades.filter((x) => x.id !== a.id);
    log(s, `${p.name} rechazó el trato de ${P(s, tr.from).name}.`, 'trade');
    ev(s, 'tradeReject', { id: a.id });
  },
  tradeCancel(s, p, a) {
    s.trades = s.trades.filter((x) => x.id !== a.id);
    ev(s, 'tradeCancel', { id: a.id });
    void p;
  },
  resign(s, p) { bankrupt(s, p, 'rendirse'); },
};

export function check(s, pid, action) {
  if (s.over) return 'La partida terminó.';
  const p = P(s, pid);
  if (!p) return 'No estás en esta partida.';
  if (p.bankrupt) return 'Estás en quiebra.';
  const fn = CHECK[action?.type];
  if (!fn) return 'Acción desconocida.';
  if (s.auction && !['bid', 'pass', 'closeAuction', 'sell', 'mortgage', 'unmortgage', 'tradeReject', 'tradeCancel', 'resign'].includes(action.type)) {
    return 'Hay una subasta en curso.';
  }
  return fn(s, p, action);
}

export function applyAction(s, pid, action, now = Date.now()) {
  const err = check(s, pid, action);
  if (err) return { ok: false, error: err };
  const p = P(s, pid);
  DO[action.type](s, p, action, now);
  // limpiar tratos que ya no son válidos
  if (s.trades.length) s.trades = s.trades.filter((tr) => !validateTrade(s, tr, false));
  const cur = P(s, s.turn.pid);
  if (!s.over && cur && cur.bankrupt && !s.auction) nextTurn(s);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Qué puede hacer un jugador ahora (para la interfaz y los bots)
// ---------------------------------------------------------------------------
export function available(s, pid) {
  const p = P(s, pid);
  const m = mapOf(s);
  const ok = (a) => !check(s, pid, a);
  const mine = p ? ownedTiles(s, pid) : [];
  const res = {
    isTurn: !!p && s.turn.pid === pid && !s.over,
    phase: s.turn.phase,
    roll: ok({ type: 'roll' }),
    buy: ok({ type: 'buy' }),
    decline: ok({ type: 'decline' }),
    endTurn: ok({ type: 'endTurn' }),
    payJail: ok({ type: 'payJail' }),
    useJailCard: ok({ type: 'useJailCard' }),
    travel: [], build: [], sell: [], mortgage: [], unmortgage: [], auctionOwn: [],
    bid: ok({ type: 'bid' }),
    pass: ok({ type: 'pass' }),
    closeAuction: ok({ type: 'closeAuction' }),
  };
  if (!p) return res;
  if (ok({ type: 'travel' })) res.travel = m.stationTiles.filter((i) => ok({ type: 'travel', to: i }));
  for (const i of mine) {
    if (ok({ type: 'build', tile: i })) res.build.push(i);
    if (ok({ type: 'sell', tile: i })) res.sell.push(i);
    if (ok({ type: 'mortgage', tile: i })) res.mortgage.push(i);
    if (ok({ type: 'unmortgage', tile: i })) res.unmortgage.push(i);
    if (ok({ type: 'auctionOwn', tile: i })) res.auctionOwn.push(i);
  }
  return res;
}

// Versión pública del estado (sin la semilla ni el orden de las cartas)
export function publicView(s) {
  const v = JSON.parse(JSON.stringify(s));
  delete v.rng;
  v.decks = { chance: s.decks.chance.length, chest: s.decks.chest.length };
  v.players.forEach((p) => { p.jailCards = p.jailCards.length; });
  return v;
}
