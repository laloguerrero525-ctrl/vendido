// VENDIDO — tablero en 3D (Three.js). Vista 2D desde arriba y 3D libre tipo mapa.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { drawBoard } from './boardTexture.js';
import { HALF, tileRect, tileAt, tokenSpot, houseSpot } from './geometry.js';

const SLAB = 0.32;
const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  bounce: (t) => {
    const n1 = 7.5625; const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
let LOW = false;
try { LOW = new URLSearchParams(location.search).has('lowgfx') || localStorage.getItem('vendido.gfx') === 'bajo'; } catch { /* */ }
export const lowGraphics = LOW;

function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

function labelSprite(text, bg, fg = '#fff') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const fs = 44;
  ctx.font = `800 ${fs}px "Bricolage Grotesque", system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w; c.height = 70;
  ctx.font = `800 ${fs}px "Bricolage Grotesque", system-ui, sans-serif`;
  ctx.fillStyle = bg;
  const r = 30;
  ctx.beginPath();
  ctx.moveTo(r, 4); ctx.arcTo(w - 2, 4, w - 2, 66, r); ctx.arcTo(w - 2, 66, 2, 66, r); ctx.arcTo(2, 66, 2, 4, r); ctx.arcTo(2, 4, w, 4, r); ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 37);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const s = new THREE.Sprite(mat);
  const h = 0.24;
  s.scale.set((h * w) / 70, h, 1);
  s.renderOrder = 10;
  return s;
}

function diceMaterials() {
  const pips = { 1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], 4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]], 6: [[0.27, 0.24], [0.73, 0.24], [0.27, 0.5], [0.73, 0.5], [0.27, 0.76], [0.73, 0.76]] };
  const face = (n) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fbfbf8'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = n === 1 ? '#e8333a' : '#1b1740';
    for (const [x, y] of pips[n]) { ctx.beginPath(); ctx.arc(x * 128, y * 128, n === 1 ? 17 : 12, 0, Math.PI * 2); ctx.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 });
  };
  // orden de caras de BoxGeometry: +x, -x, +y, -y, +z, -z
  return [face(3), face(4), face(1), face(6), face(2), face(5)];
}
const DICE_UP = {
  1: new THREE.Euler(0, 0, 0), 6: new THREE.Euler(Math.PI, 0, 0), 2: new THREE.Euler(-Math.PI / 2, 0, 0),
  5: new THREE.Euler(Math.PI / 2, 0, 0), 3: new THREE.Euler(0, 0, Math.PI / 2), 4: new THREE.Euler(0, 0, -Math.PI / 2),
};

export class Board3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(LOW ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !LOW;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.persp = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.ortho = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 400);
    this.view = '3d';
    this.rot2d = 0;
    this.insets = { top: 0, bottom: 0 };
    this.tweens = [];
    this.tokens = new Map();
    this.buildings = new Map();
    this.ownerBars = new Map();
    this.mortgageMarks = new Map();
    this.highlights = [];
    this.ambient = [];
    this.idle = false;
    this.map = null;
    this.state = null;
    this.onTileTap = null;
    this.speed = 1;
    this.clock = new THREE.Clock();

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.decor = new THREE.Group();
    this.scene.add(this.decor);
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(6, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);

    // dados
    const dm = diceMaterials();
    const dg = new RoundedBoxGeometry(0.42, 0.42, 0.42, 4, 0.07);
    this.dice = [new THREE.Mesh(dg, dm), new THREE.Mesh(dg, dm)];
    this.dice.forEach((d, k) => { d.castShadow = true; d.position.set(-0.35 + k * 0.7, 0.21, 0.6); this.dynamic.add(d); });
    this.dice[0].quaternion.setFromEuler(DICE_UP[5]);
    this.dice[1].quaternion.setFromEuler(DICE_UP[2]);

    // anillo del turno
    this.turnRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 40), new THREE.MeshBasicMaterial({ color: 0xffc531, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnRing.visible = false;
    this.dynamic.add(this.turnRing);

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.setupInput();
    this.setupControls();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ cámara
  get camera() { return this.view === '2d' ? this.ortho : this.persp; }
  setupControls() {
    if (this.controls) { this.controls.dispose(); }
    const cam = this.camera;
    if (this.view === '2d') {
      const a = (this.rot2d * Math.PI) / 2;
      cam.up.set(Math.sin(a), 0, -Math.cos(a));
      cam.position.set(0, 40, 0);
      cam.zoom = 1;
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
    } else {
      cam.up.set(0, 1, 0);
      if (!this.perspInit) {
        cam.position.set(0, 12.5, 12.5);
        this.perspInit = true;
        this.needFit = true;
      }
    }
    const c = new MapControls(cam, this.canvas);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.screenSpacePanning = this.view === '2d';
    c.zoomSpeed = 1.1;
    if (this.view === '2d') {
      c.enableRotate = false;
      c.minZoom = 0.8;
      c.maxZoom = 6;
      c.target.set(0, 0, 0);
    } else {
      c.minDistance = 3.5;
      c.maxDistance = 34;
      c.maxPolarAngle = Math.PI * 0.46;
      c.target.copy(this.perspTarget || new THREE.Vector3(0, 0, 0));
    }
    c.addEventListener('start', () => { this.userMoving = true; this.userAdjusted = true; });
    c.addEventListener('end', () => { this.userMoving = false; });
    c.update();
    this.controls = c;
  }
  setView(v) {
    if (v === this.view) return;
    if (this.view === '3d') this.perspTarget = this.controls.target.clone();
    this.view = v;
    this.setupControls();
    this.resize();
  }
  rotate2d() {
    this.rot2d = (this.rot2d + 1) % 4;
    if (this.view === '2d') { this.setupControls(); this.resize(); }
    else {
      // en 3D: girar la cámara 90° alrededor del centro
      const c = this.controls;
      const off = this.persp.position.clone().sub(c.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      const to = c.target.clone().add(off);
      const from = this.persp.position.clone();
      this.tween(500, (t) => { this.persp.position.lerpVectors(from, to, t); }, ease.inOut);
    }
  }
  // distancia de cámara para que el tablero completo quepa en el área visible
  fitDistance() {
    const vf = THREE.MathUtils.degToRad(this.persp.fov) / 2;
    const frac = this.visibleFrac || 1;
    const tv = Math.tan(vf) * frac;
    const th = Math.tan(vf) * this.persp.aspect;
    const R = 7.0;
    return Math.min(60, Math.max((R * 0.92) / tv, (R * 1.05) / th));
  }
  homePosition() {
    const a = (this.rot2d * Math.PI) / 2;
    const d = this.fitDistance();
    const el = 0.92; // ~53° de inclinación
    return new THREE.Vector3(-Math.sin(a) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(a) * Math.cos(el) * d);
  }
  resetView(animate = true) {
    this.userAdjusted = false;
    if (this.view === '2d') { this.setupControls(); this.resize(); return; }
    const c = this.controls;
    const fromP = this.persp.position.clone();
    const fromT = c.target.clone();
    const toP = this.homePosition();
    if (!animate) { this.persp.position.copy(toP); c.target.set(0, 0, 0); c.update(); return; }
    this.tween(600, (t) => {
      this.persp.position.lerpVectors(fromP, toP, t);
      c.target.lerpVectors(fromT, new THREE.Vector3(0, 0, 0), t);
    }, ease.inOut);
  }
  focusTile(i) {
    if (this.view === '2d' || !this.controls) return;
    const r = tileRect(i);
    const c = this.controls;
    const fromT = c.target.clone();
    const toT = new THREE.Vector3(r.x * 0.55, 0, r.z * 0.55);
    const delta = toT.clone().sub(fromT);
    const fromP = this.persp.position.clone();
    this.tween(700, (t) => {
      c.target.copy(fromT).addScaledVector(delta, t);
      this.persp.position.copy(fromP).addScaledVector(delta, t);
    }, ease.inOut);
  }
  setInsets(top, bottom) {
    this.insets = { top: Math.max(0, top), bottom: Math.max(0, bottom) };
    this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const { top, bottom } = this.insets;
    const shift = Math.max(0, bottom - top);
    const fullH = h + shift;
    const aspect = w / fullH;
    this.persp.aspect = aspect;
    // en vertical, alejar un poco más para que quepa el tablero
    this.persp.fov = aspect < 0.8 ? 50 : 42;
    const visible = h - top - bottom;
    const half = 7.0;
    const visAspect = w / Math.max(100, visible);
    let hw; let hh;
    if (visAspect >= 1) { hh = half * (fullH / Math.max(100, visible)); hw = hh * aspect; } else { hw = half; hh = hw / aspect; }
    this.ortho.left = -hw; this.ortho.right = hw; this.ortho.top = hh; this.ortho.bottom = -hh;
    for (const cam of [this.persp, this.ortho]) {
      if (shift > 0) cam.setViewOffset(w, fullH, 0, shift, w, h);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }
    this.visibleFrac = Math.max(100, visible) / fullH;
    if (this.view === '3d' && this.controls && (!this.userAdjusted || this.needFit)) {
      this.needFit = false;
      this.resetView(false);
    }
  }

  // ------------------------------------------------------------------ entrada
  setupInput() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved > 8 || dt > 600) return;
      const i = this.pick(e.clientX, e.clientY);
      if (i >= 0 && this.onTileTap) this.onTileTap(i);
    });
  }
  pick(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, p)) return -1;
    return tileAt(p.x, p.z);
  }

  // ------------------------------------------------------------------ animación
  tween(ms, fn, e = ease.linear) {
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now(), ms: Math.max(1, ms / this.speed), fn, e, resolve });
    });
  }
  wait(ms) { return this.tween(ms, () => {}); }
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.tweens.length) {
      const done = [];
      for (const tw of this.tweens) {
        const t = Math.min(1, (now - tw.start) / tw.ms);
        tw.fn(tw.e(t));
        if (t >= 1) done.push(tw);
      }
      if (done.length) {
        this.tweens = this.tweens.filter((x) => !done.includes(x));
        done.forEach((d) => d.resolve());
      }
    }
    for (const a of this.ambient) a(dt, now / 1000);
    if (this.turnRing.visible) {
      const s = 1 + Math.sin(now / 260) * 0.12;
      this.turnRing.scale.set(s, s, s);
    }
    for (const h of this.highlights) h.material.opacity = 0.28 + Math.sin(now / 200) * 0.18;
    if (this.idle && this.view === '3d' && !this.userMoving) {
      const off = this.persp.position.clone().sub(this.controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.08);
      this.persp.position.copy(this.controls.target).add(off);
    }
    this.controls.update();
    if (this.scene.fog) {
      const d = this.view === '2d' ? 40 : this.persp.position.distanceTo(this.controls.target);
      this.scene.fog.near = d * 0.95;
      this.scene.fog.far = d * 2.6 + 10;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ mapa
  setMap(map) {
    if (this.map && this.map.id === map.id) return;
    this.map = map;
    const L = map.look;
    // limpiar
    for (const g of [this.root, this.decor]) {
      while (g.children.length) {
        const c = g.children.pop();
        c.traverse?.((o) => { o.geometry?.dispose?.(); });
      }
    }
    this.ambient = [];
    this.clearPieces();

    // textura del tablero
    const max = this.renderer.capabilities.maxTextureSize;
    const S = !isMobile && !LOW && max >= 4096 ? 4096 : 2048;
    const tex = new THREE.CanvasTexture(drawBoard(map, S));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.boardTexture = tex;
    // cuando terminen de cargar las tipografías del tema, volver a dibujar las casillas
    if (document.fonts && document.fonts.load) {
      const fam = (L.font.match(/"([^"]+)"/) || [])[1];
      const loads = [document.fonts.load('400 40px "Bungee"'), fam ? document.fonts.load(`700 40px "${fam}"`) : null].filter(Boolean);
      Promise.all(loads).then(() => document.fonts.ready).then(() => {
        if (this.map !== map || tex !== this.boardTexture) return;
        tex.image = drawBoard(map, S);
        tex.needsUpdate = true;
      }).catch(() => {});
    }
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(L.line).multiplyScalar(0.8), roughness: 0.7 });
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: L.style === 'espacio' ? 0.55 : 0.85, metalness: 0.0 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, SLAB, HALF * 2), [side, side, top, side, side, side]);
    board.position.y = -SLAB / 2;
    board.receiveShadow = true;
    board.castShadow = true;
    this.root.add(board);

    // cielo
    const sky = document.createElement('canvas');
    sky.width = 4; sky.height = 256;
    const sctx = sky.getContext('2d');
    const gr = sctx.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, L.sky[0]); gr.addColorStop(1, L.sky[1]);
    sctx.fillStyle = gr; sctx.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.fog = L.fog ? new THREE.Fog(L.fog, 30, 90) : null;

    const builders = { metropoli: () => this.decorCity(), mundo: () => this.decorWorld(), espacio: () => this.decorSpace(), europa: () => this.decorEurope() };
    (builders[L.style] || builders.metropoli)();
    if (this.state) this.sync(this.state, true);
  }

  ground(color, size = 90, rough = 1) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -SLAB - 0.02;
    g.receiveShadow = true;
    this.decor.add(g);
    return g;
  }
  instanced(geo, mat, items, castShadow = true) {
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    const o = new THREE.Object3D();
    items.forEach((it, k) => {
      o.position.set(it.x, it.y ?? 0, it.z);
      o.rotation.set(0, it.ry || 0, 0);
      o.scale.set(it.sx || 1, it.sy || 1, it.sz || 1);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
      if (it.color) m.setColorAt(k, new THREE.Color(it.color));
    });
    m.castShadow = castShadow;
    m.receiveShadow = true;
    this.decor.add(m);
    return m;
  }
  ringPositions(rnd, n, rMin, rMax) {
    const out = [];
    for (let k = 0; k < n * 3 && out.length < n; k++) {
      const x = (rnd() * 2 - 1) * rMax;
      const z = (rnd() * 2 - 1) * rMax;
      if (Math.max(Math.abs(x), Math.abs(z)) < rMin) continue;
      out.push({ x, z });
    }
    return out;
  }

  decorCity() {
    this.hemi.color.set('#dfefff'); this.hemi.groundColor.set('#6b8f6b'); this.hemi.intensity = 1.25;
    this.sun.color.set('#fff3dc'); this.sun.intensity = 2.3;
    this.ground('#9cbf8f');
    // calles alrededor del tablero
    const road = new THREE.Mesh(new THREE.RingGeometry(0, 1, 4), new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.95 }));
    road.geometry = new THREE.PlaneGeometry(HALF * 2 + 2.2, HALF * 2 + 2.2);
    road.rotation.x = -Math.PI / 2;
    road.position.y = -SLAB - 0.01;
    road.receiveShadow = true;
    this.decor.add(road);
    const rnd = seeded(11);
    const blocks = this.ringPositions(rnd, isMobile || LOW ? 70 : 160, 8, 30).map((p) => {
      const d = Math.max(Math.abs(p.x), Math.abs(p.z));
      const h = (0.8 + rnd() * 3.5) * (d < 14 ? 1.4 : 1);
      const palette = ['#d9d4c7', '#c2cbd6', '#a9b6c4', '#e3d5b8', '#8e9aa8', '#f0e9dc', '#b9c7b0'];
      return { x: p.x, z: p.z, y: h / 2 - SLAB, sx: 1 + rnd() * 1.4, sy: h, sz: 1 + rnd() * 1.4, color: palette[Math.floor(rnd() * palette.length)] };
    });
    this.instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), blocks);
    // ventanas (puntitos claros en edificios altos) — simplificado con árboles
    const trees = this.ringPositions(rnd, 60, 7.2, 22).map((p) => ({ x: p.x, z: p.z, y: 0.4 - SLAB, sx: 0.5, sy: 0.8, sz: 0.5 }));
    this.instanced(new THREE.ConeGeometry(0.6, 1.2, 7), new THREE.MeshStandardMaterial({ color: '#2f7d46', roughness: 0.9 }), trees);
    // mini rascacielos en el centro
    const sky = [];
    for (let k = 0; k < 7; k++) {
      const h = 0.4 + rnd() * 1.4;
      sky.push({ x: 2.55 + (k % 3) * 0.42, z: -3.55 + Math.floor(k / 3) * 0.44, y: h / 2, sx: 0.36, sy: h, sz: 0.36, color: ['#5b8bd6', '#7aa7e8', '#a8c4f0', '#3d6bb8'][k % 4] });
    }
    this.instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.4 }), sky);
    // parque con fuente
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.12, 24), new THREE.MeshStandardMaterial({ color: '#d7d2c4' }));
    fountain.position.set(-3.1, 0.06, 3.1);
    fountain.castShadow = true;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 24), new THREE.MeshStandardMaterial({ color: '#5ab8e8', roughness: 0.1 }));
    water.position.set(-3.1, 0.125, 3.1);
    this.decor.add(fountain, water);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.4, 8), new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.7 }));
    jet.position.set(-3.1, 0.32, 3.1);
    this.decor.add(jet);
    this.ambient.push((dt, t) => { jet.scale.y = 0.8 + Math.sin(t * 6) * 0.2; });
  }

  decorWorld() {
    this.hemi.color.set('#e8f6ff'); this.hemi.groundColor.set('#2a6f9a'); this.hemi.intensity = 1.3;
    this.sun.color.set('#fff7e6'); this.sun.intensity = 2.4;
    // océano con oleaje suave
    const seaGeo = new THREE.PlaneGeometry(120, 120, 60, 60);
    const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: '#2b8fd0', roughness: 0.35, metalness: 0.1, flatShading: true }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -SLAB - 0.15;
    sea.receiveShadow = true;
    this.decor.add(sea);
    const pos = seaGeo.attributes.position;
    const base = Float32Array.from(pos.array);
    let acc = 0;
    this.ambient.push((dt, t) => {
      acc += dt;
      if (acc < 1 / 20) return;
      acc = 0;
      for (let k = 0; k < pos.count; k++) {
        const x = base[k * 3]; const y = base[k * 3 + 1];
        pos.array[k * 3 + 2] = Math.sin(x * 0.35 + t * 1.2) * 0.12 + Math.cos(y * 0.3 + t) * 0.1;
      }
      pos.needsUpdate = true;
    });
    // isla bajo el tablero
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 0.4, 48), new THREE.MeshStandardMaterial({ color: '#f1dca7', roughness: 1 }));
    sand.position.y = -SLAB - 0.2;
    sand.receiveShadow = true;
    this.decor.add(sand);
    const rnd = seeded(5);
    const palms = this.ringPositions(rnd, 26, 7.3, 9.8).map((p) => ({ x: p.x, z: p.z, y: 0.5 - SLAB, sx: 1, sy: 1, sz: 1 }));
    this.instanced(new THREE.CylinderGeometry(0.05, 0.08, 1, 6), new THREE.MeshStandardMaterial({ color: '#8b5a2b' }), palms);
    this.instanced(new THREE.ConeGeometry(0.55, 0.35, 6), new THREE.MeshStandardMaterial({ color: '#2fae62' }), palms.map((p) => ({ ...p, y: 1.05 - SLAB })));
    // globo terráqueo girando
    const gc = document.createElement('canvas');
    gc.width = 512; gc.height = 256;
    const g = gc.getContext('2d');
    g.fillStyle = '#2a7fc0'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#6cc070';
    const lands = [[90, 80, 60, 45], [130, 170, 35, 55], [250, 70, 40, 30], [270, 150, 40, 55], [360, 80, 80, 45], [420, 180, 30, 20]];
    for (const [x, y, rx, ry] of lands) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(0, (k * 256) / 6); g.lineTo(512, (k * 256) / 6); g.stroke(); }
    const gt = new THREE.CanvasTexture(gc);
    gt.colorSpace = THREE.SRGBColorSpace;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.75, 40, 24), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.5 }));
    globe.position.set(3.0, 1.25, -3.0);
    globe.castShadow = true;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.3, 0.5, 12), new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.6, roughness: 0.3 }));
    stand.position.set(3.0, 0.25, -3.0);
    stand.castShadow = true;
    this.decor.add(globe, stand);
    // avión dando vueltas
    const plane = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    body.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.6), new THREE.MeshStandardMaterial({ color: '#e8333a' }));
    plane.add(body, wing);
    plane.traverse((o) => { o.castShadow = true; });
    this.decor.add(plane);
    this.ambient.push((dt, t) => {
      globe.rotation.y += dt * 0.3;
      const a = t * 0.25;
      plane.position.set(Math.cos(a) * 8.5, 2.6 + Math.sin(t) * 0.2, Math.sin(a) * 8.5);
      plane.rotation.y = -a;
    });
  }

  decorSpace() {
    this.hemi.color.set('#8a8cff'); this.hemi.groundColor.set('#120a30'); this.hemi.intensity = 0.7;
    this.sun.color.set('#cfd8ff'); this.sun.intensity = 1.3;
    // estrellas
    const rnd = seeded(3);
    const n = isMobile || LOW ? 1200 : 3000;
    const pts = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const u = rnd() * 2 - 1; const th = rnd() * Math.PI * 2; const r = 60 + rnd() * 60;
      const s = Math.sqrt(1 - u * u);
      pts[k * 3] = r * s * Math.cos(th); pts[k * 3 + 1] = r * u; pts[k * 3 + 2] = r * s * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, sizeAttenuation: true, fog: false }));
    this.decor.add(stars);
    // borde luminoso del tablero
    const edge = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.12, 0.06, HALF * 2 + 0.12), new THREE.MeshBasicMaterial({ color: '#7cf3ff' }));
    edge.position.y = -SLAB - 0.03;
    this.decor.add(edge);
    // sol con planetas
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20), new THREE.MeshBasicMaterial({ color: '#ffcf5a' }));
    sun.position.set(2.9, 1.5, -2.9);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 20), new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.25 }));
    glow.position.copy(sun.position);
    const light = new THREE.PointLight('#ffb347', 6, 9, 1.4);
    light.position.copy(sun.position);
    this.decor.add(sun, glow, light);
    const planets = [
      { r: 0.85, size: 0.09, color: '#9ad1ff', speed: 1.2 },
      { r: 1.15, size: 0.12, color: '#ff7a59', speed: 0.8 },
      { r: 1.45, size: 0.1, color: '#7cf3a0', speed: 0.55 },
    ].map((p) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.size, 20, 14), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.6 }));
      m.castShadow = true;
      const orbit = new THREE.Mesh(new THREE.RingGeometry(p.r - 0.005, p.r + 0.005, 64), new THREE.MeshBasicMaterial({ color: '#7cf3ff', transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
      orbit.rotation.x = -Math.PI / 2;
      orbit.position.copy(sun.position);
      this.decor.add(m, orbit);
      return { ...p, m, a: Math.random() * 6 };
    });
    // planeta con anillos
    const sat = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 20), new THREE.MeshStandardMaterial({ color: '#e6c98f', roughness: 0.7 }));
    sat.position.set(-3.0, 1.0, 3.0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.74, 48), new THREE.MeshStandardMaterial({ color: '#d9b97a', side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.position.copy(sat.position);
    ring.rotation.x = -Math.PI / 2.6;
    sat.castShadow = true;
    this.decor.add(sat, ring);
    // asteroides alrededor
    const rocks = this.ringPositions(rnd, 70, 8, 20).map((p) => ({ x: p.x, z: p.z, y: (rnd() - 0.5) * 4, sx: 0.2 + rnd() * 0.5, sy: 0.2 + rnd() * 0.4, sz: 0.2 + rnd() * 0.5, ry: rnd() * 6 }));
    const rockMesh = this.instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#6c6a7a', roughness: 1, flatShading: true }), rocks, false);
    this.ambient.push((dt) => {
      planets.forEach((p) => { p.a += dt * p.speed; p.m.position.set(sun.position.x + Math.cos(p.a) * p.r, sun.position.y, sun.position.z + Math.sin(p.a) * p.r); });
      sat.rotation.y += dt * 0.2;
      glow.scale.setScalar(1 + Math.sin(performance.now() / 500) * 0.05);
      stars.rotation.y += dt * 0.005;
      rockMesh.rotation.y += dt * 0.01;
    });
  }

  decorEurope() {
    this.hemi.color.set('#f2e3c4'); this.hemi.groundColor.set('#5b4a36'); this.hemi.intensity = 1.0;
    this.sun.color.set('#ffd9a0'); this.sun.intensity = 2.0;
    this.sun.position.set(-9, 9, 6);
    this.ground('#7d7466', 140);
    // empedrado alrededor
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 2.6, HALF * 2 + 2.6), new THREE.MeshStandardMaterial({ color: '#9b9183', roughness: 1 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = -SLAB - 0.01;
    plaza.receiveShadow = true;
    this.decor.add(plaza);
    // casas con techos de dos aguas (ciudad alrededor)
    const rnd = seeded(17);
    const houses = this.ringPositions(rnd, isMobile || LOW ? 80 : 190, 8.2, 30).map((p) => {
      const h = 1 + rnd() * 1.8;
      const palette = ['#e8dcc2', '#d8c7a3', '#cdb894', '#efe6d2', '#c9b18a'];
      return { x: p.x, z: p.z, y: h / 2 - SLAB, sx: 1 + rnd() * 0.8, sy: h, sz: 1.1 + rnd(), ry: Math.round(rnd()) * Math.PI / 2, color: palette[Math.floor(rnd() * palette.length)], h };
    });
    this.instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }), houses);
    const roofGeo = new THREE.ConeGeometry(0.75, 0.7, 4);
    roofGeo.rotateY(Math.PI / 4);
    this.instanced(roofGeo, new THREE.MeshStandardMaterial({ color: '#5a3a2a', roughness: 0.9 }), houses.map((p) => ({ ...p, y: p.h - SLAB + 0.35, sy: 1, sx: p.sx * 1.3, sz: p.sz * 1.3, color: rnd() > 0.5 ? '#5a3a2a' : '#4a4e56' })));
    // torre del reloj / catedral en el centro
    const stone = new THREE.MeshStandardMaterial({ color: '#cbbd9e', roughness: 0.95 });
    const tower = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), stone);
    base.position.y = 0.8;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#3d4a5c', roughness: 0.6, metalness: 0.3 }));
    top.position.y = 2.05; top.rotation.y = Math.PI / 4;
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), new THREE.MeshStandardMaterial({ color: '#f4e4bc' }));
    clock.position.set(0, 1.25, 0.301);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.01), new THREE.MeshStandardMaterial({ color: '#2b1d10' }));
    hand.position.set(0, 1.25, 0.31);
    hand.geometry.translate(0, 0.06, 0);
    tower.add(base, top, clock, hand);
    tower.position.set(3.0, 0, -3.0);
    tower.traverse((o) => { o.castShadow = true; });
    this.decor.add(tower);
    // faroles con luz cálida
    for (const [x, z] of [[-7, 7], [7, 7], [-7, -7], [7, -7], [0, 7.2], [0, -7.2]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#222' }));
      pole.position.set(x, 0.8 - SLAB, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
      lamp.position.set(x, 1.62 - SLAB, z);
      const pl = new THREE.PointLight('#ffb54a', 2, 4, 1.5);
      pl.position.set(x, 1.6 - SLAB, z);
      pole.castShadow = true;
      this.decor.add(pole, lamp, pl);
    }
    this.ambient.push((dt) => { hand.rotation.z -= dt * 0.5; });
  }

  // ------------------------------------------------------------------ piezas
  clearPieces() {
    for (const t of this.tokens.values()) this.dynamic.remove(t.group);
    this.tokens.clear();
    for (const b of this.buildings.values()) this.dynamic.remove(b.group);
    this.buildings.clear();
    for (const m of this.ownerBars.values()) this.dynamic.remove(m);
    this.ownerBars.clear();
    for (const m of this.mortgageMarks.values()) this.dynamic.remove(m);
    this.mortgageMarks.clear();
    this.setHighlights([]);
    this.turnRing.visible = false;
  }

  makeToken(p) {
    const g = new THREE.Group();
    const pts = [[0, 0], [0.16, 0], [0.17, 0.035], [0.12, 0.07], [0.075, 0.13], [0.06, 0.24], [0.1, 0.28], [0.1, 0.3], [0.06, 0.32], [0, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
    const style = this.map?.look.style;
    const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.3, metalness: 0.25, emissive: style === 'espacio' ? new THREE.Color(p.color).multiplyScalar(0.35) : 0x000000 });
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), mat);
    head.position.y = 0.39;
    body.castShadow = true; head.castShadow = true;
    g.add(body, head);
    const label = labelSprite(p.name, p.color);
    label.position.y = 0.72;
    g.add(label);
    g.userData.label = label;
    this.dynamic.add(g);
    return { group: g, pid: p.id, busy: false };
  }

  makeBuilding(kind, owner) {
    const st = this.map.look.style;
    const g = new THREE.Group();
    const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
    if (st === 'espacio') {
      if (kind === 'house') {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M('#7cf3ff', { emissive: '#1c6c80', transparent: true, opacity: 0.9 }));
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), M('#c8d0ff'));
        b.position.y = 0.015; d.position.y = 0.03;
        g.add(b, d);
      } else {
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), M('#ff5fb7', { emissive: '#7a1050' }));
        core.position.y = 0.2;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 30), M('#e8ecff', { metalness: 0.6 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.2, 8), M('#c8d0ff'));
        leg.position.y = 0.1;
        g.add(core, ring, leg);
      }
    } else if (st === 'europa') {
      if (kind === 'house') {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.13), M('#efe3c6'));
        b.position.y = 0.06;
        const r = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.1, 4), M('#6b3b22'));
        r.position.y = 0.17; r.rotation.y = Math.PI / 4;
        g.add(b, r);
      } else {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.18), M('#f4ecd8'));
        b.position.y = 0.1;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M('#d4a43a', { metalness: 0.7, roughness: 0.3 }));
        dome.position.y = 0.2;
        g.add(b, dome);
      }
    } else {
      const roofColor = st === 'mundo' ? '#ff7b39' : '#1f9d55';
      if (kind === 'house') {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.14), M(st === 'mundo' ? '#fff3dc' : '#2ec27e'));
        b.position.y = 0.055;
        const r = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.09, 4), M(roofColor));
        r.position.y = 0.155; r.rotation.y = Math.PI / 4;
        g.add(b, r);
      } else {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.17), M(st === 'mundo' ? '#3fa7f0' : '#e8333a', { roughness: 0.35 }));
        b.position.y = 0.13;
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), M(st === 'mundo' ? '#a8dcff' : '#ff6b6b'));
        top.position.y = 0.32;
        g.add(b, top);
      }
    }
    // marquita del dueño
    const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10), new THREE.MeshBasicMaterial({ color: owner }));
    flag.position.y = 0.006;
    g.add(flag);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  setHighlights(tiles, color = '#ffc531') {
    for (const h of this.highlights) this.dynamic.remove(h);
    this.highlights = [];
    for (const i of tiles) {
      const r = tileRect(i);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 0.96, r.d * 0.96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false }));
      m.geometry.rotateX(-Math.PI / 2);
      m.rotation.y = -r.rot;
      m.position.set(r.x, 0.012, r.z);
      m.renderOrder = 5;
      this.dynamic.add(m);
      this.highlights.push(m);
    }
  }

  // Ajusta todo para que coincida con el estado (sin animación de movimiento)
  sync(state, force = false) {
    this.state = state;
    if (!this.map) return;
    const players = state.players.filter((p) => !p.bankrupt);
    // fichas
    for (const [pid, t] of this.tokens) {
      if (!players.find((p) => p.id === pid)) { this.dynamic.remove(t.group); this.tokens.delete(pid); }
    }
    const byTile = new Map();
    const order = state.order || players.map((p) => p.id);
    for (const pid of order) {
      const p = players.find((x) => x.id === pid);
      if (!p) continue;
      const key = p.pos === 10 ? (p.inJail ? 'j' : 'v') : String(p.pos);
      if (!byTile.has(key)) byTile.set(key, []);
      byTile.get(key).push(p);
    }
    for (const list of byTile.values()) {
      list.forEach((p, slot) => {
        let t = this.tokens.get(p.id);
        if (!t) { t = this.makeToken(p); this.tokens.set(p.id, t); }
        const spot = tokenSpot(p.pos, slot, p.inJail);
        t.slotSpot = spot;
        if (!t.busy || force) t.group.position.set(spot.x, 0, spot.z);
      });
    }
    // turno
    const cur = this.tokens.get(state.turn?.pid);
    if (cur && !state.over) {
      this.turnRing.visible = true;
      this.turnRing.material.color.set(players.find((p) => p.id === state.turn.pid)?.color || '#ffc531');
      cur.group.add(this.turnRing);
      this.turnRing.position.set(0, 0.012, 0);
      this.turnRing.rotation.set(-Math.PI / 2, 0, 0);
    } else this.turnRing.visible = false;

    // propiedades: dueños, hipotecas y construcciones
    const colorOf = (pid) => state.players.find((p) => p.id === pid)?.color || '#888';
    for (const [k, pr] of Object.entries(state.props)) {
      const i = Number(k);
      const r = tileRect(i);
      // barra del dueño
      let bar = this.ownerBars.get(i);
      if (pr.owner) {
        if (!bar) {
          bar = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 0.94, 0.11), new THREE.MeshBasicMaterial({ color: colorOf(pr.owner) }));
          bar.geometry.rotateX(-Math.PI / 2);
          bar.rotation.y = -r.rot;
          bar.position.set(r.x - r.nx * (r.d / 2 - 0.075), 0.008, r.z - r.nz * (r.d / 2 - 0.075));
          this.dynamic.add(bar);
          this.ownerBars.set(i, bar);
          if (!force) { bar.scale.set(0.01, 1, 1); this.tween(400, (t) => bar.scale.set(Math.max(0.01, t), 1, 1), ease.outBack); }
        }
        bar.material.color.set(colorOf(pr.owner));
      } else if (bar) { this.dynamic.remove(bar); this.ownerBars.delete(i); }
      // hipoteca
      let mm = this.mortgageMarks.get(i);
      if (pr.mortgaged) {
        if (!mm) {
          mm = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 0.98, r.d * 0.98), new THREE.MeshBasicMaterial({ map: this.mortgageTexture(), transparent: true, depthWrite: false }));
          mm.geometry.rotateX(-Math.PI / 2);
          mm.rotation.y = -r.rot;
          mm.position.set(r.x, 0.01, r.z);
          this.dynamic.add(mm);
          this.mortgageMarks.set(i, mm);
        }
      } else if (mm) { this.dynamic.remove(mm); this.mortgageMarks.delete(i); }
      // casas
      const have = this.buildings.get(i);
      const n = pr.houses || 0;
      if ((have?.n || 0) !== n || (have && have.owner !== pr.owner)) {
        if (have) this.dynamic.remove(have.group);
        if (n > 0) {
          const g = new THREE.Group();
          const owner = colorOf(pr.owner);
          if (n === 5) {
            const b = this.makeBuilding('hotel', owner);
            const s = houseSpot(i, 0, 1);
            b.position.set(s.x, 0, s.z);
            b.rotation.y = -r.rot;
            g.add(b);
          } else {
            for (let k = 0; k < n; k++) {
              const b = this.makeBuilding('house', owner);
              const s = houseSpot(i, k, 4);
              b.position.set(s.x, 0, s.z);
              b.rotation.y = -r.rot;
              g.add(b);
            }
          }
          this.dynamic.add(g);
          this.buildings.set(i, { group: g, n, owner: pr.owner });
          if (!force && n > (have?.n || 0)) {
            const last = g.children[g.children.length - 1];
            last.scale.setScalar(0.01);
            this.tween(450, (t) => last.scale.setScalar(Math.max(0.01, t)), ease.outBack);
          }
        } else this.buildings.delete(i);
      }
    }
  }

  mortgageTexture() {
    if (this._mortTex) return this._mortTex;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 205;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(20,16,40,.55)';
    ctx.fillRect(0, 0, 128, 205);
    ctx.strokeStyle = 'rgba(232,51,58,.85)';
    ctx.lineWidth = 6;
    for (let k = -205; k < 205; k += 34) { ctx.beginPath(); ctx.moveTo(k, 205); ctx.lineTo(k + 205, 0); ctx.stroke(); }
    ctx.save();
    ctx.translate(64, 102);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.font = '800 26px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('HIPOTECADA', 0, 0);
    ctx.restore();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this._mortTex = t;
    return t;
  }

  // ------------------------------------------------------------------ eventos animados
  async rollDice([a, b]) {
    const ends = [new THREE.Vector3(-0.32, 0.21, 0.55), new THREE.Vector3(0.36, 0.21, 0.35)];
    const vals = [a, b];
    const anims = this.dice.map((d, k) => {
      const start = new THREE.Vector3(-1.6 + k * 0.5, 2.2, 2.4 + k * 0.3);
      const end = ends[k].clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3));
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      const final = yaw.multiply(new THREE.Quaternion().setFromEuler(DICE_UP[vals[k]]));
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const spins = 3 + Math.random() * 2;
      return this.tween(850, (t) => {
        d.position.lerpVectors(start, end, t);
        d.position.y = end.y + (1 - ease.bounce(t)) * 2.0;
        const q = new THREE.Quaternion().setFromAxisAngle(axis, (1 - t) * (1 - t) * spins * Math.PI * 2);
        d.quaternion.copy(final).premultiply(q);
      }, ease.out);
    });
    await Promise.all(anims);
  }

  async moveToken(pid, path, kind, state) {
    const t = this.tokens.get(pid);
    if (!t || !path.length) return;
    t.busy = true;
    const g = t.group;
    const p = state?.players.find((x) => x.id === pid);
    const final = path[path.length - 1];
    const spotFor = (i, last) => {
      if (last) {
        // calcular la ranura final en esa casilla
        const same = (state?.order || []).map((id) => state.players.find((x) => x.id === id)).filter((x) => x && !x.bankrupt && x.pos === i && (i !== 10 || !!x.inJail === !!p?.inJail));
        const slot = Math.max(0, same.findIndex((x) => x.id === pid));
        return tokenSpot(i, slot, i === 10 && p?.inJail);
      }
      return tokenSpot(i, 4, false);
    };
    if (kind === 'jail') {
      const from = g.position.clone();
      const s = spotFor(10, true);
      const to = new THREE.Vector3(s.x, 0, s.z);
      await this.tween(750, (k) => { g.position.lerpVectors(from, to, k); g.position.y = Math.sin(k * Math.PI) * 2.2; }, ease.inOut);
    } else if (kind === 'train') {
      if (this.map.look.style === 'espacio') {
        await this.tween(260, (k) => g.scale.setScalar(Math.max(0.01, 1 - k)), ease.inOut);
        const s = spotFor(final, true);
        g.position.set(s.x, 0, s.z);
        this.portalFlash(s.x, s.z);
        await this.tween(320, (k) => g.scale.setScalar(Math.max(0.01, k)), ease.outBack);
      } else {
        for (let k = 0; k < path.length; k++) {
          const from = g.position.clone();
          const s = spotFor(path[k], k === path.length - 1);
          const to = new THREE.Vector3(s.x, 0.05, s.z);
          if (k % 2 === 0) this.puff(from.x, from.z);
          await this.tween(70, (q) => g.position.lerpVectors(from, to, q), ease.linear);
        }
        g.position.y = 0;
      }
    } else {
      for (let k = 0; k < path.length; k++) {
        const from = g.position.clone();
        const s = spotFor(path[k], k === path.length - 1);
        const to = new THREE.Vector3(s.x, 0, s.z);
        await this.tween(kind === 'back' ? 200 : 165, (q) => {
          g.position.lerpVectors(from, to, q);
          g.position.y = Math.sin(q * Math.PI) * 0.32;
        }, ease.inOut);
      }
    }
    g.position.y = 0;
    t.busy = false;
  }

  puff(x, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
    m.position.set(x, 0.35, z);
    this.dynamic.add(m);
    this.tween(700, (t) => { m.scale.setScalar(1 + t * 2.5); m.position.y = 0.35 + t * 0.6; m.material.opacity = 0.8 * (1 - t); }, ease.out).then(() => this.dynamic.remove(m));
  }
  portalFlash(x, z) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.18, 32), new THREE.MeshBasicMaterial({ color: '#7cf3ff', transparent: true, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    this.dynamic.add(m);
    this.tween(600, (t) => { m.scale.setScalar(1 + t * 4); m.material.opacity = 1 - t; }, ease.out).then(() => this.dynamic.remove(m));
  }
  soldBurst(i, color) {
    const r = tileRect(i);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 4), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI / 4;
    m.position.set(r.x, 0.05, r.z);
    this.dynamic.add(m);
    this.tween(700, (t) => { m.scale.setScalar(1 + t * 2.5); m.material.opacity = 1 - t; }, ease.out).then(() => this.dynamic.remove(m));
  }
}
