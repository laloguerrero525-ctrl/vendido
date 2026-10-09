// Dibuja la cara del tablero en un canvas (se usa como textura en 3D y vista 2D).
import { HALF, INNER, tileRect } from './geometry.js';

function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) return null;
  if (lines.some((l) => ctx.measureText(l).width > maxW * 1.02)) return null;
  return lines;
}
function fitText(ctx, text, maxW, maxLines, size, minSize, weight, family) {
  for (let s = size; s >= minSize; s -= Math.max(1, Math.round(size * 0.06))) {
    ctx.font = `${weight} ${s}px ${family}`;
    const lines = wrapLines(ctx, text, maxW, maxLines);
    if (lines) return { lines, size: s };
  }
  ctx.font = `${weight} ${minSize}px ${family}`;
  return { lines: wrapLines(ctx, text, maxW * 3, maxLines) || [text], size: minSize };
}
function drawLines(ctx, lines, x, y, lh) {
  lines.forEach((l, k) => ctx.fillText(l, x, y + k * lh));
}
function emoji(ctx, ch, x, y, size) {
  ctx.save();
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Decoración del centro según el tema
// ---------------------------------------------------------------------------
function drawCenter(ctx, map, k, S) {
  const L = map.look;
  const c0 = (HALF - INNER) * k;
  const cw = INNER * 2 * k;
  const cx = S / 2;
  const cy = S / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(c0, c0, cw, cw);
  ctx.clip();
  ctx.fillStyle = L.centerBg;
  ctx.fillRect(c0, c0, cw, cw);

  const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

  if (L.style === 'espacio') {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw * 0.7);
    g.addColorStop(0, '#2a1858');
    g.addColorStop(0.45, '#12123a');
    g.addColorStop(1, '#05061a');
    ctx.fillStyle = g;
    ctx.fillRect(c0, c0, cw, cw);
    for (let n = 0; n < 420; n++) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.75})`;
      const r = rnd() * k * 0.025 + 0.6;
      ctx.beginPath(); ctx.arc(c0 + rnd() * cw, c0 + rnd() * cw, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(124,243,255,.25)';
    ctx.lineWidth = k * 0.015;
    for (let r = 1; r <= 4; r++) { ctx.beginPath(); ctx.ellipse(cx, cy, r * k * 1.05, r * k * 1.05, 0, 0, Math.PI * 2); ctx.stroke(); }
  } else if (L.style === 'mundo') {
    // océano con líneas de latitud/longitud y rosa de los vientos
    const g = ctx.createLinearGradient(c0, c0, c0 + cw, c0 + cw);
    g.addColorStop(0, '#2a93cf');
    g.addColorStop(1, '#1667a3');
    ctx.fillStyle = g;
    ctx.fillRect(c0, c0, cw, cw);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = k * 0.012;
    for (let a = -4; a <= 4; a++) {
      ctx.beginPath(); ctx.moveTo(c0, cy + a * k); ctx.lineTo(c0 + cw, cy + a * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + a * k, c0); ctx.lineTo(cx + a * k, c0 + cw); ctx.stroke();
    }
    // continentes estilizados (manchas)
    ctx.fillStyle = 'rgba(126, 204, 120, .55)';
    const blobs = [[-2.6, -2.2, 1.1], [-2.1, 1.6, 0.9], [0.3, -2.6, 0.8], [0.8, 0.4, 0.7], [2.6, -1.2, 1.2], [2.9, 2.5, 0.7], [-0.6, 2.9, 0.5]];
    for (const [bx, bz, br] of blobs) {
      ctx.beginPath();
      for (let a = 0; a <= 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        const rr = br * k * (0.75 + rnd() * 0.45);
        const px = cx + bx * k + Math.cos(t) * rr * 1.3;
        const py = cy + bz * k + Math.sin(t) * rr;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    // rosa de los vientos
    ctx.save();
    ctx.translate(cx + 2.9 * k, cy + 2.9 * k);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let a = 0; a < 4; a++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -0.75 * k); ctx.lineTo(0.13 * k, 0); ctx.lineTo(-0.13 * k, 0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  } else if (L.style === 'europa') {
    // pergamino con un río y calles a tinta
    const g = ctx.createRadialGradient(cx, cy, cw * 0.1, cx, cy, cw * 0.75);
    g.addColorStop(0, '#e6d6ad');
    g.addColorStop(1, '#bfa66f');
    ctx.fillStyle = g;
    ctx.fillRect(c0, c0, cw, cw);
    for (let n = 0; n < 900; n++) {
      ctx.fillStyle = `rgba(90,60,20,${rnd() * 0.06})`;
      ctx.fillRect(c0 + rnd() * cw, c0 + rnd() * cw, rnd() * k * 0.3, rnd() * k * 0.05);
    }
    // calles
    ctx.strokeStyle = 'rgba(70,45,20,.35)';
    ctx.lineWidth = k * 0.02;
    for (let n = 0; n < 26; n++) {
      ctx.beginPath();
      const x1 = c0 + rnd() * cw; const y1 = c0 + rnd() * cw;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + (rnd() - 0.5) * cw * 0.6, y1 + (rnd() - 0.5) * cw * 0.6);
      ctx.stroke();
    }
    // río (Sena / Támesis)
    ctx.strokeStyle = '#6f8fa0';
    ctx.lineWidth = k * 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c0 - k, cy + 1.8 * k);
    ctx.bezierCurveTo(cx - 2 * k, cy - 0.5 * k, cx + 1 * k, cy + 2.6 * k, c0 + cw + k, cy - 1.6 * k);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = k * 0.06;
    ctx.stroke();
    // puente
    ctx.fillStyle = '#8a7a5c';
    ctx.save(); ctx.translate(cx - 0.4 * k, cy + 0.95 * k); ctx.rotate(-0.5);
    ctx.fillRect(-0.12 * k, -0.6 * k, 0.24 * k, 1.2 * k); ctx.restore();
    // marco ornamental
    ctx.strokeStyle = 'rgba(70,45,20,.6)';
    ctx.lineWidth = k * 0.03;
    ctx.strokeRect(c0 + 0.18 * k, c0 + 0.18 * k, cw - 0.36 * k, cw - 0.36 * k);
    ctx.lineWidth = k * 0.012;
    ctx.strokeRect(c0 + 0.26 * k, c0 + 0.26 * k, cw - 0.52 * k, cw - 0.52 * k);
  } else {
    // metrópoli: plano de calles en cuadrícula
    ctx.fillStyle = L.centerBg;
    ctx.fillRect(c0, c0, cw, cw);
    ctx.strokeStyle = 'rgba(27,58,38,.12)';
    ctx.lineWidth = k * 0.12;
    for (let a = -4; a <= 4; a += 1.5) {
      ctx.beginPath(); ctx.moveTo(c0, cy + a * k); ctx.lineTo(c0 + cw, cy + a * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + a * k, c0); ctx.lineTo(cx + a * k, c0 + cw); ctx.stroke();
    }
  }

  // Logo VENDIDO en diagonal (como sello)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  const logoFont = L.style === 'europa' ? L.font : '"Bungee", "Archivo Black", Impact, sans-serif';
  ctx.font = `${Math.round(k * 0.95)}px ${logoFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText('VENDIDO').width;
  const bw = tw + k * 0.7;
  const bh = k * 1.35;
  if (L.style === 'espacio') {
    ctx.shadowColor = L.accent; ctx.shadowBlur = k * 0.35;
    ctx.strokeStyle = L.accent; ctx.lineWidth = k * 0.06;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, k * 0.2); ctx.stroke();
    ctx.fillStyle = '#eafcff';
    ctx.fillText('VENDIDO', 0, k * 0.04);
    ctx.shadowBlur = 0;
  } else if (L.style === 'europa') {
    ctx.fillStyle = '#7a1f1a';
    ctx.beginPath(); ctx.ellipse(0, 0, bw / 2, bh / 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8d2a0'; ctx.lineWidth = k * 0.03;
    ctx.beginPath(); ctx.ellipse(0, 0, bw / 2 - k * 0.12, bh / 1.6 - k * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f4e4bc';
    ctx.fillText('VENDIDO', 0, k * 0.05);
  } else {
    ctx.fillStyle = '#e8333a';
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, k * 0.12); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = k * 0.05;
    roundRect(ctx, -bw / 2 + k * 0.1, -bh / 2 + k * 0.1, bw - k * 0.2, bh - k * 0.2, k * 0.08); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText('VENDIDO', 0, k * 0.06);
  }
  ctx.font = `600 ${Math.round(k * 0.3)}px ${L.font}`;
  ctx.fillStyle = L.style === 'espacio' ? L.accent : L.style === 'europa' ? '#4a2f18' : '#1b1740';
  ctx.fillText(map.name.toUpperCase(), 0, bh / 2 + k * 0.42);
  ctx.restore();

  // Lugares para las cartas
  const deckSpot = (x, y, rot, deck) => {
    ctx.save();
    ctx.translate(cx + x * k, cy + y * k);
    ctx.rotate(rot);
    const w = 1.9 * k; const h = 1.15 * k;
    ctx.setLineDash([k * 0.08, k * 0.06]);
    ctx.lineWidth = k * 0.025;
    ctx.strokeStyle = L.style === 'espacio' ? 'rgba(124,243,255,.6)' : 'rgba(0,0,0,.35)';
    roundRect(ctx, -w / 2, -h / 2, w, h, k * 0.1); ctx.stroke();
    ctx.setLineDash([]);
    emoji(ctx, deck.icon, -w * 0.28, 0, k * 0.5);
    ctx.fillStyle = L.style === 'espacio' ? '#d8f7ff' : L.ink;
    ctx.font = `700 ${Math.round(k * 0.2)}px ${L.font}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const fit = fitText(ctx, deck.name, w * 0.5, 2, Math.round(k * 0.2), Math.round(k * 0.12), 700, L.font);
    drawLines(ctx, fit.lines, -w * 0.05, -(fit.lines.length - 1) * fit.size * 0.55, fit.size * 1.1);
    ctx.restore();
  };
  deckSpot(-1.75, -1.75, -Math.PI / 4 + Math.PI, map.decks.chance);
  deckSpot(1.75, 1.75, -Math.PI / 4, map.decks.chest);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Una casilla (en coordenadas locales: centro en 0,0; "arriba" = hacia el centro)
// ---------------------------------------------------------------------------
function drawTile(ctx, map, t, w, d, k) {
  const L = map.look;
  const font = L.font;
  const cur = map.currency;
  const dark = L.style === 'espacio';
  ctx.fillStyle = L.tileBg;
  ctx.fillRect(-w / 2, -d / 2, w, d);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = L.ink;
  const pad = w * 0.07;
  const inner = w - pad * 2;

  if (t.t === 'prop') {
    const band = d * 0.22;
    ctx.fillStyle = t.color;
    ctx.fillRect(-w / 2, -d / 2, w, band);
    if (dark) {
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(-w / 2, -d / 2 + band - k * 0.015, w, k * 0.015);
    }
    ctx.strokeStyle = L.line;
    ctx.lineWidth = k * 0.012;
    ctx.beginPath(); ctx.moveTo(-w / 2, -d / 2 + band); ctx.lineTo(w / 2, -d / 2 + band); ctx.stroke();
    ctx.fillStyle = L.ink;
    const fit = fitText(ctx, t.name.toUpperCase(), inner, 3, Math.round(k * 0.15), Math.round(k * 0.085), 700, font);
    const lh = fit.size * 1.08;
    drawLines(ctx, fit.lines, 0, -d / 2 + band + k * 0.1 + fit.size / 2, lh);
    emoji(ctx, t.icon, 0, d * 0.13, k * 0.36);
    ctx.font = `700 ${Math.round(k * 0.15)}px ${font}`;
    ctx.fillStyle = L.ink;
    ctx.fillText(`${cur}${t.price}`, 0, d / 2 - k * 0.16);
    return;
  }
  const title = (txt, y, maxLines = 2, size = 0.14) => {
    const fit = fitText(ctx, txt.toUpperCase(), inner, maxLines, Math.round(k * size), Math.round(k * 0.08), 700, font);
    drawLines(ctx, fit.lines, 0, y + fit.size / 2, fit.size * 1.08);
    return fit.lines.length * fit.size * 1.08;
  };
  if (t.t === 'station' || t.t === 'utility') {
    title(t.name, -d / 2 + k * 0.1);
    emoji(ctx, t.icon, 0, d * 0.06, k * 0.5);
    ctx.font = `700 ${Math.round(k * 0.15)}px ${font}`;
    ctx.fillStyle = L.ink;
    ctx.fillText(`${cur}${t.price}`, 0, d / 2 - k * 0.16);
    return;
  }
  if (t.t === 'chance' || t.t === 'chest') {
    title(t.name, -d / 2 + k * 0.12);
    if (t.t === 'chance') {
      ctx.font = `${Math.round(k * 0.75)}px "Bungee", "Archivo Black", Impact, sans-serif`;
      ctx.fillStyle = dark ? L.accent : '#e8333a';
      ctx.fillText('?', 0, d * 0.12);
    } else emoji(ctx, t.icon, 0, d * 0.1, k * 0.55);
    return;
  }
  if (t.t === 'tax') {
    title(t.name, -d / 2 + k * 0.1);
    emoji(ctx, t.icon, 0, d * 0.05, k * 0.42);
    ctx.font = `700 ${Math.round(k * 0.13)}px ${font}`;
    ctx.fillStyle = L.ink;
    ctx.fillText(`Paga ${cur}${t.amount}`, 0, d / 2 - k * 0.16);
  }
}

function drawCorner(ctx, map, t, size, k) {
  const L = map.look;
  ctx.fillStyle = L.tileBg;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.save();
  if (t.t === 'jail') {
    const cell = size * 0.62;
    ctx.fillStyle = L.style === 'espacio' ? '#2a2f6b' : L.style === 'europa' ? '#7b6b55' : '#f2b233';
    // la celda está en la esquina interior: en coordenadas locales (sin rotar) es arriba-derecha
    ctx.fillRect(size / 2 - cell, -size / 2, cell, cell);
    ctx.strokeStyle = L.ink; ctx.lineWidth = k * 0.02;
    ctx.strokeRect(size / 2 - cell, -size / 2, cell, cell);
    ctx.strokeStyle = L.style === 'espacio' ? '#9aa6ff' : '#2b2b2b';
    ctx.lineWidth = k * 0.025;
    for (let b = 1; b < 5; b++) {
      const x = size / 2 - cell + (cell * b) / 5;
      ctx.beginPath(); ctx.moveTo(x, -size / 2); ctx.lineTo(x, -size / 2 + cell); ctx.stroke();
    }
    ctx.save();
    ctx.translate(size / 2 - cell / 2, -size / 2 + cell / 2);
    ctx.rotate(Math.PI / 4);
    emoji(ctx, t.icon, 0, -k * 0.05, k * 0.36);
    ctx.fillStyle = L.style === 'espacio' ? '#fff' : '#1b1740';
    ctx.font = `700 ${Math.round(k * 0.12)}px ${L.font}`;
    ctx.textAlign = 'center';
    const fit = fitText(ctx, t.name.toUpperCase(), cell * 0.9, 2, Math.round(k * 0.12), Math.round(k * 0.08), 700, L.font);
    drawLines(ctx, fit.lines, 0, k * 0.24, fit.size * 1.05);
    ctx.restore();
    // "solo de visita" en los bordes
    ctx.fillStyle = L.ink;
    ctx.font = `700 ${Math.round(k * 0.12)}px ${L.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DE VISITA', -size / 2 + (size - cell) / 2, size / 2 - (size - cell) / 2 - k * 0.02);
    ctx.restore();
    return;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = L.ink;
  // rotar 45° para que el texto vaya en diagonal
  ctx.rotate(Math.PI / 4);
  emoji(ctx, t.icon, 0, -k * 0.05, k * 0.55);
  const fit = fitText(ctx, t.name.toUpperCase(), size * 1.05, 2, Math.round(k * 0.17), Math.round(k * 0.1), 800, L.font);
  ctx.fillStyle = t.t === 'go' ? (L.style === 'espacio' ? L.accent : '#e8333a') : L.ink;
  drawLines(ctx, fit.lines, 0, -k * 0.55 - (fit.lines.length - 1) * fit.size * 0.5, fit.size * 1.05);
  ctx.fillStyle = L.ink;
  ctx.font = `600 ${Math.round(k * 0.1)}px ${L.font}`;
  ctx.fillText(t.sub || '', 0, k * 0.42);
  if (t.t === 'go') {
    ctx.font = `${Math.round(k * 0.4)}px "Bungee", Impact, sans-serif`;
    ctx.fillStyle = L.style === 'espacio' ? L.accent : '#e8333a';
    ctx.fillText('←', 0, k * 0.62);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
export function drawBoard(map, S = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const k = S / (HALF * 2);
  const L = map.look;
  ctx.fillStyle = L.boardBg;
  ctx.fillRect(0, 0, S, S);
  drawCenter(ctx, map, k, S);
  for (const t of map.tiles) {
    const r = tileRect(t.i);
    ctx.save();
    ctx.translate((r.x + HALF) * k, (r.z + HALF) * k);
    if (r.side === -1) {
      // esquinas: orientar para que el lado "interior" sea arriba-derecha en coordenadas locales
      const base = { 0: -Math.PI / 2, 10: 0, 20: Math.PI / 2, 30: Math.PI }[t.i];
      ctx.rotate(base);
      drawCorner(ctx, map, t, r.w * k, k);
    } else {
      ctx.rotate(r.rot);
      drawTile(ctx, map, t, r.w * k, r.d * k, k);
    }
    ctx.restore();
  }
  // líneas de división
  ctx.strokeStyle = L.line;
  ctx.lineWidth = k * 0.02;
  for (const t of map.tiles) {
    const r = tileRect(t.i);
    const hw = (r.side === 1 || r.side === 3 ? r.d : r.w) / 2;
    const hd = (r.side === 1 || r.side === 3 ? r.w : r.d) / 2;
    ctx.strokeRect((r.x - hw + HALF) * k, (r.z - hd + HALF) * k, hw * 2 * k, hd * 2 * k);
  }
  ctx.lineWidth = k * 0.05;
  ctx.strokeRect(k * 0.025, k * 0.025, S - k * 0.05, S - k * 0.05);
  ctx.strokeRect((HALF - INNER) * k, (HALF - INNER) * k, INNER * 2 * k, INNER * 2 * k);
  return canvas;
}
