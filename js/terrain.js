// Analytic island height field shared by rendering and physics.
import { clamp, lerp, smoothstep, fbm, segDist } from './util.js';

export const WORLD = 520;          // terrain mesh covers -260..260
export const SEA = 0;

export const SPAWN = { x: 2, z: 152 };

// Flat pads (plazas / districts)
export const PADS = {
  plaza:   { x: 0,    z: 20,   r: 32, h: 8,  blend: 26, name: 'Plaza Central' },
  neuro:   { x: -122, z: 2,    r: 44, h: 12, blend: 26, name: 'Distrito Neuro' },
  steam:   { x: -78,  z: -108, r: 30, h: 17, blend: 24, name: 'Distrito STEAM' },
  english: { x: 46,   z: -124, r: 30, h: 15, blend: 24, name: 'Distrito English' },
  tech:    { x: 128,  z: -18,  r: 32, h: 10, blend: 24, name: 'Distrito Technology' },
};
export const PILLAR = { x: -58, z: 94, r: 7, top: 27 };

const MOUNTAINS = [
  { x: -8,   z: -192, h: 62, s: 34 },
  { x: 100,  z: -170, h: 52, s: 30 },
  { x: -140, z: -160, h: 46, s: 30 },
  { x: 172,  z: -100, h: 34, s: 26 },
  { x: -185, z: -70,  h: 30, s: 24 },
  { x: 40,   z: -175, h: 30, s: 20 },
  { x: 168,  z: 70,   h: 16, s: 22 },
  { x: -150, z: 95,   h: 18, s: 26 },
];

// Mesa with a sheer cliff falling into the lake (waterfall)
export const MESA = { x: 84, z: -100, r: 22, h: 30 };
export const LAKE = { x: 78, z: -60, r: 19 };
export const WATERFALL = { x: 82, width: 10 };

export const RIVER = [
  [78, -60], [82, -30], [84, 0], [96, 30], [126, 58], [168, 86], [210, 108], [260, 125],
];

// Path network (polyline segments)
const PATH_POLYS = [
  [[SPAWN.x, SPAWN.z], [6, 120], [3, 90], [0, 52]],
  [[-30, 20], [-55, 12], [-78, 4]],
  [[-12, -10], [-30, -40], [-52, -78], [-66, -88]],
  [[14, -10], [26, -50], [40, -94]],
  [[30, 18], [60, 6], [84, 2], [106, -10]],
  [[-18, 46], [-34, 66], [-44, 76]],
];
export const PATH_SEGS = [];
for (const poly of PATH_POLYS) {
  for (let i = 0; i < poly.length - 1; i++) {
    PATH_SEGS.push({ ax: poly[i][0], az: poly[i][1], bx: poly[i + 1][0], bz: poly[i + 1][1], ha: 0, hb: 0 });
  }
}

export const BRIDGE = { ax: 70, az: 4, bx: 99, bz: -4.5, w: 5.2 };

function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const edge = 202 + 14 * Math.sin(3 * a + 1) + 9 * Math.sin(5 * a + 2.3) + 5 * Math.sin(11 * a + 0.7);
  const land = smoothstep(edge + 10, edge - 42, r);
  const hills = (fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 4) - 0.38) * 15;
  let hl = 3.2 + Math.max(hills, -1.6);
  const rug = 0.8 + 0.4 * fbm(x * 0.045, z * 0.045, 3);
  for (const m of MOUNTAINS) {
    const dx = x - m.x, dz = z - m.z;
    hl += m.h * Math.exp(-(dx * dx + dz * dz) / (2 * m.s * m.s)) * rug;
  }
  // mesa with steep cliff
  const dm = Math.hypot(x - MESA.x, z - MESA.z);
  const mesa = MESA.h * (1 - smoothstep(MESA.r - 1.5, MESA.r + 1.5, dm)) + (fbm(x * 0.2, z * 0.2, 2) - 0.5) * 0.8;
  // ridge from mesa to the mountain behind
  const ridge = segDist(x, z, MESA.x, MESA.z, 100, -160);
  const ridgeH = lerp(MESA.h, 40, ridge.t) * (1 - smoothstep(10, 26, ridge.d));
  hl = Math.max(hl, mesa, ridgeH);
  return lerp(-9, hl, land);
}

function padBlend(x, z, h) {
  for (const k in PADS) {
    const p = PADS[k];
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + p.blend) {
      const w = 1 - smoothstep(p.r, p.r + p.blend, d);
      h = lerp(h, p.h, w);
    }
  }
  return h;
}

// Precompute path endpoint heights
for (const s of PATH_SEGS) {
  s.ha = padBlend(s.ax, s.az, baseHeight(s.ax, s.az));
  s.hb = padBlend(s.bx, s.bz, baseHeight(s.bx, s.bz));
}

export function pathInfo(x, z) {
  let best = 1e9, target = 0;
  for (const s of PATH_SEGS) {
    const q = segDist(x, z, s.ax, s.az, s.bx, s.bz);
    if (q.d < best) { best = q.d; target = lerp(s.ha, s.hb, q.t); }
  }
  return { d: best, target };
}

export function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const q = segDist(x, z, RIVER[i][0], RIVER[i][1], RIVER[i + 1][0], RIVER[i + 1][1]);
    if (q.d < best) best = q.d;
  }
  return best;
}

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  const p = pathInfo(x, z);
  if (p.d < 9) {
    const w = 1 - smoothstep(2.5, 9, p.d);
    h = lerp(h, p.target, w * 0.92);
  }
  h = padBlend(x, z, h);
  const dm = Math.hypot(x - MESA.x, z - MESA.z);
  const keep = smoothstep(MESA.r - 1.5, MESA.r + 1.5, dm); // 0 on mesa (protect cliff)
  const rd = riverDist(x, z);
  if (rd < 15) h = lerp(h, -2.4, (1 - smoothstep(5.5, 15, rd)) * keep);
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < LAKE.r + 4) h = lerp(h, -3.6, (1 - smoothstep(LAKE.r - 5, LAKE.r + 4, ld)) * keep);
  return h;
}

export function slopeAt(x, z) {
  const e = 0.6;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return { dx, dz, m: Math.hypot(dx, dz) };
}

export function pathMask(x, z) {
  const p = pathInfo(x, z);
  return 1 - smoothstep(2.2, 3.6, p.d);
}

export function insidePad(x, z, margin = 0) {
  for (const k in PADS) {
    const p = PADS[k];
    if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return k;
  }
  return null;
}

export const clampWorld = (v) => clamp(v, -250, 250);
