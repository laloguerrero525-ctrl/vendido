// Utilidades de interfaz
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function fmt(n, cur = '$') {
  const v = Math.round(n || 0);
  return (v < 0 ? '−' : '') + cur + Math.abs(v).toLocaleString('es-MX');
}
export function toast(text, kind = '', ms = 2800) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms);
}
export function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* */ } }
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
export function store(key, val) {
  try {
    if (val === undefined) { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch { /* almacenamiento no disponible */ }
  return null;
}
export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
// contraste: texto blanco u oscuro según el color de fondo
export function onColor(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16); const g = parseInt(h.slice(2, 4), 16); const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1b1740' : '#ffffff';
}
