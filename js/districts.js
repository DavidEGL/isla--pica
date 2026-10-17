// Plaza Central + 4 districts (Neuro playable, others "Próximamente")
import * as THREE from 'three';
import { PADS, heightAt, SPAWN } from './terrain.js';
import { makeSign, textTexture, mulberry32, softSpriteTexture, bakeStatic } from './util.js';

// STEAM district geometry shared with the Sala de Matemáticas (door faces the plaza)
export const STEAM_GEO = (() => {
  const P = PADS.plaza, S = PADS.steam, d = Math.hypot(P.x - S.x, P.z - S.z);
  const dx = (P.x - S.x) / d, dz = (P.z - S.z) / d;
  return {
    dx, dz, rot: Math.atan2(dx, dz),
    door: { x: S.x + dx * 3, z: S.z + dz * 3 },
    arrive: { x: S.x + dx * 21, z: S.z + dz * 21, yaw: Math.atan2(-dx, -dz) },
    arch: { x: S.x + dx * (S.r - 1.8), z: S.z + dz * (S.r - 1.8) },
  };
})();

export function holoMaterial(color = 0x35e0ff, opts = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: opts.side ?? THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(color) }, intensity: { value: opts.intensity ?? 1 }, lines: { value: opts.lines ?? 40 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float time, intensity, lines; uniform vec3 col; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float scan = 0.65 + 0.35*sin(vP.y*lines - time*4.0);
        float a = (0.12 + f*0.9) * scan * intensity;
        gl_FragColor = vec4(col*(0.6+f*1.4), a); }`,
  });
}

export function glassMaterial(color = 0x9fe8ff) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float time; uniform vec3 col; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      float hex(vec2 p){ p.x *= 1.1547; p.y += mod(floor(p.x),2.0)*0.5; p = abs(fract(p)-0.5); return abs(max(p.x*1.5+p.y, p.y*2.0)-1.0); }
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
        float h = smoothstep(0.0, 0.08, hex(vUv*vec2(36.0, 14.0)));
        float line = 1.0 - h;
        float sweep = smoothstep(0.96, 1.0, sin(vUv.y*6.0 - time*0.8)*0.5+0.5);
        vec3 c = col*(0.5+f) + vec3(1.0)*line*0.35 + col*sweep*0.6;
        float a = 0.10 + f*0.45 + line*0.22 + sweep*0.15;
        gl_FragColor = vec4(c, a); }`,
  });
}

const white = () => new THREE.MeshStandardMaterial({ color: 0xf1f5f8, roughness: 0.45, metalness: 0.05 });
const emissive = (c, i = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });

function radialFloorTexture(base, line, accent, rings = 6, spokes = 24) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  const rnd = mulberry32(7);
  for (let r = 0; r < rings; r++) {
    const r0 = (r / rings) * S / 2, r1 = ((r + 1) / rings) * S / 2;
    const sp = spokes * (r + 1) / 2 | 0 || 4;
    for (let k = 0; k < sp; k++) {
      const a0 = (k / sp) * Math.PI * 2, a1 = ((k + 1) / sp) * Math.PI * 2;
      g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath();
      const v = 230 + rnd() * 22 | 0;
      g.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
      g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = line; g.lineWidth = 3; g.stroke();
    }
  }
  g.strokeStyle = accent; g.lineWidth = 10;
  for (const rr of [0.18, 0.5, 0.97]) { g.beginPath(); g.arc(0, 0, rr * S / 2, 0, Math.PI * 2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function hexFloorTexture(base, line, glow) {
  // seamless tile: width = 4 hex columns, height = 4 hex rows (R*1.5*4)
  const R = 48, w = Math.sqrt(3) * R;
  const W = Math.round(w * 4), H = Math.round(R * 1.5 * 4);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const S = Math.max(W, H);
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let row = -1; row < 6; row++) for (let col = -1; col < 6; col++) {
    const cx = col * w + (row % 2) * w / 2, cy = row * R * 1.5;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    g.closePath();
    g.strokeStyle = line; g.lineWidth = 5; g.stroke();
    if ((row * 7 + col * 3) % 11 === 0) { g.fillStyle = glow; g.globalAlpha = 0.18; g.fill(); g.globalAlpha = 1; }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.tile = 12; // meters per tile
  return t;
}

function floorDisk(pad, tex, r = pad.r - 1) {
  if (tex.userData && tex.userData.tile) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const rep = (r * 2) / tex.userData.tile;
    tex.repeat.set(rep, rep);
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 72), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(pad.x, pad.h + 0.03, pad.z);
  m.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.25, 6, 96), white());
  rim.rotation.x = Math.PI / 2;
  rim.position.set(pad.x, pad.h + 0.08, pad.z);
  return [m, rim];
}

function arch(color, title, subtitle, colliders, x, z, rotY, baseY, width = 8) {
  const g = new THREE.Group();
  const pillarMat = white();
  const glow = emissive(color, 1.4);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 7.5, 1.1), pillarMat);
    p.position.set(s * width / 2, 3.75, 0);
    p.castShadow = true;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6.4, 1.14), glow);
    strip.position.set(s * (width / 2 - 0.47), 3.6, 0);
    g.add(p, strip);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 1.6, 1.1, 1.3), pillarMat);
  beam.position.y = 7.9;
  beam.castShadow = true;
  g.add(beam);
  const sign = makeSign([title, subtitle], width + 0.6, (width + 0.6) / 4, {
    border: '#' + new THREE.Color(color).getHexString(), sub: '#ffffff', bg: 'rgba(10,24,48,0.92)',
  });
  sign.position.set(0, 9.6, 0);
  g.add(sign);
  g.position.set(x, baseY, z);
  g.rotation.y = rotY;
  // colliders for pillars
  for (const s of [-1, 1]) {
    const wx = x + Math.cos(rotY) * s * width / 2, wz = z - Math.sin(rotY) * s * width / 2;
    colliders.addCircle(wx, wz, 0.8, baseY - 1, baseY + 8, 'arch');
  }
  return g;
}

function lampPost(color = 0x35e0ff) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0x24324a, metalness: 0.5, roughness: 0.4 }));
  pole.position.y = 2.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), emissive(color, 2.2));
  head.position.y = 4.35;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 12), white());
  cap.position.y = 4.75;
  g.add(pole, head, cap);
  return g;
}

function banner(text, color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 8, 6), white());
  pole.position.y = 4;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 768;
  const x = c.getContext('2d');
  const col = '#' + new THREE.Color(color).getHexString();
  const gr = x.createLinearGradient(0, 0, 0, 768);
  gr.addColorStop(0, col); gr.addColorStop(1, '#0b1b3a');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 768);
  x.fillStyle = '#fff'; x.font = '900 120px Nunito, system-ui, sans-serif'; x.textAlign = 'center';
  [...text].forEach((ch, i) => x.fillText(ch, 128, 170 + i * 140));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.2, 6, 10), new THREE.MeshStandardMaterial({ map: tex, side: THREE.FrontSide, roughness: 0.8 }));
  cloth.position.set(0.75, 5.4, 0);
  // back face with a horizontally flipped texture so the letters never read mirrored
  const texB = tex.clone();
  texB.repeat.x = -1; texB.offset.x = 1;
  cloth.add(new THREE.Mesh(cloth.geometry, new THREE.MeshStandardMaterial({ map: texB, side: THREE.BackSide, roughness: 0.8 })));
  g.add(pole, cloth);
  g.userData.cloth = cloth;
  return g;
}

function barrierWall(pad, color) {
  const geo = new THREE.CylinderGeometry(pad.r - 1, pad.r - 1, 9, 96, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float time; uniform vec3 col; varying vec2 vUv;
      void main(){ float stripes = 0.5+0.5*sin(vUv.x*380.0 + time*2.0);
        float bands = smoothstep(0.92,1.0, sin(vUv.y*12.0 - time*1.6)*0.5+0.5);
        float fade = (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y);
        float a = (0.10 + stripes*0.06 + bands*0.3) * fade + smoothstep(0.03,0.0,vUv.y)*0.6;
        gl_FragColor = vec4(col, a); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pad.x, pad.h + 4.5, pad.z);
  return m;
}

function gearGeometry(R, teeth, depth) {
  const shape = new THREE.Shape();
  const inner = R * 0.82;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 ? inner : R;
    if (i === 0) shape.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    shape.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    shape.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, R * 0.3, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
  g.center();
  return g;
}

// Neuron-like glowing tree sculpture
function neuronTree(color, rnd) {
  const g = new THREE.Group();
  const mat = emissive(color, 1.3);
  const soma = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), mat.clone());
  soma.position.y = 4;
  soma.userData.dynamic = true;
  g.add(soma);
  const branch = (from, dir, len, depth) => {
    const to = from.clone().add(dir.clone().multiplyScalar(len));
    const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).add(new THREE.Vector3((rnd() - 0.5) * 0.6, 0.3, (rnd() - 0.5) * 0.6)), to);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.09 * (depth + 1) * 0.6, 5), mat));
    if (depth > 0) for (let k = 0; k < 2; k++) {
      const nd = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.4, rnd() * 0.6, (rnd() - 0.5) * 1.4)).normalize();
      branch(to, nd, len * 0.65, depth - 1);
    } else {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), mat);
      tip.position.copy(to);
      g.add(tip);
    }
  };
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rnd();
    branch(soma.position.clone(), new THREE.Vector3(Math.cos(a), 0.7, Math.sin(a)).normalize(), 1.8, 2);
  }
  // trunk (axon) to ground
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 4, 6), mat).translateY(2));
  return g;
}

export function buildDistricts(scene, colliders, kenney) {
  const animated = [];   // objects needing update(t)
  const holoMats = [];
  const rnd = mulberry32(2024);
  const root = new THREE.Group();
  scene.add(root);

  // ---------------- PLAZA
  const P = PADS.plaza;
  root.add(...floorDisk(P, radialFloorTexture('#e9eef2', 'rgba(150,170,190,0.45)', '#35e0ff')));
  // tiers
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.8, 0.8, 48), white());
  tier1.position.set(P.x, P.h + 0.4, P.z);
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.8, 48), white());
  tier2.position.set(P.x, P.h + 1.2, P.z);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.1, 6, 64), emissive(0x35e0ff, 2));
  ring1.rotation.x = Math.PI / 2; ring1.position.set(P.x, P.h + 0.82, P.z);
  const ring2 = ring1.clone(); ring2.scale.setScalar(4.3 / 6.5); ring2.position.y = P.h + 1.62;
  [tier1, tier2].forEach((m) => { m.castShadow = m.receiveShadow = true; });
  root.add(tier1, tier2, ring1, ring2);
  colliders.addCircle(P.x, P.z, 6.6, P.h - 1, P.h + 0.8, 'tier');
  colliders.addCircle(P.x, P.z, 4.4, P.h - 1, P.h + 1.6, 'tier');
  // holographic globe
  const globe = new THREE.Group();
  globe.position.set(P.x, P.h + 8.5, P.z);
  const gm = holoMaterial(0x35e0ff, { intensity: 1.2, lines: 6 });
  holoMats.push(gm);
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(3.6, 48, 32), gm));
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(3.65, 24, 14)), new THREE.LineBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
  globe.add(wire);
  // continents-ish dots
  const dotGeo = new THREE.SphereGeometry(0.09, 5, 4);
  const dotMat = emissive(0xb6fbff, 2.5);
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, 380);
  const mm = new THREE.Matrix4();
  let di = 0;
  for (let i = 0; i < 2400 && di < 380; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    const v = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), u, Math.sqrt(1 - u * u) * Math.sin(th));
    const lat = Math.asin(v.y), lon = th;
    const land = Math.sin(lon * 2.0 + 1.3) * Math.cos(lat * 3.0) + Math.sin(lon * 3.7) * 0.5;
    if (land < 0.45) continue;
    mm.makeTranslation(v.x * 3.62, v.y * 3.62, v.z * 3.62);
    dots.setMatrixAt(di++, mm);
  }
  dots.count = di;
  globe.add(dots);
  const orbit1 = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.06, 6, 96), emissive(0x35e0ff, 2.2));
  const orbit2 = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.05, 6, 96), emissive(0x8b5cf6, 2.2));
  orbit1.rotation.x = 1.2; orbit2.rotation.x = 1.9; orbit2.rotation.y = 0.6;
  globe.add(orbit1, orbit2);
  globe.userData.dynamic = true;
  root.add(globe);
  const beamMat = holoMaterial(0x35e0ff, { intensity: 0.6, lines: 3 });
  holoMats.push(beamMat);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 5.5, 32, 1, true), beamMat);
  beam.position.set(P.x, P.h + 4.3, P.z);
  root.add(beam);
  animated.push((t) => { globe.rotation.y = t * 0.25; orbit1.rotation.z = t * 0.6; orbit2.rotation.z = -t * 0.45; globe.position.y = P.h + 8.5 + Math.sin(t) * 0.25; });
  // plaza sign
  const plazaSign = makeSign(['PLAZA CENTRAL', 'Tu punto de partida'], 7, 1.75);
  plazaSign.position.set(P.x, P.h + 3.6, P.z + 7.2);
  root.add(plazaSign);
  // lamps + banners + planters
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.11;
    const l = lampPost(i % 2 ? 0x35e0ff : 0xffb020);
    l.position.set(P.x + Math.cos(a) * 27.5, P.h, P.z + Math.sin(a) * 27.5);
    root.add(l);
    colliders.addCircle(l.position.x, l.position.z, 0.3, P.h - 1, P.h + 4.5, 'lamp');
  }
  const bannerCols = [0x35e0ff, 0x8b5cf6, 0xffb020, 0x22c55e];
  const banners = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const b = banner('EPIC', bannerCols[i % 4]);
    b.position.set(P.x + Math.cos(a) * 18.5, P.h, P.z + Math.sin(a) * 18.5);
    b.rotation.y = -a;
    b.userData.dynamic = true;
    root.add(b);
    banners.push(b);
    colliders.addCircle(b.position.x, b.position.z, 0.25, P.h - 1, P.h + 8, 'pole');
  }
  animated.push((t) => banners.forEach((b, i) => { b.userData.cloth.rotation.y = Math.sin(t * 1.4 + i) * 0.18; }));
  const planterMat = white();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = P.x + Math.cos(a) * 11.5, z = P.z + Math.sin(a) * 11.5;
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.3, 0.8, 20), planterMat);
    pl.position.set(x, P.h + 0.4, z);
    pl.castShadow = true;
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshStandardMaterial({ color: 0x4caf50, flatShading: true }));
    bush.position.set(x, P.h + 1.3, z);
    bush.scale.y = 0.8;
    const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), emissive([0xff6fa8, 0xffd23f, 0xb57bff][i % 3], 0.4));
    fl.position.set(x + 0.5, P.h + 1.9, z);
    root.add(pl, bush, fl);
    colliders.addCircle(x, z, 1.5, P.h - 1, P.h + 0.8, 'planter');
  }

  // ---------------- District gates on plaza edge
  const gateDefs = [
    { key: 'neuro', color: 0xffb020, t: 'DISTRITO NEURO', s: 'Neurociencia · Bienestar', ang: Math.PI },
    { key: 'steam', color: 0x8b5cf6, t: 'DISTRITO STEAM', s: 'Ciencia · Arte · Creatividad', ang: -1.95 },
    { key: 'english', color: 0x3b82f6, t: 'DISTRITO ENGLISH', s: 'Comunicación Global', ang: -1.13 },
    { key: 'tech', color: 0x22c55e, t: 'DISTRITO TECHNOLOGY', s: 'Innovación · IA · Futuro', ang: -0.08 },
  ];
  const gates = [];
  for (const gd of gateDefs) {
    const x = P.x + Math.cos(gd.ang) * (P.r - 1.5), z = P.z + Math.sin(gd.ang) * (P.r - 1.5);
    root.add(arch(gd.color, gd.t, gd.s, colliders, x, z, -gd.ang + Math.PI / 2, P.h, 7));
    gates.push({ key: gd.key, color: gd.color, x, z, rotY: -gd.ang + Math.PI / 2, baseY: P.h, width: 7 });
  }

  // ---------------- Spawn welcome
  const sh = heightAt(SPAWN.x, SPAWN.z);
  const welcome = makeSign(['BIENVENIDO A EPIC ISLAND', 'Explora · Aprende · Crea'], 9, 2.25, { border: '#35e0ff' });
  welcome.position.set(SPAWN.x, sh + 4.6, SPAWN.z - 7);
  root.add(welcome);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 5, 8), white());
    p.position.set(SPAWN.x + s * 4.2, sh + 2.4, SPAWN.z - 7);
    root.add(p);
    colliders.addCircle(p.position.x, p.position.z, 0.3, sh - 1, sh + 5, 'pole');
  }
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.3, 40), white());
  pad.position.set(SPAWN.x, sh + 0.05, SPAWN.z);
  pad.receiveShadow = true;
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(3, 0.08, 6, 64), emissive(0x35e0ff, 2));
  padRing.rotation.x = Math.PI / 2; padRing.position.set(SPAWN.x, sh + 0.22, SPAWN.z);
  root.add(pad, padRing);
  colliders.addCircle(SPAWN.x, SPAWN.z, 3.1, sh - 1, sh + 0.2, 'spawn');

  // ---------------- NEURO DISTRICT
  const N = PADS.neuro;
  root.add(...floorDisk(N, hexFloorTexture('#eef3f6', 'rgba(53,224,255,0.35)', 'rgba(255,176,32,0.9)')));
  const dome = { x: N.x - 14, z: N.z, r: 15, y: N.h };
  const glass = glassMaterial(0x7fe6ff);
  holoMats.push(glass);
  const gap = 0.75;
  const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(dome.r, 64, 24, Math.PI + gap / 2, Math.PI * 2 - gap, 0, Math.PI / 2), glass);
  domeMesh.scale.y = 0.85;
  domeMesh.position.set(dome.x, dome.y, dome.z);
  domeMesh.renderOrder = 3;
  root.add(domeMesh);
  const frameMat = white();
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(dome.r, 0.35, 8, 96), frameMat);
  baseRing.rotation.x = Math.PI / 2; baseRing.position.set(dome.x, dome.y + 0.2, dome.z);
  root.add(baseRing);
  for (let k = 0; k < 12; k++) {
    const phi = (k / 12) * Math.PI * 2;
    // skip ribs crossing the entrance (towards +x)
    const dx = Math.cos(phi);
    if (dx > 0.93) continue;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(dome.r, 0.16, 6, 40, Math.PI / 2), frameMat);
    rib.scale.set(1, 0.85, 1);
    rib.rotation.y = -phi;
    rib.position.set(dome.x, dome.y, dome.z);
    root.add(rib);
  }
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.3, 8, 40), emissive(0xffb020, 1.6));
  topRing.rotation.x = Math.PI / 2; topRing.position.set(dome.x, dome.y + dome.r * 0.85 - 0.3, dome.z);
  root.add(topRing);
  // dome collider ring with entrance gap facing +x
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const ax = Math.cos(a), az = Math.sin(a);
    if (ax > Math.cos(gap / 2 + 0.06)) continue;
    colliders.addCircle(dome.x + ax * dome.r, dome.z + az * dome.r, 0.95, dome.y - 2, dome.y + 12, 'dome');
  }
  // entrance frame
  const entr = arch(0xffb020, 'LABORATORIO CENTRAL', 'NeuroAventura', colliders, dome.x + dome.r + 0.6, dome.z, Math.PI / 2, dome.y, 9.4);
  root.add(entr);
  // inner pedestal
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 1.0, 40), white());
  ped.position.set(dome.x, dome.y + 0.5, dome.z);
  ped.castShadow = ped.receiveShadow = true;
  const pedRing = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.09, 6, 64), emissive(0xffb020, 2));
  pedRing.rotation.x = Math.PI / 2; pedRing.position.set(dome.x, dome.y + 1.02, dome.z);
  root.add(ped, pedRing);
  colliders.addCircle(dome.x, dome.z, 3.6, dome.y - 1, dome.y + 1.0, 'ped');
  // district entrance arch from the path
  root.add(arch(0xffb020, 'DISTRITO NEURO', 'Neurociencia · Bienestar', colliders, N.x + N.r - 1, N.z + 2, Math.PI / 2, N.h, 9));
  const neuroGate = { key: 'plaza', color: 0x35e0ff, x: N.x + N.r - 1, z: N.z + 2, rotY: Math.PI / 2, baseY: N.h, width: 9 };
  // neuron trees + electric pylons
  const treeSpots = [[-96, -6], [-100, 30], [-150, 26], [-152, -22], [-112, -40], [-84, 22]];
  const nts = [];
  treeSpots.forEach(([x, z], i) => {
    const nt = neuronTree(i % 2 ? 0x35e0ff : 0xb57bff, rnd);
    nt.position.set(x, N.h, z);
    root.add(nt);
    nts.push(nt);
    colliders.addCircle(x, z, 0.5, N.h - 1, N.h + 4, 'ntree');
  });
  animated.push((t) => nts.forEach((n, i) => { n.children[0].scale.setScalar(1 + Math.sin(t * 3 + i) * 0.12); }));
  // banner-sign over district
  const ns = makeSign(['NEUROAVENTURA', 'Misión: Señal Vital'], 8, 2, { border: '#ffb020', sub: '#ffe3a1' });
  ns.position.set(dome.x, dome.y + 16.5, dome.z);
  ns.userData.dynamic = true;
  root.add(ns);
  animated.push((t, cam) => { if (cam) { ns.lookAt(cam.position.x, ns.position.y, cam.position.z); } });

  // ---------------- STEAM district (Sala de Matemáticas)
  const S = PADS.steam;
  const SA = STEAM_GEO.arch;
  root.add(arch(0x8b5cf6, 'DISTRITO STEAM', 'Ciencia · Arte · Creatividad', colliders, SA.x, SA.z, STEAM_GEO.rot, S.h, 9));
  const steamGate = { key: 'plaza', color: 0x35e0ff, x: SA.x, z: SA.z, rotY: STEAM_GEO.rot, baseY: S.h, width: 9 };
  root.add(...floorDisk(S, radialFloorTexture('#efe9fb', 'rgba(139,92,246,0.35)', '#8b5cf6', 5, 18)));
  const obs = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 6, 32), white());
  cyl.position.y = 3;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.3, roughness: 0.3 }));
  cap.position.y = 6;
  const slit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 7.2), emissive(0xd9c6ff, 1.2));
  slit.position.set(0, 8.5, 0); slit.rotation.z = 0.5; slit.scale.set(1, 1, 0.98);
  obs.add(cyl, cap);
  obs.position.set(S.x - 8, S.h, S.z - 6);
  root.add(obs);
  const gears = [];
  const gMat = new THREE.MeshStandardMaterial({ color: 0xffb020, metalness: 0.6, roughness: 0.35 });
  const gMat2 = new THREE.MeshStandardMaterial({ color: 0xc7b8f5, metalness: 0.5, roughness: 0.35 });
  [[5, 16, 0, 9, 10], [3.2, 11, 7.6, 12.6, 10], [2.2, 9, -5.6, 14, 10]].forEach(([R, teeth, ox, oy, oz], i) => {
    const gear = new THREE.Mesh(gearGeometry(R, teeth, 0.9), i % 2 ? gMat2 : gMat);
    gear.position.set(S.x + 6 + ox * 0.6, S.h + oy, S.z + oz - 18);
    gear.castShadow = true;
    gear.userData.speed = (i % 2 ? -1 : 1) * (1.6 / R);
    gear.userData.dynamic = true;
    root.add(gear);
    gears.push(gear);
  });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 14, 3), white());
  tower.position.set(S.x + 6, S.h + 7, S.z - 8);
  root.add(tower);
  const coil = new THREE.Group();
  const coilBase = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 9, 12), new THREE.MeshStandardMaterial({ color: 0x5b4b8a, metalness: 0.5, roughness: 0.3 }));
  coilBase.position.y = 4.5;
  const coilTop = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.55, 12, 24), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.2 }));
  coilTop.position.y = 9.5; coilTop.rotation.x = Math.PI / 2;
  const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), emissive(0xd9c6ff, 3));
  spark.position.y = 9.5;
  spark.userData.dynamic = true;
  coil.add(coilBase, coilTop, spark);
  coil.position.set(S.x + 12, S.h, S.z + 8);
  root.add(coil);
  animated.push((t) => { gears.forEach((g) => { g.rotation.z = t * g.userData.speed; }); spark.scale.setScalar(0.8 + Math.random() * 0.5); });

  // ---------------- ENGLISH (coming soon) — village of Kenney buildings
  const E = PADS.english;
  root.add(...floorDisk(E, radialFloorTexture('#eaf1fd', 'rgba(59,130,246,0.35)', '#3b82f6', 5, 20)));
  if (kenney && kenney.city && kenney.city.length) {
    const list = kenney.city;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const b = list[i % list.length].clone();
      b.scale.setScalar(5.2);
      b.position.set(E.x + Math.cos(a) * 18, E.h, E.z + Math.sin(a) * 18);
      b.rotation.y = -a - Math.PI / 2;
      b.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      root.add(b);
    }
  }
  const clock = new THREE.Group();
  const ct = new THREE.Mesh(new THREE.BoxGeometry(3.6, 16, 3.6), new THREE.MeshStandardMaterial({ color: 0xf5efe6, roughness: 0.6 }));
  ct.position.y = 8;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 4, 4), new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4 }));
  roof.position.y = 18; roof.rotation.y = Math.PI / 4;
  const face = makeSign(['HELLO!', '¡Hola!'], 3, 1.5, { border: '#3b82f6', sub: '#bcd6ff', width: 512, height: 256, sizes: [90, 60] });
  face.position.set(0, 13, 1.82);
  clock.add(ct, roof, face);
  clock.position.set(E.x, E.h, E.z);
  root.add(clock);
  // bunting
  const flagCols = [0xff6b6b, 0xffd23f, 0x3b82f6, 0x22c55e, 0xb57bff, 0xff8a3d];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p0 = new THREE.Vector3(E.x, E.h + 15, E.z);
    const p1 = new THREE.Vector3(E.x + Math.cos(a) * 18, E.h + 9, E.z + Math.sin(a) * 18);
    for (let f = 1; f < 10; f++) {
      const p = p0.clone().lerp(p1, f / 10);
      p.y -= Math.sin((f / 10) * Math.PI) * 1.2;
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 3), new THREE.MeshStandardMaterial({ color: flagCols[(f + k) % 6], side: THREE.DoubleSide }));
      fl.position.copy(p).add(new THREE.Vector3(0, -0.4, 0));
      fl.rotation.x = Math.PI;
      root.add(fl);
    }
  }

  // ---------------- TECHNOLOGY (coming soon)
  const T = PADS.tech;
  root.add(...floorDisk(T, hexFloorTexture('#edf6f0', 'rgba(34,197,94,0.35)', 'rgba(34,197,94,0.9)')));
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xeef2f5, metalness: 0.4, roughness: 0.25 });
  const stripMat = emissive(0x22e07a, 2);
  [[0, -8, 26], [9, 6, 18], [-10, 7, 21]].forEach(([ox, oz, h], i) => {
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, h, 6), towerMat);
    tw.position.set(T.x + ox, T.h + h / 2, T.z + oz);
    tw.castShadow = true;
    root.add(tw);
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(2.55 - k * 0.05, 0.08, 6, 6), stripMat);
      s.rotation.x = Math.PI / 2;
      s.position.set(T.x + ox, T.h + 3 + k * (h / 4.5), T.z + oz);
      root.add(s);
    }
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), emissive(0x7dffb5, 2.4));
    tip.position.set(T.x + ox, T.h + h + 1.6, T.z + oz);
    tip.userData.dynamic = true;
    root.add(tip);
    animated.push((t) => { tip.rotation.y = t * (1 + i * 0.3); tip.position.y = T.h + h + 1.6 + Math.sin(t * 1.5 + i) * 0.3; });
  });
  const bigRing = new THREE.Mesh(new THREE.TorusGeometry(7, 0.5, 12, 80), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x0f7a3a, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.3 }));
  bigRing.position.set(T.x + 2, T.h + 10, T.z + 2);
  bigRing.userData.dynamic = true;
  root.add(bigRing);
  const screenMat = holoMaterial(0x22e07a, { intensity: 1.1, lines: 18 });
  holoMats.push(screenMat);
  for (let k = 0; k < 4; k++) {
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), screenMat);
    const a = (k / 4) * Math.PI * 2;
    sc.position.set(T.x + Math.cos(a) * 14, T.h + 4.5, T.z + Math.sin(a) * 14);
    sc.lookAt(T.x, T.h + 4.5, T.z);
    root.add(sc);
  }
  animated.push((t) => { bigRing.rotation.y = t * 0.4; bigRing.rotation.x = Math.sin(t * 0.3) * 0.4; });

  // ---------------- barriers + "Próximamente" signs + colliders
  const locked = [];
  for (const [key, color, title] of [['english', 0x3b82f6, 'DISTRITO ENGLISH'], ['tech', 0x22c55e, 'DISTRITO TECHNOLOGY']]) {
    const pd = PADS[key];
    const wall = barrierWall(pd, color);
    root.add(wall);
    holoMats.push(wall.material);
    const R = pd.r - 1;
    for (let k = 0; k < 90; k++) {
      const a = (k / 90) * Math.PI * 2;
      colliders.addCircle(pd.x + Math.cos(a) * R, pd.z + Math.sin(a) * R, 1.3, pd.h - 6, pd.h + 30, 'barrier');
    }
    // sign facing the plaza
    const toP = Math.atan2(P.z - pd.z, P.x - pd.x);
    const sx = pd.x + Math.cos(toP) * (pd.r + 1), sz = pd.z + Math.sin(toP) * (pd.r + 1);
    const g = heightAt(sx, sz);
    const sign = makeSign([title, 'PRÓXIMAMENTE'], 7, 1.75, { border: '#' + new THREE.Color(color).getHexString(), sub: '#ffe3a1' });
    sign.position.set(sx, Math.max(g, pd.h - 2) + 4.2, sz);
    sign.lookAt(P.x, sign.position.y, P.z);
    root.add(sign);
    locked.push({ key, x: pd.x, z: pd.z, r: pd.r, title });
  }

  root.userData.baked = bakeStatic(root);
  return {
    root, dome, locked, gates, neuroGate, steamGate,
    update(t, cam) {
      for (const m of holoMats) m.uniforms.time.value = t;
      for (const f of animated) f(t, cam);
    },
  };
}
