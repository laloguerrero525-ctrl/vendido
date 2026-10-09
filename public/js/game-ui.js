// VENDIDO — interfaz de la partida (HUD, acciones, hojas, subasta, cartas, sello)
import { $, esc, fmt, toast, vibrate, onColor, sleep } from './util.js';
import { available, check, ownsGroup, netWorth, unmortgageCost, rentFor, MODES } from '../shared/engine.js';
import { getMap, STATION_RENT } from '../shared/maps.js';
import { EMOTES } from '../shared/room.js';
import { sfx, isMuted, setMuted } from './sfx.js';
import { lowGraphics } from './board3d.js';
import { PREMIUM, PREMIUM_MAPS, paypalLink, verifyUnlockCode } from '../shared/premium.js';
import { store } from './util.js';

// El estado público trae jailCards como número; el motor espera una lista.
export function compat(g) {
  if (!g) return g;
  return { ...g, players: g.players.map((p) => ({ ...p, jailCards: Array.from({ length: Number(p.jailCards) || 0 }, () => ({})) })) };
}
const RULES_HTML = `
  <div class="rules">
    <p>Gana quien deja a los demás en quiebra (o quien tenga más patrimonio si pusieron límite de rondas).</p>
    <h3>Tu turno</h3>
    <ul>
      <li>Tira los dados y avanza. Con dobles vuelves a tirar; tres dobles seguidos te mandan a la cárcel.</li>
      <li>Si caes en algo sin dueño, lo compras o se subasta entre todos.</li>
      <li>Nadie puede comprar ni pujar hasta dar su primera vuelta completa (pasar por la Salida). El anfitrión puede apagar esta regla.</li>
      <li>Si tiene dueño, pagas renta. Con todo el color la renta se duplica y con casas sube mucho más.</li>
    </ul>
    <h3>Modo normal y difícil</h3>
    <ul>
      <li><b>Normal:</b> con todo el color construyes casas desde donde estés, parejo en todo el color.</li>
      <li><b>Difícil:</b> solo construyes en la propiedad donde acabas de caer (y necesitas todo el color).</li>
      <li>Cuatro casas y luego un hotel.</li>
    </ul>
    <h3>Trenes</h3>
    <ul>
      <li>Si tienes 2 o más estaciones y estás parado en una de ellas, puedes viajar a cualquier otra tuya: al empezar tu turno (antes de tirar) o justo al caer en ella.</li>
      <li>Viajar es gratis, pero no cobras al pasar por la Salida. Las estaciones hipotecadas no funcionan.</li>
    </ul>
    <h3>Deudas con el banco</h3>
    <ul>
      <li>Si no te alcanza para pagarle a alguien, el banco le paga completo y tú quedas en negativo: le debes al banco.</li>
      <li>Con deuda no puedes comprar, construir ni pujar. Cada vez que pasas por la Salida el banco te cobra intereses.</li>
      <li>Quiebras cuando tu deuda supera lo que valen tus bienes más el crédito del banco.</li>
    </ul>
    <h3>Hipotecas, subastas y tratos</h3>
    <ul>
      <li>Hipoteca una propiedad sin casas y recibe la mitad de su precio. Para recuperarla pagas eso más 10%. Hipotecada no cobra renta.</li>
      <li>En tu turno puedes subastar una de tus propiedades: el dinero es para ti.</li>
      <li>Propón tratos a cualquier jugador: propiedades, dinero y tarjetas de salir de la cárcel.</li>
    </ul>
  </div>`;

export class GameUI {
  constructor(app) {
    this.app = app;
    this.mode = null;
    this.sheetKind = null;
    this.sheetParams = {};
    this.tradeDraft = null;
    this.emotesOpen = false;
    this.lastTurnSeen = null;
    this.bind();
  }
  get me() { return this.app.pid; }
  get game() { return this.app.shownGame; }
  get map() { return this.game ? getMap(this.game.settings.mapId) : null; }
  cur() { return this.map?.currency || '$'; }
  player(id) { return this.game?.players.find((p) => p.id === id); }
  name(id) { return id ? (this.player(id)?.name || '¿?') : 'El banco'; }

  bind() {
    $('#menuBtn').addEventListener('click', () => this.openSheet('menu'));
    $('#viewBtn').addEventListener('click', () => this.app.toggleView());
    $('#rotBtn').addEventListener('click', () => this.app.board.rotate2d());
    $('#centerBtn').addEventListener('click', () => this.app.board.resetView());
    $('#ticker').addEventListener('click', () => this.openSheet('log'));
    $('#overlay').addEventListener('click', () => this.closeSheet());
    $('#chips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-pid]');
      if (c) this.openSheet('props', { pid: c.dataset.pid });
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      e.preventDefault();
      this.onAct(b.dataset.act, b.dataset);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (this.sheetKind) this.closeSheet(); else if (this.mode) { this.mode = null; this.render(); } }
    });
  }

  // ------------------------------------------------------------------ acciones
  act(action) {
    this.setBusy(true);
    clearTimeout(this.busyT);
    this.busyT = setTimeout(() => this.setBusy(false), 4000);
    this.app.send({ t: 'act', action });
  }
  setBusy(b) {
    $('#dockCard').classList.toggle('busy', b);
    $('#auction').classList.toggle('busy', b && !this.game?.auction);
  }
  onAct(kind, d) {
    const g = this.game;
    switch (kind) {
      case 'roll': case 'buy': case 'decline': case 'endTurn': case 'payJail': case 'useJailCard': case 'pass': case 'closeAuction':
        this.act({ type: kind });
        if (kind === 'roll') this.app.unlock();
        break;
      case 'build': case 'sell': case 'mortgage': case 'unmortgage': case 'auctionOwn':
        this.act({ type: kind, tile: Number(d.tile) });
        if (kind === 'auctionOwn') this.closeSheet();
        break;
      case 'travelMode':
        this.mode = this.mode === 'travel' ? null : 'travel';
        this.render();
        break;
      case 'travel':
        this.mode = null;
        this.act({ type: 'travel', to: Number(d.tile) });
        break;
      case 'cancelMode':
        this.mode = null;
        this.render();
        break;
      case 'bidPlus': {
        const a = g.auction;
        const me = this.player(this.me);
        const amount = Math.min(me.money, a.high + Number(d.inc));
        this.act({ type: 'bid', amount });
        break;
      }
      case 'bidCustom': {
        const v = Math.floor(Number($('#bidInput')?.value || 0));
        if (!v) return toast('Escribe cuánto ofreces.', 'warn');
        this.act({ type: 'bid', amount: v });
        break;
      }
      case 'sheet':
        this.openSheet(d.sheet, d.tile ? { tile: Number(d.tile) } : d.pid ? { pid: d.pid } : { filter: d.filter || null, tab: d.tab || null });
        break;
      case 'close':
        this.closeSheet();
        break;
      case 'emotes':
        this.emotesOpen = !this.emotesOpen;
        this.renderDock(g);
        break;
      case 'emote':
        this.app.send({ t: 'emote', e: d.e });
        this.emotesOpen = false;
        this.renderDock(g);
        break;
      case 'tradeTarget':
        this.tradeDraft = { to: d.pid, give: { tiles: [], money: 0, cards: 0 }, get: { tiles: [], money: 0, cards: 0 } };
        this.renderSheet();
        break;
      case 'tradeSend': {
        const t = this.tradeDraft;
        if (!t?.to) return;
        const err = check(compat(g), this.me, { type: 'tradeOffer', to: t.to, give: t.give, get: t.get });
        if (err) return toast(err, 'warn');
        this.act({ type: 'tradeOffer', to: t.to, give: t.give, get: t.get });
        this.tradeDraft = null;
        this.sheetParams.tab = 'ofertas';
        toast('Oferta enviada.', 'good');
        this.renderSheet();
        break;
      }
      case 'tradeAccept': case 'tradeReject': case 'tradeCancel':
        this.act({ type: kind, id: Number(d.id) });
        break;
      case 'tab':
        this.sheetParams.tab = d.tab;
        this.renderSheet();
        break;
      case 'mute':
        setMuted(!isMuted());
        this.renderSheet();
        break;
      case 'gfx':
        try { localStorage.setItem('vendido.gfx', lowGraphics ? 'alto' : 'bajo'); } catch { /* */ }
        toast('Se aplicará al recargar.', 'gold');
        setTimeout(() => location.reload(), 600);
        break;
      case 'view':
        this.app.toggleView();
        this.renderSheet();
        break;
      case 'share':
        this.app.share();
        break;
      case 'resign':
        if (confirmInline(d, 'Toca otra vez para rendirte')) this.act({ type: 'resign' });
        break;
      case 'backLobby':
        this.app.send({ t: 'lobby', force: true });
        this.closeSheet();
        break;
      case 'leave':
        this.closeSheet();
        this.app.leave();
        break;
      case 'rules':
        this.openSheet('rules');
        break;
      case 'unlockSubmit': {
        const inp = $('#unlockInput');
        const code = (inp?.value || '').trim();
        const msg = $('#unlockMsg');
        if (!verifyUnlockCode(code)) {
          if (msg) msg.textContent = 'Ese código no es válido. Revisa que esté bien escrito (ej. VEND-ABCD-1234).';
          sfx.bad();
          return;
        }
        store('vendido.codigo', code);
        const room = this.app.room;
        if (room && this.app.isHost() && room.phase === 'lobby') {
          this.app.send({ t: 'unlock', code });
          if (this.sheetParams.mapId) this.app.send({ t: 'settings', settings: { mapId: this.sheetParams.mapId }, code });
        }
        this.closeSheet();
        toast('🔓 ¡Desbloqueado! Cosmos y Europa 1700 ya son tuyos en este dispositivo.', 'good', 4000);
        sfx.win();
        break;
      }
      default:
    }
  }

  // ------------------------------------------------------------------ render principal
  render() {
    const g = this.game;
    if (!g) return;
    this.setBusy(false);
    this.renderChips(g);
    this.renderDock(g);
    this.renderAuction(g);
    this.renderLog(g);
    this.renderHighlights(g);
    if (this.sheetKind) this.renderSheet();
    if (g.over && !this.finalShown) {
      this.finalShown = true;
      setTimeout(() => this.openSheet('final'), 900);
    }
    if (!g.over) this.finalShown = false;
    requestAnimationFrame(() => this.app.updateInsets());
  }

  renderChips(g) {
    const cur = this.cur();
    const order = g.order.map((id) => g.players.find((p) => p.id === id));
    const members = this.app.room?.members || [];
    $('#chips').innerHTML = order.map((p) => {
      const m = members.find((x) => x.id === p.id);
      const cls = ['chip'];
      if (g.turn.pid === p.id && !g.over) cls.push('turn');
      if (p.id === this.me) cls.push('me');
      if (m && !m.connected && !m.isBot) cls.push('off');
      if (p.bankrupt) cls.push('broke');
      const badges = [p.inJail ? '🔒' : '', p.jailCards ? '🎫' : '', m?.isBot ? '🤖' : '', m && !m.connected && !m.isBot ? '📡' : ''].join('');
      const firstLap = g.settings.firstLapToBuy && p.lapDone === false && !p.bankrupt;
      const sub = p.bankrupt ? 'En quiebra' : p.money < 0 ? 'Debe al banco' : firstLap ? '1ª vuelta' : '';
      return `<button class="${cls.join(' ')}" data-pid="${esc(p.id)}" type="button" aria-label="${esc(p.name)}: ${fmt(p.money, cur)}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="nm">${esc(p.name)}</span>
        <span class="mo ${p.money < 0 ? 'neg' : ''}">${fmt(p.money, cur)}</span>
        ${sub ? `<span class="sub ${firstLap && p.money >= 0 ? 'lap' : ''}">${sub}</span>` : ''}
        ${badges ? `<span class="badges">${badges}</span>` : ''}
      </button>`;
    }).join('');
    // desplazar para que se vea quien tiene el turno
    const t = $('#chips .chip.turn');
    if (t && this.lastTurnSeen !== g.turn.pid) { t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); this.lastTurnSeen = g.turn.pid; }
  }

  renderDock(g) {
    const box = $('#dockCard');
    const map = this.map;
    const cur = this.cur();
    const me = this.player(this.me);
    const cp = this.player(g.turn.pid);
    const v = compat(g);
    const av = me ? available(v, this.me) : null;
    const incoming = g.trades.filter((t) => t.to === this.me).length;
    const dice = g.turn.dice ? `<span class="dice-mini">${g.turn.dice[0]}·${g.turn.dice[1]}</span>` : '';
    const emoteBtn = `<button class="icon-btn" style="width:36px;height:36px;box-shadow:none" data-act="emotes" type="button" aria-label="Reacciones">😀</button>`;
    const titleRow = (txt, color) => `<div class="dock-title"><span class="dot" style="background:${color}"></span><span>${txt}</span><span class="spacer"></span>${dice}${emoteBtn}</div>`;
    const emoteRow = this.emotesOpen ? `<div class="tools" style="grid-template-columns:repeat(8,1fr)">${EMOTES.map((e) => `<button class="tool" style="min-height:42px;font-size:1.3rem" data-act="emote" data-e="${e}" type="button">${e}</button>`).join('')}</div>` : '';
    const tools = (enabled) => {
      const travelOk = enabled && av && av.travel.length > 0;
      const buildN = enabled && av ? av.build.length : 0;
      return `<div class="tools">
        <button class="tool ${this.mode === 'travel' ? 'on' : ''}" data-act="travelMode" type="button" ${travelOk ? '' : 'disabled'}><span class="ic">${map.stationTiles && map.tiles[5].icon}</span>Viajar</button>
        <button class="tool" data-act="sheet" data-sheet="props" data-filter="build" type="button" ${buildN ? '' : 'disabled'}><span class="ic">🏠</span>Construir${buildN ? `<span class="badge">${buildN}</span>` : ''}</button>
        <button class="tool" data-act="sheet" data-sheet="props" type="button" ${me && !me.bankrupt ? '' : 'disabled'}><span class="ic">📜</span>Propiedades</button>
        <button class="tool" data-act="sheet" data-sheet="trade" type="button" ${me && !me.bankrupt ? '' : 'disabled'}><span class="ic">🤝</span>Tratos${incoming ? `<span class="badge">${incoming}</span>` : ''}</button>
      </div>`;
    };

    if (g.over) {
      const w = this.player(g.winner);
      box.innerHTML = `${titleRow(w ? `🏆 ¡${esc(w.name)} gana!` : 'Fin de la partida', w?.color || '#ccc')}
        <div class="dock-main two">
          <button class="btn btn-gold" data-act="sheet" data-sheet="final" type="button">Resultados</button>
          ${this.app.isHost() ? '<button class="btn btn-ink" data-act="backLobby" type="button">Revancha</button>' : '<button class="btn" data-act="leave" type="button">Salir</button>'}
        </div>`;
      return;
    }
    if (!me || me.bankrupt) {
      box.innerHTML = `${titleRow(`Turno de ${esc(cp.name)}`, cp.color)}
        <div class="waiting"><span class="pulse"></span>${me ? 'Estás en quiebra: sigue viendo la partida.' : 'Estás viendo la partida.'}</div>${emoteRow}`;
      return;
    }
    if (g.auction) {
      box.innerHTML = `${titleRow('Subasta en curso', '#e8333a')}<div class="waiting"><span class="pulse"></span>Ofrece arriba o pasa.</div>${emoteRow}${tools(false)}`;
      return;
    }
    const myTurn = g.turn.pid === this.me;
    if (!myTurn) {
      const what = g.turn.phase === 'buy' ? `decide si compra ${esc(map.tiles[g.turn.pendingBuy].name)}` : g.turn.phase === 'end' ? 'está terminando su turno' : 'va a tirar los dados';
      const m = this.app.room?.members.find((x) => x.id === cp.id);
      const off = m && !m.connected && !m.isBot ? ' (desconectado, un bot jugará por él en unos segundos)' : '';
      box.innerHTML = `${titleRow(`Turno de ${esc(cp.name)}`, cp.color)}
        <div class="waiting"><span class="pulse"></span>${esc(cp.name)} ${what}${off}.</div>${emoteRow}${tools(false)}`;
      return;
    }

    // --- mi turno
    if (this.mode === 'travel') {
      const word = map.stationWord === 'portal' ? 'portal' : map.stationWord === 'diligencia' ? 'posta' : 'estación';
      box.innerHTML = `${titleRow(`${map.travelVerb}`, me.color)}
        <p class="muted" style="margin:0">Elige a qué ${word} tuya quieres ir (también puedes tocarla en el tablero).</p>
        <div class="dock-main">${av.travel.map((i) => `<button class="btn btn-gold" data-act="travel" data-tile="${i}" type="button">${map.tiles[i].icon} ${esc(map.tiles[i].name)}</button>`).join('')}
        <button class="btn btn-ghost" data-act="cancelMode" type="button">Cancelar</button></div>`;
      return;
    }
    let main = '';
    let title = '¡Tu turno!';
    if (g.turn.phase === 'roll') {
      if (me.inJail) {
        title = `En ${esc(map.tiles[10].name)} (intento ${me.jailTries + 1} de 3)`;
        main = `<div class="dock-main">
          <button class="btn btn-gold btn-big" data-act="roll" type="button">Tirar por dobles</button>
          <div class="dock-main two">
            <button class="btn" data-act="payJail" type="button" ${av.payJail ? '' : 'disabled'}>Pagar ${fmt(g.settings.jailFine, cur)}</button>
            <button class="btn" data-act="useJailCard" type="button" ${av.useJailCard ? '' : 'disabled'}>Usar tarjeta${me.jailCards ? ` (${me.jailCards})` : ''}</button>
          </div></div>`;
      } else {
        if (g.turn.extra) title = '¡Dobles! Tira otra vez';
        main = `<div class="dock-main"><button class="btn btn-gold btn-big" data-act="roll" type="button">🎲 Tirar dados</button>${this.hardBuildBtn(g, av)}</div>`;
      }
    } else if (g.turn.phase === 'buy') {
      const t = map.tiles[g.turn.pendingBuy];
      title = `Caíste en ${esc(t.name)}`;
      const can = av.buy;
      main = `${this.deedMini(t)}
        <div class="dock-main two">
          <button class="btn btn-green" data-act="buy" type="button" ${can ? '' : 'disabled'}>Comprar ${fmt(t.price, cur)}</button>
          <button class="btn btn-ink" data-act="decline" type="button">Subastar</button>
        </div>
        ${can ? '' : `<p class="muted" style="margin:0">${me.money < 0 ? 'Tienes deuda con el banco: no puedes comprar.' : 'No te alcanza. Hipoteca o vende casas en Propiedades, o déjala a subasta.'}</p>`}`;
    } else if (g.turn.phase === 'end') {
      const here = map.tiles[me.pos];
      if (av.travel.length) title = `Estás en tu ${here.t === 'station' ? esc(here.name) : 'estación'}: puedes viajar`;
      main = `<div class="dock-main">${this.hardBuildBtn(g, av)}<button class="btn btn-gold btn-big" data-act="endTurn" type="button">Terminar turno</button></div>`;
    }
    box.innerHTML = `${titleRow(title, me.color)}${main}${emoteRow}${tools(true)}`;
  }

  hardBuildBtn(g, av) {
    if (g.settings.mode !== 'dificil') return '';
    const t = g.turn.landed;
    if (t === null || !av.build.includes(t)) return '';
    const tile = this.map.tiles[t];
    const h = g.props[t].houses;
    return `<button class="btn btn-green" data-act="build" data-tile="${t}" type="button">🏠 Construir ${h === 4 ? 'hotel' : 'casa'} aquí (${fmt(tile.house, this.cur())})</button>`;
  }

  deedMini(t) {
    const cur = this.cur();
    const band = t.t === 'prop' ? t.color : '#e9e7f7';
    const info = t.t === 'prop' ? `Renta ${fmt(t.rent[0], cur)} · con todo el color ${fmt(t.rent[0] * 2, cur)} · hotel ${fmt(t.rent[5], cur)}`
      : t.t === 'station' ? `Renta ${STATION_RENT.map((r) => fmt(r, cur)).join(' / ')} según cuántas tengas. Con 2+ puedes viajar.`
        : 'Cobra 4× los dados (10× si tienes las dos).';
    return `<div class="deed-mini"><div class="band" style="background:${band};color:${onColor(band)}"><span>${t.icon} ${esc(t.name)}</span><span>${fmt(t.price, cur)}</span></div><div class="info">${info}</div></div>`;
  }

  renderHighlights(g) {
    const b = this.app.board;
    if (this.mode === 'travel') {
      const av = available(compat(g), this.me);
      if (!av.travel.length) { this.mode = null; b.setHighlights([]); return; }
      b.setHighlights(av.travel, '#2f8cff');
    } else if (this.sheetKind === 'props' && this.sheetParams.filter === 'build') {
      b.setHighlights(available(compat(g), this.me).build, '#22c55e');
    } else if (g.turn.phase === 'buy' && g.turn.pendingBuy !== null) {
      b.setHighlights([g.turn.pendingBuy], '#ffc531');
    } else if (g.auction) {
      b.setHighlights([g.auction.tile], '#e8333a');
    } else b.setHighlights([]);
  }

  onTileTap(i) {
    const g = this.game;
    if (!g) return;
    if (this.mode === 'travel') {
      const av = available(compat(g), this.me);
      if (av.travel.includes(i)) { this.mode = null; this.act({ type: 'travel', to: i }); return; }
    }
    this.openSheet('tile', { tile: i });
  }

  // ------------------------------------------------------------------ subasta
  renderAuction(g) {
    const el = $('#auction');
    const a = g.auction;
    if (!a || g.over) {
      el.hidden = true;
      clearInterval(this.auctionTick);
      this.auctionTick = null;
      return;
    }
    const map = this.map;
    const cur = this.cur();
    const t = map.tiles[a.tile];
    const me = this.player(this.me);
    const v = compat(g);
    const canBid = me && !me.bankrupt && !check(v, this.me, { type: 'bid' });
    const isSeller = a.seller === this.me;
    const bidder = a.bidder ? this.player(a.bidder) : null;
    const band = t.t === 'prop' ? t.color : '#e9e7f7';
    let actions = '';
    if (isSeller) {
      actions = `<p class="muted" style="margin:0">Estás vendiendo. ${a.bidder ? 'Puedes cerrar ya y aceptar la oferta.' : 'Esperando ofertas…'}</p>
        ${a.bidder ? '<button class="btn btn-red" data-act="closeAuction" type="button">¡Vendido! Cerrar ya</button>' : ''}`;
    } else if (a.bidder === this.me) {
      actions = '<p class="muted" style="margin:0"><b>Vas ganando.</b> Espera a ver si alguien ofrece más.</p>';
    } else if (canBid) {
      const incs = [10, 50, 100].filter((x) => a.high + x <= me.money);
      actions = `<div class="bid-btns">${[10, 50, 100].map((x) => `<button class="btn btn-gold" data-act="bidPlus" data-inc="${x}" type="button" ${incs.includes(x) ? '' : 'disabled'}>+${x}</button>`).join('')}</div>
        <div class="bid-custom"><input id="bidInput" type="number" inputmode="numeric" min="${a.high + 1}" max="${me.money}" placeholder="${a.high + 1}">
        <button class="btn btn-ink" data-act="bidCustom" type="button">Ofrecer</button>
        <button class="btn" data-act="pass" type="button" ${a.passed.includes(this.me) ? 'disabled' : ''}>${a.passed.includes(this.me) ? 'Pasaste' : 'Paso'}</button></div>
        <p class="muted" style="margin:0">Tienes ${fmt(me.money, cur)}.</p>`;
    } else if (me && !me.bankrupt) {
      actions = `<p class="muted" style="margin:0">${me.money < 0 ? 'Con deuda no puedes pujar.' : me.money <= a.high ? 'No te alcanza para subir la oferta.' : 'Pasaste.'}</p>`;
    }
    const keepInput = $('#bidInput') && document.activeElement === $('#bidInput') ? $('#bidInput').value : null;
    el.innerHTML = `
      <div class="a-head" style="background:${band};color:${onColor(band)}"><span class="gavel">🔨 Subasta</span><span>${a.seller ? `La vende ${esc(this.name(a.seller))}` : 'La vende el banco'}</span></div>
      <div class="a-body">
        <div style="font-weight:800">${t.icon} ${esc(t.name)} <span class="muted">· vale ${fmt(t.price, cur)}${g.props[a.tile].mortgaged ? ' · hipotecada' : ''}</span></div>
        <div class="bid"><b>${fmt(a.high, cur)}</b>${bidder ? `<span class="who"><span class="dot" style="background:${bidder.color}"></span>${esc(bidder.name)}</span>` : '<span class="muted">Sin ofertas</span>'}</div>
        <div class="timer"><i id="auctionBar"></i></div>
        ${actions}
      </div>`;
    el.hidden = false;
    if (keepInput !== null) { const inp = $('#bidInput'); if (inp) { inp.value = keepInput; inp.focus(); } }
    const total = g.settings.auctionSeconds * 1000;
    const upd = () => {
      const left = Math.max(0, a.endsAt - this.app.serverNow());
      const bar = $('#auctionBar');
      if (bar) bar.style.transform = `scaleX(${Math.min(1, left / total)})`;
    };
    upd();
    clearInterval(this.auctionTick);
    this.auctionTick = setInterval(upd, 100);
  }

  // ------------------------------------------------------------------ registro
  renderLog(g) {
    const items = g.log.slice(-60).reverse();
    $('#logList').innerHTML = items.map((l) => `<li class="k-${l.kind}">${esc(l.text)}</li>`).join('');
    const last = [...g.log].reverse().find((l) => l.kind !== 'turn') || g.log[g.log.length - 1];
    $('#ticker').textContent = last ? last.text : '';
  }

  // ------------------------------------------------------------------ hojas
  openSheet(kind, params = {}) {
    this.sheetKind = kind;
    this.sheetParams = params;
    if (kind === 'trade' && params.pid) this.tradeDraft = { to: params.pid, give: { tiles: [], money: 0, cards: 0 }, get: { tiles: [], money: 0, cards: 0 } };
    $('#overlay').hidden = false;
    $('#sheet').hidden = false;
    this.renderSheet();
    if (this.game) this.renderHighlights(this.game);
  }
  closeSheet() {
    const wasBuild = this.sheetKind === 'props';
    this.sheetKind = null;
    $('#overlay').hidden = true;
    $('#sheet').hidden = true;
    if (wasBuild && this.game) this.renderHighlights(this.game);
  }
  head(title) { return `<div class="sheet-head"><h2>${title}</h2><button class="close" data-act="close" type="button" aria-label="Cerrar">✕</button></div>`; }

  renderSheet() {
    const body = $('#sheetBody');
    const scroll = body.scrollTop;
    const k = this.sheetKind;
    let html = '';
    if (k === 'rules') html = this.head('Cómo se juega') + RULES_HTML;
    else if (k === 'unlock') html = this.sheetUnlock();
    else if (k === 'install') html = this.head('Instalar en el celular') + this.app.installHTML();
    else if (!this.game) html = this.head('') + '<p class="empty">No hay partida.</p>';
    else if (k === 'props') html = this.sheetProps();
    else if (k === 'tile') html = this.sheetTile();
    else if (k === 'trade') html = this.sheetTrade();
    else if (k === 'menu') html = this.sheetMenu();
    else if (k === 'log') html = this.head('Registro') + `<ol class="log-list">${[...this.game.log].reverse().map((l) => `<li class="k-${l.kind}">${esc(l.text)}</li>`).join('')}</ol>`;
    else if (k === 'final') html = this.sheetFinal();
    body.innerHTML = html;
    body.scrollTop = scroll;
    if (k === 'trade') this.bindTrade();
  }

  propActions(i) {
    const g = this.game;
    const v = compat(g);
    const t = this.map.tiles[i];
    const cur = this.cur();
    const pr = g.props[i];
    const ok = (type) => !check(v, this.me, { type, tile: i });
    const btns = [];
    if (t.t === 'prop') {
      if (ok('build')) btns.push(`<button class="btn btn-green" data-act="build" data-tile="${i}" type="button">+ ${pr.houses === 4 ? 'Hotel' : 'Casa'} ${fmt(t.house, cur)}</button>`);
      if (ok('sell')) btns.push(`<button class="btn" data-act="sell" data-tile="${i}" type="button">− Vender ${pr.houses === 5 ? 'hotel' : 'casa'} +${fmt(t.house / 2, cur)}</button>`);
    }
    if (ok('mortgage')) btns.push(`<button class="btn" data-act="mortgage" data-tile="${i}" type="button">Hipotecar +${fmt(t.price / 2, cur)}</button>`);
    if (ok('unmortgage')) btns.push(`<button class="btn btn-gold" data-act="unmortgage" data-tile="${i}" type="button">Deshipotecar ${fmt(unmortgageCost(t), cur)}</button>`);
    if (ok('auctionOwn')) btns.push(`<button class="btn btn-ink" data-act="auctionOwn" data-tile="${i}" type="button">🔨 Subastar</button>`);
    return btns;
  }

  sheetProps() {
    const g = this.game;
    const map = this.map;
    const cur = this.cur();
    const pid = this.sheetParams.pid || this.me;
    const p = this.player(pid);
    if (!p) return this.head('Propiedades') + '<p class="empty">No estás jugando en esta partida.</p>';
    const mine = pid === this.me;
    const filter = mine ? this.sheetParams.filter : null;
    const v = compat(g);
    const av = mine ? available(v, this.me) : null;
    const owned = Object.keys(g.props).map(Number).filter((i) => g.props[i].owner === pid);
    const worth = netWorth(v, pid);
    let html = this.head(filter === 'build' ? 'Construir' : mine ? 'Tus propiedades' : `Propiedades de ${esc(p.name)}`);
    html += `<p class="muted" style="margin:-4px 0 12px">Efectivo <b>${fmt(p.money, cur)}</b> · Patrimonio <b>${fmt(worth, cur)}</b>${p.jailCards ? ` · 🎫 ${p.jailCards} tarjeta(s)` : ''}${p.money < 0 ? ` · <b style="color:var(--debt)">Debe ${fmt(-p.money, cur)} al banco</b>` : ''}</p>`;
    if (filter === 'build') {
      html += `<p class="muted" style="margin:-4px 0 12px">${g.settings.mode === 'dificil' ? 'Modo difícil: solo donde acabas de caer.' : 'Construye parejo: no puedes tener 2 casas más que otra del mismo color.'}</p>`;
    }
    if (!owned.length) return html + `<p class="empty">${mine ? 'Todavía no tienes propiedades. ¡Compra lo que puedas!' : 'Sin propiedades.'}</p>`;
    const row = (i) => {
      const t = map.tiles[i];
      const pr = g.props[i];
      const hs = pr.houses === 5 ? '🏨' : '🏠'.repeat(pr.houses);
      const rent = pr.mortgaged ? 'hipotecada, no cobra' : t.t === 'utility' ? `renta ${ownsUtil(g, pid) === 2 ? '10' : '4'}× dados` : `renta ${fmt(rentFor(v, i), cur)}`;
      const acts = mine ? this.propActions(i) : [];
      if (filter === 'build' && !av.build.includes(i) && !acts.some((a) => a.includes('data-act="sell"'))) return '';
      return `<div class="prop-row ${pr.mortgaged ? 'mort' : ''}">
        <div><div class="nm">${t.icon} ${esc(t.name)} <span class="houses-ind">${hs}</span></div><div class="meta">${rent}</div></div>
        <button class="btn btn-sm btn-ghost" data-act="sheet" data-sheet="tile" data-tile="${i}" type="button">Ver</button>
        ${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}
      </div>`;
    };
    for (const grp of map.groups) {
      const list = grp.tiles.filter((i) => owned.includes(i));
      if (!list.length) continue;
      const full = ownsGroup(v, pid, map.tiles[list[0]].g);
      const rows = list.map(row).join('');
      if (!rows) continue;
      html += `<div class="group-block"><h3><span class="sw" style="background:${grp.color}"></span>${esc(grp.name)} <span class="muted">${full ? '· color completo' : `· ${list.length} de ${grp.tiles.length}`}</span></h3>${rows}</div>`;
    }
    if (filter !== 'build') {
      const st = map.stationTiles.filter((i) => owned.includes(i));
      if (st.length) html += `<div class="group-block"><h3>${map.tiles[5].icon} ${map.stationWord === 'portal' ? 'Portales' : map.stationWord === 'diligencia' ? 'Postas' : 'Estaciones'} <span class="muted">· ${st.length} de 4${st.length >= 2 ? ' · puedes viajar' : ''}</span></h3>${st.map(row).join('')}</div>`;
      const ut = map.utilityTiles.filter((i) => owned.includes(i));
      if (ut.length) html += `<div class="group-block"><h3>⚡ Servicios</h3>${ut.map(row).join('')}</div>`;
    }
    if (mine && filter !== 'build') html += '<p class="muted">Para subastar o hipotecar no debe haber casas en ese color. Subastar solo en tu turno.</p>';
    return html;
  }

  sheetTile() {
    const g = this.game;
    const map = this.map;
    const cur = this.cur();
    const i = this.sheetParams.tile;
    const t = map.tiles[i];
    const pr = g.props[i];
    const v = compat(g);
    let html = this.head('Casilla');
    const here = g.players.filter((p) => !p.bankrupt && p.pos === i).map((p) => `<span style="display:inline-flex;gap:4px;align-items:center;margin-right:8px"><span class="dot" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color};border:2px solid var(--ink)"></span>${esc(p.name)}${p.inJail ? ' (preso)' : ''}</span>`).join('');
    if (!pr) {
      const desc = {
        go: `Cobras ${fmt(g.settings.salary, cur)} cada vez que pasas.`,
        jail: 'Si solo pasas, estás de visita. Para salir: dobles, pagar fianza o tarjeta.',
        free: g.settings.freeParkingPot ? `Te llevas el bote: ${fmt(g.bank.pot, cur)}.` : 'No pasa nada. Descansa.',
        gotojail: 'Vas directo a la cárcel sin cobrar la Salida.',
        chance: 'Sacas una carta.', chest: 'Sacas una carta.',
        tax: `Pagas ${fmt(t.amount, cur)} al banco.`,
      }[t.t] || '';
      html += `<div class="deed"><div class="head" style="background:var(--paper-2)"><small>${t.icon}</small><b>${esc(t.name)}</b></div><div class="foot">${desc}${here ? `<br><br>${here}` : ''}</div></div>`;
      return html;
    }
    const band = t.t === 'prop' ? t.color : '#e9e7f7';
    let rows = '';
    if (t.t === 'prop') {
      const labels = ['Renta', 'Con 1 casa', 'Con 2 casas', 'Con 3 casas', 'Con 4 casas', 'Con hotel'];
      const full = pr.owner && ownsGroup(v, pr.owner, t.g);
      rows = labels.map((l, k) => `<tr class="${pr.owner && pr.houses === k ? 'cur' : ''}"><td>${l}${k === 0 ? ' (doble con todo el color)' : ''}</td><td>${fmt(k === 0 && full ? t.rent[0] * 2 : t.rent[k], cur)}</td></tr>`).join('');
      rows += `<tr><td>Cada casa cuesta</td><td>${fmt(t.house, cur)}</td></tr>`;
    } else if (t.t === 'station') {
      rows = STATION_RENT.map((r, k) => `<tr><td>Si tiene ${k + 1}</td><td>${fmt(r, cur)}</td></tr>`).join('');
    } else rows = '<tr><td>Con 1 servicio</td><td>4× los dados</td></tr><tr><td>Con los 2</td><td>10× los dados</td></tr>';
    rows += `<tr><td>Hipoteca</td><td>${fmt(t.price / 2, cur)}</td></tr>`;
    const owner = pr.owner ? this.player(pr.owner) : null;
    html += `<div class="deed"><div class="head" style="background:${band};color:${onColor(band)}"><small>${t.t === 'prop' ? esc(map.groups[t.g].name) : t.t === 'station' ? 'Viaje' : 'Servicio'} · ${fmt(t.price, cur)}</small><b>${t.icon} ${esc(t.name)}</b></div>
      <table>${rows}</table>
      <div class="foot">${owner ? `Dueño: <b style="color:${owner.color}">●</b> <b>${esc(owner.name)}</b>${pr.mortgaged ? ' · <b>hipotecada</b>' : ''}${pr.houses ? ` · ${pr.houses === 5 ? 'hotel' : pr.houses + ' casa(s)'}` : ''}` : 'Sin dueño: se compra al caer en ella.'}
      ${t.t === 'station' ? `<br>Con 2 o más ${map.stationWord === 'portal' ? 'portales' : 'estaciones'} el dueño puede viajar entre ellas.` : ''}${here ? `<br><br>${here}` : ''}</div></div>`;
    if (pr.owner === this.me) {
      const acts = this.propActions(i);
      if (acts.length) html += `<div class="prop-row" style="margin-top:12px;border:0;padding:0"><div class="acts">${acts.join('')}</div></div>`;
    } else if (pr.owner && this.player(this.me) && !this.player(this.me).bankrupt) {
      html += `<button class="btn btn-ghost" style="width:100%;margin-top:12px" data-act="sheet" data-sheet="trade" data-pid="${esc(pr.owner)}" type="button">🤝 Proponer trato a ${esc(owner.name)}</button>`;
    }
    return html;
  }

  sheetTrade() {
    const g = this.game;
    const map = this.map;
    const cur = this.cur();
    const tab = this.sheetParams.tab || (g.trades.some((t) => t.to === this.me || t.from === this.me) && !this.tradeDraft ? 'ofertas' : 'nueva');
    this.sheetParams.tab = tab;
    let html = this.head('Tratos');
    html += `<div class="seg" style="margin-bottom:12px"><button type="button" data-act="tab" data-tab="ofertas" aria-pressed="${tab === 'ofertas'}">Ofertas (${g.trades.filter((t) => t.to === this.me || t.from === this.me).length})</button><button type="button" data-act="tab" data-tab="nueva" aria-pressed="${tab === 'nueva'}">Nueva oferta</button></div>`;
    const pack = (pk) => {
      const items = [...pk.tiles.map((i) => `${map.tiles[i].icon} ${esc(map.tiles[i].name)}`), pk.money ? fmt(pk.money, cur) : null, pk.cards ? `🎫 ${pk.cards} tarjeta(s)` : null].filter(Boolean);
      return items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p class="muted">nada</p>';
    };
    if (tab === 'ofertas') {
      const list = g.trades.filter((t) => t.to === this.me || t.from === this.me);
      if (!list.length) return html + '<p class="empty">No tienes ofertas pendientes.</p>';
      for (const t of list) {
        const inc = t.to === this.me;
        const other = this.player(inc ? t.from : t.to);
        html += `<div class="trade-card">
          <div style="font-weight:800">${inc ? `${esc(other.name)} te propone:` : `Le propusiste a ${esc(other.name)}:`}</div>
          <div class="sides"><div><b>${inc ? 'Recibes' : 'Das'}</b>${pack(inc ? t.give : t.give)}</div><div class="arrow">⇄</div><div><b>${inc ? 'Das' : 'Recibes'}</b>${pack(t.get)}</div></div>
          <div class="dock-main two">${inc ? `<button class="btn btn-green" data-act="tradeAccept" data-id="${t.id}" type="button">Aceptar</button><button class="btn" data-act="tradeReject" data-id="${t.id}" type="button">Rechazar</button>` : `<button class="btn" data-act="tradeCancel" data-id="${t.id}" type="button">Cancelar oferta</button>`}</div>
        </div>`;
      }
      return html;
    }
    // nueva oferta
    const others = g.players.filter((p) => p.id !== this.me && !p.bankrupt);
    if (!others.length) return html + '<p class="empty">No hay con quién tratar.</p>';
    if (!this.tradeDraft || !others.find((p) => p.id === this.tradeDraft.to)) this.tradeDraft = { to: others[0].id, give: { tiles: [], money: 0, cards: 0 }, get: { tiles: [], money: 0, cards: 0 } };
    const d = this.tradeDraft;
    const me = this.player(this.me);
    const them = this.player(d.to);
    html += `<div class="target-pick">${others.map((p) => `<button type="button" data-act="tradeTarget" data-pid="${esc(p.id)}" aria-pressed="${p.id === d.to}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</button>`).join('')}</div>`;
    const tradeable = (pid) => Object.keys(g.props).map(Number).filter((i) => {
      const t = map.tiles[i];
      if (g.props[i].owner !== pid) return false;
      if (t.t === 'prop' && map.groups[t.g].tiles.some((k) => g.props[k].houses > 0)) return false;
      return true;
    });
    const col = (who, side, p) => {
      const tiles = tradeable(p.id);
      return `<div class="trade-col"><h3>${who}</h3>
        ${tiles.length ? tiles.map((i) => `<label class="pick"><input type="checkbox" data-side="${side}" data-tile="${i}" ${d[side].tiles.includes(i) ? 'checked' : ''}><span class="sw" style="background:${map.tiles[i].color || '#ccc'}"></span>${esc(map.tiles[i].name)}${g.props[i].mortgaged ? ' (hip.)' : ''}</label>`).join('') : '<span class="muted">Sin propiedades sin casas.</span>'}
        <label class="muted">Dinero (máx. ${fmt(Math.max(0, p.money), cur)})<input class="money-in" type="number" inputmode="numeric" min="0" max="${Math.max(0, p.money)}" data-side="${side}" data-money value="${d[side].money || ''}" placeholder="0"></label>
        ${p.jailCards ? `<label class="pick"><input type="checkbox" data-side="${side}" data-cards ${d[side].cards ? 'checked' : ''}>🎫 Tarjeta de salida</label>` : ''}
      </div>`;
    };
    html += `<div class="trade-cols">${col('Tú das', 'give', me)}${col(`${esc(them.name)} te da`, 'get', them)}</div>
      <button class="btn btn-gold btn-big" style="margin-top:12px" data-act="tradeSend" type="button">Enviar oferta</button>`;
    return html;
  }
  bindTrade() {
    const d = this.tradeDraft;
    if (!d) return;
    $('#sheetBody').querySelectorAll('input[data-side]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const side = inp.dataset.side;
        if (inp.dataset.tile !== undefined) {
          const i = Number(inp.dataset.tile);
          d[side].tiles = inp.checked ? [...new Set([...d[side].tiles, i])] : d[side].tiles.filter((x) => x !== i);
        } else if (inp.dataset.cards !== undefined) d[side].cards = inp.checked ? 1 : 0;
      });
      if (inp.dataset.money !== undefined) inp.addEventListener('input', () => { d[inp.dataset.side].money = Math.max(0, Math.floor(Number(inp.value) || 0)); });
    });
  }

  sheetMenu() {
    const g = this.game;
    const me = this.player(this.me);
    const host = this.app.isHost();
    return this.head('Menú') + `<div class="menu-list">
      <p class="muted" style="margin:0 0 4px">Sala <b>${esc(this.app.code)}</b> · ${esc(getMap(g.settings.mapId).name)} · modo ${esc(MODES[g.settings.mode]?.name || '')} · ronda ${g.round}${g.settings.maxRounds ? ` de ${g.settings.maxRounds}` : ''}</p>
      <button class="btn" data-act="share" type="button">📨 Invitar / copiar código</button>
      <button class="btn" data-act="rules" type="button">📖 Cómo se juega</button>
      <button class="btn" data-act="sheet" data-sheet="log" type="button">🧾 Registro completo</button>
      <button class="btn" data-act="view" type="button">🗺️ Vista: ${this.app.board.view === '3d' ? '3D (cambiar a 2D)' : '2D (cambiar a 3D)'}</button>
      <button class="btn" data-act="mute" type="button">${isMuted() ? '🔇 Sonido apagado' : '🔊 Sonido encendido'}</button>
      <button class="btn" data-act="gfx" type="button">${lowGraphics ? '🐢 Gráficos: bajos (cambiar a altos)' : '✨ Gráficos: altos (cambiar a bajos)'}</button>
      ${me && !me.bankrupt && !g.over ? '<button class="btn btn-ghost" data-act="resign" type="button">🏳️ Rendirme</button>' : ''}
      ${host && !g.over ? '<button class="btn btn-ghost" data-act="backLobby" type="button">↩︎ Terminar y volver a la sala de espera</button>' : ''}
      <button class="btn btn-red" data-act="leave" type="button">Salir de la sala</button>
      <p class="muted" style="margin:6px 0 0">Conexión: ${esc(this.app.conn?.label || '')}</p>
    </div>`;
  }

  sheetUnlock() {
    const owned = (() => { const c = store('vendido.codigo'); return c && verifyUnlockCode(c); })();
    const roomUnlocked = !!this.app.room?.unlocked;
    const cards = PREMIUM_MAPS.map((id) => {
      const m = getMap(id);
      return `<div class="mini"><span class="strip" style="display:flex;height:6px;border-radius:3px;overflow:hidden">${m.groups.map((gr) => `<i style="flex:1;background:${gr.color}"></i>`).join('')}</span><b>${m.tiles[39].icon} ${esc(m.name)}</b><span class="muted">${esc(m.blurb)}</span></div>`;
    }).join('');
    let html = this.head('Tableros premium') + `<div class="unlock-hero">${cards}</div>`;
    if (owned || roomUnlocked) {
      return html + `<p><b>✓ Ya están desbloqueados${owned ? ' en este dispositivo' : ' en esta sala'}.</b> Elígelos en la sala de espera cuando crees una partida. Tus amigos juegan contigo sin pagar.</p>`;
    }
    return html + `
      <div class="unlock-price">${PREMIUM.priceLabel}</div>
      <p class="muted" style="margin-top:-6px">Un solo pago desbloquea los dos tableros. Solo paga quien crea la sala: tus amigos entran gratis.</p>
      <ol class="unlock-steps">
        <li>Paga con PayPal (abre en otra pestaña).</li>
        <li>Te enviamos tu código al correo de tu cuenta de PayPal.</li>
        <li>Escríbelo aquí abajo.</li>
      </ol>
      <a class="btn paypal-btn" href="${paypalLink()}" target="_blank" rel="noopener">Pagar ${PREMIUM.priceLabel} con PayPal</a>
      <form class="unlock-form" onsubmit="return false">
        <input id="unlockInput" placeholder="VEND-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Código de desbloqueo">
        <button class="btn btn-ink" type="submit" data-act="unlockSubmit">Desbloquear</button>
      </form>
      <p class="form-error" id="unlockMsg" role="alert"></p>`;
  }

  sheetFinal() {
    const g = this.game;
    const cur = this.cur();
    const v = compat(g);
    const ranked = [...g.players].sort((a, b) => (a.rank || 99) - (b.rank || 99) || netWorth(v, b.id) - netWorth(v, a.id));
    const w = this.player(g.winner);
    return this.head(w ? `🏆 ¡${esc(w.name)} gana!` : 'Fin de la partida') + `
      <p class="muted" style="margin-top:-6px">${g.endReason === 'rondas' ? `Se jugaron ${g.settings.maxRounds} rondas; gana el mayor patrimonio.` : 'Todos los demás quebraron.'}</p>
      <div class="podium"><ol>${ranked.map((p, k) => `<li><span class="pos">${k + 1}</span><span><span style="color:${p.color}">●</span> ${esc(p.name)}${p.bankrupt ? ' <span class="muted">(quiebra)</span>' : ''}</span><span>${p.bankrupt ? '' : fmt(netWorth(v, p.id), cur)}</span></li>`).join('')}</ol></div>
      <div class="dock-main two">${this.app.isHost() ? '<button class="btn btn-gold" data-act="backLobby" type="button">Revancha</button>' : '<span class="muted">El anfitrión puede iniciar la revancha.</span>'}<button class="btn" data-act="leave" type="button">Salir</button></div>`;
  }

  // ------------------------------------------------------------------ efectos
  async showCard(e) {
    const map = this.map;
    const deck = map.decks[e.deck];
    const pop = $('#cardPop');
    const who = this.player(e.pid);
    pop.innerHTML = `<div class="fortune" style="border-color:var(--ink)"><div class="deck"><span class="ic">${deck.icon}</span>${esc(deck.name)}</div><p>${esc(e.text)}</p><div class="who">${esc(who?.name || '')} · toca para cerrar</div></div>`;
    pop.hidden = false;
    sfx.card();
    await new Promise((res) => {
      const done = () => { pop.removeEventListener('click', done); clearTimeout(t); res(); };
      const t = setTimeout(done, this.app.fast ? 900 : 2600);
      pop.addEventListener('click', done);
    });
    pop.hidden = true;
  }
  showStamp(tile, pid, price) {
    const map = this.map;
    const t = map.tiles[tile];
    const p = this.player(pid);
    const layer = $('#stampLayer');
    layer.innerHTML = `<div class="stamp"><span class="big">¡VENDIDO!</span><span class="what">${t.icon} ${esc(t.name)} · ${fmt(price, this.cur())}</span><span class="to"><i style="background:${p?.color || '#ccc'}"></i>${esc(p?.name || '')}</span></div>`;
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    sfx.sold();
    vibrate(40);
    clearTimeout(this.stampT);
    this.stampT = setTimeout(() => { layer.innerHTML = ''; }, 1600);
  }
  moneyFloat(pid, amount) {
    if (!amount) return;
    const chip = document.querySelector(`#chips [data-pid="${CSS.escape(pid)}"]`);
    if (!chip) return;
    const r = chip.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'money-float ' + (amount > 0 ? 'pos' : 'neg');
    el.textContent = (amount > 0 ? '+' : '−') + fmt(Math.abs(amount), this.cur()).replace('−', '');
    el.style.left = `${r.left + 20}px`;
    el.style.top = `${r.bottom - 4}px`;
    $('#floatLayer').appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
  showEmote(pid, e) {
    const chip = document.querySelector(`#chips [data-pid="${CSS.escape(pid)}"]`);
    const p = this.player(pid) || this.app.room?.members.find((m) => m.id === pid);
    const el = document.createElement('div');
    el.className = 'emote-bubble';
    el.innerHTML = `<span class="e">${e}</span> ${esc(p?.name || '')}`;
    if (chip) {
      const r = chip.getBoundingClientRect();
      el.style.left = `${Math.min(window.innerWidth - 140, r.left)}px`;
      el.style.top = `${r.bottom + 10}px`;
      el.style.position = 'fixed';
    }
    document.body.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 2200);
  }
}

function ownsUtil(g, pid) { return [12, 28].filter((i) => g.props[i].owner === pid).length; }
function confirmInline(d, text) {
  const b = document.querySelector(`[data-act="${d.act || 'resign'}"]`);
  if (b && b.dataset.armed === '1') return true;
  if (b) { b.dataset.armed = '1'; b.textContent = text; setTimeout(() => { if (b) { b.dataset.armed = ''; b.textContent = '🏳️ Rendirme'; } }, 3000); }
  return false;
}
export { sleep };
