// VENDIDO — jugadores automáticos (bots). También juegan por quien se desconecta.
import { available, mapOf, P, ownsGroup, ownedTiles, active, unmortgageCost } from './engine.js';

function reserve(s) {
  // dinero que el bot intenta conservar; crece conforme hay más casas en el tablero
  const built = Object.values(s.props).reduce((n, pr) => n + (pr.owner ? pr.houses : 0), 0);
  return 120 + Math.min(built * 15, 300);
}

function valueFor(s, pid, tile, extraOwned = []) {
  const m = mapOf(s);
  const t = m.tiles[tile];
  let v = t.price;
  if (t.t === 'prop') {
    const g = m.groups[t.g].tiles;
    const mineAfter = g.filter((i) => i === tile || s.props[i].owner === pid || extraOwned.includes(i)).length;
    if (mineAfter === g.length) v *= 2.2;
    else if (mineAfter >= 2) v *= 1.3;
    // bloquear a otro que casi completa el color
    const others = new Set(g.map((i) => s.props[i].owner).filter((o) => o && o !== pid));
    for (const o of others) {
      const theirs = g.filter((i) => s.props[i].owner === o).length;
      if (theirs === g.length - 1) v *= 1.25;
    }
  } else if (t.t === 'station') {
    const n = m.stationTiles.filter((i) => s.props[i].owner === pid).length;
    v *= 1 + n * 0.2;
  }
  return Math.round(v);
}

function fixDebt(s, pid, av) {
  const m = mapOf(s);
  // vender casas primero en lo más barato, luego hipotecar
  if (av.sell.length) {
    const t = av.sell.sort((a, b) => m.tiles[a].house - m.tiles[b].house)[0];
    return { type: 'sell', tile: t };
  }
  if (av.mortgage.length) {
    const sorted = av.mortgage.sort((a, b) => {
      const ta = m.tiles[a], tb = m.tiles[b];
      const ga = ta.t === 'prop' && ownsGroup(s, pid, ta.g) ? 1 : 0;
      const gb = tb.t === 'prop' && ownsGroup(s, pid, tb.g) ? 1 : 0;
      return ga - gb || ta.price - tb.price;
    });
    return { type: 'mortgage', tile: sorted[0] };
  }
  return null;
}

// Busca un color al que le falte una sola propiedad y propone comprarla o cambiarla.
function proposeTrade(s, pid, memory) {
  const m = mapOf(s);
  const p = P(s, pid);
  if (p.money < 0 || s.trades.some((t) => t.from === pid)) return null;
  const free = (i) => {
    const t = m.tiles[i];
    return !(t.t === 'prop' && m.groups[t.g].tiles.some((k) => s.props[k].houses > 0));
  };
  const missingFor = (who) => m.groups.map((g) => {
    const mine = g.tiles.filter((i) => s.props[i].owner === who);
    const rest = g.tiles.filter((i) => s.props[i].owner !== who);
    return mine.length && rest.length === 1 && s.props[rest[0]].owner && free(rest[0]) ? rest[0] : null;
  }).filter((x) => x !== null);
  for (const want of missingFor(pid)) {
    const owner = s.props[want].owner;
    const key = `${s.round >> 2}:${want}`;
    if (memory.tried.has(key)) continue;
    memory.tried.add(key);
    const t = m.tiles[want];
    // ¿El otro necesita algo mío?
    const swap = missingFor(owner).find((i) => s.props[i].owner === pid && m.tiles[i].g !== t.g);
    if (swap !== undefined) {
      const diff = Math.max(0, t.price - m.tiles[swap].price);
      return { type: 'tradeOffer', to: owner, give: { tiles: [swap], money: Math.min(diff, Math.max(0, p.money - 50)) }, get: { tiles: [want] } };
    }
    const cash = Math.round(t.price * 2.6);
    if (p.money - cash >= reserve(s) * 0.5) return { type: 'tradeOffer', to: owner, give: { money: cash }, get: { tiles: [want] } };
    // ofrecer dinero + una propiedad suelta que no me sirve
    const loose = ownedTiles(s, pid).find((i) => {
      const lt = m.tiles[i];
      return free(i) && lt.t === 'prop' && lt.g !== t.g && !s.props[i].mortgaged && m.groups[lt.g].tiles.filter((k) => s.props[k].owner === pid).length === 1;
    });
    const half = Math.round(t.price * 1.6);
    if (loose !== undefined && p.money - half >= 0) return { type: 'tradeOffer', to: owner, give: { tiles: [loose], money: half }, get: { tiles: [want] } };
  }
  // Juntar colores: comprar piezas sueltas (de alguien que solo tiene una de ese color)
  for (const g of m.groups) {
    const mine = g.tiles.filter((i) => s.props[i].owner === pid).length;
    if (!mine) continue;
    for (const i of g.tiles) {
      const o = s.props[i].owner;
      if (!o || o === pid || !free(i)) continue;
      if (g.tiles.filter((k) => s.props[k].owner === o).length !== 1) continue;
      const key = `${s.round >> 2}:b${i}`;
      if (memory.tried.has(key)) continue;
      memory.tried.add(key);
      const cash = Math.round(m.tiles[i].price * 1.6);
      if (p.money - cash >= reserve(s)) return { type: 'tradeOffer', to: o, give: { money: cash }, get: { tiles: [i] } };
    }
  }
  return null;
}

export function botAction(s, pid, rnd = Math.random, memory = null) {
  if (s.over) return null;
  const p = P(s, pid);
  if (!p || p.bankrupt) return null;
  const m = mapOf(s);
  const av = available(s, pid);

  // 1) Tratos que me ofrecen
  const incoming = s.trades.find((t) => t.to === pid);
  if (incoming && !s.auction) {
    const gain = incoming.give.tiles.reduce((n, i) => n + valueFor(s, pid, i, incoming.give.tiles), 0) + incoming.give.money + incoming.give.cards * 50;
    // lo que pierdo: lo que vale para mí + castigo si con eso el otro completa un color
    const loss = incoming.get.tiles.reduce((n, i) => {
      const t = m.tiles[i];
      const completes = t.t === 'prop' && m.groups[t.g].tiles.every((k) => k === i || s.props[k].owner === incoming.from || incoming.get.tiles.includes(k));
      return n + valueFor(s, pid, i) + (completes ? t.price * 0.9 : 0);
    }, 0) + incoming.get.money + incoming.get.cards * 50;
    const afterMoney = p.money + incoming.give.money - incoming.get.money;
    if (gain >= loss && afterMoney >= 0) return { type: 'tradeAccept', id: incoming.id };
    return { type: 'tradeReject', id: incoming.id };
  }

  // 2) Subastas
  if (s.auction) {
    const a = s.auction;
    if (a.seller === pid) {
      return a.bidder && Date.now() > a.endsAt - 2000 ? null : null;
    }
    if (a.bidder === pid || a.passed.includes(pid)) return null;
    const limit = Math.min(valueFor(s, pid, a.tile), p.money - Math.min(reserve(s), p.money * 0.4));
    const step = a.high < 100 ? 10 : a.high < 400 ? 20 : 50;
    if (av.bid && a.high + step <= limit) return { type: 'bid', amount: a.high + step };
    return { type: 'pass' };
  }

  if (!av.isTurn) return null;

  // 3) Si debo, intento pagar vendiendo/hipotecando
  if (p.money < 0) {
    const fix = fixDebt(s, pid, av);
    if (fix) return fix;
  }

  switch (s.turn.phase) {
    case 'buy': {
      const t = m.tiles[s.turn.pendingBuy];
      const keep = reserve(s) * (s.round < 4 ? 0.3 : 1);
      if (av.buy && p.money - t.price >= keep) return { type: 'buy' };
      if (av.buy && valueFor(s, pid, t.i) > t.price * 1.8 && p.money - t.price >= 0) return { type: 'buy' };
      return { type: 'decline' };
    }
    case 'roll':
    case 'end': {
      // levantar hipotecas si hay mucho dinero
      if (av.unmortgage.length && p.money > reserve(s) * 3) {
        const t = av.unmortgage.sort((a, b) => unmortgageCost(m.tiles[a]) - unmortgageCost(m.tiles[b]))[0];
        if (p.money - unmortgageCost(m.tiles[t]) > reserve(s) * 2) return { type: 'unmortgage', tile: t };
      }
      // construir
      if (av.build.length) {
        const t = av.build.sort((a, b) => s.props[a].houses - s.props[b].houses || m.tiles[b].price - m.tiles[a].price)[0];
        if (p.money - m.tiles[t].house >= reserve(s)) return { type: 'build', tile: t };
      }
      if (s.turn.phase === 'roll') {
        const offer = memory ? proposeTrade(s, pid, memory) : null;
        if (offer) return offer;
        if (p.inJail) {
          const late = Object.values(s.props).some((pr) => pr.houses >= 3);
          if (av.useJailCard && !late) return { type: 'useJailCard' };
          if (av.payJail && !late && p.money > reserve(s) * 2) return { type: 'payJail' };
          return { type: 'roll' };
        }
        // viajar en tren a veces para probar suerte desde otro lado del tablero
        if (av.travel.length && rnd() < 0.35) return { type: 'travel', to: av.travel[Math.floor(rnd() * av.travel.length)] };
        return { type: 'roll' };
      }
      return { type: 'endTurn' };
    }
    default:
      return null;
  }
}

export function botWantsToAct(s, pid) {
  if (s.over) return false;
  const p = P(s, pid);
  if (!p || p.bankrupt) return false;
  if (s.trades.some((t) => t.to === pid) && !s.auction) return true;
  if (s.auction) {
    const a = s.auction;
    return a.seller !== pid && a.bidder !== pid && !a.passed.includes(pid);
  }
  return s.turn.pid === pid;
}

void ownedTiles; void active;
