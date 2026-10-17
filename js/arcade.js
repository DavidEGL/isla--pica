// "Sala de Retos": the NeuroAventura challenges as video-game levels.
// A hub with one portal per level; each level has 3 phases (Aprende · Practica · Reto veloz),
// points, combos, a timer and a results screen with up to 3 stars.
import * as THREE from 'three';
import { PADS } from './terrain.js';
import { holoMaterial, STEAM_GEO } from './districts.js';
import { MATH } from './mathdata.js';
import { buildBrain } from './neuroparts.js';
import { makeSign, softSpriteTexture, roundRect, damp } from './util.js';
import { labelSprite, LABELS } from './mission.js';
import { Portal, portalMaterial, fadePortal } from './portals.js';
import { SKY, pearlMat, silverMat, goldMat, lightMat, floorDisk, rectFloorTexture, skyDome, floatingIslands, planter, sloganPanel, glassCapsule } from './labstyle.js';

export const ARENA = { x: 700, y: 60, z: 0 };            // world origin of the interior (far from the island)
const N = PADS.neuro;
export const ARCADE_DOOR = { x: -109, z: 16, y: N.h };   // portal in the Neuro district (faces +x)
export const ARCADE_RETURN = { x: -100.5, z: 16, yaw: Math.PI / 2 };
const HUB_R = 22, GATE_R = 16.5, EXIT_Z = 19.4;   // roomier hub: gates ~10 m apart
const HUB_SPAWN = { x: 0, z: 12, yaw: Math.PI };
const GAP = 0.62;
const PHASE_NAMES = ['APRENDE', 'PRACTICA', 'RETO VELOZ'];
// Sala de Matemáticas door in the STEAM district (faces the plaza)
export const STEAM_DOOR = { x: STEAM_GEO.door.x, z: STEAM_GEO.door.z, y: PADS.steam.h, rot: STEAM_GEO.rot };
const STEAM_RETURN = { x: STEAM_GEO.door.x + STEAM_GEO.dx * 5.5, y: PADS.steam.h + 0.2, z: STEAM_GEO.door.z + STEAM_GEO.dz * 5.5, yaw: STEAM_GEO.rot };
const GREEN = 0x22c55e;

export const LEVELS = [
  { key: 's1', n: 1, part: 'soma', name: 'El Cerebro', sub: 'Zonas del cerebro', emoji: '🧠', color: 0xffb020, room: [-170, 0] },
  { key: 's2', n: 2, part: 'axon', name: 'Autopista neuronal', sub: 'La velocidad de la señal', emoji: '⚡', color: 0x35e0ff, room: [0, -170] },
  { key: 's3', n: 3, part: 'sinapsis', name: 'El reflejo', sub: '¡Rápido como un reflejo!', emoji: '🔥', color: 0xff5d73, room: [170, 0] },
  { key: 's4', n: 4, part: 'dendritas', name: 'Mensajes químicos', sub: 'Mensajeros de las neuronas', emoji: '🧪', color: 0xb57bff, room: [0, 170] },
];

const TEXT = {
  hub: [
    { text: '¡Bienvenido a la **Sala de Retos**! Aquí cada pieza de la neurona se gana superando un **nivel**.', mood: 'happy', gesture: 'wave' },
    { text: 'Cada nivel tiene **tres fases**: primero aprendes, luego practicas y al final viene un **reto final**.', mood: 'think', gesture: 'think' },
    { text: 'Juegas en **modo Explorador**: sin reloj y sin prisa. Si quieres más emoción, cambia al **modo Desafío** en la plataforma morada.', mood: 'happy', gesture: 'point' },
    { text: 'Gana **puntos** con cada acierto, encadena **combos** y consigue hasta **tres estrellas**. ¡Empecemos por el **Nivel 1**!', mood: 'happy', gesture: 'point' },
  ],
};

// Modo Explorador (default): no clock, calmer bubbles, slower rival signal.
// Modo Desafío: timed, with about 25 % more time than the first version.
const MODES = {
  s1: {
    calm: [{}, { time: 0, swap: { 0: { text: '**Fase 2: Practica.** Ahora hay cinco acciones nuevas. ¡Llévalas a su zona con calma, sin prisa!', mood: 'happy', gesture: 'point' } } },
      { time: 0, swap: { 0: { text: '**Fase 3: Reto final.** Las acciones aparecerán una por una. ¡Acierta seguido para hacer combos!', mood: 'surprised', gesture: 'celebrate' } } }],
    challenge: [{}, { time: 85 }, { time: 66 }],
  },
  s2: {
    calm: [{}, { time: 0 }, { time: 40, noClock: true }],
    challenge: [{}, { time: 62 }, { time: 22 }],
  },
  s3: {
    calm: [{ roundTime: 0, swap: { 1: { text: 'Recorre el camino de la señal **en orden**, saltando sobre cada nodo. ¡Tómate tu tiempo y piensa bien!', mood: 'normal', gesture: 'point' } } },
      { roundTime: 0, swap: { 0: { text: '**Fase 2: Practica.** ¡Los nodos cambiaron de lugar! Recorre el mismo camino otra vez.', mood: 'happy', gesture: 'point' } } },
      { roundTime: 0, swap: { 0: { text: '**Fase 3: Reto final.** ¡Tres reflejos seguidos! Los nodos se mueven en cada ronda.', mood: 'surprised', gesture: 'celebrate' } } }],
    challenge: [{ roundTime: 18, swap: { 1: { text: 'Recorre el camino de la señal **en orden**, saltando sobre cada nodo. Al tocar el primero empieza el reloj: tienes **18 segundos**.', mood: 'normal', gesture: 'point' } } },
      { roundTime: 14, swap: { 0: { text: '**Fase 2: Practica.** ¡Los nodos cambiaron de lugar! Recorre el mismo camino, ahora en **14 segundos**.', mood: 'happy', gesture: 'point' } } },
      { roundTime: 11, swap: { 0: { text: '**Fase 3: Reto veloz.** ¡Tres reflejos seguidos! Los nodos se mueven en cada ronda y tienes **11 segundos** para cada una.', mood: 'surprised', gesture: 'celebrate' } } }],
  },
  s4: {
    calm: [{ life: 30, speed: 1.1 },
      { time: 0, life: 26, speed: 1.4, swap: { 0: { text: '**Fase 2: Practica.** Ahora necesitamos **3 de cada una** y las burbujas se mueven un poco más rápido.', mood: 'happy', gesture: 'point' } } },
      { time: 0, life: 20, speed: 1.7, swap: { 0: { text: '**Fase 3: Reto final.** ¡**4 de cada una**! Atrapa cada burbuja antes de que se desvanezca.', mood: 'surprised', gesture: 'celebrate' } } }],
    challenge: [{}, { time: 80 }, { time: 70, life: 12 }],
  },
};

// One "set" of levels per book district. All sets share the hub layout, phases, modes and results.
const SETS = {
  neuro: {
    key: 'neuro', levels: LEVELS, hall: 'Sala de Retos', title: ['SALA DE RETOS', 'NeuroAventura · Niveles'], exit: ['SALIDA', 'Distrito Neuro'],
    district: 'DISTRITO NEURO', progress: 'TU PROGRESO EN NEUROAVENTURA', seq: true,
    final: { key: 'final', n: 5, name: 'Nivel final', sub: 'Reconstruye la neurona', emoji: '🏆', color: 0xffd36b },
    door: { ...ARCADE_DOOR, rot: Math.PI / 2 }, sign: ['SALA DE RETOS', 'Niveles · Puntos · Estrellas'], doorColor: 0x22c55e,
    ret: { x: ARCADE_RETURN.x, y: N.h + 0.2, z: ARCADE_RETURN.z, yaw: ARCADE_RETURN.yaw },
  },
  math: {
    key: 'math', levels: MATH.levels, hall: 'Sala de Matemáticas', title: ['SALA DE MATEMÁTICAS', 'Saberes Matemáticos · 2º y 6º'], exit: ['SALIDA', 'Distrito STEAM'],
    district: 'DISTRITO STEAM', progress: 'TU PROGRESO EN MATEMÁTICAS', seq: false, final: MATH.soon,
    door: STEAM_DOOR, sign: ['SALA DE MATEMÁTICAS', 'Saberes Matemáticos'], doorColor: 0x8b5cf6, ret: STEAM_RETURN,
  },
};
const SET_OF = {};
for (const k in SETS) { for (const L of SETS[k].levels) SET_OF[L.key] = k; if (SETS[k].final) SET_OF[SETS[k].final.key] = k; }
const lvTag = (d) => d.tag || `Nivel ${d.n}`;

const HINTS = {
  s1: ['Toma una esfera y llévala a la zona del cerebro que más trabaja con esa acción: memoria, equilibrio o movimiento.'],
  s2: ['Pisa los dos interruptores y fíjate qué músculo se enciende primero.', 'Toma una cápsula blanca y llévala a una parte roja del cable B.', 'Salta de nodo en nodo sin detenerte. ¡Usa el impulso para ir más rápido!'],
  s3: ['El orden es: piel, médula espinal, músculo y, al final, cerebro.'],
  s4: ['Atrapa una burbuja caminando hacia ella. La morada va a dormir y la amarilla a concentración.'],
};
const hex = (c) => '#' + new THREE.Color(c).getHexString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = (n) => Math.round(n).toLocaleString('es-MX');
const $ = (id) => document.getElementById(id);
const _l = new THREE.Vector3(), _v = new THREE.Vector3();

// ------------------------------------------------------------------ shared props
function ringPortal(color, R) {
  const g = new THREE.Group();
  const arc = Math.PI * 2 - GAP * 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.3, 12, 72, arc), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.15 }));
  ring.rotation.z = -Math.PI / 2 + GAP;
  const glowMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(R - 0.32, 0.08, 6, 72, arc), glowMat);
  glow.rotation.z = ring.rotation.z;
  const mat = portalMaterial(color, { shape: 'circle', color2: 0xffffff });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.26, 56), mat);
  disc.renderOrder = 4;
  g.add(ring, glow, disc);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
    cap.position.set(s * R * Math.sin(GAP), -R * Math.cos(GAP), 0);
    g.add(cap);
  }
  Object.assign(g.userData, { mat, glowMat, lift: R * Math.cos(GAP), half: R * Math.sin(GAP) });
  return g;
}

function ringPad(color, r = 1.6) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.15, 0.24, 36), new THREE.MeshStandardMaterial({ color: 0xf1f5f8, roughness: 0.4 }));
  base.position.y = 0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.12, 0.07, 6, 48), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.26;
  g.add(base, ring);
  g.userData.ring = ring;
  return g;
}

function glowMat(c, i = 1.6) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 }); }
const FLOOR_MAT = () => silverMat();
const SLOGANS = [
  ['EXPLORA', 'DESCUBRE', 'APRENDE', 'TRANSFORMA'],
  ['CIENCIA', 'AVENTURA', 'IMPACTO REAL'],
  ['UN CEREBRO MEJOR,', 'UN MUNDO', 'MÁS BRILLANTE'],
];
// small hologram shown inside each level capsule in the hub
function capsuleHolo(key, holo) {
  const g = new THREE.Group();
  const H = (c, i = 1.2) => { const m = holoMaterial(c, { intensity: i, lines: 18 }); holo.push(m); return m; };
  if (key === 's1') { const b = buildBrain(H(0xff9fd0), H(0xffc0e0)); b.scale.setScalar(0.85); g.add(b); }
  else if (key === 's2') {
    const m = H(0x35e0ff), w = H(0xffffff, 1.0);
    const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), m);
    g.add(ax);
    for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 10), w); c.position.y = -0.8 + k * 0.8; g.add(c); }
  } else if (key === 's3') {
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 16, 1, true), H(0xff7a30, 1.4));
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 16, 1, true), H(0xffe066, 1.6));
    f2.position.y = -0.2;
    g.add(f1, f2);
  } else if (key === 's4') {
    const m = H(0xb57bff);
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m);
    a.position.y = 0.75; a.rotation.x = Math.PI;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), H(0x35e0ff));
    b.position.y = -0.75;
    g.add(a, b);
    for (let k = 0; k < 5; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), H(k % 2 ? 0xffd23f : 0x9b6bff, 1.6)); d.position.set(Math.cos(k) * 0.35, -0.3 + k * 0.12, Math.sin(k) * 0.35); g.add(d); }
  } else {
    const m = H(0xffd36b, 1.4);
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), m));
    for (let k = 0; k < 6; k++) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.0, 6), m);
      const a = (k / 6) * Math.PI * 2;
      d.position.set(Math.cos(a) * 0.7, Math.sin(k * 1.7) * 0.4, Math.sin(a) * 0.7);
      d.rotation.z = Math.PI / 2; d.rotation.y = -a;
      g.add(d);
    }
  }
  return g;
}

// Canvas texture with 3 stars and a caption (used over the level gates)
function starsCanvas(n, caption, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,14,44,0.82)';
  roundRect(g, 8, 8, 496, 184, 40); g.fill();
  g.lineWidth = 6; g.strokeStyle = color; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 92px Nunito, system-ui, sans-serif';
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i < n ? '#ffd23f' : 'rgba(255,255,255,0.18)';
    if (i < n) { g.shadowColor = '#ffb020'; g.shadowBlur = 18; } else g.shadowBlur = 0;
    g.fillText('★', 146 + i * 110, 80);
  }
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.font = '900 40px Nunito, system-ui, sans-serif';
  g.fillText(caption, 256, 156);
  return c;
}
function canvasSprite(canvas, w) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sp.scale.set(w, w * canvas.height / canvas.width, 1);
  return sp;
}
function setSpriteCanvas(sp, canvas) {
  sp.material.map.dispose();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  sp.material.map = tex;
  sp.material.needsUpdate = true;
}
function relabel(sp, lines, color, w) {
  const n = labelSprite(lines, color, w);
  LABELS.splice(LABELS.indexOf(n), 1);   // only its texture is used
  sp.material.map.dispose();
  sp.material.map = n.material.map;
  sp.material.needsUpdate = true;
}

// ================================================================== base level (one room)
class Level {
  constructor(A, def) {
    this.A = A;
    this.def = def;
    [this.ox, this.oz] = def.room;
    this.g = new THREE.Group();
    this.g.position.set(this.ox, 0, this.oz);
    this.g.visible = false;
    A.root.add(this.g);
    this.anim = [];
    this.holo = [];
    this.spawn = { x: 0, z: 13, yaw: Math.PI };
    this.exitAt = { x: 0, z: 17.2, rot: 0 };
  }
  get key() { return this.def.key; }
  W(x, z) { return [ARENA.x + this.ox + x, ARENA.z + this.oz + z]; }
  L(p) { return _l.set(p.x - ARENA.x - this.ox, p.y - ARENA.y, p.z - ARENA.z - this.oz); }
  rootPos(x, y, z) { return new THREE.Vector3(this.ox + x, y, this.oz + z); }
  circle(x, z, r, y0, y1) { const [wx, wz] = this.W(x, z); return this.A.col.addCircle(wx, wz, r, ARENA.y + y0, ARENA.y + y1, 'arcade'); }
  box(x, z, hx, hz, rot, y0, y1) { const [wx, wz] = this.W(x, z); return this.A.col.addBox(wx, wz, hx, hz, rot, ARENA.y + y0, ARENA.y + y1, 'arcade'); }
  spawnWorld() { const [x, z] = this.W(this.spawn.x, this.spawn.z); return { x, y: ARENA.y + 0.2, z, yaw: this.spawn.yaw }; }
  // round arena floor with neon rings and an invisible wall
  roundFloor(R) {
    const col = this.def.color;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.7, 3, 64), FLOOR_MAT());
    floor.position.y = -1.5;
    floor.receiveShadow = true;
    this.g.add(floor);
    this.circle(0, 0, R, -3, 0);
    this.g.add(floorDisk(R, hex(col)));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.16, 8, 120), goldMat());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.04;
    this.g.add(rim);
    // planters and a slogan screen to dress the room
    const rnd = (() => { let a = this.ox * 7 + this.oz * 3 + 11; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; })();
    for (const a of [0.15, -0.15, Math.PI - 0.15, Math.PI + 0.15]) {
      const pl = planter(rnd);
      pl.position.set(Math.cos(a) * (R - 1.6), 0, Math.sin(a) * (R - 1.6));
      this.g.add(pl);
      this.circle(Math.cos(a) * (R - 1.6), Math.sin(a) * (R - 1.6), 0.9, -1, 1.2);
    }
    const sl = sloganPanel(SLOGANS[(this.def.n - 1) % SLOGANS.length], hex(col), 5.2, 3.2);
    sl.position.set(-R + 2.2, 4.4, -R * 0.6);
    sl.rotation.y = 0.95;   // slogans stay in the hub: the challenge rooms are kept clear
    // low railing posts (visual) + invisible wall ring
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6), silverMat());
      post.position.set(Math.cos(a) * (R - 0.25), 0.5, Math.sin(a) * (R - 0.25));
      this.g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R - 0.25, 0.06, 6, 120), glowMat(col, 1.2));
    rail.rotation.x = Math.PI / 2; rail.position.y = 1.0;
    this.g.add(rail);
    const RR = R + 1.3, n = Math.ceil((Math.PI * 2 * RR) / 2);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; this.circle(Math.cos(a) * RR, Math.sin(a) * RR, 1.5, -2, 12); }
  }
  // portal back to the hub
  buildExit() {
    const E = this.exitAt;
    const ex = ringPortal(GREEN, 2.1);
    ex.position.set(E.x, ex.userData.lift, E.z);
    ex.rotation.y = E.rot;
    this.g.add(ex);
    this.exitMat = ex.userData.mat;
    const nx = Math.sin(E.rot), nz = Math.cos(E.rot);
    for (const s of [-1, 1]) this.circle(E.x + nz * s * ex.userData.half, E.z - nx * s * ex.userData.half, 0.4, -1, 5);
    const [wx, wz] = this.W(E.x, E.z);
    this.exitPortal = new Portal({ x: wx, z: wz, nx, nz, halfW: ex.userData.half - 0.3, y0: ARENA.y - 1, y1: ARENA.y + 3, twoSided: true });
    const lab = labelSprite(['SALIR', SETS[this.def.set || 'neuro'].hall], '#22c55e', 2.4);
    lab.position.set(E.x, 4.6, E.z);
    this.g.add(lab);
  }
  title(x = 0, z = -19.5, rot = 0) {
    const s = makeSign([`NIVEL ${this.def.n} · ${this.def.name.toUpperCase()}`, this.def.sub], 10, 2.45, { border: hex(this.def.color), sub: '#e6f6ff' });
    s.position.set(x, 11.5, z);
    s.rotation.y = rot;
    this.titleSign = s;   // kept out of the room: the HUD already shows the level name
  }
  fx(x, y, z, color, n, sp) { this.A.fx(this.rootPos(x, y, z), color, n, sp); }
  // hooks
  reset() {}
  setup() {}
  start() {}
  update() {}
  idle() {}
  interactions() { return []; }
  async outro() {}
  cleanup() {}
  mapItems() { return []; }
  objective() { return ''; }
  applyMode(calm) {
    if (!this.base) this.base = this.phases.map((p) => ({ ...p }));
    const M = (MODES[this.key] || {})[calm ? 'calm' : 'challenge'] || [];
    this.phases.forEach((p, i) => {
      const b = this.base[i], o = M[i] || {};
      for (const k of Object.keys(p)) delete p[k];
      Object.assign(p, b, o);
      delete p.swap;
      if (o.swap) p.intro = b.intro.map((ln, k) => o.swap[k] || ln);
    });
  }
}

// ================================================================== LEVEL 1 · El Cerebro
const ACTIONS = {
  musica: { target: 'memoria', emoji: '🎵', lines: ['Escuchar', 'tu canción'] },
  bici: { target: 'equilibrio', emoji: '🚲', lines: ['Andar en', 'bicicleta'] },
  mano: { target: 'movimiento', emoji: '✋', lines: ['Levantar', 'la mano'] },
  cumple: { target: 'memoria', emoji: '🎂', lines: ['Recordar tu', 'cumpleaños'] },
  casa: { target: 'memoria', emoji: '🏠', lines: ['Recordar el', 'camino a casa'] },
  cuento: { target: 'memoria', emoji: '📖', lines: ['Recordar', 'un cuento'] },
  pie: { target: 'equilibrio', emoji: '🦩', lines: ['Pararte', 'en un pie'] },
  patineta: { target: 'equilibrio', emoji: '🛹', lines: ['Andar en', 'patineta'] },
  aplaudir: { target: 'movimiento', emoji: '👏', lines: ['Aplaudir'] },
  patear: { target: 'movimiento', emoji: '⚽', lines: ['Patear', 'un balón'] },
};
const ZONES1 = [
  { key: 'memoria', label: 'MEMORIA', color: 0xb57bff, x: -8.5, z: -5.5 },
  { key: 'equilibrio', label: 'EQUILIBRIO', color: 0x22c55e, x: 0, z: -9.5 },
  { key: 'movimiento', label: 'MOVIMIENTO', color: 0xff8a3d, x: 8.5, z: -5.5 },
];
const FACT1 = {
  memoria: '¡Exacto! La música activa tu **memoria**: por eso una canción puede recordarte un momento especial. El **hipocampo** ayuda a guardar esos recuerdos.',
  equilibrio: '¡Muy bien! El **cerebelo** coordina tu **equilibrio**, por eso pedalear sin caerte se vuelve casi automático.',
  movimiento: '¡Correcto! La **corteza motora** envía la orden a tus músculos para **levantar la mano**.',
};
class LvBrain extends Level {
  constructor(A, def) {
    super(A, def);
    this.phases = [
      { items: 3, time: 0, intro: [
        { text: '**Nivel 1: El Cerebro.** Tu cerebro tiene zonas especializadas que trabajan en equipo.', mood: 'think' },
        { text: 'Toma cada esfera de acción y llévala a la **zona del cerebro** que más trabaja cuando haces esa acción.', mood: 'normal', gesture: 'point' },
        { text: 'Acércate a una esfera y presiona **interactuar** para tomarla. ¡Tú puedes!', mood: 'happy' },
      ] },
      { items: 5, time: 70, intro: [
        { text: '**Fase 2: Practica.** Ahora hay cinco acciones nuevas y el reloj está corriendo. ¡Llévalas a su zona antes de que se acabe el tiempo!', mood: 'happy', gesture: 'point' },
      ] },
      { items: 6, time: 54, intro: [
        { text: '**Fase 3: Reto veloz.** Las acciones aparecerán una por una. ¡Acierta seguido para hacer combos!', mood: 'surprised', gesture: 'celebrate' },
      ] },
    ];
    this.roundFloor(19);
    this.title();
    this.buildExit();
    // brain hologram
    const bm = holoMaterial(0xff9fd0, { intensity: 1.1, lines: 30 });
    const bm2 = holoMaterial(0xffc0e0, { intensity: 1.0, lines: 30 });
    this.holo.push(bm, bm2);
    const brain = buildBrain(bm, bm2);
    brain.scale.setScalar(1.6);
    brain.position.set(0, 9.6, -13);
    brain.rotation.y = Math.PI / 2;
    this.g.add(brain);
    this.brain = brain;
    this.anim.push((t) => { brain.rotation.y = Math.PI / 2 + Math.sin(t * 0.4) * 0.6; brain.position.y = 9.6 + Math.sin(t * 1.3) * 0.12; });
    this.zones = ZONES1.map((z) => {
      const pad = ringPad(z.color, 1.4);
      pad.position.set(z.x, 0, z.z);
      const lab = labelSprite([z.label], hex(z.color), 3.4);
      lab.position.set(0, 6.2, 0);
      pad.add(lab);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5.4, 24, 1, true), holoMaterial(z.color, { intensity: 0.35, lines: 8 }));
      beam.position.y = 2.8;
      this.holo.push(beam.material);
      pad.add(beam);
      this.g.add(pad);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color: z.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      gl.scale.setScalar(1.4);
      gl.position.copy(brain.userData.regions[z.key]);
      brain.add(gl);
      return { ...z, pad, glow: gl, flash: 0 };
    });
    // stands (south half)
    this.stands = [0.55, 1.05, 1.57, 2.09, 2.59].map((a) => {
      const x = Math.cos(a) * 7.5, z = Math.sin(a) * 7.5 + 1.5;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xeef3f6, roughness: 0.4 }));
      st.position.set(x, 0.45, z);
      this.g.add(st);
      return { x, z };
    });
    // one orb per action
    this.orbs = Object.entries(ACTIONS).map(([key, a]) => {
      const holder = new THREE.Group();
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7fdcff, emissiveIntensity: 1.1, roughness: 0.2, transparent: true, opacity: 0.92 }));
      holder.add(orb);
      const lab = labelSprite(a.lines, '#35e0ff', 1.9, a.emoji);
      lab.position.y = 0.9;
      holder.add(lab);
      holder.visible = false;
      this.g.add(holder);
      return { key, ...a, obj: holder, lab, home: new THREE.Vector3(), state: 'off', fly: null, ph: Math.random() * 6 };
    });
  }
  reset() { this.setup(0); this.queue = []; }
  setup(i) {
    this.A.carry = null;
    for (const o of this.orbs) { o.state = 'off'; o.obj.visible = false; o.obj.scale.setScalar(1); o.fly = null; }
    for (const z of this.zones) { z.glow.material.opacity = 0; z.flash = 0; }
    this.left = this.phases[i].items;
    if (i === 0) ['musica', 'bici', 'mano'].forEach((k, j) => this._show(k, j + 1));
    else if (i === 1) ['cumple', 'pie', 'aplaudir', 'casa', 'patineta'].forEach((k, j) => this._show(k, j));
    else { this.queue = shuffle(Object.keys(ACTIONS)).slice(0, 6); this._next(); }
  }
  _orb(k) { return this.orbs.find((o) => o.key === k); }
  _show(k, s) {
    const o = this._orb(k), st = this.stands[s];
    o.home.set(st.x, 2.0, st.z);
    o.obj.position.copy(o.home);
    o.obj.scale.setScalar(1);
    o.obj.visible = true;
    o.state = 'home';
    o.stand = s;
  }
  _next() {
    const k = this.queue.shift();
    if (!k) return;
    this._show(k, 2);
    this.fx(this.stands[2].x, 2, this.stands[2].z, 0x7fdcff, 14, 3);
  }
  objective() { return `Lleva cada acción a su zona del cerebro (${this.phases[this.A.phase].items - this.left}/${this.phases[this.A.phase].items})`; }
  interactions(p) {
    const out = [];
    const near = (v, r) => Math.hypot(p.x - v.x, p.z - v.z) < r;
    if (!this.A.carry) {
      for (const o of this.orbs) if (o.state === 'home' && near(o.home, 2.4)) out.push({ label: `Tomar: ${o.lines.join(' ')}`, act: () => { o.state = 'carried'; this.A.carry = o; this.A.ctx.audio.play('pick'); } });
    } else {
      for (const z of this.zones) if (near(z, 2.6)) out.push({ label: `Colocar en ${z.label}`, act: () => this._drop(z) });
    }
    return out;
  }
  async _drop(z) {
    const o = this.A.carry;
    this.A.carry = null;
    if (o.target === z.key) {
      o.state = 'flying';
      o.fly = { t: 0, from: o.obj.position.clone(), to: new THREE.Vector3(z.x, 1.6, z.z) };
      z.glow.material.opacity = 1;
      z.flash = 1;
      this.A.hit(z.x, 1.6, z.z, z.color);
      this.left--;
      this.A.refreshObjective();
      if (this.A.phase === 0) await this.A.say([{ text: FACT1[z.key], mood: 'happy', gesture: this.left === 0 ? 'celebrate' : 'wave' }]);
      if (this.left <= 0) this.A.clearPhase();
      else if (this.A.phase === 2) this._next();
    } else {
      o.state = 'flying';
      o.fly = { t: 0, from: o.obj.position.clone(), to: o.home.clone(), back: true };
      this.A.miss('Neuri-X: Mmm, esa zona no es la principal para esta acción. ¡Prueba con otra!');
    }
  }
  update(dt, t, player) {
    const p = this.L(player.pos);
    const o = this.A.carry;
    if (o) o.obj.position.lerp(_v.set(p.x, p.y + 2.5 + Math.sin(t * 4) * 0.08, p.z), 1 - Math.exp(-14 * dt));
    for (const q of this.orbs) q.lab.visible = q.state === 'home' && Math.hypot(p.x - q.obj.position.x, p.z - q.obj.position.z) < 9;
    this.idle(dt, t);
  }
  idle(dt, t) {
    for (const o of this.orbs) {
      if (o.state === 'home') o.obj.position.y = o.home.y + Math.sin(t * 2 + o.ph) * 0.12;
      if (o.state === 'flying') {
        o.fly.t += dt * 2.2;
        const k = Math.min(1, o.fly.t);
        o.obj.position.lerpVectors(o.fly.from, o.fly.to, k);
        o.obj.position.y += Math.sin(k * Math.PI) * 1.2;
        if (k >= 1) o.state = o.fly.back ? 'home' : 'placed';
      }
      if (o.state === 'placed') {
        const s = damp(o.obj.scale.x, 0, 4, dt);
        o.obj.scale.setScalar(s);
        if (s < 0.05) { o.obj.visible = false; o.state = 'off'; }
      }
    }
    for (const z of this.zones) {
      z.flash = Math.max(0, z.flash - dt * 0.7);
      z.glow.material.opacity = Math.max(z.flash, 0);
      z.pad.userData.ring.material.emissiveIntensity = 1.6 + z.flash * 2 + (this.A.carry ? Math.sin(t * 6) * 0.6 : 0);
    }
  }
  cleanup() { if (this.A.carry && this.orbs.includes(this.A.carry)) this.A.carry = null; }
  mapItems() {
    return this.zones.map((z) => ({ x: z.x, z: z.z, r: 1.4, color: hex(z.color) }))
      .concat(this.orbs.filter((o) => o.state === 'home').map((o) => ({ x: o.home.x, z: o.home.z, r: 0.7, color: '#7fdcff' })));
  }
}

// ================================================================== LEVEL 2 · Autopista neuronal
const X0 = 11, X1 = -11;               // cable start (switch side) and end (muscle side)
const TRACK_Z = 25;
const NODES2 = [[9.7, 0.2], [6.5, 0.6], [3.3, 0.2], [0.1, 0.8], [-3.1, 0.4], [-6.3, 0.8], [-9.5, 0.3]];
class LvHighway extends Level {
  constructor(A, def) {
    super(A, def);
    this.spawn = { x: 14, z: 8.5, yaw: Math.PI };
    this.exitAt = { x: 7.5, z: 11.2, rot: 0 };
    this.phases = [
      { items: 1, time: 0, intro: [
        { text: '**Nivel 2: La autopista neuronal.** Estas dos fibras nerviosas llevan una señal hasta el **músculo**.', mood: 'think' },
        { text: 'Pisa el interruptor del **cable A** y luego el del **cable B**. ¡Observa bien qué señal llega primero!', mood: 'normal', gesture: 'point' },
      ] },
      { items: 4, time: 50, intro: [
        { text: '**Fase 2: Repara la mielina.** ¡Oh, no! El cable B perdió partes de su **mielina** y la señal ya no puede saltar. Lleva cada cápsula blanca a una zona dañada.', mood: 'surprised', gesture: 'point' },
      ] },
      { items: 8, time: 18, countdown: true, intro: [
        { text: '**Fase 3: Salta como la señal.** Con mielina, la señal **salta** de nodo en nodo. ¡Brinca por los nodos y llega al músculo antes que la señal lenta!', mood: 'happy', gesture: 'celebrate' },
      ] },
    ];
    const col = def.color;
    // main floor (rectangle) + walls
    const floor = new THREE.Mesh(new THREE.BoxGeometry(36, 3, 26), FLOOR_MAT());
    floor.position.set(0, -1.5, 0);
    floor.receiveShadow = true;
    this.g.add(floor);
    this.box(0, 0, 18, 13, 0, -3, 0);
    for (const [x, z, hx, hz] of [[0, -14, 19, 1], [0, 14, 19, 1], [-19, 0, 1, 14], [19, 0, 1, 14]]) this.box(x, z, hx, hz, 0, -2, 12);
    const rtex = rectFloorTexture(36, 26, hex(col));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(36, 26), new THREE.MeshStandardMaterial({ map: rtex, emissiveMap: rtex, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.22, metalness: 0.1 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.012;
    top.receiveShadow = true;
    this.g.add(top);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(36.3, 0.14, 26.3), goldMat());
    edge.position.y = -0.09;
    this.g.add(edge);
    const rnd2 = (() => { let a = 77; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; })();
    for (const [x, z] of [[-16.5, -11.5], [16.5, -11.5], [-16.5, 11.5]]) { const pl = planter(rnd2); pl.position.set(x, 0, z); this.g.add(pl); this.circle(x, z, 0.9, -1, 1.2); }
    const sl = sloganPanel(SLOGANS[1], hex(col), 5.2, 3.2);
    sl.position.set(-6, 3.4, -12.6);
    this.g.add(sl);
    this.title(-20.5, 0, Math.PI / 2);
    this.buildExit();
    // cables
    this.cables = ['A', 'B'].map((id, i) => {
      const z = i === 0 ? -3 : 3;
      const pts = [];
      for (let k = 0; k <= 20; k++) {
        const x = X0 + (X1 - X0) * (k / 20);
        pts.push(new THREE.Vector3(x, 0.55 + Math.sin(k * 0.9 + i) * 0.12, z + Math.sin(k * 0.5 + i * 2) * 0.35));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.13, 8), new THREE.MeshStandardMaterial({ color: 0x6fb6d8, emissive: 0x0c3b55, emissiveIntensity: 0.6, roughness: 0.4 }));
      this.g.add(core);
      const nodes = [], sheaths = [];
      if (id === 'B') {
        const nSeg = 9;
        for (let k = 0; k < nSeg; k++) {
          const t0 = (k + 0.12) / nSeg, t1 = (k + 0.88) / nSeg;
          const sub = [];
          for (let q = 0; q <= 6; q++) sub.push(curve.getPoint(t0 + (t1 - t0) * (q / 6)));
          const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x9fdcff, emissiveIntensity: 0.25, transparent: true, opacity: 1 });
          const sheath = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sub), 16, 0.36, 12), mat);
          this.g.add(sheath);
          sheaths.push({ mesh: sheath, mat, mid: curve.getPoint((t0 + t1) / 2), broken: false });
          nodes.push(k / nSeg);
        }
        nodes.push(1);
      }
      for (let k = 0; k <= 4; k++) {
        const p = curve.getPoint(k / 4);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, p.y, 6), new THREE.MeshStandardMaterial({ color: 0x8fa3c9 }));
        post.position.set(p.x, p.y / 2, p.z);
        this.g.add(post);
      }
      const sw = ringPad(0x35e0ff, 1.25);
      sw.position.set(X0 + 2.4, 0.01, z);
      this.g.add(sw);
      const swLab = labelSprite([`CABLE ${id}`, 'pisa para activar'], '#35e0ff', 2.6);
      swLab.position.set(X0 + 2.4, id === 'A' ? 3.9 : 2.0, z);
      this.g.add(swLab);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 16), new THREE.MeshStandardMaterial({ color: 0xff8a8a, emissive: 0xff3355, emissiveIntensity: 0.15, roughness: 0.35 }));
      lamp.position.set(X1 - 1.2, 1.2, z);
      const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 0.6, 14), new THREE.MeshStandardMaterial({ color: 0xeef3f6, roughness: 0.4 }));
      lampBase.position.set(X1 - 1.2, 0.3, z);
      this.g.add(lamp, lampBase);
      const lampLab = labelSprite(['MÚSCULO'], '#ff8a8a', 2.0);
      lampLab.position.set(X1 - 1.2, 2.5, z);
      this.g.add(lampLab);
      this.circle(X1 - 1.2, z, 0.7, -1, 1.8);
      const ans = ringPad(id === 'A' ? 0xffb020 : 0x22c55e, 1.6);
      ans.position.set(X1 - 4.6, 0.01, z);
      ans.visible = false;
      this.g.add(ans);
      const ansLab = labelSprite([`¿CABLE ${id}?`], id === 'A' ? '#ffb020' : '#22c55e', 2.2);
      ansLab.position.set(X1 - 4.6, 4.2, z);
      ansLab.visible = false;
      this.g.add(ansLab);
      const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color: 0xfff6a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pulse.scale.setScalar(1.6);
      pulse.visible = false;
      this.g.add(pulse);
      return { id, z, curve, nodes, sheaths, sw, swPos: new THREE.Vector3(X0 + 2.4, 0, z), lamp, ans, ansLab, ansPos: new THREE.Vector3(X1 - 4.6, 0, z), pulse, fired: false, running: false, p: 0, lampT: 0, onPad: false };
    });
    // myelin capsules (phase 2)
    this.caps = [4, 0.5, -3, -6.5].map((x) => {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xeef3f6, roughness: 0.4 }));
      st.position.set(x, 0.45, 8.6);
      this.g.add(st);
      const holder = new THREE.Group();
      const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 4, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fdcff, emissiveIntensity: 0.5, roughness: 0.25 }));
      cap.rotation.z = Math.PI / 2;
      holder.add(cap);
      holder.visible = false;
      this.g.add(holder);
      return { obj: holder, home: new THREE.Vector3(x, 1.7, 8.6), state: 'off', ph: x };
    });
    this.capLab = labelSprite(['MIELINA', 'cápsulas'], '#ffffff', 2.4);
    this.capLab.position.set(-1.25, 3.3, 8.6);
    this.capLab.visible = false;
    this.g.add(this.capLab);
    // ---- race track (phase 3): start platform, nodes of Ranvier over the void, muscle at the end
    const plat = (x, r, h) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.6, h, 32), FLOOR_MAT());
      m.position.set(x, -h / 2, TRACK_Z);
      this.g.add(m);
      const disk = floorDisk(r, hex(col));
      disk.position.set(x, 0.012, TRACK_Z);
      this.g.add(disk);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 6, 64), goldMat());
      rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.03, TRACK_Z);
      this.g.add(rim);
      this.circle(x, TRACK_Z, r, -h, 0);
    };
    plat(14.2, 2.6, 2.4);
    plat(-14.2, 2.6, 2.4);
    const axon = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 28.4, 12), glowMat(0x7fe9ff, 0.9));
    axon.rotation.z = Math.PI / 2;
    axon.position.set(0, -1.3, TRACK_Z);
    this.g.add(axon);
    const myMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x9fdcff, emissiveIntensity: 0.3 });
    const xs = [11.6].concat(NODES2.map((n) => n[0])).concat([-11.6]);
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i] - (i === 0 ? 0 : 1.0), b = xs[i + 1] + (i === xs.length - 2 ? 0 : 1.0);
      const len = Math.abs(a - b);
      if (len < 0.4) continue;
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, Math.max(0.1, len - 1.2), 4, 12), myMat);
      m.rotation.z = Math.PI / 2;
      m.position.set((a + b) / 2, -1.3, TRACK_Z);
      this.g.add(m);
    }
    this.raceNodes = NODES2.map(([x, h]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, h + 1.3, 24), new THREE.MeshStandardMaterial({ color: 0xeef3ff, roughness: 0.4 }));
      m.position.set(x, (h - 1.3) / 2, TRACK_Z);
      this.g.add(m);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.96, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0xfff3a0, emissive: 0xffd23f, emissiveIntensity: 0.5 }));
      top.position.set(x, h + 0.02, TRACK_Z);
      this.g.add(top);
      this.circle(x, TRACK_Z, 0.95, -1.4, h);
      return { x, h, top, hit: false };
    });
    const nlab = labelSprite(['NODOS DE RANVIER', '¡salta de uno en uno!'], '#ffd23f', 3.4);
    nlab.position.set(0, 3.2, TRACK_Z - 1.5);
    this.g.add(nlab);
    const finLamp = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 16), new THREE.MeshStandardMaterial({ color: 0xff8a8a, emissive: 0xff3355, emissiveIntensity: 0.3, roughness: 0.35 }));
    finLamp.position.set(-15.4, 1.4, TRACK_Z - 1.2);
    this.g.add(finLamp);
    this.circle(-15.4, TRACK_Z - 1.2, 0.85, -1, 2.2);
    this.finLamp = finLamp;
    const finLab = labelSprite(['MÚSCULO', '¡META!'], '#ff8a8a', 2.4);
    finLab.position.set(-14.2, 3.2, TRACK_Z + 0.8);
    this.g.add(finLab);
    // the slow (unmyelinated) rival signal, running along a thin fiber beside the track
    const slowPts = [new THREE.Vector3(14, 0.4, TRACK_Z + 3.4), new THREE.Vector3(0, 0.6, TRACK_Z + 3.8), new THREE.Vector3(-14, 0.4, TRACK_Z + 3.4)];
    this.slowCurve = new THREE.CatmullRomCurve3(slowPts);
    this.g.add(new THREE.Mesh(new THREE.TubeGeometry(this.slowCurve, 60, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x6fb6d8, emissive: 0x0c3b55, emissiveIntensity: 0.6 })));
    const slowLab = labelSprite(['SEÑAL LENTA', 'sin mielina'], '#ff8a8a', 2.6);
    slowLab.position.set(13, 2.4, TRACK_Z + 3.6);
    this.g.add(slowLab);
    this.slow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color: 0xff8a8a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.slow.scale.setScalar(1.8);
    this.slow.visible = false;
    this.g.add(this.slow);
  }
  reset() { this.setup(0); }
  setup(i) {
    this.A.carry = null;
    this.asking = false;
    this.cool = 0;
    for (const c of this.cables) { c.fired = false; c.running = false; c.p = 0; c.ni = 0; c.hop = 0; c.pulse.visible = false; c.ans.visible = false; c.ansLab.visible = false; c.lampT = 0; c.auto = false; }
    for (const s of this.cables[1].sheaths) { s.broken = false; s.mat.color.set(0xffffff); s.mat.emissive.set(0x9fdcff); s.mat.opacity = 1; s.mesh.visible = true; }
    for (const c of this.caps) { c.state = 'off'; c.obj.visible = false; }
    this.capLab.visible = false;
    this.slow.visible = false;
    this.race = null;
    for (const n of this.raceNodes) { n.hit = false; n.top.material.emissiveIntensity = 0.5; n.top.material.emissive.set(0xffd23f); }
    if (i === 1) {
      [1, 3, 5, 7].forEach((k) => { const s = this.cables[1].sheaths[k]; s.broken = true; s.mat.color.set(0xff5d73); s.mat.emissive.set(0xff2040); s.mat.opacity = 0.35; });
      for (const c of this.caps) { c.state = 'home'; c.obj.visible = true; c.obj.position.copy(c.home); }
      this.capLab.visible = true;
      this.left = 4;
    }
    if (i === 2) {
      const s = this.raceStart();
      this.A.ctx.teleport(s.x, s.y, s.z, s.yaw, true);
    }
  }
  raceStart() { const [x, z] = this.W(14.2, TRACK_Z); return { x, y: ARENA.y + 0.2, z, yaw: -Math.PI / 2 }; }
  start(i) {
    if (i === 2) { this.race = { t: 0, dur: this.phases[2].time + this.A.bonusT() }; this.slow.visible = true; }
  }
  objective() {
    const i = this.A.phase;
    if (i === 0) return this.asking ? '¿Qué cable llevó la señal más rápido? Párate en su plataforma' : 'Activa el cable A y el cable B';
    if (i === 1) return `Repara la mielina del cable B (${4 - this.left}/4)`;
    return 'Salta por los nodos y llega al músculo antes que la señal lenta';
  }
  interactions(p) {
    const out = [];
    if (this.A.phase !== 1) return out;
    if (!this.A.carry) {
      for (const c of this.caps) if (c.state === 'home' && Math.hypot(p.x - c.home.x, p.z - c.home.z) < 2.2) out.push({ label: 'Tomar cápsula de mielina', act: () => { c.state = 'carried'; this.A.carry = c; this.A.ctx.audio.play('pick'); } });
    } else {
      for (const s of this.cables[1].sheaths) if (s.broken && Math.hypot(p.x - s.mid.x, p.z - s.mid.z) < 2.3) out.push({ label: 'Reparar mielina', act: () => this._repair(s) });
    }
    return out;
  }
  _repair(s) {
    const c = this.A.carry;
    this.A.carry = null;
    c.state = 'off';
    c.obj.visible = false;
    s.broken = false;
    s.mat.color.set(0xffffff); s.mat.emissive.set(0x9fdcff); s.mat.opacity = 1;
    this.A.ctx.audio.play('snap');
    this.A.hit(s.mid.x, s.mid.y + 0.6, s.mid.z, 0xffffff);
    this.left--;
    this.A.refreshObjective();
    if (this.left <= 0) {
      const b = this.cables[1];
      b.running = true; b.p = 0; b.ni = 0; b.hop = 0; b.pulse.visible = true; b.auto = true;
      this.A.ctx.audio.play('switch');
      this.A.ctx.ui.toast('¡Mielina reparada! Mira cómo vuela la señal', '', '⚡', false, 2.4);
    }
  }
  async _answer(id) {
    const A = this.A;
    if (id === 'B') {
      this.asking = false;
      A.hit(X1 - 4.6, 1, 3, 0x22c55e, 2);
      for (const c of this.cables) { c.ans.visible = false; c.ansLab.visible = false; }
      await A.say([
        { text: '¡Correcto! El **cable B** está cubierto de **mielina**, una capa que aísla la fibra como el plástico de un cable.', mood: 'happy', gesture: 'celebrate' },
        { text: 'Con mielina, la señal **salta** de un hueco a otro y viaja muchísimo más rápido: ¡más de **100 metros por segundo**!', mood: 'surprised' },
      ]);
      A.clearPhase();
    } else {
      this.cool = 2.5;
      A.miss();
      await A.say([{ text: 'Mmm, observa otra vez: ¿qué **luz de músculo** se encendió primero? Puedes volver a activar los cables.', mood: 'think', gesture: 'think' }]);
    }
  }
  async outro(i) {
    if (i === 1) await this.A.say([{ text: '¡La señal vuelve a volar! Cuando la **mielina** se daña, los mensajes viajan más lento o se pierden en el camino.', mood: 'happy', gesture: 'celebrate' }]);
    if (i === 2) await this.A.say([{ text: '¡Increíble! Saltar de nodo en nodo es justo lo que hace la señal en un axón con mielina. A eso se le llama **conducción saltatoria**.', mood: 'surprised', gesture: 'celebrate' }]);
  }
  update(dt, t, player) {
    const A = this.A, audio = A.ctx.audio;
    const p = this.L(player.pos);
    const i = A.phase;
    this.cool = Math.max(0, this.cool - dt);
    if (A.carry && this.caps.includes(A.carry)) A.carry.obj.position.lerp(_v.set(p.x, p.y + 2.4, p.z), 1 - Math.exp(-14 * dt));
    for (const c of this.caps) if (c.state === 'home') c.obj.position.y = c.home.y + Math.sin(t * 2 + c.ph) * 0.1;
    if (i === 0) {
      for (const c of this.cables) {
        const onPad = Math.hypot(p.x - c.swPos.x, p.z - c.swPos.z) < 1.3 && player.grounded;
        if (onPad && !c.onPad && !c.running) { c.running = true; c.p = 0; c.pulse.visible = true; c.fired = true; audio.play('switch'); c.sw.userData.ring.material.emissiveIntensity = 3; }
        c.onPad = onPad;
        if (this.asking && !A.busy && this.cool <= 0 && Math.hypot(p.x - c.ansPos.x, p.z - c.ansPos.z) < 1.6 && player.grounded) { this.cool = 99; this._answer(c.id).then(() => { if (this.cool === 99) this.cool = 0; }); }
      }
    }
    this._cables(dt, t, i);
    if (i === 2 && this.race) this._race(dt, t, player, p);
  }
  _cables(dt, t, i) {
    const audio = this.A.ctx.audio;
    for (const c of this.cables) {
      if (c.running) {
        if (c.id === 'A') c.p += dt / 6.5;
        else {
          c.hop = (c.hop || 0) + dt;
          if (c.hop > 0.16) { c.hop = 0; c.ni = (c.ni || 0) + 1; audio.play('pulse'); }
          const ni = Math.min(c.ni || 0, c.nodes.length - 1);
          c.p = damp(c.p, c.nodes[ni], 30, dt);
          if (ni >= c.nodes.length - 1 && c.p > 0.995) c.p = 1;
        }
        c.curve.getPoint(Math.min(1, c.p), c.pulse.position);
        c.pulse.scale.setScalar(1.4 + Math.sin(t * 20) * 0.2);
        if (c.p >= 1) {
          c.running = false; c.pulse.visible = false; c.ni = 0; c.hop = 0;
          c.lampT = 1.6;
          audio.play('good');
          this.fx(c.lamp.position.x, c.lamp.position.y, c.lamp.position.z, 0xff6b6b, 20, 4);
          c.sw.userData.ring.material.emissiveIntensity = 1.6;
          if (i === 0 && !this.asking && this.cables.every((x) => x.fired && !x.running)) {
            this.asking = true;
            for (const x of this.cables) { x.ans.visible = true; x.ansLab.visible = true; }
            this.A.refreshObjective();
            this.A.ctx.ui.toast('Neuri-X: ¡Súbete a la plataforma del cable que llegó primero!', 'Están al final de los cables', '🤖', false, 3.5);
          }
          if (i === 1 && c.auto) { c.auto = false; this.A.clearPhase(); }
        }
      }
      c.lampT = Math.max(0, c.lampT - dt);
      c.lamp.material.emissiveIntensity = 0.15 + c.lampT * 2.2;
    }
  }
  _race(dt, t, player, p) {
    const A = this.A, r = this.race;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    this.slowCurve.getPoint(k, this.slow.position);
    this.slow.scale.setScalar(1.6 + Math.sin(t * 14) * 0.2);
    if (player.grounded && Math.abs(p.z - TRACK_Z) < 1.3) {
      for (const n of this.raceNodes) {
        if (!n.hit && Math.abs(p.x - n.x) < 1.0 && Math.abs(p.y - n.h) < 0.25) {
          n.hit = true;
          n.top.material.emissive.set(0x22e07a); n.top.material.emissiveIntensity = 2.2;
          A.hit(n.x, n.h + 0.6, TRACK_Z, 0x22e07a);
          A.ctx.audio.play('pulse');
        }
      }
    }
    if (player.grounded && Math.hypot(p.x + 14.2, p.z - TRACK_Z) < 2.6 && Math.abs(p.y) < 0.3) {
      this.race = null;
      this.slow.visible = false;
      this.finLamp.material.emissiveIntensity = 3;
      A.hit(-14.2, 1.2, TRACK_Z, 0xff6b6b, 2);
      A.clearPhase();
      return;
    }
    if (k >= 1) {
      this.race = null;
      A.raceLost();
    }
  }
  mapItems() {
    const out = this.cables.map((c) => ({ x: X1 - 1.2, z: c.z, r: 0.8, color: '#ff8a8a' }))
      .concat(this.cables.map((c) => ({ x: X0 + 2.4, z: c.z, r: 1.2, color: '#35e0ff' })));
    if (this.A.phase === 2) out.push(...this.raceNodes.map((n) => ({ x: n.x, z: TRACK_Z, r: 0.95, color: n.hit ? '#22e07a' : '#ffd23f' })), { x: 14.2, z: TRACK_Z, r: 2.6, color: '#4b5bb8' }, { x: -14.2, z: TRACK_Z, r: 2.6, color: '#ff8a8a' });
    return out;
  }
  mapView() { return this.A.phase === 2 ? { cx: 0, cz: TRACK_Z, span: 40 } : { cx: 0, cz: 0, span: 42 }; }
  cleanup() { if (this.A.carry && this.caps.includes(this.A.carry)) this.A.carry = null; this.race = null; }
}

// ================================================================== LEVEL 3 · El reflejo
const SLOTS3 = [[-8, -3.5], [-4.6, -9.8], [2.3, -10.4], [8, -5.8], [6.9, 1.8], [-6.9, 3.6], [0, -2.9]];
const NODE3 = [
  { key: 'piel', label: 'PIEL', h: 0.9, color: 0xffb3a0 },
  { key: 'cerebro', label: 'CEREBRO', h: 1.45, color: 0xff9fd0 },
  { key: 'medula', label: 'MÉDULA ESPINAL', h: 1.25, color: 0xffe066 },
  { key: 'musculo', label: 'MÚSCULO', h: 1.5, color: 0xff6b6b },
];
const ORDER3 = ['piel', 'medula', 'musculo', 'cerebro'];
const HINTS3 = [
  'Recuerda: primero la **piel** detecta el calor.',
  'Después de la piel, la señal viaja a la **médula espinal**, en tu espalda. ¡Ella responde sin esperar al cerebro!',
  'La médula le ordena al **músculo** retirar la mano… y el **cerebro** se entera al final.',
];
class LvReflex extends Level {
  constructor(A, def) {
    super(A, def);
    this.phases = [
      { items: 4, time: 0, roundTime: 14, rounds: 1, intro: [
        { text: '**Nivel 3: El reflejo.** Imagina que tocas algo muy caliente… ¡tu cuerpo reacciona antes de que lo pienses!', mood: 'surprised' },
        { text: 'Recorre el camino de la señal **en orden**, saltando sobre cada nodo. Al tocar el primero empieza el reloj: tienes **14 segundos**.', mood: 'normal', gesture: 'point' },
        { text: 'Pista: la señal empieza en el lugar que **detecta** el calor. ¿A dónde va después?', mood: 'think', gesture: 'think' },
      ] },
      { items: 4, time: 0, roundTime: 10, rounds: 1, intro: [
        { text: '**Fase 2: Practica.** ¡Los nodos cambiaron de lugar! Recorre el mismo camino, ahora en **10 segundos**.', mood: 'happy', gesture: 'point' },
      ] },
      { items: 12, time: 0, roundTime: 8, rounds: 3, intro: [
        { text: '**Fase 3: Reto veloz.** ¡Tres reflejos seguidos! Los nodos se mueven en cada ronda y tienes **8 segundos** para cada una.', mood: 'surprised', gesture: 'celebrate' },
      ] },
    ];
    this.roundFloor(19);
    this.title();
    this.buildExit();
    // flame hologram
    const flame = new THREE.Group();
    const fm = holoMaterial(0xff7a30, { intensity: 1.4, lines: 22 });
    const f2m = holoMaterial(0xffe066, { intensity: 1.6 });
    this.holo.push(fm, f2m);
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 16, 1, true), fm);
    f1.position.y = 1.2;
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.0, 16, 1, true), f2m);
    f2.position.y = 1.0;
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.6, roughness: 0.4 }));
    burner.position.y = 0.2;
    flame.add(burner, f1, f2);
    flame.position.set(-3.6, 0, 9.6);
    this.g.add(flame);
    this.circle(-3.6, 9.6, 0.8, -1, 0.4);
    const fl = labelSprite(['¡CALIENTE!'], '#ff7a30', 2.2, '🔥');
    fl.position.set(-3.6, 2.5, 9.6);   // (sign left out: it covered the PIEL node; the flame speaks for itself)
    this.anim.push((t) => { f1.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 9) * 0.12, 1); f2.scale.y = 1 + Math.sin(t * 15) * 0.15; });
    // slot colliders (toggled per assignment) + node columns
    this.slotCols = SLOTS3.map(([x, z]) => { const c = this.circle(x, z, 1.6, -1, 1); c.on = false; return c; });
    this.nodes = NODE3.map((nd) => {
      const g = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, nd.h, 28), new THREE.MeshStandardMaterial({ color: 0xf3f7fa, roughness: 0.45 }));
      col.position.y = nd.h / 2;
      col.castShadow = col.receiveShadow = true;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.56, 0.08, 28), new THREE.MeshStandardMaterial({ color: nd.color, emissive: nd.color, emissiveIntensity: 0.5 }));
      top.position.y = nd.h + 0.02;
      g.add(col, top);
      const lab = labelSprite([nd.label], hex(nd.color), 3.0);
      lab.position.y = nd.h + 1.7;
      g.add(lab);
      const num = lab;
      this.g.add(g);
      return { ...nd, g, top, num, hit: false, x: 0, z: 0, slot: -1, tx: 0, tz: 0 };
    });
  }
  _assign(fixed) {
    const slots = fixed ? [5, 1, 6, 4] : shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, 4);
    for (const c of this.slotCols) c.on = false;
    this.nodes.forEach((n, i) => {
      const s = slots[i];
      n.slot = s;
      [n.tx, n.tz] = SLOTS3[s];
      const c = this.slotCols[s];
      c.on = true;
      c.y1 = ARENA.y + n.h;
      if (fixed || !n.g.visible) { n.x = n.tx; n.z = n.tz; n.g.position.set(n.x, 0, n.z); }
      n.g.visible = true;
    });
  }
  reset() { this.setup(0); }
  setup(i) {
    this.round = 0;
    this.seq = [];
    this.timer = null;
    this.needLeave = false;
    this.cool = 0;
    this.fails = 0;
    this._assign(i === 0);
    this._resetRound(false);
  }
  _resetRound(failed) {
    this.seq = [];
    this.timer = null;
    for (const n of this.nodes) {
      n.hit = false;
      n.top.material.emissive.set(failed ? 0xff2040 : n.color);
      n.top.material.emissiveIntensity = failed ? 2 : 0.5;
      relabel(n.num, [n.label], hex(n.color), 3.0);
    }
    this.A.ctx.ui.setTimer(null);
  }
  objective() {
    const ph = this.phases[this.A.phase];
    return ph.rounds > 1 ? `Toca los nodos en el orden correcto · Ronda ${this.round + 1}/${ph.rounds}` : 'Toca los nodos en el orden correcto';
  }
  async _fail(reason) {
    const A = this.A;
    this.fails++;
    this._resetRound(true);
    this.cool = 1.2;
    if (A.phase === 0) {
      A.miss();
      const msg = reason === 'time' ? '¡Se acabó el tiempo! Los reflejos son rapidísimos. ¡Inténtalo otra vez!' : '¡Ups! La señal tomó un camino equivocado.';
      await A.say([{ text: `${msg} ${HINTS3[Math.min(this.fails - 1, HINTS3.length - 1)]}`, mood: 'sad', gesture: 'think' }]);
    } else {
      A.miss(reason === 'time' ? 'Neuri-X: ¡Se acabó el tiempo! ¡Tú puedes, otra vez!' : 'Neuri-X: ¡Ups! Recuerda el orden: piel, médula, músculo y cerebro.');
    }
    this._resetRound(false);
    this.needLeave = true;
  }
  async _roundWon() {
    const A = this.A, ph = this.phases[A.phase];
    const left = Math.max(0, this.timer || 0);
    this.timer = null;
    A.ctx.ui.setTimer(null);
    A.bonus(Math.round(left) * 30, '¡Reflejo rápido!');
    this.round++;
    if (this.round < ph.rounds) {
      A.ctx.ui.centerMsg(`RONDA ${this.round + 1}/${ph.rounds}`, '¡Los nodos se mueven!', 1.6);
      A.ctx.audio.play('switch');
      this._assign(false);
      this._resetRound(false);
      this.needLeave = true;
      A.refreshObjective();
      return;
    }
    if (A.phase === 0) {
      await A.say([
        { text: '¡Increíble! La **piel** detecta el calor, la **médula espinal** responde de inmediato y el **músculo** retira tu mano.', mood: 'happy', gesture: 'celebrate' },
        { text: 'El **cerebro** se entera un instante después. ¡Por eso primero te mueves y luego sientes el ardor! Eso es un **arco reflejo**.', mood: 'surprised' },
      ]);
    }
    A.clearPhase();
  }
  update(dt, t, player) {
    const A = this.A;
    const p = this.L(player.pos);
    this.idle(dt, t);
    this.cool = Math.max(0, this.cool - dt);
    if (A.busy || this.cool > 0) return;
    const onAny = this.nodes.some((n) => player.grounded && Math.hypot(p.x - n.x, p.z - n.z) < 1.7 && Math.abs(p.y - n.h) < 0.25);
    if (this.needLeave && !onAny) this.needLeave = false;
    if (!this.needLeave) {
      for (const n of this.nodes) {
        const on = player.grounded && Math.hypot(p.x - n.x, p.z - n.z) < 1.65 && Math.abs(p.y - n.h) < 0.2;
        if (!on || n.hit) continue;
        const expected = ORDER3[this.seq.length];
        if (n.key === expected) {
          n.hit = true;
          this.seq.push(n.key);
          n.top.material.emissive.set(0x22e07a);
          n.top.material.emissiveIntensity = 2.2;
          relabel(n.num, [`${this.seq.length} · ${n.label}`], '#22c55e', 3.0);
          A.hit(n.x, n.h + 0.5, n.z, 0x22e07a);
          if (this.seq.length === 1 && this.phases[A.phase].roundTime) this.timer = this.phases[A.phase].roundTime + A.bonusT();
          if (this.seq.length === 4) { this._roundWon(); return; }
        } else if (this.seq.length > 0 || n.key !== 'piel') {
          this._fail('order');
          return;
        }
      }
    }
    if (this.timer !== null) {
      const prev = Math.ceil(this.timer);
      this.timer -= dt;
      if (Math.ceil(this.timer) !== prev && this.timer < 5) A.ctx.audio.play('tick');
      A.ctx.ui.setTimer(Math.max(0, this.timer));
      if (this.timer <= 0) this._fail('time');
    }
  }
  idle(dt) {
    for (const n of this.nodes) {
      if (Math.hypot(n.x - n.tx, n.z - n.tz) > 0.01) {
        n.x = damp(n.x, n.tx, 5, dt); n.z = damp(n.z, n.tz, 5, dt);
        n.g.position.set(n.x, 0, n.z);
      }
    }
  }
  cleanup() { this.A.ctx.ui.setTimer(null); this.timer = null; }
  mapItems() { return this.nodes.map((n) => ({ x: n.x, z: n.z, r: 1.6, color: n.hit ? '#22e07a' : hex(n.color) })); }
}

// ================================================================== LEVEL 4 · Mensajes químicos
const REC4 = [
  { key: 'dormir', color: 0x9b6bff, want: 'morado', label: ['DORMIR Y', 'RELAJARSE'], emoji: '🌙', x: -9, z: 2 },
  { key: 'atencion', color: 0xffd23f, want: 'amarillo', label: ['ATENCIÓN Y', 'CONCENTRACIÓN'], emoji: '⚡', x: 9, z: 2 },
];
const EMIT4 = { x: 0, z: -6 };
class LvChem extends Level {
  constructor(A, def) {
    super(A, def);
    this.phases = [
      { items: 4, time: 0, need: 2, emit: 1.6, speed: 1.4, life: 22, intro: [
        { text: '**Nivel 4: Mensajes químicos.** Las neuronas también se comunican con **mensajeros químicos**. Aquí los vemos como burbujas de colores.', mood: 'think' },
        { text: 'La **melatonina** (morada) le avisa a tu cuerpo que ya es de noche. La **dopamina** (amarilla) te ayuda a mantener el enfoque y la motivación.', mood: 'normal' },
        { text: 'Atrapa las burbujas que salen de la sinapsis y llévalas a la situación correcta. ¡Necesitamos **2 de cada una**!', mood: 'happy', gesture: 'point' },
      ] },
      { items: 6, time: 66, need: 3, emit: 1.1, speed: 2.0, life: 16, intro: [
        { text: '**Fase 2: Practica.** Ahora necesitamos **3 de cada una** y las burbujas se mueven más rápido. ¡Atento al reloj!', mood: 'happy', gesture: 'point' },
      ] },
      { items: 8, time: 56, need: 4, emit: 0.85, speed: 2.6, life: 10, intro: [
        { text: '**Fase 3: Reto veloz.** ¡**4 de cada una**! Las burbujas desaparecen pronto, así que muévete rápido.', mood: 'surprised', gesture: 'celebrate' },
      ] },
    ];
    this.roundFloor(19);
    this.title();
    this.buildExit();
    const term = new THREE.Group();
    const tm = new THREE.MeshStandardMaterial({ color: 0xd2b6ff, emissive: 0x8b5cf6, emissiveIntensity: 0.8, roughness: 0.3 });
    const t1 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), tm);
    t1.position.y = 3.6; t1.rotation.x = Math.PI;
    const t2 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x19c2e6, emissiveIntensity: 0.7, roughness: 0.3 }));
    t2.position.y = 1.2;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 12), tm);
    stalk.position.y = 4.4;
    term.add(t1, t2, stalk);
    term.position.set(EMIT4.x, 0, EMIT4.z);
    this.g.add(term);
    this.circle(EMIT4.x, EMIT4.z, 1.1, -1, 5);
    const sl = labelSprite(['SINAPSIS'], '#d2b6ff', 2.4);
    sl.position.set(EMIT4.x, 6.4, EMIT4.z);
    this.g.add(sl);
    this.recs = REC4.map((r) => {
      const pad = ringPad(r.color, 1.6);
      pad.position.set(r.x, 0, r.z);
      const lab = labelSprite(r.label, hex(r.color), 3.2, r.emoji);
      lab.position.y = 2.6;
      pad.add(lab);
      const meter = labelSprite(['0 / 2'], '#ffffff', 1.4);
      meter.position.y = 4.0;
      pad.add(meter);
      this.g.add(pad);
      return { ...r, pad, meter, count: 0 };
    });
    // bubble pool (two shared materials + two labels per bubble)
    const mats = {
      morado: new THREE.MeshStandardMaterial({ color: 0x9b6bff, emissive: 0x9b6bff, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.1 }),
      amarillo: new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.1 }),
    };
    const geo = new THREE.SphereGeometry(0.42, 20, 16);
    this.pool = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const sphere = new THREE.Mesh(geo, mats.morado);
      g.add(sphere);
      const lm = labelSprite(['Melatonina'], '#b48cff', 1.6);
      const ly = labelSprite(['Dopamina'], '#ffd23f', 1.6);
      lm.position.y = ly.position.y = 0.9;
      g.add(lm, ly);
      g.visible = false;
      this.g.add(g);
      this.pool.push({ g, sphere, lm, ly, mats, kind: 'morado', vel: new THREE.Vector3(), life: 0, live: false, carried: false });
    }
  }
  reset() { this.setup(0); }
  setup(i) {
    const ph = this.phases[i];
    this.A.carry = null;
    this.emitT = 0.4;
    for (const b of this.pool) { b.live = false; b.carried = false; b.g.visible = false; }
    for (const r of this.recs) { r.count = 0; relabel(r.meter, [`0 / ${ph.need}`], '#ffffff', 1.4); }
  }
  objective() {
    const ph = this.phases[this.A.phase];
    const tot = this.recs.reduce((a, r) => a + Math.min(r.count, ph.need), 0);
    return `Entrega ${ph.need} mensajeros a cada situación (${tot}/${ph.need * 2})`;
  }
  _spawn(ph) {
    const b = this.pool.find((x) => !x.live);
    if (!b) return;
    const need = { morado: this.recs[0].count < ph.need, amarillo: this.recs[1].count < ph.need };
    const kind = need.morado && need.amarillo ? (Math.random() < 0.5 ? 'morado' : 'amarillo') : need.morado ? (Math.random() < 0.7 ? 'morado' : 'amarillo') : (Math.random() < 0.7 ? 'amarillo' : 'morado');
    b.kind = kind;
    b.sphere.material = b.mats[kind];
    b.lm.visible = kind === 'morado';
    b.ly.visible = kind === 'amarillo';
    b.g.position.set(EMIT4.x, 2.4, EMIT4.z);
    b.g.scale.setScalar(1);
    const ang = Math.random() * Math.PI * 2;
    b.vel.set(Math.cos(ang) * ph.speed, 0.2, Math.sin(ang) * ph.speed);
    b.life = ph.life;
    b.live = true; b.carried = false;
    b.g.visible = true;
    this.A.ctx.audio.play('blip');
  }
  update(dt, t, player) {
    const A = this.A, ph = this.phases[A.phase];
    const p = this.L(player.pos);
    this.emitT -= dt;
    if (this.emitT <= 0 && this.pool.filter((b) => b.live).length < 7) { this.emitT = ph.emit; this._spawn(ph); }
    for (const b of this.pool) {
      if (!b.live) continue;
      if (b.carried) {
        b.g.position.lerp(_v.set(p.x, p.y + 2.4, p.z), 1 - Math.exp(-14 * dt));
        for (const r of this.recs) {
          if (Math.hypot(p.x - r.x, p.z - r.z) >= 2.0) continue;
          b.live = false; b.carried = false; b.g.visible = false; A.carry = null;
          if (r.want === b.kind && r.count < ph.need) {
            r.count++;
            relabel(r.meter, [`${r.count} / ${ph.need}`], r.count >= ph.need ? '#22c55e' : '#ffffff', 1.4);
            A.hit(r.x, 1.6, r.z, r.color);
            A.refreshObjective();
            if (this.recs.every((x) => x.count >= ph.need)) { for (const o of this.pool) { o.live = false; o.g.visible = false; } A.clearPhase(); return; }
          } else if (r.want === b.kind) {
            A.ctx.ui.toast('¡Esa situación ya está completa!', '', '✅');
          } else {
            A.miss(b.kind === 'morado' ? 'Neuri-X: La melatonina prepara para dormir… ¡justo lo contrario de concentrarse!' : 'Neuri-X: La dopamina te pone en modo enfoque… ¡así cuesta relajarse para dormir!');
          }
          break;
        }
        continue;
      }
      b.life -= dt;
      b.vel.y += (Math.sin(t * 2 + b.life) * 0.4 - (b.g.position.y - 1.9) * 0.8) * dt;
      b.g.position.addScaledVector(b.vel, dt);
      const nearL = b.g.position.distanceTo(_v.set(p.x, p.y + 1.2, p.z)) < 7.5;
      b.lm.visible = b.kind === 'morado' && nearL;
      b.ly.visible = b.kind === 'amarillo' && nearL;
      const dx = b.g.position.x, dz = b.g.position.z, dd = Math.hypot(dx, dz);
      if (dd > 15) { b.vel.x -= (dx / dd) * 4 * dt; b.vel.z -= (dz / dd) * 4 * dt; }
      b.vel.x += (Math.random() - 0.5) * dt * 2; b.vel.z += (Math.random() - 0.5) * dt * 2;
      const sp = Math.hypot(b.vel.x, b.vel.z), mx = ph.speed * 1.4;
      if (sp > mx) { b.vel.x *= mx / sp; b.vel.z *= mx / sp; }
      if (b.life < 1) b.g.scale.setScalar(Math.max(0.05, b.life));
      if (b.life <= 0) { b.live = false; b.g.visible = false; continue; }
      const mg = A.ctx.gear && A.ctx.gear.magnet();
      if (mg && !A.carry) { const mx2 = p.x - b.g.position.x, mz2 = p.z - b.g.position.z, ml = Math.hypot(mx2, mz2); if (ml < 6 && ml > 0.01) { b.vel.x += (mx2 / ml) * 7 * dt; b.vel.z += (mz2 / ml) * 7 * dt; } }
      if (!A.carry && b.g.position.distanceTo(_v.set(p.x, p.y + 1.2, p.z)) < (mg ? 2.4 : 1.6)) {
        b.carried = true; b.g.scale.setScalar(1); A.carry = b;
        A.ctx.audio.play('pick');
      }
    }
  }
  async outro(i) {
    if (i === 0) await this.A.say([
      { text: '¡Perfecto! Para dormir, mensajeros como la **melatonina** le avisan a tu cuerpo que es hora de descansar.', mood: 'happy', gesture: 'celebrate' },
      { text: 'Para concentrarte, la **dopamina** y la **noradrenalina** mantienen tu atención. Y ojo: ¡dormir bien también te ayuda a concentrarte mejor!', mood: 'normal' },
    ]);
  }
  cleanup() { for (const b of this.pool) { b.live = false; b.g.visible = false; } if (this.A.carry && this.pool.includes(this.A.carry)) this.A.carry = null; }
  mapItems() {
    return this.recs.map((r) => ({ x: r.x, z: r.z, r: 1.6, color: hex(r.color) }))
      .concat([{ x: EMIT4.x, z: EMIT4.z, r: 1.1, color: '#d2b6ff' }])
      .concat(this.pool.filter((b) => b.live && !b.carried).map((b) => ({ x: b.g.position.x, z: b.g.position.z, r: 0.5, color: b.kind === 'morado' ? '#9b6bff' : '#ffd23f' })));
  }
}

// ================================================================== the arcade (hub + flow)
// ================================================================== CONTENT LEVELS (book districts)
// Data-driven rooms: every phase is a list of steps — quiz (answer pads) · sort (carry to zones) ·
// build (insert tokens up to a goal) · pick (activate pads, in order or the right ones).
const QX = { 2: [-4.2, 4.2], 3: [-6, 0, 6], 4: [-8.4, -2.8, 2.8, 8.4] };
const SORTZ = { 2: [[-6.5, -4.5], [6.5, -4.5]], 3: [[-8.5, -4], [0, -4.6], [8.5, -4]] };
const BOARD_Y = 4.1, BOARD_Y_SORT = 5.3, BOARD_Z = -9.5;   // close and low: the follow camera looks down, so it stays clear of the top HUD
const QCOL = [0xffb020, 0x35e0ff, 0xb57bff, 0x22c55e];
const ITEM_SLOTS = [[-7.5, 6.6], [7.5, 6.6], [-4.2, 9.4], [4.2, 9.4], [-10.6, 3.4], [10.6, 3.4]];
const LETTER = ['A', 'B', 'C', 'D'];
const plain = (s) => String(s).replace(/\*\*/g, '');
const FONT = 'Nunito, system-ui, sans-serif';
function wrapText(g, text, maxW) {
  const out = [];
  let ln = '';
  for (const w of text.split(' ')) {
    const t = ln ? ln + ' ' + w : w;
    if (g.measureText(t).width > maxW && ln) { out.push(ln); ln = w; } else ln = t;
  }
  if (ln) out.push(ln);
  return out;
}
// big question / instruction board
function boardCanvas(head, text, color, extra) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,14,44,0.9)';
  roundRect(g, 8, 8, 1008, 496, 48); g.fill();
  g.lineWidth = 10; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 20; g.stroke(); g.shadowBlur = 0;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.font = `900 40px ${FONT}`;
  g.fillText(head, 512, 60, 940);
  const top = 100, H = extra ? 150 : 380;
  let size = extra ? 48 : 60, lines = [];
  for (; size >= 30; size -= 3) {
    g.font = `800 ${size}px ${FONT}`;
    lines = wrapText(g, plain(text), 930);
    if (lines.length * size * 1.22 <= H) break;
  }
  g.fillStyle = '#ffffff';
  const y0 = top + (H - lines.length * size * 1.22) / 2 + size * 0.61;
  lines.forEach((ln, i) => g.fillText(ln, 512, y0 + i * size * 1.22, 960));
  if (extra) extra(g);
  return c;
}
// answer card over a pad (letter badge + wrapped text)
function cardCanvas(head, text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 300;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,22,44,0.9)';
  roundRect(g, 6, 6, 500, 288, 40); g.fill();
  g.lineWidth = 8; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 14; g.stroke(); g.shadowBlur = 0;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let cx = 256, maxW = 460;
  if (head) {
    g.fillStyle = color;
    g.beginPath(); g.arc(70, 150, 44, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b1230'; g.font = `900 58px ${FONT}`;
    g.fillText(head, 70, 154);
    cx = 300; maxW = 360;
  }
  g.fillStyle = '#ffffff';
  let size = 84, lines = [];
  for (; size >= 30; size -= 4) {
    g.font = `900 ${size}px ${FONT}`;
    lines = wrapText(g, plain(text), maxW);
    if (lines.length <= 4 && lines.length * size * 1.12 <= 250 && lines.every((l) => g.measureText(l).width <= maxW)) break;
  }
  const y0 = 150 - ((lines.length - 1) * size * 1.12) / 2;
  lines.forEach((ln, i) => g.fillText(ln, cx, y0 + i * size * 1.12, maxW));
  return c;
}
// glyph hologram for the hub capsules of the book districts
function glyphHolo(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${text.length > 3 ? 70 : 96}px ${FONT}`;
  g.shadowColor = hex(color); g.shadowBlur = 26;
  g.fillStyle = hex(color);
  g.fillText(text, 128, 132, 240);
  g.shadowBlur = 8; g.fillStyle = '#ffffff';
  g.fillText(text, 128, 132, 240);
  const sp = canvasSprite(c, 1.9);
  sp.material.depthTest = true;
  return sp;
}

class LvContent extends Level {
  constructor(A, def) {
    super(A, def);
    this.hints = def.hints || [];
    this.phases = def.phases.map((p) => ({ items: p.steps.reduce((a, s) => a + LvContent.hits(s), 0), time: 0, intro: p.intro }));
    this.roundFloor(19);
    this.title();
    this.buildExit();
    this.dyn = new THREE.Group();
    this.g.add(this.dyn);
    this.board = canvasSprite(boardCanvas(def.name.toUpperCase(), def.sub, hex(def.color)), 9);
    this.board.position.set(0, BOARD_Y, BOARD_Z);
    this.g.add(this.board);
    // board frame posts
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 7.6, 10), pearlMat());
      post.position.set(s * 4.85, 3.8, BOARD_Z - 0.1);
      this.g.add(post);
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), goldMat());
      cap.position.set(s * 4.85, 7.9, BOARD_Z - 0.1);
      this.g.add(cap);
      this.circle(s * 4.85, BOARD_Z - 0.1, 0.3, -1, 8);
    }
    this.dynHolo = [];
    this.pads = []; this.items = []; this.zones = []; this.fly = [];
  }
  static hits(s) { return s.t === 'quiz' ? s.qs.length : s.t === 'sort' ? s.items.length : s.t === 'build' ? s.targets.length : (s.order || s.good).length; }
  applyMode(calm) { this.phases.forEach((p, i) => { p.time = calm ? 0 : (this.def.phases[i].ctime || 0); }); }
  get step() { return this.steps && this.steps[this.si]; }
  reset() { this._clear(); this.steps = null; }
  cleanup() { if (this.A.carry && this.items.includes(this.A.carry)) this.A.carry = null; this.lock = false; }
  setup(i) {
    this.A.carry = null;
    this.lock = false;
    this.pi = i;
    this.si = 0;
    this.steps = this.def.phases[i].steps;
    this._build(this.steps[0]);
  }
  // ---------------------------------------------------------------- helpers
  _clear() {
    for (const o of [...this.dyn.children]) {
      this.dyn.remove(o);
      o.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
        if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
      });
    }
    this.dynHolo = [];
    this.pads = []; this.items = []; this.zones = []; this.fly = [];
    this.undo = null;
  }
  _pad(x, z, color, r = 1.4) {
    const p = ringPad(color, r);
    p.position.set(x, 0, z);
    this.dyn.add(p);
    return p;
  }
  _card(head, text, color, w, x, y, z) {
    const sp = canvasSprite(cardCanvas(head, text, hex(color)), w);
    sp.position.set(x, y, z);
    this.dyn.add(sp);
    return sp;
  }
  _setBoard(head, text, extra, sub) {
    setSpriteCanvas(this.board, boardCanvas(head, text, hex(this.def.color), extra));
    this.A.qShow(head, plain(text), sub || '');   // same question as a banner under the HUD (always readable)
  }
  _alive(cur) { return this.A.cur === cur && this.A.state === 'play'; }
  async _explain(s, text) {
    if (!text) return;
    if (s.teach) await this.A.say([{ text, mood: 'happy', gesture: 'wave' }]);
    else this.A.ctx.ui.toast('Neuri-X: ' + text, '', '💡', false, 3.6);
  }
  _build(s) {
    this._clear();
    this.board.position.y = s.t === 'sort' ? BOARD_Y_SORT : BOARD_Y;
    if (s.t === 'quiz') { this.qi = 0; this._quizShow(); }
    else if (s.t === 'sort') this._sortBuild(s);
    else if (s.t === 'build') { this.ti = 0; this._buildTarget(); }
    else if (s.t === 'pick') this._pickBuild(s);
  }
  async _stepDone() {
    const cur = this.A.cur;
    this.lock = true;
    await wait(600);
    if (!this._alive(cur)) return;
    this.si++;
    if (this.si >= this.steps.length) {
      this._clear();
      this._setBoard(this.def.name.toUpperCase(), `¡Fase ${this.pi + 1} superada!`);
      this.A.qHide();
      this.lock = false;
      this.A.clearPhase();
      return;
    }
    const s = this.step;
    this._build(s);
    this.A.refreshObjective();
    if (s.intro) await this.A.say(s.intro);
    this.lock = false;
  }
  _nearest(list, p, r) {
    let best = null, bd = r;
    for (const o of list) { const d = Math.hypot(p.x - o.x, p.z - o.z); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  // ---------------------------------------------------------------- quiz
  _quizShow() {
    const s = this.step, q = s.qs[this.qi];
    this._clear();
    this._setBoard(`${s.who || 'PREGUNTA'} · ${this.qi + 1}/${s.qs.length}`, q.q);
    const xs = QX[q.o.length];
    const w = q.o.length === 4 ? 3.1 : 3.5;
    this.pads = q.o.map((txt, k) => {
      const color = q.o.length === 2 ? (k === 0 ? 0x22c55e : 0xff5d73) : QCOL[k];
      const pad = this._pad(xs[k], 2.5, color, 1.45);
      const lab = this._card(q.o.length === 2 ? '' : LETTER[k], txt, color, w, xs[k], 2.2, 2.5);
      return { x: xs[k], z: 2.5, k, txt, pad, lab, color, flash: 0, bad: 0 };
    });
    this.A.refreshObjective();
  }
  async _answer(p) {
    const s = this.step, q = s.qs[this.qi], A = this.A, cur = A.cur;
    if (p.k !== q.a) {
      p.bad = 1;
      A.miss('Neuri-X: ' + (q.no || 'Mmm, esa no es. ¡Lee otra vez la pregunta!'));
      return;
    }
    this.lock = true;
    p.flash = 1;
    A.hit(p.x, 1.6, p.z, p.color);
    for (const o of this.pads) if (o !== p) o.op = 0.25;
    await this._explain(s, q.ok);
    if (!this._alive(cur)) return;
    this.qi++;
    if (this.qi < s.qs.length) { await wait(s.teach ? 200 : 900); if (!this._alive(cur)) return; this._quizShow(); this.lock = false; }
    else this._stepDone();
  }
  // ---------------------------------------------------------------- sort
  _sortBuild(s) {
    this._setBoard(s.who || 'CLASIFICA', s.prompt || '');
    const zp = SORTZ[s.zones.length];
    this.zones = s.zones.map((z, k) => {
      const [x, zz] = zp[k];
      const pad = this._pad(x, zz, z.color, 1.7);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 2.2, 24, 1, true), holoMaterial(z.color, { intensity: 0.35, lines: 8 }));
      beam.position.set(x, 1.2, zz);
      this.dyn.add(beam);
      this.dynHolo.push(beam.material);
      const lab = this._card('', z.label, z.color, 3.4, x, 2.7, zz);
      return { ...z, x, z: zz, pad, lab, flash: 0, bad: 0 };
    });
    const n = s.items.length;
    this.items = shuffle(s.items.slice()).map((it, k) => {
      const [x, z] = ITEM_SLOTS[k];   // left / right of the walkway: nothing stands in front of the zones or the board
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xeef3f6, roughness: 0.4 }));
      st.position.set(x, 0.45, z);
      this.dyn.add(st);
      const holder = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: this.def.color, emissiveIntensity: 0.7, roughness: 0.25 }));
      box.rotation.set(0.4, 0.6, 0);
      holder.add(box);
      const lab = canvasSprite(cardCanvas('', `${it.emoji ? it.emoji + ' ' : ''}${it.label}`, hex(this.def.color)), 2.6);
      lab.position.y = 1.15;
      holder.add(lab);
      holder.position.set(x, 1.9, z);
      this.dyn.add(holder);
      return { ...it, zone: it.z, x, z, home: new THREE.Vector3(x, 1.9, z), obj: holder, box, state: 'home', fly: null, ph: k * 1.7 };
    });
    this.left = n;
  }
  async _drop(zn) {
    const s = this.step, A = this.A, o = A.carry, cur = A.cur;
    A.carry = null;
    if (o.zone === zn.key) {
      o.state = 'flying';
      o.fly = { t: 0, from: o.obj.position.clone(), to: new THREE.Vector3(zn.x, 1.6, zn.z) };
      zn.flash = 1;
      A.hit(zn.x, 1.6, zn.z, zn.color);
      this.left--;
      A.refreshObjective();
      this.lock = true;
      await this._explain(s, o.ok);
      if (!this._alive(cur)) return;
      this.lock = false;
      if (this.left <= 0) this._stepDone();
    } else {
      o.state = 'flying';
      o.fly = { t: 0, from: o.obj.position.clone(), to: o.home.clone(), back: true };
      zn.bad = 1;
      A.miss('Neuri-X: ' + (s.no || 'Mmm, ese no va ahí. ¡Prueba con otra zona!'));
    }
  }
  // ---------------------------------------------------------------- build (tokens up to a goal)
  _buildTarget() {
    const s = this.step;
    this._clear();
    this.sum = 0;
    this.hist = [];
    const xs = s.tok.length === 2 ? [-4.2, 4.2] : [-6, 0, 6];
    this.pads = s.tok.map((tk, k) => {
      const pad = this._pad(xs[k], 1, tk.color, 1.45);
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.56, 0.06), new THREE.MeshStandardMaterial({ color: tk.color, emissive: tk.color, emissiveIntensity: 0.6, roughness: 0.3 }));
      card.position.set(xs[k], 1.3, 1);
      this.dyn.add(card);
      const lab = this._card('', tk.label, tk.color, 2.4, xs[k], 2.4, 1);
      return { x: xs[k], z: 1, tk, pad, lab, card, color: tk.color, flash: 0, bad: 0 };
    });
    const up = this._pad(9.2, 2.6, 0xff5d73, 1.0);   // off the walkway, so it never hides the board
    this.undo = { x: 9.2, z: 2.6, pad: up, flash: 0, bad: 0, color: 0xff5d73 };
    this._card('', '↺ Deshacer', 0xff5d73, 1.8, 9.2, 1.8, 2.6);
    this._buildBoard();
    this.A.refreshObjective();
  }
  _buildBoard() {
    const s = this.step, T = s.targets[this.ti], base = T.base || 0, money = s.money;
    const cnt = s.tok.map((tk) => this.hist.filter((v) => v === tk.v).length);
    const f = (n) => (money ? '$' : '') + n.toLocaleString('es-MX');
    const sub = `${base ? `${base} + ${this.sum} = ${base + this.sum}` : `Llevas: ${f(this.sum)}`} · Meta: ${f(T.goal)}`;
    this._setBoard(`${s.who || 'META'} · ${this.ti + 1}/${s.targets.length}`, T.prompt, (g) => {
      g.font = `900 66px ${FONT}`;
      g.fillStyle = '#ffd23f';
      const line = base ? `${base} + ${this.sum} = ${base + this.sum}` : `Llevas: ${f(this.sum)}`;
      g.fillText(line, 512, 300, 940);
      g.font = `900 40px ${FONT}`;
      g.fillStyle = '#c9ffd9';
      g.fillText(`Meta: ${f(T.goal)}`, 512, 372);
      // chips with how many tokens of each kind
      const W = 240, x0 = 512 - ((s.tok.length - 1) * W) / 2;
      s.tok.forEach((tk, k) => {
        const x = x0 + k * W;
        g.fillStyle = hex(tk.color);
        roundRect(g, x - 105, 412, 210, 64, 26); g.fill();
        g.fillStyle = '#0b1230';
        g.font = `900 36px ${FONT}`;
        g.fillText(`${tk.label} × ${cnt[k]}`, x, 445, 196);
      });
    }, sub);
  }
  async _insert(p) {
    const s = this.step, T = s.targets[this.ti], A = this.A, cur = A.cur;
    this.sum += p.tk.v;
    this.hist.push(p.tk.v);
    p.flash = 1;
    A.ctx.audio.play('pick');
    const m = new THREE.Mesh(p.card.geometry.clone(), p.card.material.clone());
    m.position.copy(p.card.position);
    this.dyn.add(m);
    this.fly.push({ m, t: 0, from: p.card.position.clone(), to: new THREE.Vector3(0, 2.6, BOARD_Z + 0.3) });
    this._buildBoard();
    const total = (T.base || 0) + this.sum;
    if (total === T.goal) {
      this.lock = true;
      A.hit(0, 4.4, -11.8, this.def.color);
      await this._explain(s, T.ok);
      if (!this._alive(cur)) return;
      await wait(s.teach ? 200 : 700);
      if (!this._alive(cur)) return;
      this.ti++;
      if (this.ti < s.targets.length) { this._buildTarget(); this.lock = false; }
      else this._stepDone();
    } else if (total > T.goal) {
      p.bad = 1;
      A.miss('Neuri-X: ¡Te pasaste de la meta! Empecemos de nuevo esta cuenta.');
      this.sum = 0;
      this.hist = [];
      this._buildBoard();
    }
  }
  _undo() {
    if (!this.hist.length) { this.A.ctx.audio.play('bad'); return; }
    this.sum -= this.hist.pop();
    this.undo.flash = 1;
    this.A.ctx.audio.play('blip');
    this._buildBoard();
  }
  // ---------------------------------------------------------------- pick (ordered / set)
  _pickBuild(s) {
    const labels = shuffle(s.pads.slice());
    const n = labels.length, r1 = Math.ceil(n / 2), r2 = n - r1, SP = 4.4;
    this.need = (s.order || s.good).slice();
    this.got = [];
    this.pads = labels.map((txt, k) => {
      const row = k < r1 ? 0 : 1, j = row ? k - r1 : k, cnt = row ? r2 : r1;
      const x = (j - (cnt - 1) / 2) * SP, z = row ? 3.0 : -1.6;
      const color = this.def.color;
      const pad = this._pad(x, z, color, 1.35);
      const lab = this._card('', txt, color, 2.3, x, 2.1, z);
      return { x, z, txt, pad, lab, color, flash: 0, bad: 0, done: false };
    });
    this._pickBoard();
  }
  _pickBoard() {
    const s = this.step;
    const sub = s.order ? 'Tu orden: ' + this.need.map((v, k) => (k < this.got.length ? v : '?')).join(' < ') : `Encontrados: ${this.got.length} / ${this.need.length}${this.got.length ? ' · ' + this.got.join(' · ') : ''}`;
    this._setBoard(s.who || 'ACTIVA', s.prompt, (g) => {
      g.font = `900 34px ${FONT}`;
      g.fillStyle = '#c9ffd9';
      g.fillText(s.order ? 'Tu orden:' : `Encontrados: ${this.got.length} / ${this.need.length}`, 512, 300);
      if (s.order) {
        g.font = `900 58px ${FONT}`;
        g.fillStyle = '#ffd23f';
        const chain = this.need.map((v, k) => (k < this.got.length ? v : '?')).join('  <  ');
        g.fillText(chain, 512, 390, 960);
      } else {
        g.font = `900 58px ${FONT}`;
        g.fillStyle = '#ffd23f';
        g.fillText(this.got.length ? this.got.join('  ·  ') : '…', 512, 390, 960);
      }
    }, sub);
  }
  async _pick(p) {
    const s = this.step, A = this.A, cur = A.cur;
    const ok = s.order ? p.txt === s.order[this.got.length] : s.good.includes(p.txt);
    if (!ok) {
      p.bad = 1;
      A.miss('Neuri-X: ' + (s.no || 'Ese no es. ¡Piensa otra vez!'));
      return;
    }
    p.done = true;
    p.flash = 1;
    p.pad.userData.ring.material.color.set(0x22c55e);
    p.pad.userData.ring.material.emissive.set(0x22c55e);
    p.op = 0.35;
    this.got.push(p.txt);
    A.hit(p.x, 1.6, p.z, 0x22c55e);
    this._pickBoard();
    A.refreshObjective();
    if (this.got.length >= this.need.length) {
      this.lock = true;
      await this._explain(s, s.ok);
      if (!this._alive(cur)) return;
      this._stepDone();
    }
  }
  // ---------------------------------------------------------------- level hooks
  objective() {
    const s = this.step;
    if (!s) return '';
    if (s.t === 'quiz') return `Pregunta ${this.qi + 1}/${s.qs.length} · Párate en la respuesta correcta`;
    if (s.t === 'sort') return `Clasifica (${s.items.length - this.left}/${s.items.length}) · Lleva cada objeto a su zona`;
    if (s.t === 'build') return `Llega justo a la meta (${this.ti + 1}/${s.targets.length}) · Inserta fichas en las plataformas`;
    return `${s.order ? 'Activa en orden' : 'Activa los correctos'} (${this.got.length}/${this.need.length})`;
  }
  hintFor() {
    const s = this.step;
    if (!s) return 'Escucha a Neuri-X: te dirá qué hacer en cada fase.';
    if (s.hint) return s.hint;
    if (s.t === 'quiz') return 'Lee la pregunta de la pizarra, párate en la plataforma con la respuesta correcta y presiona interactuar.';
    if (s.t === 'sort') return 'Toma un objeto y llévalo a la zona correcta.';
    if (s.t === 'build') return 'Inserta fichas en las plataformas hasta llegar justo a la meta. Si te equivocas, usa Deshacer.';
    return 'Párate en una plataforma y presiona interactuar para activarla.';
  }
  interactions(p) {
    const s = this.step;
    if (!s || this.lock) return [];
    if (s.t === 'quiz') {
      const pd = this._nearest(this.pads, p, 2.1);
      return pd ? [{ label: `Responder: ${pd.txt}`, act: () => this._answer(pd) }] : [];
    }
    if (s.t === 'sort') {
      if (!this.A.carry) {
        const it = this._nearest(this.items.filter((o) => o.state === 'home'), p, 2.4);
        return it ? [{ label: `Tomar: ${it.label}`, act: () => { it.state = 'carried'; this.A.carry = it; this.A.ctx.audio.play('pick'); } }] : [];
      }
      const zn = this._nearest(this.zones, p, 2.8);
      return zn ? [{ label: `Colocar en ${zn.label}`, act: () => this._drop(zn) }] : [];
    }
    if (s.t === 'build') {
      const pd = this._nearest(this.pads.concat(this.undo ? [this.undo] : []), p, 2.1);
      if (!pd) return [];
      if (pd === this.undo) return [{ label: 'Deshacer la última ficha', act: () => this._undo() }];
      return [{ label: `Insertar ${pd.tk.name}`, act: () => this._insert(pd) }];
    }
    const pd = this._nearest(this.pads.filter((o) => !o.done), p, 2.0);
    return pd ? [{ label: `Activar: ${pd.txt}`, act: () => this._pick(pd) }] : [];
  }
  update(dt, t, player) {
    const p = this.L(player.pos);
    const o = this.A.carry;
    if (o && this.items.includes(o)) o.obj.position.lerp(_v.set(p.x, p.y + 2.5 + Math.sin(t * 4) * 0.08, p.z), 1 - Math.exp(-14 * dt));
    // the card of the pad you stand on fades out, so it never covers the board (above all in VR)
    for (const q of this.pads) if (q.lab) q.lab.material.opacity = (q.op ?? 1) * (Math.hypot(p.x - q.x, p.z - q.z) < 2.6 ? 0.15 : 1);
    this.idle(dt, t);
  }
  idle(dt, t) {
    for (const m of this.dynHolo) m.uniforms.time.value = t;
    for (const it of this.items) {
      it.box.rotation.y = t * 0.8 + it.ph;
      if (it.state === 'home') it.obj.position.y = it.home.y + Math.sin(t * 2 + it.ph) * 0.12;
      if (it.state === 'flying') {
        it.fly.t += dt * 2.2;
        const k = Math.min(1, it.fly.t);
        it.obj.position.lerpVectors(it.fly.from, it.fly.to, k);
        it.obj.position.y += Math.sin(k * Math.PI) * 1.2;
        if (k >= 1) it.state = it.fly.back ? 'home' : 'placed';
      }
      if (it.state === 'placed') {
        const sc = damp(it.obj.scale.x, 0, 4, dt);
        it.obj.scale.setScalar(sc);
        if (sc < 0.05) { it.obj.visible = false; it.state = 'off'; }
      }
    }
    const pulse = (q, base) => {
      q.flash = Math.max(0, q.flash - dt * 1.4);
      q.bad = Math.max(0, q.bad - dt * 1.6);
      const r = q.pad.userData.ring.material;
      r.emissiveIntensity = base + q.flash * 3 + Math.sin(t * 5) * 0.25;
      if (q.bad > 0) r.emissive.set(0xff3040); else if (!q.done) r.emissive.set(q.color);
    };
    for (const q of this.pads) pulse(q, 1.5);
    for (const z of this.zones) pulse(z, 1.6 + (this.A.carry ? Math.sin(t * 6) * 0.6 : 0));
    if (this.undo) pulse(this.undo, 1.2);
    for (const q of this.pads) if (q.card) q.card.rotation.y = t * 1.5;
    for (let i = this.fly.length - 1; i >= 0; i--) {
      const f = this.fly[i];
      f.t += dt * 1.8;
      const k = Math.min(1, f.t);
      f.m.position.lerpVectors(f.from, f.to, k);
      f.m.position.y += Math.sin(k * Math.PI) * 2;
      f.m.rotation.y += dt * 8;
      if (k >= 1) { this.dyn.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); this.fly.splice(i, 1); }
    }
  }
  mapItems() {
    return this.pads.map((q) => ({ x: q.x, z: q.z, r: 1.3, color: hex(q.done ? 0x22c55e : q.color) }))
      .concat(this.zones.map((z) => ({ x: z.x, z: z.z, r: 1.6, color: hex(z.color) })))
      .concat(this.items.filter((o) => o.state === 'home').map((o) => ({ x: o.x, z: o.z, r: 0.7, color: '#7fdcff' })))
      .concat(this.undo ? [{ x: this.undo.x, z: this.undo.z, r: 1, color: '#ff5d73' }] : []);
  }
}

export class Arcade {
  constructor(scene, colliders) {
    this.scene = scene;
    this.col = colliders;
    this.inside = false;
    this.where = 'hub';
    this.busy = false;
    this.modal = null;
    this.state = 'idle';
    this.cur = null;
    this.carry = null;
    this.phase = 0;
    this.holo = [];
    this.anim = [];
    this.glowTex = softSpriteTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
    this.root = new THREE.Group();
    this.root.position.set(ARENA.x, ARENA.y, ARENA.z);
    this.root.visible = false;
    scene.add(this.root);
    this.hub = new THREE.Group();
    this.root.add(this.hub);
    this.set = 'neuro';
    this._buildHub();
    this.sets = {};
    for (const k in SETS) this.sets[k] = this._buildSet(SETS[k]);
    this.levels = {
      s1: new LvBrain(this, LEVELS[0]),
      s2: new LvHighway(this, LEVELS[1]),
      s3: new LvReflex(this, LEVELS[2]),
      s4: new LvChem(this, LEVELS[3]),
    };
    for (const d of MATH.levels) this.levels[d.key] = new LvContent(this, d);
    this._buildSparks();
    this._buildDom();
    this.portals = [{ portal: this.hubExit, kind: 'exitArcade', where: 'hub' }];
    for (const sk in this.sets) {
      const st = this.sets[sk];
      for (const g of st.gates) this.portals.push({ portal: g.portal, kind: 'gate', key: g.key, where: 'hub', set: sk });
      this.portals.push({ portal: st.entrance, kind: 'enterArcade', key: sk, where: 'world' });
    }
    for (const k in this.levels) this.portals.push({ portal: this.levels[k].exitPortal, kind: 'toHub', where: 'room:' + k });
    this.door = ARCADE_DOOR;
    this.mathDoor = STEAM_DOOR;
  }

  get cfg() { return SETS[this.set]; }
  cfgOf(k) { return SETS[k] || SETS.neuro; }
  get gates() { return this.sets[this.set].gates; }
  get board() { return this.sets[this.set].board; }
  setOf(k) { return SET_OF[k] || 'neuro'; }
  returnSpot() { return { ...this.cfg.ret }; }
  // ------------------------------------------------------------ build
  _hubCircle(x, z, r, y0, y1) { this.col.addCircle(ARENA.x + x, ARENA.z + z, r, ARENA.y + y0, ARENA.y + y1, 'arcade'); }
  _buildHub() {
    const H = this.hub, R = HUB_R;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.6, 4, 72), FLOOR_MAT());
    floor.position.y = -2;
    H.add(floor);
    H.add(floorDisk(R, '#35e0ff'));
    this._hubCircle(0, 0, R, -4, 0);
    const RR = R + 1.3, n = Math.ceil((Math.PI * 2 * RR) / 2);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; this._hubCircle(Math.cos(a) * RR, Math.sin(a) * RR, 1.5, -2, 14); }
    const cols = [0xffb020, 0x35e0ff, 0xff5d73, 0xb57bff, 0x22c55e];
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.2, 8, 140), goldMat());
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.04;
    H.add(rim);
    // arcade pillars with neon caps around the edge (south half, so gates stay clear)
    [0.35, 0.75, 1.15, 1.99, 2.39, 2.79].forEach((a, k) => {
      const x = Math.cos(a) * (R - 1.2), z = Math.sin(a) * (R - 1.2);
      if (k === 1 || k === 4) {
        const pl = planter(Math.random);
        pl.position.set(x, 0, z);
        H.add(pl);
        this._hubCircle(x, z, 0.9, -1, 1.2);
        return;
      }
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5, 16), pearlMat());
      p.position.set(x, 2.5, z);
      H.add(p);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 16), lightMat(cols[k % 5], 1.6));
      band.position.set(x, 4.7, z);
      H.add(band);
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), goldMat());
      cap.position.set(x, 5.6, z);
      cap.userData.dynamic = true;
      H.add(cap);
      this.anim.push((t) => { cap.rotation.y = t * 1.3 + k; cap.position.y = 5.6 + Math.sin(t * 2 + k) * 0.2; });
      this._hubCircle(x, z, 0.55, -1, 5);
    });
    SLOGANS.forEach((ln, i) => {
      const a = [Math.PI * 0.5 + 0.6, Math.PI * 0.5 - 0.6, Math.PI * 0.5][i];
      if (i === 2) return;
      const sp = sloganPanel(ln, ['#35e0ff', '#ffb020'][i], 6, 4);
      sp.position.set(Math.cos(a) * (R + 2.6), 4.8, Math.sin(a) * (R + 2.6));
      sp.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      H.add(sp);
    });
    // exit portal (south)
    const ex = ringPortal(0xffb020, 2.3);
    ex.position.set(0, ex.userData.lift, EXIT_Z);
    H.add(ex);
    this.hubExitMat = ex.userData.mat;
    for (const s of [-1, 1]) this._hubCircle(s * ex.userData.half, EXIT_Z, 0.4, -1, 5);
    this.hubExit = new Portal({ x: ARENA.x, z: ARENA.z + EXIT_Z, nx: 0, nz: 1, halfW: ex.userData.half - 0.3, y0: ARENA.y - 1, y1: ARENA.y + 3, twoSided: true });
    // mode platform (Explorador / Desafío), left of the spawn
    this.modePad = { x: -4.8, z: 11.5 };
    const mp = ringPad(0x8b5cf6, 1.35);
    mp.position.set(this.modePad.x, 0, this.modePad.z);
    H.add(mp);
    this.modeLab = labelSprite(['MODO EXPLORADOR', 'sin reloj'], '#22c55e', 3.0);
    this.modeLab.position.set(this.modePad.x, 2.5, this.modePad.z);
    H.add(this.modeLab);
    // sunny sky with floating islands around the whole interior
    this.root.add(skyDome());
    this.islands = floatingIslands(21);
    this.root.add(this.islands);
    // floating particles
    const np = 140, pp = new Float32Array(np * 3);
    for (let i = 0; i < np; i++) { const r = Math.sqrt(Math.random()) * 60, a = Math.random() * Math.PI * 2; pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = -6 + Math.random() * 30; pp[i * 3 + 2] = Math.sin(a) * r; }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ map: this.glowTex, color: 0xffe3a0, size: 0.28, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.root.add(this.dust);
  }
  // gates, capsules, board and titles of one level set (only the active set is visible)
  _buildSet(cfg) {
    const D = new THREE.Group(), R = HUB_R;
    D.visible = cfg.key === this.set;
    this.hub.add(D);
    const board = canvasSprite(this._boardCanvas(0, 0, 0), 8);
    board.position.set(0, 11.8, -(R + 4));
    D.add(board);
    const defs = cfg.levels.map((l) => ({ ...l })).concat(cfg.final ? [{ ...cfg.final }] : []);
    const angs = [-68, -34, 34, 68, 0].map((d) => (d * Math.PI) / 180);   // levels 1-4 left→right, final gate in the middle
    const gates = defs.map((d, i) => {
      const a = angs[i], GR = GATE_R;
      const x = Math.sin(a) * GR, z = -Math.cos(a) * GR;
      const th = Math.atan2(-x, -z);
      const ring = ringPortal(d.color, 2.3);
      ring.position.set(x, ring.userData.lift, z);
      ring.rotation.y = th;
      D.add(ring);
      const nx = Math.sin(th), nz = Math.cos(th);
      for (const s of [-1, 1]) this._hubCircle(x + nz * s * ring.userData.half, z - nx * s * ring.userData.half, 0.4, -1, 5);
      const portal = new Portal({ x: ARENA.x + x, z: ARENA.z + z, nx, nz, halfW: ring.userData.half - 0.3, y0: ARENA.y - 1, y1: ARENA.y + 3, twoSided: true });
      const head = d.tag || (d.key === 'final' ? 'NIVEL FINAL' : `NIVEL ${d.n}`);
      const sign = labelSprite([head, d.name], hex(d.color), 3.4, d.emoji);
      sign.position.set(x, 6.3, z);
      D.add(sign);
      const stars = canvasSprite(starsCanvas(0, '', hex(d.color)), 2.6);
      stars.position.set(x, 4.85, z);
      D.add(stars);
      const lock = labelSprite([d.soon ? 'PRÓXIMAMENTE' : 'BLOQUEADO'], '#9aa6c8', 2.2, '🔒');
      lock.position.set(x, 2.0, z);
      D.add(lock);
      const floorRing = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 6, 64), glowMat(d.color, 1.4));
      floorRing.rotation.x = Math.PI / 2; floorRing.position.set(x + nx * 1.5, 0.05, z + nz * 1.5);
      D.add(floorRing);
      // glass capsule with the level hologram, standing behind the gate
      const cap = glassCapsule(1.0, 2.6, d.color);
      const cx = x - nx * 2.6, cz = z - nz * 2.6;
      cap.position.set(cx, 0, cz);
      D.add(cap);
      this._hubCircle(cx, cz, 1.3, -1, 4);
      const ho = d.glyph ? glyphHolo(d.glyph, d.color) : capsuleHolo(d.key, this.holo);
      ho.position.set(cx, cap.userData.center, cz);
      D.add(ho);
      if (d.glyph) this.anim.push((t) => { ho.position.y = cap.userData.center + Math.sin(t * 1.5 + i) * 0.1; });
      else this.anim.push((t) => { ho.rotation.y = t * 0.6 + i; ho.position.y = cap.userData.center + Math.sin(t * 1.5 + i) * 0.08; });
      return { ...d, x, z, ring, portal, sign, stars, lock, floorRing, mat: ring.userData.mat };
    });
    const exLab = labelSprite(cfg.exit, '#ffb020', 2.8);
    exLab.position.set(0, 5.6, EXIT_Z);
    D.add(exLab);
    const title = makeSign(cfg.title, 12, 3, { border: hex(cfg.doorColor), sub: '#e9ddff' });
    title.position.set(0, 16.6, -(R + 4.5));
    D.add(title);
    const ent = this._buildEntrance(cfg);
    return { key: cfg.key, decor: D, board, gates, door: cfg.door, ...ent };
  }
  _boardCanvas(stars, total, pts) {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 300;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,14,44,0.86)';
    roundRect(g, 8, 8, 624, 284, 44); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#22c55e'; g.shadowColor = '#22c55e'; g.shadowBlur = 16; g.stroke(); g.shadowBlur = 0;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#c9ffd9'; g.font = '900 38px Nunito, system-ui, sans-serif';
    g.fillText('TUS ESTRELLAS', 320, 58);
    g.fillStyle = '#ffd23f'; g.font = '900 104px Nunito, system-ui, sans-serif';
    g.shadowColor = '#ffb020'; g.shadowBlur = 20;
    g.fillText(`★ ${stars}/${total}`, 320, 150);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff'; g.font = '900 36px Nunito, system-ui, sans-serif';
    g.fillText(`Récords: ${fmt(pts)} puntos`, 320, 240);
    return c;
  }
  _buildSparks() {
    this.sparks = [];
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      this.root.add(s);
      this.sparks.push({ s, v: new THREE.Vector3(), life: 0 });
    }
  }
  fx(local, color, n = 24, speed = 6) {
    let c = 0;
    for (const sp of this.sparks) {
      if (sp.life > 0) continue;
      sp.life = 1 + Math.random() * 0.4;
      sp.s.visible = true;
      sp.s.material.color.set(color);
      sp.s.position.copy(local);
      sp.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      if (++c >= n) break;
    }
  }
  _buildEntrance(cfg) {
    const E = cfg.door, col = cfg.doorColor, rot = E.rot;
    const g = ringPortal(col, 3.4);
    g.position.set(E.x, E.y + g.userData.lift, E.z);
    g.rotation.y = rot;
    this.scene.add(g);
    const nx = Math.sin(rot), nz = Math.cos(rot);
    for (const s of [-1, 1]) this.col.addCircle(E.x + nz * s * g.userData.half, E.z - nx * s * g.userData.half, 0.45, E.y - 1, E.y + 6, 'arcdoor');
    const floorRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.12, 6, 64), glowMat(col, 1.8));
    floorRing.rotation.x = Math.PI / 2;
    floorRing.position.set(E.x, E.y + 0.06, E.z);
    this.scene.add(floorRing);
    const trophy = new THREE.Group();
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0), new THREE.MeshStandardMaterial({ color: cfg.key === 'math' ? 0xc7b8f5 : 0xffd36b, emissive: cfg.key === 'math' ? 0x8b5cf6 : 0xffa000, emissiveIntensity: 1.4, roughness: 0.2, flatShading: true }));
    trophy.add(st);
    const oc = cfg.key === 'math' ? [0x8b5cf6, 0xff8a3d, 0x35e0ff] : [0x22c55e, 0x35e0ff, 0xffb020];
    for (let i = 0; i < 3; i++) {
      const o = new THREE.Mesh(new THREE.TorusGeometry(2 + i * 0.5, 0.06, 6, 48), glowMat(oc[i], 1.8));
      o.rotation.x = Math.PI / 2 + i * 0.5;
      trophy.add(o);
    }
    if (cfg.key === 'math') {
      ['+', '−', '×', '÷'].forEach((ch, i) => {
        const sp = glyphHolo(ch, [0xff8a3d, 0x35e0ff, 0x22c55e, 0xffd23f][i]);
        sp.scale.setScalar(1.3);
        const a = (i / 4) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 2.7, 0.3, Math.sin(a) * 2.7);
        trophy.add(sp);
      });
    }
    trophy.position.set(E.x, E.y + 8.2, E.z);
    this.scene.add(trophy);
    const sign = makeSign(cfg.sign, 6.6, 1.65, { border: hex(col), sub: '#e9ddff' });
    sign.position.set(E.x, E.y + 11.2, E.z);
    sign.rotation.y = rot;
    this.scene.add(sign);
    const entrance = new Portal({ x: E.x, z: E.z, nx, nz, halfW: g.userData.half - 0.35, y0: E.y - 1, y1: E.y + 3, twoSided: true });
    return { doorMat: g.userData.mat, trophy, entrance };
  }
  _buildDom() {
    const hud = $('hud');
    const el = document.createElement('div');
    el.id = 'arc-hud';
    el.className = 'hidden';
    el.innerHTML = `<div class="arc-l"><b id="arc-name"></b><span id="arc-phase"></span></div>
      <div class="arc-dots" id="arc-dots"><i></i><i></i><i></i></div>
      <div class="arc-s"><small>PUNTOS</small><b id="arc-pts">0</b></div>
      <div class="arc-c hidden" id="arc-combo"></div>`;
    hud.appendChild(el);
    const pops = document.createElement('div');
    pops.id = 'arc-pops';
    hud.appendChild(pops);
    const res = document.createElement('div');
    res.id = 'arc-results';
    res.className = 'hidden';
    res.innerHTML = `<div class="arc-res">
      <div class="res-medal"><div class="medal"><span id="arcr-emoji">🧠</span></div><div class="arc-stars" id="arcr-stars"><span>★</span><span>★</span><span>★</span></div></div>
      <div class="res-banner"><h2 id="arcr-title">¡NIVEL COMPLETADO!</h2><div id="arcr-tag"></div></div>
      <div class="res-msg" id="arcr-msg"></div>
      <div class="res-cols">
        <div class="glass res-card"><div class="res-h">RECOMPENSAS OBTENIDAS</div><div class="res-rewards" id="arcr-rewards"></div></div>
        <div class="glass res-card"><div class="res-h">OBJETIVOS COMPLETADOS <span class="ok">✓ 3/3</span></div><ul class="res-obj" id="arcr-obj"></ul><div class="res-stats" id="arcr-stats"></div></div>
      </div>
      <div class="glass res-prog"><div class="pf-face"><canvas id="arcr-face" width="160" height="160"></canvas></div>
        <div class="rp-main"><small id="arcr-prog">TU PROGRESO EN NEUROAVENTURA</small><b id="arcr-lvl">Nivel 1</b><div class="pf-bar"><i id="arcr-bar"></i></div><span id="arcr-xp"></span></div>
        <div class="res-count"><small>Niveles completados</small><b id="arcr-count">0 / 4</b></div></div>
      <div class="arc-btns" id="arcr-btns"></div>
      <div class="small arc-keys">Elige con <kbd>↑</kbd><kbd>↓</kbd> y confirma con <kbd>E</kbd> · o pulsa <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></div>
    </div>`;
    $('app').appendChild(res);
    const q = document.createElement('div');
    q.id = 'arc-q';
    q.className = 'hidden';
    q.innerHTML = '<small id="arcq-h"></small><b id="arcq-t"></b><span id="arcq-s"></span>';
    hud.appendChild(q);
    this.pts = 0;
    this.shownPts = 0;
  }

  // ------------------------------------------------------------ state
  init(ctx) {
    this.ctx = ctx;
    const S = ctx.save.data;
    S.arcade = S.arcade || {};
    S.arcade_math = S.arcade_math || {};
    this.saves = { neuro: S.arcade, math: S.arcade_math };
    // migrate stations finished in the old version of the district
    S.stations = S.stations || {};
    S.parts = S.parts || {};
    for (const L of LEVELS) {
      if (S.stations[L.key] && !this.S[L.key]) this.S[L.key] = { done: true, stars: 1, best: 0, plays: 1 };
      if (this.S[L.key] && this.S[L.key].done) { S.stations[L.key] = true; S.parts[L.part] = true; }
    }
    if (S.stage === 'stations' && LEVELS.every((L) => S.parts[L.part])) S.stage = 'final';
    this.refreshHub();
  }
  get S() { return this.saves ? this.saves[this.set] : null; }
  rec(k) { const sv = this.saves && this.saves[this.setOf(k)]; return (sv && sv[k]) || { done: false, stars: 0, best: 0, plays: 0 }; }
  get calm() { const sv = this.saves && this.saves.neuro; return !sv || sv.mode !== 'challenge'; }
  toggleMode() {
    const c = this.ctx;
    this.saves.neuro.mode = this.calm ? 'challenge' : 'calm';
    c.persist();
    c.audio.play('switch');
    this.refreshHub();
    this.hubObjective();
    c.ui.toast(this.calm ? 'Neuri-X: ¡Modo Explorador! Sin reloj: tómate tu tiempo para aprender.' : 'Neuri-X: ¡Modo Desafío! Ahora hay reloj, pero con tiempo suficiente. ¡Tú puedes!', '', this.calm ? '🌱' : '⏱️', false, 4);
  }
  unlocked(k) {
    const cfg = SETS[this.setOf(k)];
    if (cfg.final && cfg.final.key === k && cfg.final.soon) return false;
    if (k === 'final') { const st = this.ctx.save.data.stage; return st === 'final' || st === 'done'; }
    if (!cfg.seq) return true;
    const i = cfg.levels.findIndex((l) => l.key === k);
    return i === 0 || this.rec(cfg.levels[i - 1].key).done;
  }
  meta(k) { return SETS[this.setOf(k)].levels.find((l) => l.key === k); }
  totals(sk = this.set) {
    const list = sk === 'all' ? Object.values(SETS).flatMap((c) => c.levels) : SETS[sk].levels;
    let stars = 0, pts = 0, done = 0;
    for (const L of list) { const r = this.rec(L.key); stars += r.stars || 0; pts += r.best || 0; if (r.done) done++; }
    return { stars, pts, done, max: list.length * 3 };
  }
  refreshHub() {
    for (const g of this.gates) {
      const open = this.unlocked(g.key);
      g.mat.userData.base = open ? 1 : 0.28;
      g.ring.userData.glowMat.color.set(open ? g.color : 0x5a6386);
      g.lock.visible = !open;
      g.floorRing.visible = open;
      if (g.soon) {
        setSpriteCanvas(g.stars, starsCanvas(0, g.sub, hex(g.color)));
      } else if (g.key === 'final') {
        const st = this.ctx ? this.ctx.save.data.stage : '';
        setSpriteCanvas(g.stars, starsCanvas(0, st === 'done' ? '¡COMPLETADO!' : open ? '¡ABIERTO!' : 'Gana las 4 piezas', hex(g.color)));
      } else {
        const r = this.rec(g.key);
        setSpriteCanvas(g.stars, starsCanvas(r.stars || 0, r.best ? `Récord ${fmt(r.best)}` : open ? '¡Juega!' : '', hex(g.color)));
      }
    }
    const T = this.totals();
    setSpriteCanvas(this.board, this._boardCanvas(T.stars, T.max, T.pts));
    if (this.modeLab && this.S) relabel(this.modeLab, this.calm ? ['MODO EXPLORADOR', 'sin reloj'] : ['MODO DESAFÍO', 'con reloj'], this.calm ? '#22c55e' : '#ffb020', 3.0);
  }
  hubSpawn() { return { x: ARENA.x + HUB_SPAWN.x, y: ARENA.y + 0.2, z: ARENA.z + HUB_SPAWN.z, yaw: HUB_SPAWN.yaw }; }
  enter(sk = 'neuro') {
    const c = this.ctx;
    this.set = SETS[sk] ? sk : 'neuro';
    for (const k in this.sets) this.sets[k].decor.visible = k === this.set;
    this.inside = true;
    this.where = 'hub';
    this.root.visible = true;
    this.hub.visible = true;
    for (const k in this.levels) this.levels[k].g.visible = false;
    this._hidden = c.worldObjs().filter((o) => o.visible);
    for (const o of this._hidden) o.visible = false;
    const s = this.scene, L = c.lights;
    this._env = { bg: s.background, fogC: s.fog.color.getHex(), hc: L.hemi.color.getHex(), hg: L.hemi.groundColor.getHex(), hi: L.hemi.intensity, sc: L.sun.color.getHex(), si: L.sun.intensity };
    s.background = new THREE.Color(SKY.mid);
    s.fog.color.set(SKY.fog);
    s.fog.density = 0.0042;
    L.hemi.color.set(0xffffff); L.hemi.groundColor.set(0xd6e4ff); L.hemi.intensity = 1.35;
    L.sun.color.set(0xfff0d8); L.sun.intensity = 2.3;
    c.player.indoor = true;
    c.player.killY = ARENA.y - 14;
    c.cam.pitch = 0.14;
    c.neurix.inRoom = true;   // Neuri-X floats further aside so he never covers the challenge
    c.audio.setIndoor && c.audio.setIndoor(true);
    this.refreshHub();
    this.hubObjective();
  }
  exit() {
    if (!this.inside) return;
    const c = this.ctx;
    this._abort();
    this.inside = false;
    this.root.visible = false;
    for (const o of this._hidden || []) o.visible = true;
    const s = this.scene, L = c.lights, e = this._env;
    s.background = e.bg;
    s.fog.color.setHex(e.fogC);
    s.fog.density = c.fogDensity();
    L.hemi.color.setHex(e.hc); L.hemi.groundColor.setHex(e.hg); L.hemi.intensity = e.hi;
    L.sun.color.setHex(e.sc); L.sun.intensity = e.si;
    c.player.indoor = false;
    c.player.killY = -12;
    c.cam.pitch = 0.32;
    c.neurix.inRoom = false;
    c.audio.setIndoor && c.audio.setIndoor(false);
  }
  async onEnteredHub() {
    this.hubObjective();
    if (this.S.intro) return;
    this.S.intro = true;
    this.ctx.persist();
    await this.say(this.set === 'math' ? MATH.hub : TEXT.hub);
  }
  hubObjective() {
    const ui = this.ctx.ui, st = this.ctx.save.data.stage;
    const cfg = this.cfg;
    const next = cfg.levels.find((l) => !this.rec(l.key).done);
    const T = this.totals();
    const mode = this.calm ? 'Modo Explorador' : 'Modo Desafío';
    if (next) ui.setObjective(`${cfg.hall} · ${lvTag(next)}`, `Cruza el portal de «${next.name}» · Estrellas ${T.stars}/${T.max} · ${mode}`, null);
    else if (cfg.key === 'neuro' && st === 'final') ui.setObjective('¡Nivel final abierto!', 'Cruza el portal dorado para reconstruir la neurona', null);
    else ui.setObjective(cfg.hall, `Mejora tus récords · Estrellas ${T.stars}/${T.max} · ${mode}`, null);
  }
  objective() { if (this.cur) this.refreshObjective(); else this.hubObjective(); }
  steps() {
    if (this.cur) return PHASE_NAMES.map((n, i) => ({ text: `Fase ${i + 1}: ${n.charAt(0) + n.slice(1).toLowerCase()}`, done: i < this.phase || this.state === 'results', cur: i === this.phase && this.state !== 'results' }));
    const list = this.cfg.levels.map((l) => ({ text: `${lvTag(l)}: ${l.name}`, done: this.rec(l.key).done }));
    if (this.set === 'neuro') list.push({ text: 'Nivel final: reconstruye la neurona', done: this.ctx.save.data.stage === 'done' });
    const cur = list.find((x) => !x.done && (x.text.startsWith('Nivel final') ? this.unlocked('final') : true));
    if (cur) cur.cur = true;
    return list;
  }
  hintText() {
    if (!this.cur) return this.set === 'math' ? MATH.hubHint : 'Cruza el portal del nivel que quieras. Los niveles se abren uno por uno.';
    if (this.cur.lv.hintFor) return this.cur.lv.hintFor();
    return HINTS[this.cur.lv.key][Math.min(this.phase, HINTS[this.cur.lv.key].length - 1)];
  }
  // crossing a gate in the hub
  gate(k) {
    const c = this.ctx;
    if (!this.unlocked(k)) {
      if ((this._lockT || 0) + 4 < performance.now() / 1000) {
        this._lockT = performance.now() / 1000;
        c.audio.play('bad');
        const fin = this.cfg.final;
        c.ui.toast(fin && fin.key === k && fin.soon ? `${fin.tag}: ¡este nivel llegará muy pronto!` : k === 'final' ? 'Gana las 4 piezas de la neurona para abrir el Nivel final' : 'Supera el nivel anterior para abrir este portal', '', '🔒', false, 3);
      }
      return;
    }
    c.portal(k === 'final' ? 'finalBoss' : 'level', k);
  }

  // ------------------------------------------------------------ level flow
  startLevel(k) {
    this._abort();
    const lv = this.levels[k];
    this.ctx.cam.pitch = 0.14;
    lv.applyMode(this.calm);
    PHASE_NAMES[2] = this.calm ? 'RETO FINAL' : 'RETO VELOZ';
    this.hub.visible = false;
    for (const key in this.levels) this.levels[key].g.visible = key === k;
    this.where = 'room:' + k;
    this.cur = { lv, token: Symbol(k), score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, t0: performance.now(), replay: this.rec(k).done };
    this.score = 0;
    this.phase = 0;
    this.state = 'intro';
    lv.reset();
    this._hudShow(true);
    this._hud();
    return lv.spawnWorld();
  }
  beginLevel() { if (this.cur) this.beginPhase(0, false); }
  toHub() {
    const from = this.cur ? this.cur.lv.key : null;
    this._abort();
    this.where = 'hub';
    this.ctx.cam.pitch = 0.14;
    this.hub.visible = true;
    for (const k in this.levels) this.levels[k].g.visible = false;
    this.refreshHub();
    const g = from && this.gates.find((x) => x.key === from);
    if (g) {
      const d = Math.hypot(g.x, g.z), ux = -g.x / d, uz = -g.z / d;
      return { x: ARENA.x + g.x + ux * 4, y: ARENA.y + 0.2, z: ARENA.z + g.z + uz * 4, yaw: Math.atan2(ux, uz) };
    }
    return this.hubSpawn();
  }
  _abort() {
    if (this.ctx && this.ctx.ui.dialogOpen && (this.cur || this.busy)) this.ctx.ui._close();
    if (this.cur) this.cur.lv.cleanup();
    this.cur = null;
    this.carry = null;
    this.state = 'idle';
    this._closeResults();
    this._hudShow(false);
    this.qHide();
    if (this.ctx) this.ctx.ui.setTimer(null);
  }
  async say(lines) {
    const c = this.ctx;
    this.busy = true;
    c.mission.busy = true;
    await c.mission.say(lines);
    c.mission.busy = false;
    this.busy = false;
  }
  async beginPhase(i, retry) {
    const cur = this.cur;
    if (!cur) return;
    const c = this.ctx, lv = cur.lv, ph = lv.phases[i];
    this.phase = i;
    this.state = 'intro';
    this.phaseStart = cur.score;
    this.phaseMiss = 0;
    this.timeLeft = (ph.time || 0) + (ph.time ? this.bonusT() : 0);
    c.ui.setTimer(null);
    lv.setup(i);
    this._hud();
    c.ui.centerMsg(retry ? '¡OTRA VEZ!' : `FASE ${i + 1}`, PHASE_NAMES[i], 1.8);
    c.audio.play('switch');
    this.busy = true;
    await wait(1400);
    if (this.cur !== cur) return;
    if (!retry) {
      const lines = cur.replay && i === 0 ? ph.intro.slice(-1) : ph.intro;
      await this.say(lines);
      if (this.cur !== cur) return;
    }
    if (ph.time || ph.countdown) {
      c.player.frozen = true;
      c.mission.busy = true;
      this.busy = true;
      for (const s of ['3', '2', '1']) { c.ui.centerMsg(s, '', 0.75); c.audio.play('tick'); await wait(650); if (this.cur !== cur) { c.mission.busy = false; return; } }
      c.ui.centerMsg('¡YA!', '', 0.8);
      c.audio.play('switch');
      c.mission.busy = false;
    }
    this.busy = false;
    this.state = 'play';
    lv.start(i);
    this.refreshObjective();
  }
  bonusT() { return this.ctx.gear ? this.ctx.gear.timeBonus() : 0; }
  refreshObjective() {
    if (!this.cur) return;
    const lv = this.cur.lv;
    this.ctx.ui.setObjective(`${lvTag(lv.def)} · Fase ${this.phase + 1}: ${PHASE_NAMES[this.phase].toLowerCase()}`, lv.objective(), null);
  }
  hit(x, y, z, color, mult = 1) {
    const cur = this.cur;
    if (!cur) return;
    const m = 1 + 0.5 * Math.min(cur.combo, 4);
    const pts = Math.round(100 * m * mult);
    cur.combo++;
    cur.maxCombo = Math.max(cur.maxCombo, cur.combo);
    cur.hits++;
    cur.score += pts;
    this.ctx.audio.play('good');
    cur.lv.fx(x, y, z, color, 18, 4.5);
    this._pop(`+${pts}`, m > 1 ? `x${m}` : '');
    this._hud();
  }
  bonus(n, label) {
    if (!this.cur || n <= 0) return;
    this.cur.score += n;
    this._pop(`+${n}`, label, 'bonus');
    this._hud();
  }
  miss(toast) {
    const cur = this.cur;
    if (!cur) return;
    cur.combo = 0;
    cur.misses++;
    this.phaseMiss++;
    const c = this.ctx;
    c.audio.play('bad');
    c.neurix.setMood('sad');
    setTimeout(() => c.neurix.setMood('normal'), 1500);
    this._pop('¡Ups!', 'combo perdido', 'miss');
    if (toast) c.ui.toast(toast, '', '🤖', false, 3.4);
    this._hud();
  }
  async clearPhase() {
    const cur = this.cur;
    if (!cur || this.state !== 'play') return;
    const c = this.ctx, lv = cur.lv, ph = lv.phases[this.phase];
    this.state = 'clear';
    this.carry = null;
    c.ui.setTimer(null);
    let b = 250;
    const parts = ['Fase +250'];
    if (this.phaseMiss === 0) { b += 150; parts.push('Sin errores +150'); }
    if (ph.time && !ph.noClock) { const tb = Math.floor(Math.max(0, this.timeLeft)) * 20; if (tb > 0) { b += tb; parts.push(`Tiempo +${tb}`); } }
    cur.score += b;
    this._hud();
    c.audio.play('reward');
    c.player.cheer = 1.4;
    lv.fx(0, 2.5, 0, lv.def.color, 40, 8);
    c.ui.centerMsg(`¡FASE ${this.phase + 1} SUPERADA!`, parts.join(' · '), 2.6);
    await lv.outro(this.phase);
    if (this.cur !== cur) return;
    await wait(1500);
    if (this.cur !== cur) return;
    if (this.phase < 2) this.beginPhase(this.phase + 1, false);
    else this.finishLevel();
  }
  async failPhase() {
    const cur = this.cur;
    if (!cur || this.state !== 'play') return;
    const c = this.ctx;
    this.state = 'fail';
    cur.lv.cleanup();
    this.carry = null;
    cur.score = this.phaseStart;
    cur.combo = 0;
    cur.misses++;
    this._hud();
    c.ui.setTimer(null);
    c.audio.play('bad');
    c.ui.centerMsg('¡SE ACABÓ EL TIEMPO!', 'Intenta la fase otra vez', 2.2);
    c.ui.toast('Neuri-X: ¡Se acabó el tiempo! ¡Tú puedes, otra vez!', '', '🤖', false, 3);
    await wait(2300);
    if (this.cur !== cur) return;
    this.beginPhase(this.phase, true);
  }
  async raceLost() {
    const cur = this.cur;
    if (!cur || this.state !== 'play') return;
    const c = this.ctx, lv = cur.lv;
    this.state = 'fail';
    cur.combo = 0;
    cur.misses++;
    cur.score = this.phaseStart;
    this._hud();
    c.audio.play('bad');
    c.ui.centerMsg('¡LA SEÑAL LENTA GANÓ!', 'Salta más rápido de nodo en nodo', 2.2);
    c.ui.toast('Neuri-X: ¡La señal lenta llegó primero! Inténtalo otra vez.', '', '🤖', false, 3);
    await wait(2300);
    if (this.cur !== cur) return;
    this.beginPhase(2, true);
  }
  async finishLevel() {
    const cur = this.cur;
    const c = this.ctx, lv = cur.lv, k = lv.key;
    this.state = 'results';
    this.qHide();
    const par = lv.phases.reduce((a, p) => a + p.items * 250 + 400 + (p.noClock ? 0 : (p.time || p.roundTime * (p.rounds || 1) || 0)) * 7, 0);
    const stars = cur.score >= par * 0.85 ? 3 : cur.score >= par * 0.6 ? 2 : 1;
    const r = this.rec(k);
    const first = !r.done;
    const record = cur.score > (r.best || 0);
    const starsUp = stars > (r.stars || 0);
    this.S[k] = { done: true, stars: Math.max(stars, r.stars || 0), best: Math.max(cur.score, r.best || 0), plays: (r.plays || 0) + 1 };
    const secs = Math.round((performance.now() - cur.t0) / 1000);
    c.audio.play('fanfare');
    c.player.cheer = 3;
    for (let i = 0; i < 4; i++) setTimeout(() => lv.fx((Math.random() - 0.5) * 10, 5 + Math.random() * 3, (Math.random() - 0.5) * 10, [0xffb020, 0x35e0ff, 0xb57bff, 0x22c55e][i], 30, 8), i * 350);
    c.ui.centerMsg('¡NIVEL SUPERADO!', lv.def.name, 2.6);
    const xpGain = first ? 100 : record ? 30 : 10;
    c.addXP(xpGain, first ? 'Nivel superado' : record ? '¡Nuevo récord!' : 'Nivel repetido');
    c.persist();
    this.refreshHub();
    this._hud();
    await wait(2200);
    if (this.cur !== cur) return;
    const isNeuro = this.set === 'neuro';
    if (first && isNeuro) {
      c.save.data.stations[k] = true;
      await c.mission.awardPart(lv.def.part);
      if (this.cur !== cur) return;
      const gg = c.gear && c.gear.forLevel(k);
      if (gg && !c.gear.S.seen[gg.key]) { await c.gear.present(gg.key); if (this.cur !== cur) return; }
    }
    if (isNeuro) {
      if (LEVELS.every((L) => this.rec(L.key).done)) c.unlock('retos');
      if (this.totals().stars >= LEVELS.length * 3) c.unlock('estrellas');
    } else if (this.cfg.levels.every((L) => this.rec(L.key).done)) c.unlock('mate');
    this.refreshHub();
    this._openResults({ lv, stars, score: cur.score, best: this.S[k].best, record, starsUp, first, hits: cur.hits, misses: cur.misses, combo: cur.maxCombo, secs, xp: xpGain + (first ? 25 : 0) });
  }

  // ------------------------------------------------------------ results screen
  _openResults(R) {
    const c = this.ctx;
    const cfg = this.cfg;
    const i = cfg.levels.findIndex((l) => l.key === R.lv.key);
    const next = cfg.levels[i + 1];
    const st = c.save.data.stage;
    const opts = [];
    if (next) opts.push({ label: `${lvTag(next)}: ${next.name}`, act: () => c.portal('level', next.key) });
    else if (cfg.key === 'neuro' && st === 'final') opts.push({ label: 'Ir al Nivel final', act: () => c.portal('finalBoss') });
    opts.push({ label: '↻ Repetir', act: () => c.portal('level', R.lv.key) });
    opts.push({ label: '‹ Volver a la Sala', act: () => c.portal('toHub') });
    const D = R.lv.def;
    $('arcr-emoji').textContent = D.emoji;
    $('arcr-tag').textContent = `${lvTag(D)} · ${D.name} · ${this.calm ? '🌱 Modo Explorador' : '⏱️ Modo Desafío'}`;
    $('arcr-title').textContent = R.stars === 3 ? '¡NIVEL PERFECTO!' : '¡NIVEL COMPLETADO!';
    $('arcr-msg').textContent = R.first ? (cfg.key === 'math' ? `¡Excelente trabajo! Ganaste la insignia de ${D.badge.toLowerCase()}. ¡Juega otra vez para conseguir las tres estrellas!` : '¡Excelente trabajo, explorador! Ganaste una pieza de la neurona y una mejora para tu avatar.') : R.record ? '¡Superaste tu récord! Cada vez eres más rápido.' : '¡Bien hecho! Juega otra vez para conseguir más estrellas.';
    [...$('arcr-stars').children].forEach((el, k) => { el.className = k < R.stars ? 'on' : ''; el.style.animationDelay = (0.3 + k * 0.3) + 's'; });
    const PART = { soma: 'SOMA', axon: 'AXÓN', sinapsis: 'SINAPSIS', dendritas: 'DENDRITAS' }[D.part];
    const tiles = [
      `<div class="rw coin"><div class="rw-ico">⭐</div><b>+${R.xp} EXP</b><small>Experiencia</small></div>`,
      R.first && cfg.key === 'math' ? `<div class="rw part"><div class="rw-ico">${D.emoji}</div><b>${D.badge}</b><small>Insignia</small></div>`
        : R.first ? `<div class="rw part"><div class="rw-ico">🧠</div><b>${PART}</b><small>Pieza de neurona</small></div>` : `<div class="rw part"><div class="rw-ico">★</div><b>${R.stars} / 3</b><small>Estrellas</small></div>`,
      `<div class="rw pts"><div class="rw-ico">🏅</div><b>${fmt(R.score)}</b><small>${R.record ? '¡Nuevo récord!' : `Récord: ${fmt(R.best)}`}</small></div>`,
    ];
    const gg = R.first && c.gear && c.gear.forLevel(R.lv.key);
    if (gg) tiles.push(`<div class="rw gear"><div class="rw-ico">${gg.icon}</div><b>${gg.name}</b><small>¡Nueva mejora!</small></div>`);
    $('arcr-rewards').classList.toggle('four', tiles.length > 3);
    $('arcr-rewards').innerHTML = tiles.join('');
    $('arcr-obj').innerHTML = PHASE_NAMES.map((n, k) => `<li><i>✓</i><span>Fase ${k + 1}: ${n.charAt(0) + n.slice(1).toLowerCase()}</span></li>`).join('');
    const mm = Math.floor(R.secs / 60), ss = String(R.secs % 60).padStart(2, '0');
    $('arcr-stats').innerHTML = `<div><b>${R.hits}</b>Aciertos</div><div><b>${R.misses}</b>Errores</div><div><b>${R.combo}</b>Mejor combo</div><div><b>${mm}:${ss}</b>Tiempo</div>`;
    const xp = c.save.data.xp;
    $('arcr-lvl').textContent = `Nivel ${1 + Math.floor(xp / 250)}`;
    $('arcr-bar').style.width = Math.round((xp % 250) / 2.5) + '%';
    $('arcr-xp').textContent = `${xp % 250} / 250 EXP`;
    $('arcr-count').textContent = `${this.totals().done} / ${cfg.levels.length}`;
    $('arcr-prog').textContent = cfg.progress;
    try { $('arcr-face').getContext('2d').drawImage($('pf-face'), 0, 0); } catch { /* ignore */ }
    const box = $('arcr-btns');
    box.innerHTML = '';
    opts.forEach((o, k) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (k === 0 ? 'primary' : 'ghost');
      b.innerHTML = `<span class="n">${k + 1}</span>${o.label}${k === 0 ? ' <span class="go">›</span>' : ''}`;
      b.addEventListener('click', (e) => { e.stopPropagation(); this._choose(k); });
      box.appendChild(b);
    });
    $('arc-results').classList.remove('hidden');
    document.body.classList.add('results-open');
    this.modal = { opts, sel: 0 };
    this._selRender();
    c.mission.busy = true;
    c.player.frozen = true;
    c.audio.play('achieve');
  }
  _selRender() {
    if (!this.modal) return;
    [...$('arcr-btns').children].forEach((b, k) => b.classList.toggle('sel', k === this.modal.sel));
  }
  _closeResults() {
    if (!this.modal) return;
    this.modal = null;
    $('arc-results').classList.add('hidden');
    document.body.classList.remove('results-open');
    if (this.ctx) this.ctx.mission.busy = false;
  }
  _choose(k) {
    const m = this.modal;
    if (!m || !m.opts[k]) return;
    this.ctx.audio.play('blip');
    this._closeResults();
    m.opts[k].act();
  }
  updateModal(dt, input) {
    const m = this.modal;
    if (!m) return;
    if (input.consume('up')) { m.sel = (m.sel + m.opts.length - 1) % m.opts.length; this._selRender(); this.ctx.audio.play('blip'); }
    if (input.consume('down')) { m.sel = (m.sel + 1) % m.opts.length; this._selRender(); this.ctx.audio.play('blip'); }
    for (let k = 0; k < 3; k++) if (input.consume('choice' + k)) { this._choose(k); return; }
    if (input.consume('interact') || input.consume('jump')) this._choose(m.sel);
  }

  // ------------------------------------------------------------ HUD
  qShow(head, text, sub) {
    $('arcq-h').textContent = head;
    $('arcq-t').textContent = text;
    $('arcq-s').textContent = sub;
    $('arcq-s').classList.toggle('hidden', !sub);
    $('arc-q').classList.remove('hidden');
    document.body.classList.add('arcq');
  }
  qHide() {
    const el = $('arc-q');
    if (el) el.classList.add('hidden');
    document.body.classList.remove('arcq');
  }
  _hudShow(on) {
    $('arc-hud').classList.toggle('hidden', !on);
    document.body.classList.toggle('arcade-play', on);
  }
  _hud() {
    const cur = this.cur;
    if (!cur) return;
    const lv = cur.lv;
    $('arc-name').textContent = `${lvTag(lv.def).toUpperCase()} · ${lv.def.name.toUpperCase()}`;
    $('arc-phase').textContent = `FASE ${this.phase + 1}/3 · ${PHASE_NAMES[this.phase]}`;
    [...$('arc-dots').children].forEach((d, k) => { d.className = k < this.phase || (k === this.phase && this.state === 'results') ? 'done' : k === this.phase ? 'cur' : ''; });
    this.pts = cur.score;
    const m = 1 + 0.5 * Math.min(cur.combo, 4);
    const cb = $('arc-combo');
    if (cur.combo >= 2) { cb.classList.remove('hidden'); cb.textContent = `COMBO ${cur.combo} · x${m}`; cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump'); }
    else cb.classList.add('hidden');
  }
  _pop(txt, sub = '', cls = '') {
    const el = document.createElement('div');
    el.className = 'arc-pop ' + cls;
    el.innerHTML = `${txt}${sub ? `<small>${sub}</small>` : ''}`;
    el.style.left = (46 + Math.random() * 8) + '%';
    $('arc-pops').appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  // ------------------------------------------------------------ input / map
  interactions(player) {
    if (this.inside && this.where === 'hub' && !this.cur && !this.busy && this.modePad) {
      const p = player.pos;
      if (Math.hypot(p.x - (ARENA.x + this.modePad.x), p.z - (ARENA.z + this.modePad.z)) < 2.3) return [{ label: this.calm ? 'Cambiar a modo Desafío (con reloj)' : 'Cambiar a modo Explorador (sin reloj)', act: () => this.toggleMode() }];
      return [];
    }
    if (!this.inside || !this.cur || this.state !== 'play' || this.busy) return [];
    return this.cur.lv.interactions(this.cur.lv.L(player.pos).clone());
  }
  drawMap(player, buddy) {
    const cv = $('mm');
    if (!cv) return;
    const g = cv.getContext('2d');
    const W = cv.width;
    let cx = 0, cz = 0, span = 2 * HUB_R + 8, items = [], ox = 0, oz = 0;
    if (this.cur) {
      const lv = this.cur.lv;
      ox = lv.ox; oz = lv.oz;
      const v = lv.mapView ? lv.mapView() : { cx: 0, cz: 0, span: 46 };
      cx = v.cx; cz = v.cz; span = v.span;
      items = lv.mapItems();
    }
    const s = W / span;
    const P = (x, z) => [W / 2 + (x - cx) * s, W / 2 + (z - cz) * s];
    g.save();
    g.fillStyle = '#bfe3ff';
    g.fillRect(0, 0, W, W);
    const disk = (x, z, r, fill, stroke) => {
      const [px, py] = P(x, z);
      g.beginPath(); g.arc(px, py, Math.max(2, r * s), 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      if (stroke) { g.lineWidth = 3; g.strokeStyle = stroke; g.stroke(); }
    };
    if (!this.cur) {
      disk(0, 0, HUB_R, '#f2f6fb', '#ffc95a');
      for (const gt of this.gates) disk(gt.x, gt.z, 1.6, this.unlocked(gt.key) ? hex(gt.color) : '#4a5070', '#ffffff');
      disk(0, EXIT_Z, 1.4, '#ffb020', '#ffffff');
      disk(this.modePad.x, this.modePad.z, 1.35, '#8b5cf6', '#ffffff');
    } else {
      const lv = this.cur.lv;
      if (lv.key === 's2') { const [px, py] = P(-18, -13); g.fillStyle = '#f2f6fb'; g.fillRect(px, py, 36 * s, 26 * s); }
      else disk(0, 0, 19, '#f2f6fb', hex(lv.def.color));
      for (const it of items) disk(it.x, it.z, it.r, it.color);
      disk(lv.exitAt.x, lv.exitAt.z, 1.2, '#22c55e', '#ffffff');
    }
    if (buddy) disk(buddy.x - ARENA.x - ox, buddy.z - ARENA.z - oz, 0.9, '#ffffff', '#35e0ff');
    const [px, py] = P(player.pos.x - ARENA.x - ox, player.pos.z - ARENA.z - oz);
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const L = 15, Wd = 9;
    g.beginPath();
    g.moveTo(px + fx * L, py + fz * L);
    g.lineTo(px - fx * L * 0.6 + fz * Wd, py - fz * L * 0.6 - fx * Wd);
    g.lineTo(px - fx * L * 0.6 - fz * Wd, py - fz * L * 0.6 + fx * Wd);
    g.closePath();
    g.fillStyle = '#ffb020'; g.fill();
    g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
    g.restore();
  }

  // ------------------------------------------------------------ update
  update(dt, t, player, cam) {
    for (const k in this.sets) {
      const st = this.sets[k], D = st.door;
      st.doorMat.uniforms.time.value = t;
      if (cam) fadePortal(st.doorMat, D.x, D.z, cam);
      st.trophy.rotation.y = t * 0.5;
      st.trophy.position.y = D.y + 8.2 + Math.sin(t * 1.3) * 0.25;
    }
    // smooth score counter
    if (this.shownPts !== this.pts) {
      this.shownPts = this.pts < this.shownPts ? this.pts : Math.min(this.pts, this.shownPts + Math.max(4, (this.pts - this.shownPts) * dt * 6));
      const el = $('arc-pts');
      if (el) el.textContent = fmt(this.shownPts);
    }
    if (!this.inside) return;
    const c = this.ctx;
    c.mission.idleHintT = 0;
    for (const m of this.holo) m.uniforms.time.value = t;
    for (const f of this.anim) f(t);
    this.dust.rotation.y = t * 0.015;
    if (this.where === 'hub') {
      this.hubExitMat.uniforms.time.value = t;
      if (cam) fadePortal(this.hubExitMat, ARENA.x, ARENA.z + EXIT_Z, cam);
      for (const gt of this.gates) {
        gt.mat.uniforms.time.value = t;
        if (cam) fadePortal(gt.mat, ARENA.x + gt.x, ARENA.z + gt.z, cam);
      }
    }
    const cur = this.cur;
    if (cur) {
      const lv = cur.lv;
      for (const m of lv.holo) m.uniforms.time.value = t;
      for (const f of lv.anim) f(t);
      lv.exitMat.uniforms.time.value = t;
      if (cam) { const [wx, wz] = lv.W(lv.exitAt.x, lv.exitAt.z); fadePortal(lv.exitMat, wx, wz, cam); }
      if (this.state === 'play') {
        lv.update(dt, t, player);
        const ph = lv.phases[this.phase];
        if (ph.time && !ph.noClock && this.state === 'play' && !this.busy) {
          const prev = Math.ceil(this.timeLeft);
          this.timeLeft -= dt;
          if (Math.ceil(this.timeLeft) !== prev && this.timeLeft < 6) c.audio.play('tick');
          c.ui.setTimer(Math.max(0, this.timeLeft));
          if (this.timeLeft <= 0) { if (lv.key === 's2' && this.phase === 2) { /* race handled by the level */ } else this.failPhase(); }
        }
      } else lv.idle(dt, t, player);
    }
    for (const sp of this.sparks) {
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.v.y -= 6 * dt;
      sp.s.position.addScaledVector(sp.v, dt);
      sp.s.material.opacity = Math.max(0, sp.life);
      sp.s.scale.setScalar(0.5 + sp.life * 0.6);
      if (sp.life <= 0) sp.s.visible = false;
    }
  }
}
