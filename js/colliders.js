// Static collision world: circles and rotated boxes, each with a vertical extent.
const CELL = 12;

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
  // Highest walkable top under (x,z) that is not above feetY+step
  supportHeight(x, z, feetY, step, list) {
    let best = -Infinity;
    this.near(x, z, list);
    for (const c of list) {
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
        if (c.t === 0) {
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
      if (Colliders.contains(c, x, z, 0.25)) return true;
    }
    return false;
  }
}
