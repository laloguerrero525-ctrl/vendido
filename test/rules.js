// Pruebas de las reglas especiales de VENDIDO. Uso: node test/rules.js
import assert from 'node:assert/strict';
import { createGame, applyAction, available, tick, P, rentFor } from '../public/shared/engine.js';

const players = [
  { id: 'a', name: 'Ana', color: '#f00' },
  { id: 'b', name: 'Beto', color: '#00f' },
  { id: 'c', name: 'Caro', color: '#0f0' },
];
function game(settings = {}) {
  const s = createGame({ settings: { firstLapToBuy: false, ...settings }, players, seed: 7, now: 0 });
  s.order = ['a', 'b', 'c'];
  s.turn.pid = 'a';
  return s;
}
const act = (s, pid, a, now = 0) => {
  const r = applyAction(s, pid, a, now);
  if (!r.ok) throw new Error(`${pid} ${a.type}: ${r.error}`);
  return r;
};
const own = (s, pid, ...tiles) => tiles.forEach((i) => { s.props[i].owner = pid; });
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✓', name); };

test('Renta impagable: banco cubre, deudor negativo, acreedor intacto (determinista)', () => {
  // buscamos una semilla en la que Ana (pos 32) saque 7 sin dobles y caiga en 39 sin pasar la Salida
  for (let seed = 1; seed < 5000; seed++) {
    const s = game({ creditLimit: 5000 });
    own(s, 'b', 37, 39);
    s.props[39].houses = 5; // 2000
    s.props[37].houses = 5;
    const a = P(s, 'a');
    const b = P(s, 'b');
    a.money = 300;
    a.pos = 32;
    s.rng = seed;
    const bBefore = b.money;
    act(s, 'a', { type: 'roll' });
    const [d1, d2] = s.turn.dice;
    if (d1 + d2 !== 7) continue;
    assert.equal(a.pos, 39);
    assert.equal(b.money, bBefore + 2000, 'el acreedor recibe completo');
    assert.equal(a.money, 300 - 2000, 'el deudor queda debiendo al banco');
    assert.equal(a.bankrupt, false);
    assert.ok(s.log.some((l) => l.text.includes('El banco le cubrió')));
    // con deuda no puede comprar ni construir ni pujar
    return;
  }
  assert.fail('no se encontró semilla');
});

test('Quiebra cuando la deuda supera bienes + crédito', () => {
  for (let seed = 1; seed < 5000; seed++) {
    const s = game({ creditLimit: 500 });
    own(s, 'b', 37, 39);
    s.props[39].houses = 5;
    s.props[37].houses = 5;
    const a = P(s, 'a');
    a.money = 300;
    a.pos = 32;
    s.rng = seed;
    act(s, 'a', { type: 'roll' });
    const [d1, d2] = s.events.filter((e) => e.type === 'dice').pop().dice;
    if (d1 + d2 !== 7) continue;
    assert.equal(a.bankrupt, true);
    assert.equal(s.turn.pid, 'b', 'pasa el turno al siguiente');
    return;
  }
  assert.fail('no se encontró semilla');
});

test('Intereses sobre la deuda al pasar por la Salida', () => {
  for (let seed = 1; seed < 5000; seed++) {
    const s = game({ interest: 0.1, creditLimit: 5000 });
    const a = P(s, 'a');
    a.money = -1000;
    a.pos = 36;
    s.rng = seed;
    act(s, 'a', { type: 'roll' });
    const sum = s.turn.dice[0] + s.turn.dice[1];
    if (sum !== 5) continue; // cae en 1 (sin dueño)
    assert.equal(a.money, -1000 - 100 + 200);
    return;
  }
  assert.fail('no se encontró semilla');
});

test('Trenes: con 2 estaciones viaja entre ellas, con 1 no', () => {
  const s = game();
  const a = P(s, 'a');
  own(s, 'a', 5);
  a.pos = 5;
  assert.deepEqual(available(s, 'a').travel, []);
  own(s, 'a', 25);
  assert.deepEqual(available(s, 'a').travel, [25]);
  own(s, 'a', 15, 35);
  assert.deepEqual(available(s, 'a').travel, [15, 25, 35]);
  const money = a.money;
  act(s, 'a', { type: 'travel', to: 35 });
  assert.equal(a.pos, 35);
  assert.equal(a.money, money, 'viajar no cobra ni paga Salida');
  assert.ok(applyAction(s, 'a', { type: 'travel', to: 5 }).error, 'solo un viaje por tirada');
  // estación hipotecada no opera
  const t = game();
  own(t, 'a', 5, 15);
  P(t, 'a').pos = 5;
  t.props[15].mortgaged = true;
  assert.deepEqual(available(t, 'a').travel, []);
  // no se puede viajar desde estación ajena
  const u = game();
  own(u, 'b', 5);
  own(u, 'a', 15, 25);
  P(u, 'a').pos = 5;
  assert.deepEqual(available(u, 'a').travel, []);
});

test('Modo normal: construye desde cualquier lugar, parejo', () => {
  const s = game({ mode: 'normal' });
  own(s, 'a', 1, 3);
  P(s, 'a').pos = 20;
  assert.deepEqual(available(s, 'a').build, [1, 3]);
  act(s, 'a', { type: 'build', tile: 1 });
  assert.deepEqual(available(s, 'a').build, [3], 'regla de construir parejo');
  act(s, 'a', { type: 'build', tile: 3 });
  assert.deepEqual(available(s, 'a').build, [1, 3]);
  // sin el color completo no
  const t = game();
  own(t, 'a', 1);
  assert.deepEqual(available(t, 'a').build, []);
});

test('Modo difícil: solo construye donde cae', () => {
  for (let seed = 1; seed < 5000; seed++) {
    const s = game({ mode: 'dificil' });
    own(s, 'a', 1, 3);
    const a = P(s, 'a');
    a.pos = 36;
    assert.deepEqual(available(s, 'a').build, [], 'antes de caer no puede');
    s.rng = seed;
    act(s, 'a', { type: 'roll' });
    const [d1, d2] = s.turn.dice;
    if (d1 + d2 !== 7 || d1 === d2) continue; // 36+7 = 43 → 3
    assert.equal(a.pos, 3);
    assert.deepEqual(available(s, 'a').build, [3]);
    act(s, 'a', { type: 'build', tile: 3 });
    act(s, 'a', { type: 'build', tile: 3 });
    assert.equal(s.props[3].houses, 2, 'sin regla de parejo en difícil');
    assert.ok(applyAction(s, 'a', { type: 'build', tile: 1 }).error);
    return;
  }
  assert.fail('no se encontró semilla');
});

test('Hipotecas: no con casas en el color; deshipotecar cuesta +10%', () => {
  const s = game();
  own(s, 'a', 1, 3);
  s.props[3].houses = 1;
  assert.ok(applyAction(s, 'a', { type: 'mortgage', tile: 1 }).error);
  s.props[3].houses = 0;
  const m0 = P(s, 'a').money;
  act(s, 'a', { type: 'mortgage', tile: 1 });
  assert.equal(P(s, 'a').money, m0 + 30);
  assert.equal(rentFor(s, 1), 0, 'hipotecada no cobra renta');
  act(s, 'a', { type: 'unmortgage', tile: 1 });
  assert.equal(P(s, 'a').money, m0 + 30 - 33);
});

test('Subasta del banco al no comprar + VENDIDO al mejor postor', () => {
  for (let seed = 1; seed < 5000; seed++) {
    const s = game();
    s.rng = seed;
    P(s, 'a').pos = 0;
    act(s, 'a', { type: 'roll' }, 0);
    if (s.turn.phase !== 'buy') continue;
    const tile = s.turn.pendingBuy;
    act(s, 'a', { type: 'decline' }, 0);
    assert.equal(s.turn.phase, 'auction');
    act(s, 'b', { type: 'bid', amount: 50 }, 1000);
    act(s, 'c', { type: 'bid', amount: 80 }, 2000);
    assert.ok(applyAction(s, 'c', { type: 'bid', amount: 90 }, 2100).error, 'no puja contra sí mismo');
    act(s, 'a', { type: 'pass' }, 3000);
    const cMoney = P(s, 'c').money;
    act(s, 'b', { type: 'pass' }, 4000); // todos pasaron → se cierra
    assert.equal(s.auction, null);
    assert.equal(s.props[tile].owner, 'c');
    assert.equal(P(s, 'c').money, cMoney - 80);
    assert.ok(['roll', 'end'].includes(s.turn.phase));
    return;
  }
  assert.fail('no se encontró semilla');
});

test('Subasta propia: el dinero va al dueño; cierra por tiempo', () => {
  const s = game({ auctionSeconds: 10 });
  own(s, 'a', 11);
  act(s, 'a', { type: 'auctionOwn', tile: 11 }, 0);
  act(s, 'b', { type: 'bid', amount: 120 }, 1000);
  const aMoney = P(s, 'a').money;
  assert.equal(tick(s, 9000), false);
  assert.equal(tick(s, 10001), true);
  assert.equal(s.props[11].owner, 'b');
  assert.equal(P(s, 'a').money, aMoney + 120);
  assert.equal(s.turn.phase, 'roll', 'regresa a la fase anterior');
});

test('Tratos: intercambio de propiedades y dinero', () => {
  const s = game();
  own(s, 'a', 1);
  own(s, 'b', 3);
  act(s, 'a', { type: 'tradeOffer', to: 'b', give: { tiles: [1], money: 100 }, get: { tiles: [3] } });
  const id = s.trades[0].id;
  assert.ok(applyAction(s, 'c', { type: 'tradeAccept', id }).error, 'solo el destinatario acepta');
  const am = P(s, 'a').money;
  act(s, 'b', { type: 'tradeAccept', id });
  assert.equal(s.props[1].owner, 'b');
  assert.equal(s.props[3].owner, 'a');
  assert.equal(P(s, 'a').money, am - 100);
});

test('Tres dobles seguidos → cárcel; salir pagando fianza', () => {
  for (let seed = 1; seed < 20000; seed++) {
    const s = game();
    s.rng = seed;
    const a = P(s, 'a');
    let k = 0;
    while (s.turn.pid === 'a' && s.turn.phase === 'roll' && k < 3) {
      act(s, 'a', { type: 'roll' });
      if (s.turn.phase === 'buy') act(s, 'a', { type: 'buy' });
      k++;
    }
    if (!a.inJail || k !== 3) continue;
    assert.equal(a.pos, 10);
    act(s, 'a', { type: 'endTurn' });
    s.turn.pid = 'a'; s.turn.phase = 'roll';
    assert.ok(available(s, 'a').payJail);
    act(s, 'a', { type: 'payJail' });
    assert.equal(a.inJail, false);
    return;
  }
  assert.fail('no se encontró semilla');
});

test('Primera vuelta: no se compra ni se puja hasta pasar por la Salida', () => {
  let probado = false;
  for (let seed = 1; seed < 5000 && !probado; seed++) {
    const s = game({ firstLapToBuy: true });
    const a = P(s, 'a');
    assert.equal(a.lapDone, false);
    s.rng = seed;
    act(s, 'a', { type: 'roll' });
    const [d1, d2] = s.turn.dice;
    const t = s.props[a.pos];
    if (!t || d1 === d2) continue;
    assert.notEqual(s.turn.phase, 'buy', 'no se ofrece comprar');
    assert.equal(t.owner, null);
    assert.ok(s.log.some((l) => l.text.includes('todavía no puede comprar')));
    // tampoco puede pujar
    s.props[11].owner = 'b';
    P(s, 'b').lapDone = true;
    s.turn.pid = 'b'; s.turn.phase = 'roll';
    act(s, 'b', { type: 'auctionOwn', tile: 11 }, 0);
    assert.ok(applyAction(s, 'a', { type: 'bid', amount: 20 }, 10).error);
    probado = true;
  }
  assert.ok(probado, 'no se encontró semilla');
  // al pasar por la Salida ya puede comprar
  for (let k = 1; k < 5000; k++) {
    const t2 = game({ firstLapToBuy: true });
    const a2 = P(t2, 'a');
    a2.pos = 37;
    t2.rng = k;
    act(t2, 'a', { type: 'roll' });
    if (!a2.inJail && a2.pos < 37) { assert.equal(a2.lapDone, true); return; }
  }
  assert.fail('no pasó por la Salida');
});

console.log(`\n${n} pruebas OK`);
