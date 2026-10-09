// Efectos de sonido sintetizados (sin archivos de audio).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('vendido.mute') === '1'; } catch { /* */ }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function unlockAudio() { ac(); }
export function isMuted() { return muted; }
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('vendido.mute', v ? '1' : '0'); } catch { /* */ }
}

function tone(freq, dur, { type = 'sine', vol = 0.18, at = 0, slide = 0 } = {}) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
function noise(dur, { vol = 0.15, at = 0, hp = 800 } = {}) {
  const a = ac();
  if (!a || muted) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(a.currentTime + at);
}

export const sfx = {
  dice() { for (let k = 0; k < 5; k++) noise(0.05, { vol: 0.2, at: k * 0.09 + Math.random() * 0.03, hp: 1500 }); },
  step() { tone(520 + Math.random() * 60, 0.05, { type: 'triangle', vol: 0.06 }); },
  coin() { tone(988, 0.08, { type: 'square', vol: 0.07 }); tone(1319, 0.22, { type: 'square', vol: 0.07, at: 0.08 }); },
  pay() { tone(330, 0.12, { type: 'triangle', vol: 0.12 }); tone(247, 0.2, { type: 'triangle', vol: 0.12, at: 0.1 }); },
  sold() { noise(0.12, { vol: 0.35, hp: 200 }); tone(110, 0.25, { type: 'sine', vol: 0.35, slide: -50 }); },
  card() { noise(0.18, { vol: 0.1, hp: 3000 }); tone(660, 0.1, { type: 'sine', vol: 0.08, at: 0.12 }); },
  turn() { tone(660, 0.1, { type: 'sine', vol: 0.15 }); tone(880, 0.18, { type: 'sine', vol: 0.15, at: 0.1 }); },
  build() { tone(392, 0.07, { type: 'square', vol: 0.06 }); tone(523, 0.07, { type: 'square', vol: 0.06, at: 0.07 }); tone(659, 0.12, { type: 'square', vol: 0.06, at: 0.14 }); },
  bid() { tone(740, 0.06, { type: 'triangle', vol: 0.1 }); },
  jail() { tone(196, 0.3, { type: 'sawtooth', vol: 0.08 }); tone(147, 0.4, { type: 'sawtooth', vol: 0.08, at: 0.25 }); },
  train() { for (let k = 0; k < 2; k++) { tone(587, 0.25, { type: 'triangle', vol: 0.09, at: k * 0.3 }); tone(740, 0.25, { type: 'triangle', vol: 0.07, at: k * 0.3 }); } },
  win() { [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.3, { type: 'triangle', vol: 0.14, at: k * 0.13 })); },
  bad() { tone(220, 0.3, { type: 'sawtooth', vol: 0.08, slide: -80 }); },
};
