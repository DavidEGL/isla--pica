// Static collision world: circles, rotated boxes and triangle meshes, each with a vertical extent.
const CELL = 12;

// Forma para colliders de malla: posiciones sin índice (3 vértices por triángulo) a escala 1.
export function meshShape(tris) {
  let yMin = Infinity, yMax = -Infinity, rMax = 0, yWide = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const y = tris[i + 1], r = Math.hypot(tris[i], tris[i + 2]);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
    if (r > rMax) { rMax = r; yWide = y; }
  }
  return { tris, yMin, yMax, rMax, yWide };
}

// Altura de la superficie de la malla en (lx,lz); -Infinity si el punto queda fuera.
// lowest: devuelve la cara inferior en vez de la superior (+Infinity si queda fuera).
function meshTop(t, lx, lz, lowest = false) {
  let best = lowest ? Infinity : -Infinity;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], az = t[i + 2], bx = t[i + 3], bz = t[i + 5], cx = t[i + 6], cz = t[i + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((bz - cz) * (lx - cx) + (cx - bx) * (lz - cz)) / d;
    const v = ((cz - az) * (lx - cx) + (ax - cx) * (lz - cz)) / d;
    const w = 1 - u - v;
    if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
    const h = u * t[i + 1] + v * t[i + 4] + w * t[i + 7];
    best = lowest ? Math.min(best, h) : Math.max(best, h);
  }
  return best;
}

// Punto del contorno de la malla a la altura y más cercano a (lx,lz): [x, z, distancia], o null si no la corta.
function meshOutlineNearest(t, lx, lz, y) {
  let bd = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < t.length; i += 9) {
    let n = 0, p0x = 0, p0z = 0, p1x = 0, p1z = 0;
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3, b = i + ((e + 1) % 3) * 3, ya = t[a + 1], yb = t[b + 1];
      if ((ya - y) * (yb - y) >= 0) continue;
      const k = (y - ya) / (yb - ya), px = t[a] + k * (t[b] - t[a]), pz = t[a + 2] + k * (t[b + 2] - t[a + 2]);
      if (n++ === 0) { p0x = px; p0z = pz; } else { p1x = px; p1z = pz; }
    }
    if (n !== 2) continue;
    const ex = p1x - p0x, ez = p1z - p0z, l2 = ex * ex + ez * ez;
    const k = l2 > 1e-12 ? Math.max(0, Math.min(1, ((lx - p0x) * ex + (lz - p0z) * ez) / l2)) : 0;
    const qx = p0x + k * ex, qz = p0z + k * ez, d = Math.hypot(lx - qx, lz - qz);
    if (d < bd) { bd = d; bx = qx; bz = qz; }
  }
  return bd === Infinity ? null : [bx, bz, bd];
}

export class Colliders {
  constructor() {
    this.grid = new Map();
    this.all = [];
  }
  _key(ix, iz) { return ix * 100003 + iz; }
  _insert(c, minX, maxX, minZ, maxZ) {
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this._key(ix, iz);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(c);
    }
    this.all.push(c);
    return c;
  }
  addCircle(x, z, r, y0, y1, tag = null) {
    const c = { t: 0, x, z, r, y0, y1, tag, on: true };
    return this._insert(c, x - r, x + r, z - r, z + r);
  }
  // hx/hz half extents, rot radians about Y
  addBox(x, z, hx, hz, rot, y0, y1, tag = null) {
    const c = { t: 1, x, z, hx, hz, rot, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, tag, on: true };
    const R = Math.hypot(hx, hz);
    return this._insert(c, x - R, x + R, z - R, z + R);
  }
  // malla exacta: misma posición (origen en y), escala uniforme s y giro rot que la instancia visible
  addMesh(x, y, z, s, rot, shape, tag = null) {
    const r = shape.rMax * s;
    const c = { t: 2, x, y, z, s, r, shape, cos: Math.cos(rot), sin: Math.sin(rot), y0: y + shape.yMin * s, y1: y + shape.yMax * s, tag, on: true };
    return this._insert(c, x - r, x + r, z - r, z + r);
  }
  near(x, z, out) {
    out.length = 0;
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = this.grid.get(this._key(ix + a, iz + b));
      if (arr) for (const c of arr) if (c.on && !out.includes(c)) out.push(c);
    }
    return out;
  }
  // local coordinates of a point relative to a box
  static local(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos];
  }
  static contains(c, x, z, margin = 0) {
    if (c.t === 0) return Math.hypot(x - c.x, z - c.z) < c.r + margin;
    const [lx, lz] = Colliders.local(c, x, z);
    return Math.abs(lx) < c.hx + margin && Math.abs(lz) < c.hz + margin;
  }
  // altura real de una malla en (x,z); -Infinity si está fuera de su silueta
  static meshSurface(c, x, z) {
    const [lx, lz] = Colliders.local(c, x, z);
    if (Math.hypot(lx, lz) > c.r) return -Infinity;
    const top = meshTop(c.shape.tris, lx / c.s, lz / c.s);
    return top === -Infinity ? -Infinity : c.y + top * c.s;
  }
  // Empuja un cilindro fuera del contorno de la malla a la altura wy. true si lo movió.
  static _pushFromMesh(c, pos, wy, pr) {
    const s = c.s, [lx0, lz0] = Colliders.local(c, pos.x, pos.z), lx = lx0 / s, lz = lz0 / s, r = pr / s;
    const y = (wy - c.y) / s;
    const q = meshOutlineNearest(c.shape.tris, lx, lz, y);
    if (!q) return false;
    // dentro solo si está entre las dos caras: pasar por debajo de la malla no es estar dentro
    const inside = meshTop(c.shape.tris, lx, lz) > y && meshTop(c.shape.tris, lx, lz, true) < y;
    if (!inside && q[2] >= r) return false;
    let nx = lx - q[0], nz = lz - q[1], side = inside ? -1 : 1;
    let n = Math.hypot(nx, nz);
    if (n < 1e-7) { nx = lx; nz = lz; n = Math.hypot(nx, nz) || 1; side = 1; }
    const ox = (q[0] + side * (nx / n) * r) * s, oz = (q[1] + side * (nz / n) * r) * s;
    pos.x = c.x + ox * c.cos + oz * c.sin;
    pos.z = c.z - ox * c.sin + oz * c.cos;
    return true;
  }
  // Highest walkable top under (x,z) that is not above feetY+step
  supportHeight(x, z, feetY, step, list) {
    let best = -Infinity;
    this.near(x, z, list);
    for (const c of list) {
      if (c.t === 2) {
        const h = Colliders.meshSurface(c, x, z);
        if (h <= feetY + step && h > best) best = h;
        continue;
      }
      if (c.y1 <= feetY + step && c.y1 > best && Colliders.contains(c, x, z, 0.15)) best = c.y1;
    }
    return best;
  }
  // Push a cylinder (radius pr, from feetY to feetY+ph) out of solids. Mutates pos {x,z}. Returns true if hit.
  resolve(pos, feetY, ph, pr, step, list) {
    let hit = false;
    this.near(pos.x, pos.z, list);
    for (let iter = 0; iter < 2; iter++) {
      for (const c of list) {
        if (feetY >= c.y1 - step || feetY + ph <= c.y0) continue;
        if (c.t === 2) {
          if (Math.hypot(pos.x - c.x, pos.z - c.z) >= c.r + pr) continue;
          // lo pisable queda por debajo de feetY+step; si el cuerpo pasa bajo la parte ancha, también choca con ella
          const low = feetY + step, wide = c.y + c.shape.yWide * c.s;
          if (Colliders._pushFromMesh(c, pos, low, pr)) hit = true;
          if (low < wide && Colliders._pushFromMesh(c, pos, Math.min(feetY + ph, wide), pr)) hit = true;
        } else if (c.t === 0) {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + pr;
          if (d < min) {
            const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
            pos.x = c.x + nx * min;
            pos.z = c.z + nz * min;
            hit = true;
          }
        } else {
          const [lx, lz] = Colliders.local(c, pos.x, pos.z);
          const cx = Math.max(-c.hx, Math.min(c.hx, lx));
          const cz = Math.max(-c.hz, Math.min(c.hz, lz));
          let dx = lx - cx, dz = lz - cz;
          let d = Math.hypot(dx, dz);
          let nlx, nlz;
          if (d < 1e-5) {
            // inside: push along smallest penetration axis
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) { nlx = lx + Math.sign(lx || 1) * (px + pr); nlz = lz; }
            else { nlx = lx; nlz = lz + Math.sign(lz || 1) * (pz + pr); }
          } else if (d < pr) {
            nlx = cx + (dx / d) * pr;
            nlz = cz + (dz / d) * pr;
          } else continue;
          // back to world
          pos.x = c.x + nlx * c.cos + nlz * c.sin;
          pos.z = c.z - nlx * c.sin + nlz * c.cos;
          hit = true;
        }
      }
    }
    return hit;
  }
  // is a point inside any solid (for camera)
  pointBlocked(x, y, z, list) {
    this.near(x, z, list);
    for (const c of list) {
      if (y < c.y0 || y > c.y1) continue;
      if (c.t === 2) {
        const [lx, lz] = Colliders.local(c, x, z);
        if (y < Colliders.meshSurface(c, x, z) && y > c.y + meshTop(c.shape.tris, lx / c.s, lz / c.s, true) * c.s) return true;
        continue;
      }
      if (Colliders.contains(c, x, z, 0.25)) return true;
    }
    return false;
  }
}
