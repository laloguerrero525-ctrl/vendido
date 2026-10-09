// Geometría del tablero: dónde está cada casilla en el mundo 3D (y en la textura).
export const HALF = 6.1;   // medio lado del tablero
export const CORNER = 1.6; // tamaño de las esquinas (y profundidad de las casillas)
export const TILE_W = 1.0; // ancho de casilla normal
export const INNER = HALF - CORNER; // 4.5

// Para cada casilla: centro (x,z), ancho a lo largo del lado (w), profundidad (d),
// lado (0 abajo, 1 izquierda, 2 arriba, 3 derecha, -1 esquina), rotación para dibujar
// y vector hacia el centro del tablero (nx,nz).
export function tileRect(i) {
  const c = HALF - CORNER / 2; // 5.3
  if (i === 0) return { x: c, z: c, w: CORNER, d: CORNER, side: -1, rot: -Math.PI / 4, nx: -1, nz: -1 };
  if (i === 10) return { x: -c, z: c, w: CORNER, d: CORNER, side: -1, rot: Math.PI / 4, nx: 1, nz: -1 };
  if (i === 20) return { x: -c, z: -c, w: CORNER, d: CORNER, side: -1, rot: (3 * Math.PI) / 4, nx: 1, nz: 1 };
  if (i === 30) return { x: c, z: -c, w: CORNER, d: CORNER, side: -1, rot: (-3 * Math.PI) / 4, nx: -1, nz: 1 };
  const off = INNER - TILE_W / 2; // 4.0
  if (i < 10) return { x: off - (i - 1), z: c, w: TILE_W, d: CORNER, side: 0, rot: 0, nx: 0, nz: -1 };
  if (i < 20) return { x: -c, z: off - (i - 11), w: TILE_W, d: CORNER, side: 1, rot: Math.PI / 2, nx: 1, nz: 0 };
  if (i < 30) return { x: -off + (i - 21), z: -c, w: TILE_W, d: CORNER, side: 2, rot: Math.PI, nx: 0, nz: 1 };
  return { x: c, z: -off + (i - 31), w: TILE_W, d: CORNER, side: 3, rot: -Math.PI / 2, nx: -1, nz: 0 };
}

// Vector a lo largo del lado (perpendicular a la normal)
export function alongOf(r) { return { ax: -r.nz, az: r.nx }; }

// Qué casilla hay en (x,z) del mundo; -1 si es el centro o fuera
export function tileAt(x, z) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return -1;
  if (Math.abs(x) < INNER && Math.abs(z) < INNER) return -1;
  for (let i = 0; i < 40; i++) {
    const r = tileRect(i);
    const hw = r.side === 1 || r.side === 3 ? r.d / 2 : r.w / 2;
    const hd = r.side === 1 || r.side === 3 ? r.w / 2 : r.d / 2;
    if (Math.abs(x - r.x) <= hw && Math.abs(z - r.z) <= hd) return i;
  }
  return -1;
}

// Puntos para colocar fichas dentro de una casilla (hasta 8)
const SLOTS = [[-0.2, 0.18], [0.2, 0.18], [-0.2, 0.48], [0.2, 0.48], [0, 0.33], [-0.2, -0.12], [0.2, -0.12], [0, 0.05]];
export function tokenSpot(i, slot, inJail = false) {
  const r = tileRect(i);
  if (i === 10) {
    if (inJail) {
      // celda: parte interior de la esquina
      const j = [[0.25, -0.25], [0.55, -0.25], [0.25, -0.55], [0.55, -0.55], [0.4, -0.4], [0.1, -0.1], [0.65, -0.1], [0.1, -0.65]][slot % 8];
      return { x: r.x + j[0], z: r.z + j[1] };
    }
    // de visita: borde exterior (abajo e izquierda)
    const v = [[-0.55, 0.6], [-0.15, 0.6], [0.25, 0.6], [0.6, 0.6], [-0.6, 0.2], [-0.6, -0.2], [-0.6, -0.55], [0.6, 0.25]][slot % 8];
    return { x: r.x + v[0], z: r.z + v[1] };
  }
  if (r.side === -1) {
    const v = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, 0], [0, -0.45], [-0.45, 0], [0.45, 0]][slot % 8];
    return { x: r.x + v[0], z: r.z + v[1] };
  }
  const { ax, az } = alongOf(r);
  const [a, o] = SLOTS[slot % 8];
  // o > 0 = hacia afuera del tablero (lejos de la franja de color)
  return { x: r.x + ax * a - r.nx * o, z: r.z + az * a - r.nz * o };
}

// Punto para casas: sobre la franja de color (lado interior)
export function houseSpot(i, k, total) {
  const r = tileRect(i);
  const { ax, az } = alongOf(r);
  const inward = r.d / 2 - 0.2;
  const spread = total === 1 ? 0 : (k - (total - 1) / 2) * 0.22;
  return { x: r.x + r.nx * inward + ax * spread, z: r.z + r.nz * inward + az * spread };
}
