import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// frame-rate independent exponential smoothing
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dampAngle = (a, b, lambda, dt) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbm(x, z, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

export function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const L = vx * vx + vz * vz;
  let t = L > 0 ? (wx * vx + wz * vz) / L : 0;
  t = clamp(t, 0, 1);
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return { d: Math.sqrt(dx * dx + dz * dz), t };
}

// Canvas text texture, crisp and colored
export function textTexture(lines, opts = {}) {
  const {
    width = 1024, height = 256, bg = 'rgba(8,22,44,0.85)', border = '#35e0ff',
    color = '#ffffff', sub = '#9fe8ff', font = 'Nunito, system-ui, sans-serif', radius = 40,
    sizes = [110, 56], glow = true,
  } = opts;
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    roundRect(g, 8, 8, width - 16, height - 16, radius);
    g.fill();
    if (border) {
      g.lineWidth = 10;
      g.strokeStyle = border;
      if (glow) { g.shadowColor = border; g.shadowBlur = 24; }
      g.stroke();
      g.shadowBlur = 0;
    }
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.length;
  lines.forEach((ln, i) => {
    let size = sizes[Math.min(i, sizes.length - 1)];
    g.font = `900 ${size}px ${font}`;
    while (g.measureText(ln).width > width - 90 && size > 20) { size -= 4; g.font = `900 ${size}px ${font}`; }
    g.fillStyle = i === 0 ? color : sub;
    const y = total === 1 ? height / 2 : height * (0.36 + i * 0.36);
    g.fillText(ln, width / 2, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function makeSign(lines, w, h, opts = {}) {
  const tex = textTexture(lines, opts);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.FrontSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  // readable from both sides (a DoubleSide plane shows the text mirrored from behind)
  const back = new THREE.Mesh(mesh.geometry, mat);
  back.rotation.y = Math.PI;
  mesh.add(back);
  return mesh;
}

export function softSpriteTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function safeStorage() {
  return {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
}

// ---------------------------------------------------------------------------
// Merge static meshes under `root` that share an equivalent material into one mesh.
// Objects (and their descendants) flagged with userData.dynamic are left untouched.
function matKey(m) {
  if (Array.isArray(m)) return null;
  if (m.isShaderMaterial) return 'shader:' + m.uuid;
  const c = (x) => (x && x.getHexString ? x.getHexString() : '');
  return [m.type, c(m.color), c(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.map ? m.map.uuid : '',
    m.transparent, m.opacity, m.side, m.flatShading, m.vertexColors, m.clearcoat ?? '', m.toneMapped].join('|');
}
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const visit = (o) => {
    if (o.userData && o.userData.dynamic) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible) {
      const k = matKey(o.material);
      if (k) {
        let b = buckets.get(k);
        if (!b) { b = { mat: o.material, list: [], cast: false, recv: false, order: o.renderOrder }; buckets.set(k, b); }
        b.list.push(o);
        b.cast = b.cast || o.castShadow;
        b.recv = b.recv || o.receiveShadow;
      }
    }
    for (const ch of o.children) visit(ch);
  };
  for (const ch of root.children) visit(ch);
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const geos = [];
    for (const o of b.list) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(m);
      geos.push(g);
    }
    const hasColor = geos.some((g) => g.attributes.color);
    if (hasColor) for (const g of geos) if (!g.attributes.color) {
      const arr = new Float32Array(g.attributes.position.count * 3).fill(1);
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    }
    const out = mergeGeometries(geos, false);
    if (!out) continue;
    const mesh = new THREE.Mesh(out, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.order;
    root.add(mesh);
    for (const o of b.list) victims.push(o);
    merged += b.list.length;
  }
  for (const o of victims) o.parent && o.parent.remove(o);
  return merged;
}
