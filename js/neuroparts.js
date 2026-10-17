// Procedural neuroscience props: brain hologram geometry and neuron parts.
import * as THREE from 'three';
import { bakeStatic } from './util.js';

function h3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function n3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), L(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v),
    L(L(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), L(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v),
    w,
  );
}

let _brain = null;
export function brainGeometry() {
  if (_brain) return _brain;
  const g = new THREE.IcosahedronGeometry(1, 5);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // ellipsoid
    let x = v.x * 0.95, y = v.y * 0.8, z = v.z * 1.22;
    // flatten bottom
    if (y < -0.3) y = -0.3 + (y + 0.3) * 0.55;
    // longitudinal fissure
    const fis = Math.exp(-(v.x * v.x) / 0.004) * Math.max(0, v.y + 0.1) * 0.22;
    // gyri: ridged noise
    const n = n3(v.x * 4.2 + 10, v.y * 4.2, v.z * 4.2) * 0.6 + n3(v.x * 8.5, v.y * 8.5 + 3, v.z * 8.5) * 0.4;
    const ridge = 1 - Math.abs(Math.sin(n * 9.0));
    const k = 1 + ridge * 0.07 - fis;
    x *= k; y *= k; z *= k;
    // temporal lobes bulge lower sides
    const tl = Math.exp(-((v.y + 0.35) ** 2) / 0.05) * Math.exp(-((v.z - 0.1) ** 2) / 0.3) * 0.08;
    x += Math.sign(v.x) * tl;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  _brain = g;
  return g;
}

export function cerebellumGeometry() {
  const g = new THREE.SphereGeometry(0.42, 40, 24);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const stripes = 1 + Math.sin(v.y * 60) * 0.03;
    p.setXYZ(i, v.x * 1.55 * stripes, v.y * 0.75, v.z * 0.9 * stripes);
  }
  g.computeVertexNormals();
  return g;
}

export function buildBrain(mat, matCb) {
  const g = new THREE.Group();
  const cortex = new THREE.Mesh(brainGeometry(), mat);
  g.add(cortex);
  const cb = new THREE.Mesh(cerebellumGeometry(), matCb || mat);
  cb.position.set(0, -0.45, -0.92);
  g.add(cb);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.7, 16), matCb || mat);
  stem.position.set(0, -0.72, -0.55);
  stem.rotation.x = 0.35;
  g.add(stem);
  // region anchors (local)
  g.userData.regions = {
    memoria: new THREE.Vector3(0.55, -0.32, 0.15),     // hippocampus / temporal
    equilibrio: new THREE.Vector3(0, -0.45, -0.95),    // cerebellum
    movimiento: new THREE.Vector3(0.35, 0.7, -0.05),   // motor cortex
  };
  return g;
}

const M = {
  gold: () => new THREE.MeshStandardMaterial({ color: 0xffc84a, emissive: 0xffa000, emissiveIntensity: 1.3, roughness: 0.3 }),
  cyan: () => new THREE.MeshStandardMaterial({ color: 0x8ff8ff, emissive: 0x19c2e6, emissiveIntensity: 1.4, roughness: 0.3 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fdcff, emissiveIntensity: 0.6, roughness: 0.25 }),
  purple: () => new THREE.MeshStandardMaterial({ color: 0xd2b6ff, emissive: 0x8b5cf6, emissiveIntensity: 1.4, roughness: 0.3 }),
};

// Each part built along +Z (neuron axis) in "neuron space" units (neuron total ~10 units long)
export function partSoma(mat = M.gold()) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 3), mat);
  const nuc = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 16), M.purple());
  nuc.position.set(0.25, 0.25, 0.4);
  g.add(s, nuc);
  return g;
}
export function partDendritas(mat = M.cyan()) {
  const g = new THREE.Group();
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const branch = (from, dir, len, rad, depth) => {
    const to = from.clone().addScaledVector(dir, len);
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 8, rad, 6), mat));
    if (depth > 0) {
      for (let k = 0; k < 2; k++) {
        const nd = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.3, (rnd() - 0.5) * 1.3, -0.3)).normalize();
        branch(to, nd, len * 0.68, rad * 0.65, depth - 1);
      }
    } else {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(rad * 1.6, 8, 6), mat);
      tip.position.copy(to);
      g.add(tip);
    }
  };
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const d = new THREE.Vector3(Math.cos(a) * 0.9, Math.sin(a) * 0.9, -0.8).normalize();
    branch(new THREE.Vector3(Math.cos(a) * 0.6, Math.sin(a) * 0.6, -0.4), d, 1.5, 0.12, 2);
  }
  bakeStatic(g);
  return g;
}
export function partAxon(mat = M.white()) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6.2, 12), M.cyan());
  core.rotation.x = Math.PI / 2;
  core.position.z = 3.1;
  g.add(core);
  for (let i = 0; i < 6; i++) {
    const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.55, 6, 14), mat);
    sh.rotation.x = Math.PI / 2;
    sh.position.z = 0.7 + i * 0.98;
    g.add(sh);
  }
  bakeStatic(g);
  return g;
}
export function partSinapsis(mat = M.purple()) {
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const d = new THREE.Vector3(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 1).normalize();
    const end = d.clone().multiplyScalar(1.1);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), end), 4, 0.08, 6), M.cyan()));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat);
    bulb.position.copy(end);
    g.add(bulb);
  }
  bakeStatic(g);
  return g;
}

export const PART_INFO = {
  soma: { name: 'SOMA', color: 0xffb020, build: partSoma, z: 0 },
  dendritas: { name: 'DENDRITAS', color: 0x35e0ff, build: partDendritas, z: -0.6 },
  axon: { name: 'AXÓN', color: 0xffffff, build: partAxon, z: 0.9 },
  sinapsis: { name: 'SINAPSIS', color: 0xb57bff, build: partSinapsis, z: 7.2 },
};
