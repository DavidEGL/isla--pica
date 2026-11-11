// Plaza Central + 4 districts (Neuro playable, others "Próximamente")
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PADS, heightAt, SPAWN } from './terrain.js';
import { makeSign, textTexture, mulberry32, softSpriteTexture, bakeStatic } from './util.js';
import { gateArchFrame, addGateArchColliders, PORTAL_MATS, facetedCyl } from './labstyle.js';
import { meshShape } from './colliders.js';

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
  rim.scale.z = 0.14;
  rim.position.set(pad.x, pad.h + 0.04, pad.z);
  return [m, rim];
}

function arch(color, title, subtitle, colliders, x, z, rotY, baseY, width = 8) {
  const g = gateArchFrame(emissive(color, 1.4), width);
  const sign = makeSign([title, subtitle], width + 0.6, (width + 0.6) / 4, {
    border: '#' + new THREE.Color(color).getHexString(), sub: '#ffffff', bg: 'rgba(10,24,48,0.92)',
  });
  sign.position.set(0, 9.6, 0);
  g.add(sign);
  g.position.set(x, baseY, z);
  g.rotation.y = rotY;
  addGateArchColliders(colliders, x, z, rotY, baseY, width, 'arch');
  return g;
}

// perfiles [radio, altura] de la farola, de abajo hacia arriba
const LAMP_BODY = [[0.34, 0], [0.34, 0.12], [0.26, 0.3], [0.22, 0.42], [0.18, 1.55], [0.2, 1.62], [0.1, 1.8], [0.075, 1.9], [0.07, 3.75], [0.11, 3.9], [0.1, 3.98], [0.22, 4.02], [0.22, 4.05]];
const LAMP_ROOF = [[0, 4.62], [0.26, 4.62], [0.38, 4.7], [0.34, 4.82], [0.2, 4.92], [0.07, 4.98], [0.05, 5.0], [0.09, 5.06], [0, 5.2]];
const lathe8 = (profile) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 8);

// Farola facetada de 8 lados: base y poste, linterna luminosa con marco, y techo con remate
function lampPost(color = 0x35e0ff) {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x24324a, metalness: 0.5, roughness: 0.4, flatShading: true });
  const roofMat = white();
  roofMat.flatShading = true;
  const glowMat = emissive(color, 2.2);
  glowMat.flatShading = true;
  const R0 = 0.2, R1 = 0.3, Y0 = 4.05, Y1 = 4.65; // linterna: más ancha arriba
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R1, R0, Y1 - Y0, 8), glowMat);
  glass.position.y = (Y0 + Y1) / 2;
  g.add(new THREE.Mesh(lathe8(LAMP_BODY), frame), glass, new THREE.Mesh(lathe8(LAMP_ROOF), roofMat));
  const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2, sin = Math.sin(th), cos = Math.cos(th);
    a.set(sin * R0, Y0, cos * R0);
    b.set(sin * R1, Y1, cos * R1);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, a.distanceTo(b), 5), frame);
    bar.position.copy(a).add(b).multiplyScalar(0.5);
    bar.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    g.add(bar);
  }
  return g;
}

const BANNER_W = 1.4, BANNER_H = 4.4;

// Bandera de plaza: poste metálico con base, dos brazos y panel con texto girado 90°.
// island: 'EPIC ISLAND' a dos tonos; si no, solo 'EPIC'.
function banner(island, color) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc4cbd2, metalness: 0.7, roughness: 0.35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 8, 10), metal);
  pole.position.y = 4;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 16), metal);
  foot.position.y = 0.06;
  g.add(pole, foot);
  for (const y of [3.1, 7.5]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), metal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.8, y, 0);
    g.add(arm);
  }
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1600;
  const x = c.getContext('2d');
  x.fillStyle = '#e6eaee'; x.fillRect(0, 0, 512, 1600);
  x.fillStyle = '#' + new THREE.Color(color).getHexString();
  x.fillRect(34, 0, 36, 1600); x.fillRect(442, 0, 36, 1600);
  // texto de abajo hacia arriba; se reduce hasta caber en el largo del panel
  const first = island ? 'EPIC ' : 'EPIC', second = island ? 'ISLAND' : '';
  const font = (px) => `900 ${px}px Nunito, system-ui, sans-serif`;
  x.font = font(300);
  const px = Math.floor(300 * Math.min(1, 1408 / x.measureText(first + second).width));
  x.font = font(px);
  const w1 = x.measureText(first).width, w2 = x.measureText(second).width;
  x.translate(256, 800);
  x.rotate(-Math.PI / 2);
  x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillStyle = '#0b1b3a'; x.fillText(first, -(w1 + w2) / 2, 0);
  x.fillStyle = '#' + new THREE.Color(color).multiplyScalar(0.6).getHexString(); x.fillText(second, -(w1 + w2) / 2 + w1, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(BANNER_W, BANNER_H, 8, 12), new THREE.MeshStandardMaterial({ map: tex, side: THREE.FrontSide, roughness: 0.8 }));
  cloth.position.set(0.13 + BANNER_W / 2, 5.3, 0);
  cloth.userData.dynamic = true; // el poste y los brazos se unen a la plaza estática; el panel se anima
  // back face with a horizontally flipped texture so the letters never read mirrored
  const texB = tex.clone();
  texB.repeat.x = -1; texB.offset.x = 1;
  cloth.add(new THREE.Mesh(cloth.geometry, new THREE.MeshStandardMaterial({ map: texB, side: THREE.BackSide, roughness: 0.8 })));
  g.add(cloth);
  g.userData.cloth = cloth;
  return g;
}

// Onda del panel; no mueve el borde del poste ni los bordes sujetos a los brazos. amp 0 lo deja plano.
function waveBanner(geo, t, ph, amp) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / BANNER_W + 0.5, v = p.getY(i) / BANNER_H + 0.5;
    p.setZ(i, Math.sin(u * 5 + v * 5 - t * 2.4 + ph) * amp * u * Math.sin(Math.PI * v));
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
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

// Metal gastado: manchas oscuras y óxido sobre el color base, en unidades de mundo.
function wornTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d'), r = mulberry32(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 420; k++) {
    const rad = 1 + r() * r() * 16;
    g.fillStyle = r() < 0.65 ? `rgba(70,42,20,${0.04 + r() * 0.16})` : `rgba(255,226,170,${0.03 + r() * 0.12})`;
    g.beginPath(); g.arc(r() * 256, r() * 256, rad, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.3, 0.3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const GEAR_MATS = {
  brass: new THREE.MeshStandardMaterial({ color: 0xc2953f, metalness: 0.45, roughness: 0.42, map: wornTexture(3) }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc4703a, metalness: 0.45, roughness: 0.38, map: wornTexture(9) }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4a4b53, metalness: 0.4, roughness: 0.6, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c2d33, metalness: 0.4, roughness: 0.6, flatShading: true }),
};
// Contorno de un engranaje: mismos dientes para un mismo módulo m, así engranan con cualquier otro.
function gearOutline(N, m) {
  const rp = (m * N) / 2, root = rp - 1.2 * m, tip = rp + 0.95 * m, step = (Math.PI * 2) / N, half = step / 4;
  const pts = [];
  for (let k = 0; k < N; k++) {
    const a = k * step;
    for (const [r, h] of [[root, -half * 1.22], [rp, -half * 0.8], [tip, -half * 0.34], [tip, half * 0.34], [rp, half * 0.8], [root, half * 1.22]]) {
      pts.push([Math.cos(a + h) * r, Math.sin(a + h) * r]);
    }
  }
  return pts;
}
// Engranaje steampunk: cuerpo de latón con ventanas, aro de cobre, cubo de hierro y remaches. Gira sobre su eje z.
function steamGear(N, m, depth, bodyMat = GEAR_MATS.brass, opts = {}) {
  const g = new THREE.Group(), outline = gearOutline(N, m), rp = (m * N) / 2, root = rp - 1.2 * m;
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const hub = opts.hub ?? rp * 0.26, ro = opts.rimIn ?? root - m * 1.1, ri = opts.spokeIn ?? hub + m * 0.9, w = opts.windows ?? (N >= 20 ? 6 : 5), gap = opts.gap ?? 0.22;
  for (let k = 0; k < w; k++) {
    const a0 = (k / w) * Math.PI * 2 + gap, a1 = ((k + 1) / w) * Math.PI * 2 - gap, hole = new THREE.Path();
    hole.absarc(0, 0, ro, a0, a1, false);
    hole.absarc(0, 0, ri, a1, a0, true);
    shape.holes.push(hole);
  }
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.04, bevelSegments: 1 }).translate(0, 0, -depth / 2), bodyMat);
  body.castShadow = true;
  g.add(body);
  // aro de cobre en ambas caras
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(root - m * 0.55, m * 0.2, 6, Math.max(32, N * 3)), GEAR_MATS.copper);
    rim.position.z = s * (depth / 2 + 0.02);
    rim.scale.z = 0.6;
    g.add(rim);
  }
  // cubo: tambor de hierro, tapa de latón y eje
  const drum = new THREE.CylinderGeometry(hub, hub * 1.08, depth + 0.4, 14).rotateX(Math.PI / 2);
  const cap = new THREE.CylinderGeometry(hub * 0.5, hub * 0.68, 0.16, 8).rotateX(Math.PI / 2).translate(0, 0, depth / 2 + 0.26);
  g.add(new THREE.Mesh(drum, GEAR_MATS.iron), new THREE.Mesh(cap, GEAR_MATS.brass));
  // remaches en el aro y alrededor del cubo
  const rivets = [], rivet = new THREE.IcosahedronGeometry(Math.max(0.05, m * 0.14), 0);
  const ring = (r, count, z) => { for (let k = 0; k < count; k++) { const a = (k / count) * Math.PI * 2; rivets.push(rivet.clone().translate(Math.cos(a) * r, Math.sin(a) * r, z)); } };
  ring(root - m * 0.55, Math.round(N / 2), depth / 2 + 0.08);
  ring(root - m * 0.55, Math.round(N / 2), -depth / 2 - 0.08);
  ring(hub * 0.8, 8, depth / 2 + 0.22);
  g.add(new THREE.Mesh(mergeGeometries(rivets), GEAR_MATS.iron));
  Object.assign(g.userData, { N, m, rp, outline });
  return g;
}

// Casa del Distrito STEAM: mismo cuerpo blanco y cúpula violeta, con pocas ventanas, franja, claraboya,
// dos torres y una entrada en arco. front: ángulo hacia donde mira la entrada (x = sin, z = cos).
function dressSteamHouse(obs, colliders, front) {
  const violet = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.3, roughness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xc4a8ff, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x24406f, emissive: 0x1b4f8f, emissiveIntensity: 0.55, roughness: 0.2, side: THREE.DoubleSide });
  const shell = white();
  const wallR = (y) => 7.5 - y / 12;
  const ring = (y, h, rOff, th0, len, mat) => {
    const r0 = wallR(y - h / 2) + rOff, r1 = wallR(y + h / 2) + rOff;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, Math.max(6, Math.ceil(len * 12)), 1, true, th0, len), mat);
    m.position.y = y;
    m.material.side = THREE.DoubleSide;
    return m;
  };
  // franja continua alrededor del cuerpo
  obs.add(ring(1.15, 0.16, 0.03, 0, Math.PI * 2, violet));
  // pocas ventanas anchas con marco, repartidas por el cuerpo y sin tapar la entrada
  for (const off of [-1.15, 1.15, 2.6, -2.6]) {
    const len = 0.46;
    obs.add(ring(3.15, 1.5, 0.04, front + off - len / 2 - 0.03, len + 0.06, trim), ring(3.15, 1.22, 0.07, front + off - len / 2, len, glass));
  }
  // dos ventanas pequeñas en la cúpula
  const r = 7.05;
  for (const off of [-0.72, 0.72]) {
    const phi = front + off + Math.PI / 2;
    const f = new THREE.Mesh(new THREE.SphereGeometry(r + 0.03, 8, 5, phi - 0.2, 0.4, 0.86, 0.34), trim);
    const g = new THREE.Mesh(new THREE.SphereGeometry(r + 0.07, 8, 5, phi - 0.16, 0.32, 0.89, 0.28), glass);
    f.position.y = g.position.y = 6;
    f.material.side = THREE.DoubleSide;
    obs.add(f, g);
  }
  // claraboya blanca en lo alto de la cúpula, como un casquete
  const sky = new THREE.Mesh(new THREE.SphereGeometry(7.1, 32, 6, 0, Math.PI * 2, 0, 0.62), shell);
  sky.position.y = 6;
  const skyEdge = new THREE.Mesh(new THREE.TorusGeometry(7.1 * Math.sin(0.62), 0.1, 6, 40), trim);
  skyEdge.rotation.x = Math.PI / 2;
  skyEdge.position.y = 6 + 7.1 * Math.cos(0.62);
  obs.add(sky, skyEdge);
  const dirAt = (a, d) => [Math.sin(a) * d, Math.cos(a) * d];
  // torre gruesa sobre la cúpula, atrás a la derecha
  const [tx, tz] = dirAt(front + 2.05, 4.6);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 5.2, 18), shell);
  tower.position.set(tx, 10.6, tz);
  tower.castShadow = true;
  const towerCap = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), violet);
  towerCap.position.set(tx, 13.2, tz);
  const towerBand = new THREE.Mesh(new THREE.CylinderGeometry(1.29, 1.31, 0.14, 18), trim);
  towerBand.position.set(tx, 12.5, tz);
  obs.add(tower, towerCap, towerBand);
  const toTower = Math.atan2(-tx, -tz); // cara de la torre que da hacia la entrada
  for (const [y, w] of [[11.6, 0.8], [10.2, 0.8]]) {
    const win = new THREE.Mesh(new THREE.CylinderGeometry(1.31, 1.33, 0.46, 8, 1, true, toTower + Math.PI - w / 2, w), glass);
    win.position.set(tx, y, tz);
    obs.add(win);
  }
  // torre esbelta en el suelo, a la izquierda, con cabina redonda
  const [sx, sz] = dirAt(front - 1.5, 11);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.45, 0.4, 18), shell);
  foot.position.set(sx, 0.2, sz);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 8, 12), shell);
  mast.position.set(sx, 4.2, sz);
  mast.castShadow = true;
  const pod = new THREE.Mesh(new THREE.SphereGeometry(1.75, 20, 12), shell);
  pod.scale.y = 0.72;
  pod.position.set(sx, 8.8, sz);
  pod.castShadow = true;
  const podWin = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.72, 0.42, 20, 1, true), glass);
  podWin.position.set(sx, 8.95, sz);
  const podCap = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2), violet);
  podCap.scale.y = 0.55;
  podCap.position.set(sx, 9.7, sz);
  obs.add(foot, mast, pod, podWin, podCap);
  // entrada: cuerpo en arco que sale del muro, con marco violeta y puerta
  const W = 1.55, Hs = 2.2, D = 2.9;
  const arch = (w, hs) => {
    const s = new THREE.Shape();
    s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, hs); s.absarc(0, hs, w, 0, Math.PI, false); s.lineTo(-w, 0);
    return s;
  };
  const entry = new THREE.Group();
  const [ex, ez] = dirAt(front, 6.6);
  entry.position.set(ex, 0, ez);
  entry.rotation.y = front;
  const block = new THREE.Mesh(new THREE.ExtrudeGeometry(arch(W, Hs), { depth: D, bevelEnabled: false, curveSegments: 10 }), shell);
  block.castShadow = true;
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(arch(W + 0.16, Hs), { depth: 0.2, bevelEnabled: false, curveSegments: 10 }), violet);
  frame.position.z = D - 0.08;
  const door = new THREE.Mesh(new THREE.ExtrudeGeometry(arch(W - 0.4, Hs - 0.25), { depth: 0.12, bevelEnabled: false, curveSegments: 10 }), trim);
  door.position.z = D + 0.1;
  const split = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.1, 0.04), violet);
  split.position.set(0, 1.55, D + 0.23);
  const step = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 1, 0.14, 1.3), shell);
  step.position.set(0, 0.07, D + 0.55);
  entry.add(block, frame, door, split, step);
  obs.add(entry);
  // colisión: cuerpo, torre de suelo y entrada
  const px = obs.position.x, py = obs.position.y, pz = obs.position.z;
  colliders.addCircle(px, pz, 7.55, py - 1, py + 13, 'house');
  colliders.addCircle(px + sx, pz + sz, 0.75, py - 1, py + 7, 'house');
  const [bx, bz] = dirAt(front, 6.6 + D / 2);
  colliders.addBox(px + bx, pz + bz, W + 0.16, D / 2 + 0.1, front, py - 1, py + Hs + W, 'house');
}

// Máquina steampunk. Lógica: la caldera da vapor al cilindro, el pistón mueve la biela y la manivela del piñón;
// el piñón hace girar la gran rueda dentada, que lleva 3 engranajes en sus radios rodando sobre un sol fijo.
function steamMachine(x, y, z, colliders) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const M = 0.3, depth = 0.6, axleY = 9, planeZ = 2.15, frontZ = planeZ + 0.75;
  const addCyl = (rt, rb, h, px, py, pz, mat, seg = 8, axis = 'y') => {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (axis === 'z') geo.rotateX(Math.PI / 2);
    if (axis === 'x') geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const addBox = (w, h, d, px, py, pz, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const addBeam = (a, b, w, d, mat) => {
    const dir = b.clone().sub(a), m = new THREE.Mesh(new THREE.BoxGeometry(w, dir.length(), d), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    m.castShadow = true;
    g.add(m);
    return m;
  };

  // ---------------- poste de hierro: zócalo escalonado, fuste con bandas de latón y remate con farol
  addCyl(1.95, 2.25, 0.5, 0, 0.25, 0, GEAR_MATS.dark);
  addCyl(1.55, 1.85, 0.5, 0, 0.75, 0, GEAR_MATS.iron);
  addCyl(0.95, 1.3, 13.9, 0, 7.95, 0, GEAR_MATS.iron);
  for (const py of [1.3, 4.4, 13, 14.9]) {
    const k = (py - 1) / 13.9;
    addCyl(1.36 - k * 0.34, 1.4 - k * 0.34, 0.34, 0, py, 0, GEAR_MATS.brass);
  }
  addCyl(1.25, 1.02, 0.4, 0, 15.2, 0, GEAR_MATS.dark);
  addCyl(0.5, 0.5, 1, 0, 15.9, 0, emissive(0xffc266, 1.8), 8);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; addCyl(0.05, 0.05, 1, Math.cos(a) * 0.55, 15.9, Math.sin(a) * 0.55, GEAR_MATS.dark, 5); }
  addCyl(0.08, 0.95, 0.75, 0, 16.75, 0, GEAR_MATS.copper);
  // cojinete que une el poste con el eje de la rueda
  addBox(2.4, 2.4, 1.55, 0, axleY, 1.25, GEAR_MATS.dark);
  addCyl(0.55, 0.55, frontZ + 0.7 - 1, 0, axleY, (frontZ + 0.7 + 1) / 2, GEAR_MATS.iron, 12, 'z');
  addCyl(0.3, 0.72, 0.28, 0, axleY, frontZ + 0.82, GEAR_MATS.brass, 8, 'z').rotation.x = 0;

  // ---------------- gran rueda dentada (como un plato) con 3 radios, que hace de portaengranajes
  const wheel = steamGear(44, M, depth, GEAR_MATS.copper, { hub: 1.25, rimIn: 5.55, spokeIn: 1.45, windows: 6, gap: 0.075 });
  wheel.position.set(0, axleY, planeZ);
  wheel.userData.dynamic = true;
  g.add(wheel);

  // sol fijo en el centro y 3 engranajes que ruedan sobre él, sujetos a los radios
  const sun = steamGear(14, M, 0.5, GEAR_MATS.brass, { hub: 0.58, windows: 5, gap: 0.3 });
  sun.position.set(0, axleY, frontZ);
  sun.userData.dynamic = true;
  g.add(sun);
  const Ws = 0.16, wheelSpeed = Ws, planetR = (M * (14 + 10)) / 2;
  const planets = [];
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2;
    const pl = steamGear(10, M, 0.5, GEAR_MATS.brass, { hub: 0.4, windows: 3, gap: 0.42 });
    pl.position.set(Math.cos(ang) * planetR, Math.sin(ang) * planetR, frontZ - planeZ);
    // eje del engranaje, que atraviesa hasta el radio de la rueda
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, frontZ - planeZ, 10).rotateX(Math.PI / 2), GEAR_MATS.dark);
    pin.position.set(pl.position.x, pl.position.y, (frontZ - planeZ) / 2);
    wheel.add(pin, pl);
    // diente del sol dentro de un hueco del engranaje en el arranque (ángulo de mundo con la rueda en 0)
    const pSun = (ang * 14) / (Math.PI * 2);
    const phase = ang + Math.PI - ((0.5 - pSun) * Math.PI * 2) / 10;
    pl.userData.phase = phase;
    pl.userData.local = (Ws * 14) / 10; // en la rueda gira así; visto de fuera suma el giro de la rueda
    pl.rotation.z = phase;
    planets.push(pl);
  }

  // ---------------- piñón motriz sobre el bastidor del motor, engranado con la rueda
  const pinA = -0.58, pinN = 14, pinDist = (M * (44 + pinN)) / 2;
  const px = Math.cos(pinA) * pinDist, py = axleY + Math.sin(pinA) * pinDist;
  const pPin = (pinA * 44) / (Math.PI * 2);
  const pinPhase = pinA + Math.PI - ((0.5 - pPin) * Math.PI * 2) / pinN, pinSpeed = (-Ws * 44) / pinN;
  const pinion = steamGear(pinN, M, depth, GEAR_MATS.brass, { hub: 0.6, windows: 4, gap: 0.26 });
  pinion.position.set(px, py, planeZ);
  pinion.userData.dynamic = true;
  pinion.rotation.z = pinPhase;
  g.add(pinion);
  // bastidor en A: dos patas de hierro del suelo al eje del piñón, detrás del engranaje
  const fz = planeZ - 0.62;
  for (const s of [-1, 1]) addBeam(new THREE.Vector3(px + s * 1.9, 0.1, fz), new THREE.Vector3(px + s * 0.25, py, fz), 0.36, 0.34, GEAR_MATS.iron);
  addBox(4.6, 0.3, 1.2, px, 0.15, fz, GEAR_MATS.dark);
  addBeam(new THREE.Vector3(px - 1.1, py * 0.42, fz), new THREE.Vector3(px + 1.1, py * 0.42, fz), 0.24, 0.24, GEAR_MATS.iron);
  addCyl(0.42, 0.42, 0.7, px, py, fz + 0.1, GEAR_MATS.dark, 10, 'z');
  addCyl(0.2, 0.2, planeZ - fz + 0.36, px, py, (planeZ + fz) / 2 + 0.18, GEAR_MATS.iron, 10, 'z');
  colliders.addBox(x + px, z + fz, 2.3, 0.6, 0, y - 1, y + 0.3, 'machine');

  // ---------------- manivela, biela y pistón
  const crankR = 0.95, rodLen = 4.2, crankZ = planeZ + depth / 2 + 0.25, cylX = px + 7.9;
  const crank = new THREE.Group();
  crank.position.set(px, py, crankZ);
  crank.userData.dynamic = true;
  const web = new THREE.Mesh(new THREE.BoxGeometry(crankR + 0.5, 0.42, 0.18), GEAR_MATS.iron);
  web.position.x = crankR / 2;
  const crankPin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 10).rotateX(Math.PI / 2), GEAR_MATS.brass);
  crankPin.position.set(crankR, 0, 0.2);
  crank.add(web, crankPin);
  g.add(crank);
  const rodGeo = new THREE.CylinderGeometry(0.11, 0.11, 1, 8);
  const rod = new THREE.Mesh(rodGeo, GEAR_MATS.brass);
  rod.userData.dynamic = true;
  g.add(rod);
  const headGeo = new THREE.BoxGeometry(0.46, 0.5, 0.4);
  const head = new THREE.Mesh(headGeo, GEAR_MATS.iron);
  head.userData.dynamic = true;
  g.add(head);
  const pistonRod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8).rotateZ(Math.PI / 2), GEAR_MATS.iron);
  pistonRod.userData.dynamic = true;
  g.add(pistonRod);
  // cilindro de vapor con guías, sobre un pedestal
  addCyl(0.72, 0.72, 2.6, cylX, py, crankZ, GEAR_MATS.copper, 12, 'x');
  for (const dx of [-1.3, 1.3]) addCyl(0.82, 0.82, 0.16, cylX + dx, py, crankZ, GEAR_MATS.brass, 12, 'x');
  addBox(1.5, py - 0.4, 1, cylX, (py - 0.4) / 2, crankZ, GEAR_MATS.iron);
  addBox(2.2, 0.28, 1.5, cylX, 0.14, crankZ, GEAR_MATS.dark);
  for (const s of [-1, 1]) addBox(cylX - 1.4 - (px + rodLen - crankR - 0.4), 0.08, 0.08, (cylX - 1.4 + px + rodLen - crankR - 0.4) / 2, py + s * 0.34, crankZ, GEAR_MATS.dark);
  colliders.addBox(x + cylX, z + crankZ, 1.1, 0.8, 0, y - 1, y + py + 0.7, 'machine');

  // ---------------- caldera de cobre con chimenea y tubo hasta el cilindro
  const boilX = cylX + 3.5;
  addCyl(1.25, 1.25, 3.2, boilX, 1.5, crankZ, GEAR_MATS.copper, 14);
  addCyl(1.3, 1.45, 0.36, boilX, 0.18, crankZ, GEAR_MATS.dark, 14);
  addCyl(0.1, 1.25, 0.8, boilX, 3.5, crankZ, GEAR_MATS.copper, 14);
  for (const b of [1, 2.2]) addCyl(1.3, 1.3, 0.14, boilX, b, crankZ, GEAR_MATS.brass, 14);
  addCyl(0.26, 0.32, 2.4, boilX, 4.9, crankZ, GEAR_MATS.dark, 10);
  addCyl(0.44, 0.28, 0.42, boilX, 6.2, crankZ, GEAR_MATS.brass, 10);
  addBeam(new THREE.Vector3(boilX - 1.2, 2.6, crankZ), new THREE.Vector3(cylX + 1.3, py, crankZ), 0.2, 0.2, GEAR_MATS.brass);
  addCyl(0.34, 0.34, 0.1, boilX, 1.9, crankZ + 1.28, emissive(0xffb020, 1.3), 12, 'z');
  colliders.addCircle(x + boilX, z + crankZ, 1.4, y - 1, y + 4, 'machine');
  colliders.addCircle(x, z, 1.9, y - 1, y + 16, 'machine');
  // vapor de la chimenea
  const puffTex = softSpriteTexture('rgba(245,245,250,0.75)', 'rgba(245,245,250,0)');
  const puffs = [0, 1, 2, 3].map((i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
    sp.userData.dynamic = true;
    sp.userData.ph = i / 4;
    g.add(sp);
    return sp;
  });

  const rodUp = new THREE.Vector3(0, 1, 0), pinW = new THREE.Vector3(), headW = new THREE.Vector3(), dir = new THREE.Vector3();
  g.userData.parts = { wheel, sun, planets, pinion, crank, rod, head, pistonRod, cylX, py, crankZ, wheelSpeed, pinPhase, pinSpeed };
  g.userData.tick = (t) => {
    wheel.rotation.z = wheelSpeed * t;
    for (const pl of planets) pl.rotation.z = pl.userData.phase + pl.userData.local * t;
    const pa = pinPhase + pinSpeed * t;
    pinion.rotation.z = pa;
    crank.rotation.z = pa;
    // biela: de la manivela a la cruceta, que solo se mueve en línea recta hacia el cilindro
    pinW.set(px + Math.cos(pa) * crankR, py + Math.sin(pa) * crankR, crankZ + 0.3);
    const hx = pinW.x + Math.sqrt(rodLen * rodLen - (pinW.y - py) ** 2);
    headW.set(hx, py, crankZ + 0.3);
    head.position.copy(headW);
    dir.copy(headW).sub(pinW);
    rod.position.copy(pinW).addScaledVector(dir, 0.5);
    rod.scale.y = dir.length();
    rod.quaternion.setFromUnitVectors(rodUp, dir.normalize());
    const inCyl = cylX - 0.2;
    pistonRod.position.set((hx + inCyl) / 2, py, crankZ + 0.3);
    pistonRod.scale.x = Math.max(0.01, inCyl - hx);
    pistonRod.scale.y = pistonRod.scale.z = 1;
    for (const sp of puffs) {
      const k = (t * 0.32 + sp.userData.ph) % 1;
      sp.position.set(boilX + k * 0.9, 6.4 + k * 3.4, crankZ + Math.sin(k * 7 + sp.userData.ph * 6) * 0.25);
      sp.scale.setScalar(0.7 + k * 2.3);
      sp.material.opacity = 0.62 * (1 - k);
    }
  };
  g.userData.tick(0);
  return g;
}

// Torre de energía: patas abiertas, núcleo de cristal, tres anillos en la columna y rayos que cambian de forma.
function teslaTower() {
  const g = new THREE.Group(), shell = white();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd4d8e2, metalness: 0.45, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5b4b8a, metalness: 0.4, roughness: 0.35 });
  const violet = emissive(0x8b5cf6, 1.4), lilac = emissive(0xd9c6ff, 2.2);
  const up = new THREE.Vector3(0, 1, 0);
  const beam = (a, b, w, d, mat) => {
    const dir = b.clone().sub(a), m = new THREE.Mesh(new THREE.BoxGeometry(w, dir.length(), d), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    m.castShadow = true;
    return m;
  };
  // plataforma hexagonal, baja para subirla caminando
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.5, 0.45, 6), shell);
  pad.position.y = 0.225;
  pad.castShadow = pad.receiveShadow = true;
  // franja con las esquinas alineadas a las de la plataforma, un poco hacia dentro de su borde
  const padLine = new THREE.Mesh(new THREE.TorusGeometry(2.92, 0.07, 6, 6), violet);
  padLine.rotation.set(Math.PI / 2, 0, Math.PI / 6);
  padLine.position.y = 0.46;
  g.add(pad, padLine);
  // tres patas con filete luminoso, unidas por dos anillos triangulares
  const legAt = (k, y) => {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2, r = 2.55 + ((y - 0.45) / 5.95) * (0.45 - 2.55);
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  for (let k = 0; k < 3; k++) {
    g.add(beam(legAt(k, 0.45), legAt(k, 6.4), 0.5, 0.5, shell), beam(legAt(k, 0.9), legAt(k, 6), 0.13, 0.54, violet));
    for (const y of [2.2, 4]) g.add(beam(legAt(k, y), legAt((k + 1) % 3, y), 0.18, 0.18, shell));
  }
  // núcleo de cristal
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), lilac);
  crystal.scale.set(0.72, 1.9, 0.72);
  crystal.position.y = 3;
  crystal.userData.dynamic = true;
  g.add(crystal);
  // columna, y tres anillos unidos a ella con radios
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 3, 10), dark);
  col.position.y = 7.85;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.52, 0.4, 10), shell);
  collar.position.y = 6.4;
  g.add(col, collar);
  const rings = [[6.7, 1.9], [7.75, 1.45], [8.75, 1]];
  for (const [y, r] of rings) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 8, 32), steel), line = new THREE.Mesh(new THREE.TorusGeometry(r - 0.2, 0.05, 6, 32), lilac);
    t.rotation.x = line.rotation.x = Math.PI / 2;
    t.position.y = line.position.y = y;
    t.castShadow = true;
    g.add(t, line);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + y;
      g.add(beam(new THREE.Vector3(Math.cos(a) * 0.25, y, Math.sin(a) * 0.25), new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), 0.12, 0.12, dark));
    }
  }
  // esfera superior con resplandor
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.6, 10), shell);
  neck.position.y = 9.4;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), lilac);
  orb.position.y = 10.1;
  orb.userData.dynamic = true;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSpriteTexture('rgba(190,160,255,0.85)', 'rgba(140,100,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 10.1;
  halo.scale.setScalar(3.4);
  halo.userData.dynamic = true;
  g.add(neck, orb, halo);
  // rayos: cintas cruzadas en zigzag, redibujadas cada décima de segundo
  const arcs = [
    { a: [0.6, 10.2, 0], b: [2.6, 11.5, 0.4] }, { a: [-0.6, 10.2, 0], b: [-2.5, 11.6, -0.3] },
    { a: [1.9, 6.7, 0], b: [1.45, 7.75, 0] }, { a: [-1.45, 7.75, 0], b: [-1, 8.75, 0] },
    { a: [0, 6.7, 1.9], b: [0.3, 3.3, 2.9] }, { a: [0, 6.7, -1.9], b: [-0.5, 3.6, -2.8] },
  ];
  const SEG = 6, arcData = new Float32Array(arcs.length * SEG * 2 * 6 * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcData, 3));
  const arcMesh = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: 0xe6dcff, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  arcMesh.frustumCulled = false;
  arcMesh.userData.dynamic = true;
  g.add(arcMesh);
  const redraw = () => {
    let o = 0;
    const quad = (p, q, wx, wz) => {
      const v = [[p[0] - wx, p[1], p[2] - wz], [p[0] + wx, p[1], p[2] + wz], [q[0] + wx, q[1], q[2] + wz], [p[0] - wx, p[1], p[2] - wz], [q[0] + wx, q[1], q[2] + wz], [q[0] - wx, q[1], q[2] - wz]];
      for (const c of v) { arcData[o++] = c[0]; arcData[o++] = c[1]; arcData[o++] = c[2]; }
    };
    for (const { a, b } of arcs) {
      const on = Math.random() < 0.7;
      let prev = a;
      for (let s = 1; s <= SEG; s++) {
        const t = s / SEG, j = s === SEG ? 0 : 0.28;
        const cur = [a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * j * 2, a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * j * 2, a[2] + (b[2] - a[2]) * t + (Math.random() - 0.5) * j * 2];
        const w = on ? 0.035 + 0.02 * (1 - t) : 0;
        quad(prev, cur, w, 0);
        quad(prev, cur, 0, w);
        prev = cur;
      }
    }
    arcGeo.attributes.position.needsUpdate = true;
  };
  redraw();
  let next = 0;
  g.userData.tick = (t) => {
    crystal.rotation.y = t * 0.5;
    const beat = 1 + Math.sin(t * 5) * 0.06;
    orb.scale.setScalar(beat);
    halo.scale.setScalar(3.4 * beat);
    if (t >= next) { redraw(); next = t + 0.1; }
  };
  g.userData.legs = [0, 1, 2].map((k) => legAt(k, 0.45));
  return g;
}

// Tubo curvo que se afina de r0 a r1; sus uniones se tapan con una esfera en cada nudo.
function taperedLimb(from, control, to, r0, r1, mat, seg = 6) {
  const curve = new THREE.QuadraticBezierCurve3(from, control, to);
  const geo = new THREE.TubeGeometry(curve, seg, 1, 5);
  const p = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let j = 0; j <= seg; j++) {
    curve.getPointAt(j / seg, c);
    const r = r0 + (r1 - r0) * (j / seg);
    for (let k = 0; k <= 5; k++) {
      const i = j * 6 + k;
      v.fromBufferAttribute(p, i).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}
const knot = (pos, r, mat, detail = 1) => {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.position.copy(pos);
  return m;
};
// ramas continuas: cada hija nace en la punta de su madre. tip recibe cada extremo final.
function grownBranch(g, rnd, from, dir, len, r0, depth, mat, spread, tip) {
  const to = from.clone().addScaledVector(dir, len), r1 = r0 * 0.68;
  const control = from.clone().lerp(to, 0.55).add(new THREE.Vector3((rnd() - 0.5) * len * 0.3, (rnd() - 0.2) * len * 0.22, (rnd() - 0.5) * len * 0.3));
  g.add(taperedLimb(from, control, to, r0, r1, mat, 4), knot(to, r1 * 1.08, mat, 0));
  if (depth === 0) { tip(to); return; }
  const n = depth > 1 || rnd() < 0.5 ? 2 : 3;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * Math.PI;
    const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(spread);
    const nd = dir.clone().add(side).add(new THREE.Vector3(0, 0.15 + rnd() * 0.2, 0)).normalize();
    grownBranch(g, rnd, to, nd, len * (0.66 + rnd() * 0.1), r1, depth - 1, mat, spread, tip);
  }
}

// Árbol A: neurona con núcleo, dendritas, axón con mielina y terminales en el suelo. Sin colisión en dendritas.
function neuronTreeA(rnd) {
  const g = new THREE.Group();
  const mat = emissive(0x35e0ff, 1.3), myelin = white();
  const somaY = 4.15, V = (x, y, z) => new THREE.Vector3(x, y, z);
  // terminales del axón
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.6, r = 1.1 + rnd() * 0.5, end = V(Math.cos(a) * r, 0.07, Math.sin(a) * r);
    g.add(taperedLimb(V(0, 0.72, 0), V(Math.cos(a) * r * 0.35, 0.05, Math.sin(a) * r * 0.35), end, 0.1, 0.05, mat), knot(end, 0.13, mat));
  }
  // axón con vainas de mielina y nodos
  g.add(taperedLimb(V(0, 0.72, 0), V(0, 2.4, 0), V(0, somaY, 0), 0.09, 0.1, mat, 3));
  for (const y of [1.3, 2.2, 3.07]) {
    const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.2, 3, 10), myelin);
    c.position.y = y;
    c.castShadow = true;
    g.add(c);
  }
  for (const y of [1.75, 2.65, 3.5]) g.add(knot(V(0, y, 0), 0.13, mat));
  // dendritas
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rnd() * 0.5, dir = V(Math.cos(a), 0.45 + rnd() * 0.45, Math.sin(a)).normalize();
    grownBranch(g, rnd, V(0, somaY, 0), dir, 1.15, 0.13, 2, mat, 0.5, (p) => g.add(knot(p, 0.1 + rnd() * 0.05, mat)));
  }
  // cuerpo translúcido con el núcleo visible, que late
  const bodyMat = emissive(0x8cecff, 0.9);
  bodyMat.transparent = true; bodyMat.opacity = 0.55; bodyMat.depthWrite = false;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 2), bodyMat);
  body.position.y = somaY;
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color: 0x2f7fb8, emissive: 0x2f7fb8, emissiveIntensity: 1, roughness: 0.4 }));
  nucleus.position.y = somaY;
  nucleus.userData.dynamic = true;
  g.add(nucleus, body);
  g.userData.tick = (t, ph) => { nucleus.scale.setScalar(1 + Math.sin(t * 3 + ph) * 0.14); };
  return g;
}

// Árbol B: tronco y ramas violeta con copa de luces e impulsos cian que suben por el tronco.
function neuronTreeB(rnd) {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x5c448e, roughness: 0.75 });
  const light = emissive(0xb57bff, 1.6), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const crown = V(0.05, 2.6, 0);
  g.add(taperedLimb(V(0, 0, 0), V(0.1, 1.2, 0.05), crown, 0.36, 0.22, bark, 8), knot(crown, 0.23, bark));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3, r = 1 + rnd() * 0.5;
    g.add(taperedLimb(V(0, 0.42, 0), V(Math.cos(a) * r * 0.4, 0.06, Math.sin(a) * r * 0.4), V(Math.cos(a) * r, 0.03, Math.sin(a) * r), 0.16, 0.04, bark));
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rnd() * 0.4, dir = V(Math.cos(a), 0.6 + rnd() * 0.5, Math.sin(a)).normalize();
    grownBranch(g, rnd, crown, dir, 1.5, 0.18, 3, bark, 0.42, (p) => g.add(knot(p, 0.13 + rnd() * 0.1, light)));
  }
  // impulsos: suben por el tronco y vuelven a empezar
  const impulseMat = emissive(0x35e0ff, 2.6);
  const impulses = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), impulseMat);
    m.userData.dynamic = true;
    g.add(m);
    return m;
  });
  g.userData.tick = (t, ph) => impulses.forEach((m, i) => {
    const y = ((t * 0.4 + ph + i / 3) % 1) * 2.5, side = 0.36 + (0.22 - 0.36) * (y / 2.6);
    m.position.set(0.05 * (y / 2.6) + side, y, 0);
  });
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
  colliders.addCircle(P.x, P.z, 6.61, P.h - 1, P.h + 0.38, 'tier');
  colliders.addCircle(P.x, P.z, 6.4, P.h - 1, P.h + 0.8, 'tier');
  colliders.addCircle(P.x, P.z, 4.36, P.h - 1, P.h + 1.18, 'tier');
  colliders.addCircle(P.x, P.z, 4.2, P.h - 1, P.h + 1.6, 'tier');
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
  // 4 proyectores en diagonal sobre el stand; sus haces entran en el mundo aunque este flote
  const standTop = P.h + 1.6, projBody = white(), up = new THREE.Vector3(0, 1, 0);
  const lensMat = emissive(0x7ff6ff, 2.4);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a);
    const fx = P.x + ca * 3.35, fz = P.z + sa * 3.35;
    const target = new THREE.Vector3(P.x + ca * 1.5, P.h + 8.5 - 3.15, P.z + sa * 1.5);
    const base = new THREE.Vector3(fx, standTop + 0.5, fz);
    const axis = target.clone().sub(base).normalize();
    const lens = base.clone().addScaledVector(axis, 0.18);
    root.add(
      new THREE.Mesh(facetedCyl(0.42, 0.52, 0.14, fx, standTop + 0.07, fz), PORTAL_MATS.stone),
      new THREE.Mesh(facetedCyl(0.2, 0.3, 0.26, fx, standTop + 0.27, fz), projBody),
    );
    const head = new THREE.Group();
    head.position.copy(lens);
    head.quaternion.setFromUnitVectors(up, axis);
    const len = lens.distanceTo(target) + 0.45;
    const light = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.24, len, 24, 1, true), beamMat);
    light.position.y = 0.06 + len / 2;
    head.add(
      new THREE.Mesh(facetedCyl(0.34, 0.24, 0.32, 0, -0.16), projBody),
      new THREE.Mesh(facetedCyl(0.37, 0.34, 0.05, 0, 0.025), PORTAL_MATS.blue),
      new THREE.Mesh(facetedCyl(0.29, 0.29, 0.03, 0, 0.045), lensMat),
      light,
    );
    root.add(head);
    // pie, cuello y cabeza inclinada: cada uno con su forma
    colliders.addCircle(fx, fz, 0.52, P.h + 1, standTop + 0.14, 'projector');
    colliders.addCircle(fx, fz, 0.3, P.h + 1, standTop + 0.4, 'projector');
    head.updateMatrix();
    const headGeo = mergeGeometries(head.children.slice(0, 2).map((m) => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry).clone().applyMatrix4(head.matrix).translate(-fx, 0, -fz)));
    colliders.addMesh(fx, 0, fz, 1, 0, meshShape(headGeo.attributes.position.array.slice()), 'projector');
  }
  animated.push((t) => { globe.rotation.y = t * 0.25; orbit1.rotation.z = t * 0.6; orbit2.rotation.z = -t * 0.45; globe.position.y = P.h + 8.5 + Math.sin(t) * 0.25; });
  // plaza sign
  const plazaSign = makeSign(['PLAZA CENTRAL', 'Tu punto de partida'], 7, 1.75);
  plazaSign.position.set(P.x, P.h + 3.6, P.z + 7.2);
  root.add(plazaSign);
  // lamps + banners + planters
  // ángulos elegidos para dejar libres los portales y los caminos (al menos 5 m de cada uno)
  [20, 38, 56, 74, 107.5, 142, 154, 206, 222, 271.5, 320, 331].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const l = lampPost(i % 2 ? 0x35e0ff : 0xffb020);
    l.position.set(P.x + Math.cos(a) * 27.5, P.h, P.z + Math.sin(a) * 27.5);
    root.add(l);
    colliders.addCircle(l.position.x, l.position.z, 0.34, P.h - 1, P.h + 1.8, 'lamp');
    colliders.addCircle(l.position.x, l.position.z, 0.12, P.h - 1, P.h + 5.2, 'lamp');
  });
  const bannerCols = [0x35e0ff, 0x8b5cf6, 0xffb020, 0x22c55e];
  const banners = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const b = banner(i % 2 === 0, bannerCols[i % 4]);
    b.position.set(P.x + Math.cos(a) * 18.5, P.h, P.z + Math.sin(a) * 18.5);
    b.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); // de frente al centro de la plaza
    root.add(b);
    banners.push(b);
    colliders.addCircle(b.position.x, b.position.z, 0.28, P.h - 1, P.h + 8, 'pole');
  }
  let bannerWave = true;
  animated.push((t) => { if (bannerWave) banners.forEach((b, i) => waveBanner(b.userData.cloth.geometry, t, i, 0.06)); });
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
  colliders.addCircle(SPAWN.x, SPAWN.z, 3, sh - 1, sh + 0.2, 'spawn');

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
  // abierto en la entrada, igual que el domo y su collider
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(dome.r, 0.35, 8, 96, Math.PI * 2 - gap), frameMat);
  baseRing.rotation.set(Math.PI / 2, 0, gap / 2); baseRing.position.set(dome.x, dome.y + 0.2, dome.z);
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
  colliders.addCircle(dome.x, dome.z, 3.53, dome.y - 1, dome.y + 0.45, 'ped');
  colliders.addCircle(dome.x, dome.z, 3.2, dome.y - 1, dome.y + 1, 'ped');
  // district entrance arch from the path
  root.add(arch(0xffb020, 'DISTRITO NEURO', 'Neurociencia · Bienestar', colliders, N.x + N.r - 1, N.z + 2, Math.PI / 2, N.h, 9));
  const neuroGate = { key: 'plaza', color: 0x35e0ff, x: N.x + N.r - 1, z: N.z + 2, rotY: Math.PI / 2, baseY: N.h, width: 9 };
  // neuron trees + electric pylons
  // dos arcos simétricos respecto al eje entrada-domo, alternando tipos; lejos de portales y recorridos
  const treeSpots = [[-92, -22, 'B'], [-112, -32, 'A'], [-146, -28, 'B'], [-92, 26, 'A'], [-112, 36, 'B'], [-146, 32, 'A']];
  const nts = [];
  treeSpots.forEach(([x, z, kind], i) => {
    const nt = kind === 'A' ? neuronTreeA(mulberry32(31 + i * 7)) : neuronTreeB(mulberry32(53 + i * 11));
    nt.position.set(x, N.h, z);
    root.add(nt);
    nts.push(nt);
    if (kind === 'A') colliders.addCircle(x, z, 0.32, N.h - 1, N.h + 4.2, 'ntree');
    else colliders.addCircle(x, z, 0.42, N.h - 1, N.h + 2.7, 'ntree');
  });
  animated.push((t) => nts.forEach((n, i) => n.userData.tick(t, i * 0.37)));
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
  dressSteamHouse(obs, colliders, Math.atan2(-0.3, 0.95));
  root.add(obs);
  const machine = steamMachine(S.x + 8, S.h, S.z - 8, colliders);
  root.add(machine);
  // torre de energía (bobina Tesla), apartada del camino hacia la Sala de Matemáticas
  const coil = teslaTower();
  coil.position.set(S.x + 16, S.h, S.z + 6);
  root.add(coil);
  const padTris = new THREE.CylinderGeometry(3.1, 3.5, 0.45, 6).translate(0, 0.225, 0).toNonIndexed().attributes.position.array.slice();
  colliders.addMesh(coil.position.x, S.h, coil.position.z, 1, 0, meshShape(padTris), 'tesla');
  for (const leg of coil.userData.legs) colliders.addCircle(coil.position.x + leg.x, coil.position.z + leg.z, 0.42, S.h + 0.2, S.h + 6, 'tesla');
  colliders.addCircle(coil.position.x, coil.position.z, 0.8, S.h + 0.2, S.h + 5, 'tesla');
  animated.push((t) => { machine.userData.tick(t); coil.userData.tick(t); });

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
    // calidad baja: panel fijo
    setBannerWave(on) {
      if (on === bannerWave) return;
      bannerWave = on;
      if (!on) banners.forEach((b) => waveBanner(b.userData.cloth.geometry, 0, 0, 0));
    },
    update(t, cam) {
      for (const m of holoMats) m.uniforms.time.value = t;
      for (const f of animated) f(t, cam);
    },
  };
}
