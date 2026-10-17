// "Viaje al Cerebro": an interior level reached through a portal in the Neuro district.
// The player explores a giant brain and activates its four lobes (frontal, parietal, temporal, occipital).
import * as THREE from 'three';
import { PADS } from './terrain.js';
import { holoMaterial } from './districts.js';
import { buildBrain } from './neuroparts.js';
import { makeSign, softSpriteTexture, mulberry32, bakeStatic } from './util.js';
import { labelSprite } from './mission.js';
import { Portal, portalMaterial, fadePortal } from './portals.js';

export const LAB = { x: 0, y: 60, z: -700 };           // world origin of the interior (far from the island)
const N = PADS.neuro;
export const LAB_DOOR = { x: -109, z: -12, y: N.h };     // portal in the Neuro district (faces +x)
export const LAB_RETURN = { x: -100.5, z: -12, yaw: Math.PI / 2 };
const EXIT_L = { x: -6.6, z: 6.6 };
const SPAWN_L = { x: 0, z: -1.5 };
const GAP = 0.62;                                         // bottom opening of the ring portals (radians, half angle)

const ZONES = [
  { key: 'frontal', title: 'Lóbulo frontal', name: 'LÓBULO FRONTAL', sub: 'Planear · Decidir · Moverse', emoji: '💡', color: 0xffb020, x: 0, y: 3, z: -34, glow: [0, 0.35, 0.85] },
  { key: 'parietal', title: 'Lóbulo parietal', name: 'LÓBULO PARIETAL', sub: 'Tacto · Cuerpo en el espacio', emoji: '✋', color: 0x22c55e, x: 36, y: 0, z: 0, glow: [0, 0.8, -0.3] },
  { key: 'temporal', title: 'Lóbulo temporal', name: 'LÓBULO TEMPORAL', sub: 'Oído · Lenguaje · Memoria', emoji: '👂', color: 0xb57bff, x: -30, y: 0, z: 0, glow: [0.85, -0.2, 0.15] },
  { key: 'occipital', title: 'Lóbulo occipital', name: 'LÓBULO OCCIPITAL', sub: 'La vista', emoji: '👁️', color: 0x35e0ff, x: 0, y: 5, z: 31.5, glow: [0, 0.15, -1.0] },
];

const TEXT = {
  intro: [
    { text: '¡Bienvenido al **Viaje al Cerebro**! Estamos dentro de un cerebro gigante. ¡Mira esas neuronas brillando en las paredes!', mood: 'surprised', gesture: 'wave' },
    { text: 'El cerebro se divide en **lóbulos** y cada uno tiene una especialidad. Hay cuatro esperándote: **frontal**, **parietal**, **temporal** y **occipital**.', mood: 'think', gesture: 'think' },
    { text: 'Llega a cada lóbulo y toca su cristal para activarlo. Ojo: ¡cada camino es diferente! Y si te atreves, hay un **reto de equilibrio** esperándote. El portal azul te regresa al Distrito Neuro.', mood: 'happy', gesture: 'point' },
  ],
  frontal: [
    { text: 'Este es el **lóbulo frontal**, justo detrás de tu frente. Te ayuda a **planear**, **tomar decisiones** y concentrarte.', mood: 'happy', gesture: 'celebrate' },
    { text: 'En su parte de atrás está la **corteza motora**, que envía las órdenes para mover tu cuerpo. ¡Llegaste montado en una señal eléctrica, igual que esas órdenes!', mood: 'surprised' },
  ],
  parietal: [
    { text: 'Este es el **lóbulo parietal**, en la parte de arriba de tu cabeza. Recibe la información del **tacto**: si algo está frío, caliente o si te duele.', mood: 'happy', gesture: 'celebrate' },
    { text: 'También te ayuda a saber **dónde está tu cuerpo** en el espacio. ¡Por eso pudiste calcular esos saltos!', mood: 'surprised' },
  ],
  temporal: [
    { text: 'Este es el **lóbulo temporal**, a los lados de tu cabeza, cerca de tus orejas. Procesa lo que **escuchas** y te ayuda a **entender el lenguaje**.', mood: 'happy', gesture: 'celebrate' },
    { text: 'Muy cerca está el **hipocampo**, que ayuda a guardar tus **recuerdos**. ¿Te acuerdas de la estación de la música?', mood: 'think', gesture: 'think' },
  ],
  occipital: [
    { text: 'Este es el **lóbulo occipital**, en la parte de atrás de tu cabeza. Su trabajo es interpretar todo lo que **ves**: colores, formas y movimiento.', mood: 'happy', gesture: 'celebrate' },
    { text: 'Tus ojos capturan la luz, pero es tu cerebro el que **arma la imagen**. ¡Increíble!', mood: 'surprised' },
  ],
  cerebelo: [
    { text: '¡Lo lograste! Eso fue tu **cerebelo** en acción. Está en la parte de atrás y abajo del cerebro.', mood: 'happy', gesture: 'celebrate' },
    { text: 'El cerebelo coordina tus músculos para que mantengas el **equilibrio** y te muevas con precisión… ¡como cuando caminas por una línea o andas en bicicleta!', mood: 'surprised' },
  ],
  final: [
    { text: '¡Activaste los **cuatro lóbulos**! Cada uno tiene su especialidad, pero siempre trabajan **en equipo**, conectados por miles de millones de neuronas.', mood: 'happy', gesture: 'celebrate' },
    { text: 'Ahora eres oficialmente un **Viajero del Cerebro**. Cuando quieras, usa el portal azul para regresar al Distrito Neuro.', mood: 'normal', gesture: 'point' },
  ],
};

const _p = new THREE.Vector3(), _t = new THREE.Vector3();
const hex = (c) => '#' + new THREE.Color(c).getHexString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Horseshoe-shaped ring portal (open at the floor so the player walks through cleanly).
function ringPortal(color, R) {
  const g = new THREE.Group();
  const arc = Math.PI * 2 - GAP * 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.34, 12, 72, arc), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.15 }));
  ring.rotation.z = -Math.PI / 2 + GAP;
  const glow = new THREE.Mesh(new THREE.TorusGeometry(R - 0.36, 0.09, 6, 72, arc), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  glow.rotation.z = ring.rotation.z;
  const mat = portalMaterial(color, { shape: 'circle', color2: 0xffffff });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.3, 56), mat);
  disc.renderOrder = 4;
  g.add(ring, glow, disc);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
    cap.position.set(s * R * Math.sin(GAP), -R * Math.cos(GAP), 0);
    g.add(cap);
  }
  g.userData.mat = mat;
  g.userData.lift = R * Math.cos(GAP); // center height above the floor
  g.userData.half = R * Math.sin(GAP); // half width of the opening at the floor
  return g;
}

function glyphSprite(ch, color, size = 1.2) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 100px Nunito, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(ch, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sp.scale.setScalar(size);
  return sp;
}

export class BrainLab {
  constructor(scene, colliders) {
    this.scene = scene;
    this.col = colliders;
    this.inside = false;
    this.busy = false;
    this.ride = null;
    this.holoMats = [];
    this.anim = [];
    this.glowTex = softSpriteTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
    this.root = new THREE.Group();
    this.root.position.set(LAB.x, LAB.y, LAB.z);
    this.root.visible = false;
    scene.add(this.root);
    this.stat = new THREE.Group();
    this.root.add(this.stat);
    this._buildCave();
    this._buildHub();
    this._buildZones();
    this._buildPaths();
    this._buildCerebellum();
    this._buildSparks();
    bakeStatic(this.stat);
    this._buildEntrance();
  }

  // ------------------------------------------------------------ helpers
  _addCircle(x, z, r, y0, y1) { this.col.addCircle(LAB.x + x, LAB.z + z, r, LAB.y + y0, LAB.y + y1, 'lab'); }
  _addBox(x, z, hx, hz, y0, y1) { this.col.addBox(LAB.x + x, LAB.z + z, hx, hz, 0, LAB.y + y0, LAB.y + y1, 'lab'); }
  _white() { return new THREE.MeshStandardMaterial({ color: 0xf8eef6, roughness: 0.5 }); }
  _glowMat(c, i = 1.8) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 }); }
  _platform(x, y, z, r, h, color, taper = 0.6) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * taper, h, 40), this._white());
    body.position.y = -h / 2;
    body.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.11, 6, 80), this._glowMat(color));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    g.add(body, rim);
    g.position.set(x, y, z);
    this.stat.add(g);
    this._addCircle(x, z, r, y - h, y);
    return g;
  }

  // ------------------------------------------------------------ build
  _buildCave() {
    const rnd = mulberry32(4242);
    // brain-tissue shell with folds (gyri), seen from inside
    const geo = new THREE.IcosahedronGeometry(1, 4);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3(), cA = new THREE.Color(0xffe0f0), cB = new THREE.Color(0xf0a6d6), cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const fold = Math.sin(v.x * 7.3 + Math.sin(v.z * 5.1) * 2.2) * Math.cos(v.z * 6.7 + v.y * 4.1);
      const ridge = 1 - Math.abs(fold);
      const s = 1 + ridge * 0.06;
      pos.setXYZ(i, v.x * 54 * s, v.y * 26 * s, v.z * 54 * s);
      cc.copy(cB).lerp(cA, ridge * 0.8);
      cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const shell = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissive: 0x6e3364, emissiveIntensity: 0.55, side: THREE.BackSide, flatShading: true }));
    shell.position.y = 6;
    this.root.add(shell);
    // invisible ring keeps the camera inside the cave
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      this._addCircle(Math.cos(a) * 49, Math.sin(a) * 49, 2.4, -30, 40);
    }
    // glowing neurons on the walls
    const pal = [0x7ff6ff, 0xff8fd0, 0xffd36b, 0xc6a2ff].map((c) => new THREE.Color(c));
    const dots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.24, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), 420);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const wallPt = (k) => {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      return new THREE.Vector3(sq * Math.cos(th) * 54 * k, u * 26 * k + 6, sq * Math.sin(th) * 54 * k);
    };
    for (let i = 0; i < 420; i++) {
      const p = wallPt(0.955);
      sc.setScalar(0.6 + rnd() * 1.4);
      m4.compose(p, q, sc);
      dots.setMatrixAt(i, m4);
      dots.setColorAt(i, pal[i % 4]);
    }
    this.root.add(dots);
    // signals travelling between neurons
    const arcMat = new THREE.MeshBasicMaterial({ color: 0xff9ad0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.signals = [];
    for (let i = 0; i < 16; i++) {
      const a = wallPt(0.93), b = wallPt(0.93);
      const mid = a.clone().lerp(b, 0.5).multiplyScalar(0.45);
      mid.y = Math.max(mid.y, 8);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      this.stat.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.07, 5), arcMat));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: pal[i % 4], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.scale.setScalar(1.6);
      this.root.add(sp);
      this.signals.push({ curve, sp, t: rnd(), speed: 0.12 + rnd() * 0.15 });
    }
    // floating particles (neurotransmitters)
    const n = 600, pp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(rnd()) * 42, a = rnd() * Math.PI * 2;
      pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = -8 + rnd() * 30; pp[i * 3 + 2] = Math.sin(a) * r;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ map: this.glowTex, color: 0xffb8e8, size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.root.add(this.dust);
  }

  _buildHub() {
    this._platform(0, 0, 0, 10, 2.6, 0x35e0ff, 0.55);
    // floor glyphs: rings + paths to each lobe
    for (const [r, c] of [[3, 0xff8fd0], [6, 0x35e0ff], [8.7, 0xffffff]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 4, 96), this._glowMat(c, 1.4));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.03;
      this.stat.add(ring);
    }
    for (const z of ZONES) {
      const a = Math.atan2(z.z, z.x);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.04, 0.22), this._glowMat(z.color, 1.6));
      strip.position.set(Math.cos(a) * 7.2, 0.03, Math.sin(a) * 7.2);
      strip.rotation.y = -a;
      this.stat.add(strip);
    }
    // big brain hologram with lobe lights
    const bm = holoMaterial(0xff9ad0, { intensity: 0.75, lines: 26 });
    const bm2 = holoMaterial(0xffc0e0, { intensity: 0.7, lines: 26 });
    this.holoMats.push(bm, bm2);
    this.brainMats = [bm, bm2];
    const brain = buildBrain(bm, bm2);
    brain.scale.setScalar(4.2);
    brain.position.set(0, 12, 0);
    this.root.add(brain);
    this.brain = brain;
    this.anim.push((t) => { brain.rotation.y = t * 0.18; brain.position.y = 12 + Math.sin(t * 0.8) * 0.3; });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.2, 7.5, 32, 1, true), holoMaterial(0xff9ad0, { intensity: 0.45, lines: 3 }));
    beam.position.y = 4.2;
    this.holoMats.push(beam.material);
    this.root.add(beam);
    // exit portal (back to the Neuro district)
    const ex = ringPortal(0x35e0ff, 2.6);
    const th = Math.atan2(-EXIT_L.x, -EXIT_L.z);
    ex.position.set(EXIT_L.x, ex.userData.lift, EXIT_L.z);
    ex.rotation.y = th;
    this.root.add(ex);
    this.exitMat = ex.userData.mat;
    const lx = Math.cos(th), lz = -Math.sin(th);
    for (const s of [-1, 1]) this._addCircle(EXIT_L.x + lx * s * ex.userData.half, EXIT_L.z + lz * s * ex.userData.half, 0.45, -1, 5);
    this.exitPortal = new Portal({ x: LAB.x + EXIT_L.x, z: LAB.z + EXIT_L.z, nx: Math.sin(th), nz: Math.cos(th), halfW: ex.userData.half - 0.35, y0: LAB.y - 1, y1: LAB.y + 3, twoSided: true });
    const exLab = labelSprite(['SALIDA', 'Distrito Neuro'], '#35e0ff', 3.0);
    exLab.position.set(EXIT_L.x, 6.4, EXIT_L.z);
    this.root.add(exLab);
  }

  _buildZones() {
    this.zones = ZONES.map((Z) => {
      const z = { ...Z, on: false };
      this._platform(Z.x, Z.y, Z.z, 7, 3.4, Z.color, 0.5);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 1.2, 24), this._white());
      ped.position.set(Z.x, Z.y + 0.6, Z.z);
      this.stat.add(ped);
      this._addCircle(Z.x, Z.z, 1.0, Z.y - 1, Z.y + 1.2);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), new THREE.MeshStandardMaterial({ color: Z.color, emissive: Z.color, emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.1, flatShading: true }));
      crystal.position.set(Z.x, Z.y + 3.1, Z.z);
      crystal.scale.y = 1.5;
      this.root.add(crystal);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: Z.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 }));
      halo.scale.setScalar(5);
      halo.position.copy(crystal.position);
      this.root.add(halo);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.06, 6, 48), this._glowMat(Z.color, 2));
      ring.position.copy(crystal.position);
      this.root.add(ring);
      this.anim.push((t) => {
        crystal.rotation.y = t * (z.on ? 1.6 : 0.5);
        crystal.position.y = Z.y + 3.1 + Math.sin(t * 1.4 + Z.x) * 0.18;
        ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.9) * 0.4;
        ring.rotation.y = t * 0.7;
      });
      const lab = labelSprite([Z.name, Z.sub], hex(Z.color), 5.0, Z.emoji);
      lab.position.set(Z.x, Z.y + 6.4, Z.z);
      this.root.add(lab);
      // beam + link to the central brain (shown once activated)
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 24, 20, 1, true), holoMaterial(Z.color, { intensity: 0.9, lines: 6 }));
      beam.position.set(Z.x, Z.y + 15, Z.z);
      beam.visible = false;
      this.holoMats.push(beam.material);
      this.root.add(beam);
      const a = new THREE.Vector3(Z.x, Z.y + 3.1, Z.z), b = new THREE.Vector3(0, 12, 0);
      const mid = a.clone().lerp(b, 0.5); mid.y += 9;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const link = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.12, 6), new THREE.MeshBasicMaterial({ color: Z.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      link.geometry.setDrawRange(0, 0);
      link.userData.total = link.geometry.index.count;
      this.root.add(link);
      const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: Z.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pulse.scale.setScalar(1.8);
      pulse.visible = false;
      this.root.add(pulse);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: Z.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.12 }));
      glow.scale.setScalar(0.62);
      glow.position.set(...Z.glow);
      this.brain.add(glow);
      Object.assign(z, { crystal, halo, beam, link, curve, pulse, glow, grow: 0, pt: Math.random() });
      return z;
    });
  }

  _buildPaths() {
    // TEMPORAL (west): a bridge with rails, sound waves and music notes
    const deck = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.7, 3.6), this._white());
    deck.position.set(-16.4, -0.35, 0);
    deck.receiveShadow = true;
    this.stat.add(deck);
    this._addBox(-16.4, 0, 7.3, 1.8, -0.7, 0);
    const purple = this._glowMat(0xb57bff, 1.6);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.12, 0.12), purple);
      rail.position.set(-16.4, 1.0, s * 1.72);
      this.stat.add(rail);
      for (let k = 0; k <= 6; k++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), this._white());
        post.position.set(-9.4 - k * 2.4, 0.5, s * 1.72);
        this.stat.add(post);
      }
      this._addBox(-16.4, s * 1.8, 7.3, 0.14, -0.7, 1.1);
    }
    const waveMat = new THREE.MeshBasicMaterial({ color: 0xc9a6ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const waves = [-12, -16.5, -21].map((x, i) => {
      const w = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.05, 6, 48), waveMat.clone());
      w.position.set(x, 1.7, 0);
      w.rotation.y = Math.PI / 2;
      this.root.add(w);
      return { w, ph: i * 0.33 };
    });
    const notes = ['♪', '♫', '♪', '♫'].map((ch, i) => {
      const sp = glyphSprite(ch, i % 2 ? '#ffd36b' : '#e2c9ff', 1.1);
      sp.position.set(-11 - i * 3.4, 2.6, (i % 2 ? 1 : -1) * 1.0);
      this.root.add(sp);
      return sp;
    });
    this.anim.push((t) => {
      for (const o of waves) { const k = (t * 0.6 + o.ph) % 1; o.w.scale.setScalar(0.6 + k * 1.1); o.w.material.opacity = 0.75 * (1 - k); }
      notes.forEach((n, i) => { n.position.y = 2.6 + Math.sin(t * 2 + i) * 0.35; });
    });
    // PARIETAL (east): jump across neuron bodies over the void
    const somas = [[14, -1.6], [18.8, 1.6], [23.6, -1.6], [28.2, 1.0]];
    const spikeMat = this._glowMat(0x22c55e, 0.9);
    somas.forEach(([x, z]) => {
      this._platform(x, 0, z, 1.55, 1.8, 0x22c55e, 0.35);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + x;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 6), spikeMat);
        sp.position.set(x + Math.cos(a) * 1.9, -0.7, z + Math.sin(a) * 1.9);
        sp.rotation.z = -Math.PI / 2;
        sp.rotation.y = -a;
        sp.rotation.order = 'YZX';
        this.stat.add(sp);
      }
    });
    this.gapSparks = [];
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xb6ffcf, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.set(11.8 + i * 4.7, -0.4, 0);
      sp.scale.setScalar(1.2);
      this.root.add(sp);
      this.gapSparks.push(sp);
    }
    this.anim.push((t) => this.gapSparks.forEach((s, i) => { s.material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(t * 3 + i * 1.7)); s.position.y = -0.4 + Math.sin(t * 2 + i) * 0.3; }));
    // OCCIPITAL (south): floating steps going up
    [[0, 1, 13.2], [1.6, 2, 16.6], [-1.6, 3, 20], [0, 4, 23.4]].forEach(([x, y, z]) => this._platform(x, y, z, 1.6, 0.8, 0x35e0ff, 0.7));
    // FRONTAL (north): ride an axon signal
    const pts = [[0, 0, -7.6], [0, 2.6, -11], [0, 6.4, -17], [0, 7.2, -22.6], [0, 4.8, -27.4], [0, 3, -30.6]].map((a) => new THREE.Vector3(...a));
    this.rideCurve = new THREE.CatmullRomCurve3(pts);
    const vis = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(new THREE.Vector3(0, -0.62, 0))));  // the player surfs on top of the axon
    this.stat.add(new THREE.Mesh(new THREE.TubeGeometry(vis, 90, 0.26, 8), this._glowMat(0x7fe9ff, 1.2)));
    const myelin = this._white();
    for (let i = 1; i < 8; i++) {
      const u = i / 8;
      const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.9, 4, 12), myelin);
      vis.getPointAt(u, _p);
      vis.getTangentAt(u, _t);
      cap.position.copy(_p);
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _t);
      this.stat.add(cap);
    }
    this.visCurve = vis;
    this.axonPulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xfff3a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.axonPulse.scale.setScalar(2.2);
    this.root.add(this.axonPulse);
    this.ridePads = [
      { x: 0, y: 0, z: -7.6, back: false, label: 'Viajar por el axón ⚡' },
      { x: 0, y: 3, z: -29.4, back: true, label: 'Regresar por el axón' },
    ];
    for (const rp of this.ridePads) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.12, 32), this._glowMat(0xffd36b, 0.6));
      pad.position.set(rp.x, rp.y + 0.06, rp.z);
      this.stat.add(pad);
      const lab = labelSprite([rp.back ? 'REGRESO' : 'AXÓN EXPRESS'], '#ffd36b', rp.back ? 1.8 : 2.4, '⚡');
      lab.position.set(rp.x, rp.y + (rp.back ? 1.7 : 2.4), rp.z);
      this.root.add(lab);
    }
  }

  // Bonus: a narrow zig-zag beam to the cerebellum platform (balance challenge)
  _buildCerebellum() {
    const C = { x: 26, z: 26, r: 4.2 };
    this.cb = C;
    const col = 0xff8a3d;
    const nodes = [[6.9, 6.9], [12.6, 10.2], [15.4, 16], [20.8, 18.2], [23.2, 23.2]];
    const beamMat = this._white();
    const edgeMat = this._glowMat(col, 1.4);
    for (let i = 0; i < nodes.length - 1; i++) {
      const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      const th = Math.atan2(-dz, dx);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.7), beamMat);
      beam.position.set(mx, -0.175, mz);
      beam.rotation.y = th;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.74), edgeMat);
      edge.position.set(mx, -0.33, mz);
      edge.rotation.y = th;
      this.stat.add(beam, edge);
      this.col.addBox(LAB.x + mx, LAB.z + mz, len / 2, 0.35, th, LAB.y - 0.35, LAB.y, 'lab');
    }
    for (const [x, z] of nodes.slice(1, -1)) {
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.35, 16), beamMat);
      j.position.set(x, -0.175, z);
      this.stat.add(j);
      this._addCircle(x, z, 0.62, -0.35, 0);
    }
    this._platform(C.x, 0, C.z, C.r, 2.4, col, 0.5);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.04, 0.22), this._glowMat(col, 1.6));
    strip.position.set(5.1, 0.03, 5.1);
    strip.rotation.y = -Math.PI / 4;
    this.stat.add(strip);
    const start = labelSprite(['RETO DE EQUILIBRIO', 'Cerebelo'], '#ff8a3d', 3.2, '⚖️');
    start.position.set(8.2, 2.3, 8.2);
    this.root.add(start);
    const lab = labelSprite(['CEREBELO', 'Equilibrio · Coordinación'], '#ff8a3d', 4.4, '⚖️');
    lab.position.set(C.x, 5.6, C.z);
    this.root.add(lab);
    // the balance star
    const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffa000, emissiveIntensity: 1.6, roughness: 0.2, flatShading: true }));
    star.position.set(C.x, 1.6, C.z);
    this.root.add(star);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffc04a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    halo.scale.setScalar(3.4);
    halo.position.copy(star.position);
    this.root.add(halo);
    this.cbStar = star;
    this.cbHalo = halo;
    this.anim.push((t) => { star.rotation.y = t * 1.8; star.rotation.x = t * 0.7; star.position.y = 1.6 + Math.sin(t * 2.2) * 0.2; halo.position.y = star.position.y; });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.12 }));
    glow.scale.setScalar(0.6);
    glow.position.set(0, -0.45, -0.95);
    this.brain.add(glow);
    this.cbGlow = glow;
  }
  _cbCollected() {
    this.cbStar.visible = false;
    this.cbHalo.visible = false;
    this.cbGlow.material.opacity = 1;
  }
  async _collectStar() {
    const c = this.ctx;
    this.S.star = true;
    this.busy = true;
    c.mission.busy = true;
    this._fx(this.cbStar.position.clone(), 0xffc04a, 40, 7);
    this._cbCollected();
    c.audio.play('reward');
    c.player.cheer = 2;
    c.addXP(50, 'Reto del cerebelo');
    c.unlock('equilibrio');
    c.persist();
    await c.mission.say(TEXT.cerebelo);
    c.mission.busy = false;
    this.busy = false;
  }
  // Schematic minimap of the interior (top view, north up)
  drawMap(player, buddy) {
    const cv = document.getElementById('mm');
    if (!cv) return;
    const g = cv.getContext('2d');
    const W = cv.width, s = W / 104, cx = W / 2, cy = W / 2;
    const P = (x, z) => [cx + x * s, cy + z * s];
    g.save();
    g.fillStyle = '#fde4f3';
    g.fillRect(0, 0, W, W);
    const disk = (x, z, r, fill, stroke) => {
      const [px, py] = P(x, z);
      g.beginPath(); g.arc(px, py, r * s, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      if (stroke) { g.lineWidth = 3; g.strokeStyle = stroke; g.stroke(); }
    };
    const line = (pts, w, color) => {
      g.beginPath();
      pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.lineWidth = w * s; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    };
    line([[-9, 0], [-24, 0]], 3.6, '#e9d8ea');
    line([[6.9, 6.9], [12.6, 10.2], [15.4, 16], [20.8, 18.2], [23.2, 23.2]], 0.9, '#ffb98a');
    line([[0, -8], [0, -30]], 0.7, '#7fe9ff');
    for (const [x, z] of [[14, -1.6], [18.8, 1.6], [23.6, -1.6], [28.2, 1.0]]) disk(x, z, 1.55, '#bff5d0');
    for (const [x, z] of [[0, 13.2], [1.6, 16.6], [-1.6, 20], [0, 23.4]]) disk(x, z, 1.6, '#bdf3ff');
    disk(0, 0, 10, '#f3e6f0', '#35e0ff');
    for (const z of this.zones) disk(z.x, z.z, 7, z.on ? hex(z.color) : 'rgba(255,255,255,0.18)', hex(z.color));
    disk(this.cb.x, this.cb.z, this.cb.r, this.S.star ? '#ff8a3d' : 'rgba(255,255,255,0.18)', '#ff8a3d');
    disk(EXIT_L.x, EXIT_L.z, 1.6, '#35e0ff', '#ffffff');
    if (buddy) disk(buddy.x - LAB.x, buddy.z - LAB.z, 1.0, '#ffffff', '#35e0ff');
    // player arrow
    const [px, py] = P(player.pos.x - LAB.x, player.pos.z - LAB.z);
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

  _buildSparks() {
    this.sparks = [];
    for (let i = 0; i < 60; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      this.root.add(s);
      this.sparks.push({ s, v: new THREE.Vector3(), life: 0 });
    }
  }
  _fx(local, color, n = 30, speed = 6) {
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

  // Portal standing in the Neuro district
  _buildEntrance() {
    const E = LAB_DOOR;
    const g = ringPortal(0xff6fd8, 3.4);
    g.position.set(E.x, E.y + g.userData.lift, E.z);
    g.rotation.y = Math.PI / 2;
    this.scene.add(g);
    this.doorMat = g.userData.mat;
    for (const s of [-1, 1]) this.col.addCircle(E.x, E.z + s * g.userData.half, 0.45, E.y - 1, E.y + 6, 'labdoor');
    const floorRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.12, 6, 64), this._glowMat(0xff6fd8, 1.8));
    floorRing.rotation.x = Math.PI / 2;
    floorRing.position.set(E.x, E.y + 0.06, E.z);
    this.scene.add(floorRing);
    const bm = holoMaterial(0xff8fd0, { intensity: 1.1, lines: 24 });
    const bm2 = holoMaterial(0xffc0e0, { intensity: 1.0, lines: 24 });
    this.doorHolo = [bm, bm2];
    const brain = buildBrain(bm, bm2);
    brain.scale.setScalar(1.5);
    brain.position.set(E.x, E.y + 8.0, E.z);
    this.scene.add(brain);
    this.doorBrain = brain;
    const sign = makeSign(['VIAJE AL CEREBRO', '¡Cruza el portal!'], 6.4, 1.6, { border: '#ff6fd8', sub: '#ffd0f0' });
    sign.position.set(E.x, E.y + 10.9, E.z);
    sign.rotation.y = Math.PI / 2;
    this.scene.add(sign);
    this.entrancePortal = new Portal({ x: E.x, z: E.z, nx: 1, nz: 0, halfW: g.userData.half - 0.35, y0: E.y - 1, y1: E.y + 3, twoSided: true });
  }

  // ------------------------------------------------------------ state
  init(ctx) {
    this.ctx = ctx;
    const S = ctx.save.data;
    S.lab = S.lab || { lobes: {}, intro: false, done: false };
    this.S = S.lab;
    for (const z of this.zones) if (this.S.lobes[z.key]) { this._applyZone(z, true); z.grow = 1; z.link.geometry.setDrawRange(0, z.link.userData.total); }
    if (this.S.done) this._brainBright(true);
    if (this.S.star) this._cbCollected();
  }
  spawnWorld() {
    return { x: LAB.x + SPAWN_L.x, y: LAB.y + 0.2, z: LAB.z + SPAWN_L.z, yaw: Math.PI }; // facing the frontal lobe, camera away from the exit
  }
  enter() {
    const c = this.ctx;
    this.inside = true;
    this.root.visible = true;
    this._hidden = c.worldObjs().filter((o) => o.visible);
    for (const o of this._hidden) o.visible = false;
    const s = this.scene, L = c.lights;
    this._env = {
      bg: s.background, fogC: s.fog.color.getHex(),
      hc: L.hemi.color.getHex(), hg: L.hemi.groundColor.getHex(), hi: L.hemi.intensity, sc: L.sun.color.getHex(), si: L.sun.intensity,
    };
    s.background = new THREE.Color(0xffe8f5);
    s.fog.color.set(0xffe8f5);
    s.fog.density = 0.007;
    L.hemi.color.set(0xffffff); L.hemi.groundColor.set(0xf6c8e6); L.hemi.intensity = 1.45;
    L.sun.color.set(0xfff0f8); L.sun.intensity = 2.0;
    c.player.indoor = true;
    c.player.killY = LAB.y - 14;
    c.audio.setIndoor && c.audio.setIndoor(true);
    this._objective();
  }
  exit() {
    const c = this.ctx;
    if (!this.inside) return;
    this.inside = false;
    this.ride = null;
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
    c.audio.setIndoor && c.audio.setIndoor(false);
  }
  async onEntered() {
    if (this.S.intro) return;
    this.S.intro = true;
    this.ctx.persist();
    this.busy = true;
    this.ctx.mission.busy = true;
    await this.ctx.mission.say(TEXT.intro);
    this.ctx.mission.busy = false;
    this.busy = false;
  }
  _objective() {
    const n = this.zones.filter((z) => z.on).length;
    if (n < 4) this.ctx.ui.setObjective('Viaje al Cerebro', `Activa los lóbulos del cerebro (${n}/4)`, null);
    else this.ctx.ui.setObjective('¡Cerebro activado!', 'Usa el portal azul para volver al Distrito Neuro', null);
  }
  _applyZone(z, on) {
    z.on = on;
    z.crystal.material.emissiveIntensity = on ? 2.6 : 0.45;
    z.halo.material.opacity = on ? 0.85 : 0.25;
    z.beam.visible = on;
    z.glow.material.opacity = on ? 1 : 0.12;
    z.pulse.visible = on;
  }
  _brainBright(on) {
    for (const m of this.brainMats) m.uniforms.intensity.value = on ? 1.6 : 0.75;
  }
  interactions(player) {
    const out = [];
    if (!this.inside || this.ride || this.busy) return out;
    const near = (x, y, z, r) => Math.hypot(player.pos.x - (LAB.x + x), player.pos.z - (LAB.z + z)) < r && Math.abs(player.pos.y - (LAB.y + y)) < 2.2;
    for (const rp of this.ridePads) if (near(rp.x, rp.y, rp.z, 1.9)) out.push({ label: rp.label, act: () => this.startRide(rp.back) });
    for (const z of this.zones) if (!z.on && near(z.x, z.y, z.z, 3.6)) out.push({ label: `Activar: ${z.title}`, act: () => this.activate(z) });
    return out;
  }
  startRide(back) {
    const c = this.ctx;
    this.ride = { t: 0, back, beep: 0 };
    c.mission.busy = true;
    c.player.frozen = true;
    c.audio.play('portal');
    const P = c.player;
    c.cam.startCine({
      pos: () => new THREE.Vector3(P.pos.x + 8, P.pos.y + 3.2, P.pos.z + 1.5),
      look: () => new THREE.Vector3(P.pos.x, P.pos.y + 1.2, P.pos.z),
    });
    if (!this.S.rode) { this.S.rode = true; c.ui.toast('¡Viajas a la velocidad de una señal eléctrica!', 'Las neuronas envían señales por el axón', '⚡', false, 3.2); }
  }
  async activate(z) {
    const c = this.ctx;
    this.busy = true;
    c.mission.busy = true;
    this._applyZone(z, true);
    this.S.lobes[z.key] = true;
    c.audio.play('reward');
    this._fx(z.crystal.position.clone(), z.color, 40, 7);
    c.addXP(40, z.title);
    c.persist();
    this._objective();
    await c.mission.say(TEXT[z.key]);
    if (this.zones.every((x) => x.on) && !this.S.done) {
      this.S.done = true;
      c.persist();
      c.audio.play('fanfare');
      c.ui.centerMsg('¡CEREBRO ACTIVADO!', 'Los cuatro lóbulos trabajan en equipo', 3.5);
      this._brainBright(true);
      for (let i = 0; i < 5; i++) setTimeout(() => this._fx(new THREE.Vector3((Math.random() - 0.5) * 12, 12 + Math.random() * 6, (Math.random() - 0.5) * 12), [0xffb020, 0x22c55e, 0xb57bff, 0x35e0ff, 0xff8fd0][i], 30, 9), i * 450);
      c.player.cheer = 3;
      await wait(2600);
      c.unlock('cerebro');
      c.addXP(100, 'Viaje al Cerebro');
      await c.mission.say(TEXT.final);
      this._objective();
    }
    c.mission.busy = false;
    this.busy = false;
  }

  // ------------------------------------------------------------ update
  update(dt, t, player, cam) {
    for (const m of this.doorHolo) m.uniforms.time.value = t;
    this.doorMat.uniforms.time.value = t;
    if (cam) fadePortal(this.doorMat, LAB_DOOR.x, LAB_DOOR.z, cam);
    this.doorBrain.rotation.y = t * 0.35;
    if (!this.inside) return;
    const c = this.ctx;
    c.mission.idleHintT = 0;
    for (const m of this.holoMats) m.uniforms.time.value = t;
    this.exitMat.uniforms.time.value = t;
    if (cam) fadePortal(this.exitMat, LAB.x + EXIT_L.x, LAB.z + EXIT_L.z, cam);
    for (const f of this.anim) f(t);
    this.dust.rotation.y = t * 0.02;
    for (const s of this.signals) {
      s.t = (s.t + dt * s.speed) % 1;
      s.curve.getPoint(s.t, s.sp.position);
    }
    // idle pulse along the axon
    if (!this.ride) {
      const u = (t * 0.35) % 1;
      this.visCurve.getPoint(u, this.axonPulse.position);
      this.axonPulse.scale.setScalar(1.6);
    }
    // ride
    if (this.ride) {
      const r = this.ride;
      r.t += dt / 2.4;
      const k = Math.min(1, r.t);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const u = r.back ? 1 - e : e;
      this.rideCurve.getPoint(u, _p);
      this.rideCurve.getTangent(u, _t);
      if (r.back) _t.negate();
      player.pos.set(LAB.x + _p.x, LAB.y + _p.y, LAB.z + _p.z);
      player.vel.set(0, 0, 0);
      if (Math.hypot(_t.x, _t.z) > 0.05) player.yaw = Math.atan2(_t.x, _t.z);
      player.cheer = 0.3;
      player.avatar.root.position.copy(player.pos);
      player.avatar.root.rotation.y = player.yaw;
      this.axonPulse.position.set(_p.x, _p.y + 1.0, _p.z);
      this.axonPulse.scale.setScalar(3 + Math.sin(t * 20) * 0.4);
      r.beep += dt;
      if (r.beep > 0.16) { r.beep = 0; c.audio.play('pulse'); }
      if (k >= 1) {
        this.ride = null;
        c.cam.endCine();
        player.safe.copy(player.pos);
        player.grounded = true;
        c.mission.busy = false;
        this._fx(_p.clone().add(new THREE.Vector3(0, 1, 0)), 0xffd36b, 20, 4);
      }
    }
    // balance star pickup
    if (!this.S.star && !this.busy && !c.ui.dialogOpen && Math.hypot(player.pos.x - (LAB.x + this.cb.x), player.pos.z - (LAB.z + this.cb.z)) < 2.4 && Math.abs(player.pos.y - LAB.y) < 2.5) this._collectStar();
    // lobe links grow toward the brain, then pulses travel along them
    for (const z of this.zones) {
      if (!z.on) continue;
      if (z.grow < 1) {
        z.grow = Math.min(1, z.grow + dt * 0.8);
        z.link.geometry.setDrawRange(0, Math.floor(z.link.userData.total * z.grow / 3) * 3);
      }
      z.pt = (z.pt + dt * 0.45) % 1;
      z.curve.getPoint(z.pt * z.grow, z.pulse.position);
      z.glow.material.opacity = 0.75 + Math.sin(t * 4 + z.x) * 0.25;
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
