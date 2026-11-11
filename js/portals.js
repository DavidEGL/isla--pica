// Portals: animated surfaces, crossing detection and the screen transition used when travelling.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { labelSprite } from './mission.js';
import { PORTAL_MATS, prism, facetedCyl, gateArch } from './labstyle.js';

export function portalMaterial(color, opts = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: {
      time: { value: 0 },
      col: { value: new THREE.Color(color) },
      col2: { value: new THREE.Color(opts.color2 ?? 0xffffff) },
      shape: { value: opts.shape === 'arch' ? 1 : 0 },
      power: { value: opts.locked ? 0.32 : 1 },
      aspect: { value: opts.aspect ?? 1 },
      spring: { value: opts.spring ?? 0 }, // arch: altura (-1..1) donde empieza la curva
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float time, shape, power, aspect, spring; uniform vec3 col, col2; varying vec2 vUv;
      void main(){
        vec2 p = vUv*2.0-1.0;
        float edge, r;
        if (shape > 0.5) {
          r = p.y > spring ? length(vec2(p.x, (p.y - spring) / (1.0 - spring))) : abs(p.x);
          edge = 1.0 - smoothstep(0.93, 1.0, r);
          p.x *= aspect;
        } else {
          r = length(p);
          edge = 1.0 - smoothstep(0.93, 1.0, r);
        }
        float rr = length(p);
        float a = atan(p.y, p.x);
        float sw = sin(a*5.0 + rr*12.0 - time*3.2)*0.5+0.5;
        float rings = sin(rr*24.0 - time*4.5)*0.5+0.5;
        float core = 1.0 - smoothstep(0.0, 0.9, rr);
        vec3 c = mix(col*0.45, col, sw);
        c = mix(c, col2, pow(core, 3.0)*0.75 + rings*0.1);
        float rim = smoothstep(0.72, 0.97, r) * edge;
        c += col * rim * 1.4;
        float alpha = edge * (0.5 + 0.3*sw + 0.25*core + rim*0.5);
        gl_FragColor = vec4(c*(0.55 + 0.7*power), clamp(alpha*power, 0.0, 1.0));
      }`,
  });
  m.userData.base = opts.locked ? 0.32 : 1;
  return m;
}

const RING_GAP = 0.62; // media abertura inferior del aro (radianes)
const RING_SLAB = 0.12; // alto de la base de los portales grandes
const arcPrism = (a0, a1, ri, ro, depth, seg = 2) => {
  const pts = [];
  for (let k = 0; k <= seg; k++) { const a = a0 + (a1 - a0) * (k / seg); pts.push([ro * Math.cos(a), ro * Math.sin(a)]); }
  for (let k = seg; k >= 0; k--) { const a = a0 + (a1 - a0) * (k / seg); pts.push([ri * Math.cos(a), ri * Math.sin(a)]); }
  return prism(pts, depth);
};

// Portal circular de dovelas: aro continuo con pieza central, abierto abajo para cruzarlo caminando.
// Origen en el centro del aro. Con R >= 3 lleva además base y dos torres. Colisión: addRingColliders.
export function ringPortal(color, R) {
  const k = R / 3.4, big = R >= 3, slab = big ? RING_SLAB : 0;
  const lift = R * Math.cos(RING_GAP) + slab, floor = -lift;
  const ri = R - 0.08 * k, ro = R + 0.72 * k, band = ro + 0.13 * k, d = 0.92 * k, N = 11;
  const start = -Math.PI / 2 + RING_GAP, end = (3 * Math.PI) / 2 - RING_GAP, step = (end - start) / N;
  const parts = { body: [], stone: [], blue: [], sky: [] };
  for (let i = 0; i < N; i++) {
    const a0 = start + i * step, a1 = a0 + step;
    if (i === (N - 1) / 2) {
      parts.sky.push(arcPrism(a0 - 0.03, a1 + 0.03, ri, ro + 0.28 * k, d + 0.34 * k));
      continue;
    }
    parts.body.push(arcPrism(a0, a1, ri, ro, d));
    parts.blue.push(arcPrism(a0, a1, ro, band, d * 0.78));
    parts.stone.push(arcPrism(a0 + 0.05, a1 - 0.05, ri + 0.2 * k, ro - 0.14 * k, d + 0.06 * k));
    if (i === 2 || i === N - 3) {
      const am = (a0 + a1) / 2, hex = [];
      for (let q = 0; q < 6; q++) hex.push([band * Math.cos(am) + 0.2 * k * Math.cos((q / 6) * Math.PI * 2), band * Math.sin(am) + 0.23 * k * Math.sin((q / 6) * Math.PI * 2)]);
      parts.sky.push(prism(hex, d * 0.7));
    }
  }
  // pies: la base del aro se apoya en dos bloques grises
  const footIn = ri * Math.sin(RING_GAP) - 0.06 * k, footOut = footIn + 1.45 * k;
  for (const s of [-1, 1]) {
    const y0 = floor + slab, y1 = y0 + 0.78 * k;
    parts.stone.push(prism([[s * footIn, y0], [s * footOut, y0], [s * (footOut - 0.3 * k), y1], [s * (footIn + 0.1 * k), y1]], d + 0.28 * k));
  }
  let towerX = 0;
  if (big) {
    const w = 2 * (R + 2.1 * k), z = 3.2 * k;
    parts.body.push(new THREE.BoxGeometry(w, slab, z).toNonIndexed().translate(0, floor + slab / 2, 0));
    parts.blue.push(new THREE.BoxGeometry(w + 0.24, 0.05, z + 0.24).toNonIndexed().translate(0, floor + 0.025, 0));
    towerX = R + 1.55 * k;
    for (const s of [-1, 1]) {
      parts.stone.push(facetedCyl(0.14 * k, 0.26 * k, 1.18 * k, s * towerX, floor + slab + 0.59 * k));
      parts.sky.push(facetedCyl(0.001, 0.17 * k, 0.36 * k, s * towerX, floor + slab + 1.36 * k));
    }
  }
  const g = new THREE.Group();
  for (const key in parts) g.add(new THREE.Mesh(mergeGeometries(parts[key]), PORTAL_MATS[key]));
  // línea de luz por el borde interior y superficie animada
  const glowMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  g.add(new THREE.Mesh(arcPrism(start, end, ri - 0.1 * k, ri, d * 0.6, 40), glowMat));
  const mat = portalMaterial(color, { shape: 'circle', color2: 0xffffff });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(ri - 0.08 * k, 56), mat);
  disc.renderOrder = 4;
  g.add(disc);
  Object.assign(g.userData, {
    mat, glowMat, lift, half: R * Math.sin(RING_GAP),
    foot: { x: (footIn + band) / 2, hx: (band - footIn) / 2, hz: (d + 0.28 * k) / 2, top: lift + ro * 0.6 },
    slab: big ? { hx: R + 2.1 * k, hz: 1.6 * k, top: slab, towerX, towerR: 0.28 * k, towerTop: slab + 1.54 * k } : null,
  });
  return g;
}

// Colliders del aro: una caja a cada lado de la abertura y, si la tiene, la base y sus torres. y es el suelo.
export function addRingColliders(col, g, x, z, rot, y, tag) {
  const u = g.userData, cos = Math.cos(rot), sin = Math.sin(rot);
  for (const s of [-1, 1]) {
    col.addBox(x + cos * s * u.foot.x, z - sin * s * u.foot.x, u.foot.hx, u.foot.hz, rot, y - 1, y + u.foot.top, tag);
    if (u.slab) col.addCircle(x + cos * s * u.slab.towerX, z - sin * s * u.slab.towerX, u.slab.towerR, y - 1, y + u.slab.towerTop, tag);
  }
  if (u.slab) col.addBox(x, z, u.slab.hx, u.slab.hz, rot, y - 1, y + u.slab.top, tag);
}

// Fade a portal surface when the camera gets very close (so it never fills the screen).
export function fadePortal(mat, x, z, cam) {
  const d = Math.hypot(cam.position.x - x, cam.position.z - z);
  mat.uniforms.power.value = mat.userData.base * Math.min(1, Math.max(0.08, (d - 1.0) / 3.5));
}

// A vertical portal plane. n = horizontal normal; crossing along +n triggers (or both ways if twoSided).
export class Portal {
  constructor({ x, z, nx, nz, halfW, y0, y1, twoSided = false }) {
    Object.assign(this, { x, z, nx, nz, halfW, y0, y1, twoSided });
    this.prev = null;
  }
  reset() { this.prev = null; }
  check(p) {
    const dx = p.x - this.x, dz = p.z - this.z;
    const d = dx * this.nx + dz * this.nz;
    const lat = Math.abs(dx * this.nz - dz * this.nx);
    const inside = lat < this.halfW && p.y > this.y0 && p.y < this.y1;
    let crossed = false;
    if (inside && this.prev !== null) {
      if (this.prev < 0 && d >= 0) crossed = true;
      else if (this.twoSided && this.prev > 0 && d <= 0) crossed = true;
    }
    this.prev = Math.abs(d) < 4 && lat < this.halfW + 2 ? d : null;
    return crossed;
  }
}

// Portal surface inside one of the district arches (data from buildDistricts).
export function gatePortal(scene, g, locked) {
  const { W, yS, Hi: h } = gateArch(g.width);
  const w = 2 * W;
  const mat = portalMaterial(g.color, { shape: 'arch', aspect: w / h, spring: (yS / h) * 2 - 1, locked });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(g.x, g.baseY + h / 2, g.z);
  mesh.rotation.y = g.rotY;
  mesh.renderOrder = 4;
  scene.add(mesh);
  const out = { mesh, mat, portal: null, label: null };
  out.portal = new Portal({
    x: g.x, z: g.z, nx: Math.sin(g.rotY), nz: Math.cos(g.rotY), halfW: w / 2 - 0.25, y0: g.baseY - 1.5, y1: g.baseY + 4,
  });
  if (locked) {
    const lab = labelSprite(['PRÓXIMAMENTE'], '#' + new THREE.Color(g.color).getHexString(), 3.0, '🔒');
    lab.position.set(g.x, g.baseY + 3.4, g.z);
    scene.add(lab);
    out.label = lab;
  }
  return out;
}

const WARP_COLORS = ['#35e0ff', '#2f7fff', '#8b5cf6', '#ff4fd8', '#dcf5ff'];
const WARP_FADE = 350, WARP_SWAP = 600, WARP_OUT = 850, WARP_END = 1200; // ms desde que empieza el viaje

// Túnel de luz a pantalla completa para viajar por un portal. El cambio de lugar ocurre con la pantalla cubierta.
export class Travel {
  constructor() {
    const el = document.createElement('canvas');
    el.id = 'portal-fade';
    Object.assign(el.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '14', pointerEvents: 'none',
      opacity: '0', display: 'none', transition: `opacity ${WARP_FADE}ms ease`,
    });
    document.body.appendChild(el);
    this.el = el;
    this.busy = false;
    this.streaks = [];
    for (let i = 0; i < 300; i++) {
      this.streaks.push({
        a: Math.random() * Math.PI * 2, r: Math.random(), speed: 0.5 + Math.random(),
        color: WARP_COLORS[i % WARP_COLORS.length], len: 0.4 + Math.random(), wide: i % 6 === 0,
      });
    }
  }
  // un cuadro del túnel; k: de 0 (arranque) a 1 (máxima velocidad)
  _draw(g, W, H, k, dt) {
    const reach = Math.hypot(W, H) / 2, cx = W / 2, cy = H / 2;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = '#030614';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const s of this.streaks) {
      s.r += s.speed * (0.25 + 1.6 * k) * (0.15 + s.r) * dt;
      if (s.r > 1.1) s.r = 0.02 + Math.random() * 0.1;
      const r0 = s.r * reach, r1 = r0 + s.len * (0.05 + 0.45 * k) * (0.1 + s.r) * reach;
      const dx = Math.cos(s.a), dy = Math.sin(s.a);
      g.strokeStyle = s.color;
      g.globalAlpha = s.wide ? 0.16 : Math.min(1, 0.25 + s.r * 1.1);
      g.lineWidth = s.wide ? 9 + 12 * s.r : 1 + 2.5 * s.r;
      g.beginPath();
      g.moveTo(cx + dx * r0, cy + dy * r0);
      g.lineTo(cx + dx * r1, cy + dy * r1);
      g.stroke();
    }
  }
  go({ apply, after }) {
    if (this.busy) return;
    this.busy = true;
    const el = this.el, g = el.getContext('2d');
    el.width = innerWidth;
    el.height = innerHeight;
    el.style.display = 'block';
    const start = performance.now();
    let last = start;
    const frame = (now) => {
      if (!this.busy) return;
      const t = now - start, dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      this._draw(g, el.width, el.height, Math.min(1, Math.max(0, t / WARP_SWAP)), dt);
      requestAnimationFrame(frame);
    };
    frame(start);
    requestAnimationFrame(() => { el.style.opacity = '1'; }); // tras el primer cuadro, para que la transición corra
    // los tiempos no dependen del dibujo: si la pestaña queda en segundo plano, el viaje igual termina
    setTimeout(() => { try { apply && apply(); } catch (e) { console.error(e); } }, WARP_SWAP);
    setTimeout(() => { el.style.opacity = '0'; }, WARP_OUT);
    setTimeout(() => {
      this.busy = false;
      el.style.display = 'none';
      after && after();
    }, WARP_END);
  }
}
