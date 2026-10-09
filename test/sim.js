// Simulación: juega muchas partidas solo con bots y revisa que las reglas no se rompan.
// Uso: node test/sim.js [partidas]
import { createGame, applyAction, tick, P, active, mapOf, publicView } from '../public/shared/engine.js';
import { botAction } from '../public/shared/bot.js';
import { MAP_ORDER } from '../public/shared/maps.js';

const GAMES = Number(process.argv[2] || 200);
let seedRnd = 12345;
const rnd = () => { seedRnd = (seedRnd * 1103515245 + 12345) & 0x7fffffff; return seedRnd / 0x7fffffff; };

function invariants(s, where) {
  const m = mapOf(s);
  let houses = s.bank.houses;
  let hotels = s.bank.hotels;
  for (const [i, pr] of Object.entries(s.props)) {
    if (pr.houses === 5) hotels++; else houses += pr.houses;
    if (pr.owner) {
      const o = P(s, pr.owner);
      if (!o || o.bankrupt) throw new Error(`${where}: casilla ${i} de jugador inválido`);
    } else if (pr.houses || pr.mortgaged) throw new Error(`${where}: casilla ${i} sin dueño con casas/hipoteca`);
    if (pr.houses && pr.mortgaged) throw new Error(`${where}: casas en hipotecada ${i}`);
    const t = m.tiles[i];
    if (pr.houses && t.t !== 'prop') throw new Error(`${where}: casas en no-propiedad`);
  }
  if (s.settings.limitedBuildings && houses !== 32) throw new Error(`${where}: casas totales ${houses}`);
  if (s.settings.limitedBuildings && hotels !== 12) throw new Error(`${where}: hoteles totales ${hotels}`);
  if (!s.over) {
    const cur = P(s, s.turn.pid);
    if (!cur || cur.bankrupt) throw new Error(`${where}: turno de jugador inválido`);
  }
  for (const p of s.players) {
    if (p.pos < 0 || p.pos > 39 || !Number.isInteger(p.pos)) throw new Error(`${where}: posición inválida`);
    if (!Number.isFinite(p.money)) throw new Error(`${where}: dinero inválido`);
  }
  if (s.decks.chance.length + s.players.reduce((n, p) => n + p.jailCards.filter((c) => c.deck === 'chance').length, 0) !== 16) throw new Error(`${where}: mazo suerte roto`);
}

const stats = { games: 0, steps: 0, overBy: {}, rounds: 0, bankrupt: 0, travels: 0, auctions: 0, trades: 0, debts: 0, builds: 0, hard: 0 };
for (let g = 0; g < GAMES; g++) {
  const n = 2 + (g % 5);
  const mapId = MAP_ORDER[g % 4];
  const mode = g % 2 ? 'dificil' : 'normal';
  const players = Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'Bot ' + i, color: '#fff', isBot: true }));
  const settings = { mapId, mode, maxRounds: g % 3 === 0 ? 40 : 500, freeParkingPot: g % 4 === 1, creditLimit: [0, 500, 1000][g % 3], limitedBuildings: g % 5 === 2, firstLapToBuy: g % 2 === 0 };
  let now = 1_000_000;
  const s = createGame({ settings, players, seed: 1000 + g, now });
  let steps = 0;
  const mem = Object.fromEntries(players.map((p) => [p.id, { tried: new Set() }]));
  while (!s.over && steps < 60000) {
    now += 500;
    if (tick(s, now)) { invariants(s, `g${g} tick`); continue; }
    let acted = false;
    // primero el que tenga algo pendiente: subasta / trato / turno
    const order = [...active(s)].sort(() => rnd() - 0.5);
    for (const p of order) {
      const a = botAction(s, p.id, rnd, mem[p.id]);
      if (!a) continue;
      const before = s.seq;
      const r = applyAction(s, p.id, a, now);
      if (!r.ok) throw new Error(`g${g} paso ${steps}: bot ${p.id} intentó ${JSON.stringify(a)} -> ${r.error} (fase ${s.turn.phase})`);
      if (a.type === 'travel') stats.travels++;
      if (a.type === 'build') stats.builds++;
      if (a.type === 'tradeAccept') stats.accepted = (stats.accepted || 0) + 1;
      if (s.seq === before) throw new Error('acción sin efecto');
      acted = true;
      break;
    }
    if (!acted && !s.auction) throw new Error(`g${g}: nadie puede actuar (fase ${s.turn.phase}, turno ${s.turn.pid})`);
    // a veces un bot propone un trato aleatorio para probar los tratos
    if (!s.over && !s.auction && rnd() < 0.01) {
      const ps = active(s);
      const a = ps[Math.floor(rnd() * ps.length)];
      const b = ps.find((x) => x.id !== a.id);
      const mine = Object.keys(s.props).map(Number).filter((i) => s.props[i].owner === a.id && !s.props[i].houses);
      const theirs = Object.keys(s.props).map(Number).filter((i) => s.props[i].owner === b?.id && !s.props[i].houses);
      if (b && mine.length && theirs.length) {
        const r = applyAction(s, a.id, { type: 'tradeOffer', to: b.id, give: { tiles: [mine[0]], money: 50 }, get: { tiles: [theirs[0]] } }, now);
        if (r.ok) stats.trades++;
      }
    }
    for (const e of s.events) {
      if (e.type === 'auction' && !e._c) { e._c = 1; stats.auctions++; }
      if (e.type === 'bankCover' && !e._c) { e._c = 1; stats.debts++; }
    }
    invariants(s, `g${g} paso ${steps}`);
    steps++;
  }
  if (!s.over) {
    const m = mapOf(s);
    for (const p of s.players) console.log(p.id, p.money, p.bankrupt, Object.entries(s.props).filter(([, pr]) => pr.owner === p.id).map(([i, pr]) => i + (pr.houses ? 'h' + pr.houses : '') + (pr.mortgaged ? 'M' : '')).join(' '));
    m.groups.forEach((gr) => console.log(gr.name, gr.tiles.map((i) => s.props[i].owner + ':' + s.props[i].houses)));
    console.log(settings, JSON.stringify(s.trades), s.turn, s.log.slice(-12).map((l) => l.text));
    throw new Error(`g${g}: no terminó en ${steps} pasos (ronda ${s.round})`);
  }
  JSON.stringify(publicView(s));
  stats.games++;
  stats.steps += steps;
  stats.rounds += s.round;
  stats.overBy[s.endReason] = (stats.overBy[s.endReason] || 0) + 1;
  stats.bankrupt += s.players.filter((p) => p.bankrupt).length;
}
console.log('OK', { ...stats, avgRounds: (stats.rounds / stats.games).toFixed(1), avgSteps: Math.round(stats.steps / stats.games) });
