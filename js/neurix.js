// Neuri-X: procedural companion robot with expressive visor eyes, articulated arms/legs and hover thrusters.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { damp, dampAngle, softSpriteTexture } from './util.js';

function eyeCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512; // el doble de 512×256, la escala en la que dibuja _drawEyes
  return c;
}

export class NeuriX {
  constructor(scene) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const shell = new THREE.MeshPhysicalMaterial({ color: 0xf6f9fb, roughness: 0.22, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.15 });
    const teal = new THREE.MeshStandardMaterial({ color: 0x19d3c5, roughness: 0.3, metalness: 0.2, emissive: 0x0b6f68, emissiveIntensity: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c1a2b, roughness: 0.15, metalness: 0.3 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x7ff6ff, emissive: 0x35e0ff, emissiveIntensity: 2.2 });
    this.glowMat = glow;
    // cuerpo en forma de gota, ancho arriba y en punta abajo
    const profile = new THREE.SplineCurve([[0.001, 0.3], [0.07, 0.31], [0.14, 0.38], [0.21, 0.48], [0.27, 0.6], [0.32, 0.74], [0.34, 0.86], [0.29, 0.98], [0.15, 1.04], [0.001, 1.06]].map(([x, y]) => new THREE.Vector2(x, y)));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(profile.getPoints(36), 36), shell);
    this.body.add(torso);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.024, 8, 40), teal);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.46;
    this.body.add(belt);
    // chest emblem (neuron)
    const ec = document.createElement('canvas');
    ec.width = ec.height = 512;
    const g = ec.getContext('2d');
    g.scale(4, 4); // dibujo en unidades de 128, a 4 veces la resolución
    g.strokeStyle = '#7ff6ff'; g.fillStyle = '#7ff6ff'; g.lineWidth = 7; g.lineCap = 'round';
    g.shadowColor = '#35e0ff'; g.shadowBlur = 56;
    g.beginPath(); g.arc(64, 64, 15, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + 0.3;
      g.beginPath(); g.moveTo(64 + Math.cos(a) * 15, 64 + Math.sin(a) * 15);
      g.quadraticCurveTo(64 + Math.cos(a + 0.4) * 34, 64 + Math.sin(a + 0.4) * 34, 64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); g.stroke();
      g.beginPath(); g.arc(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50, 5, 0, Math.PI * 2); g.fill();
    }
    const et = new THREE.CanvasTexture(ec);
    et.colorSpace = THREE.SRGBColorSpace;
    et.anisotropy = 8;
    // entre el cinturón y la cabeza, inclinado como la superficie del cuerpo para no quedar tapado
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.105, 32), new THREE.MeshBasicMaterial({ map: et, transparent: true, toneMapped: false }));
    emblem.position.set(0, 0.61, 0.285);
    emblem.rotation.x = 0.4;
    this.body.add(emblem);
    // head: más grande que el cuerpo; visor, ojos y orejas crecen con ella
    this.head = new THREE.Group();
    this.head.position.y = 1.2;
    this.head.scale.setScalar(1.14);
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 30), shell);
    skull.scale.set(1.12, 0.95, 1);
    this.head.add(skull);
    // pantalla de esquinas redondeadas pegada a la cabeza, con un marco celeste delgado
    const onSkull = (u, v, k) => {
      const th = Math.PI * 0.49 + v; // u: giro a los lados; v: hacia abajo
      return new THREE.Vector3(0.42 * 1.12 * k * Math.sin(u) * Math.sin(th), 0.42 * 0.95 * k * Math.cos(th), 0.42 * k * Math.cos(u) * Math.sin(th));
    };
    const edge = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      edge.push([Math.PI * 0.3 * Math.sign(c) * Math.abs(c) ** 0.5, Math.PI * 0.19 * Math.sign(s) * Math.abs(s) ** 0.5]);
    }
    const rings = 8, verts = [], faces = [];
    for (let r = 0; r <= rings; r++) for (const [u, v] of edge) verts.push(...onSkull((u * r) / rings, (v * r) / rings, 1.02).toArray());
    for (let r = 0; r < rings; r++) for (let i = 0; i < 72; i++) {
      const a = r * 72 + i, b = r * 72 + (i + 1) % 72, c = a + 72, d = b + 72;
      faces.push(a, b, c, b, d, c);
    }
    const visorGeo = new THREE.BufferGeometry();
    visorGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    visorGeo.setIndex(faces);
    visorGeo.computeVertexNormals();
    this.head.add(new THREE.Mesh(visorGeo, dark));
    const frameLine = new THREE.CatmullRomCurve3(edge.map(([u, v]) => onSkull(u, v, 1.024)), true);
    this.head.add(new THREE.Mesh(new THREE.TubeGeometry(frameLine, 144, 0.009, 6, true), glow));
    // eyes drawn on a canvas, mapped onto a curved patch over the visor
    this.eyeCanvas = eyeCanvas();
    this.eyeTex = new THREE.CanvasTexture(this.eyeCanvas);
    this.eyeTex.colorSpace = THREE.SRGBColorSpace;
    this.eyeTex.anisotropy = 8;
    const eyes = new THREE.Mesh(
      new THREE.SphereGeometry(0.415, 40, 20, Math.PI / 2 - Math.PI * 0.3, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.38),
      new THREE.MeshBasicMaterial({ map: this.eyeTex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    eyes.scale.set(1.1, 0.95, 1.02);
    eyes.position.z = 0.04;
    // SphereGeometry phi measured from -x; rotate so the patch faces +z
    eyes.rotation.y = -Math.PI / 2 + Math.PI / 2;
    this.head.add(eyes);
    this.eyes = eyes;
    // ear discs
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 28), teal);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(s * 0.47, 0, 0);
      const earIn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.11, 20), glow);
      earIn.rotation.z = Math.PI / 2;
      earIn.position.set(s * 0.48, 0, 0);
      this.head.add(ear, earIn);
    }
    // antenas de dendrita: un tallo que se abre en dos puntas luminosas
    const stem = (from, to, r0, r1) => {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), 6), teal);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return m;
    };
    for (const [s, h] of [[-1, 0.15], [1, 0.2]]) {
      const base = [s * 0.13, 0.34, 0], fork = [s * 0.19, 0.38 + h * 0.55, 0];
      const tips = [[s * 0.12, 0.38 + h, 0], [s * 0.28, 0.38 + h * 0.85, 0]];
      this.head.add(stem(base, fork, 0.024, 0.016));
      for (const tp of tips) {
        const tipMesh = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), glow);
        tipMesh.position.set(...tp);
        this.head.add(stem(fork, tp, 0.014, 0.01), tipMesh);
        this.antTip = tipMesh;
      }
    }
    // brazos: hombro y mano flotante unidos por una estela de luz; giran desde el hombro
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.37, 0.8, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), teal);
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.3, 6), glow);
      trail.position.y = -0.19;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), shell);
      hand.scale.y = 0.9;
      hand.position.y = -0.43;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 24), teal);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.37;
      sh.add(ball, trail, hand, cuff);
      sh.rotation.z = s * 0.35;
      this.body.add(sh);
      this.arms.push(sh);
    }
    // propulsor en forma de átomo bajo la punta del cuerpo
    this.atom = new THREE.Group();
    this.atom.position.y = 0.05;
    this.body.add(this.atom);
    const orbitMat = new THREE.MeshStandardMaterial({ color: 0x3f8cff, emissive: 0x2f7fff, emissiveIntensity: 2.4 });
    const electronMat = new THREE.MeshStandardMaterial({ color: 0x2b4fd0, emissive: 0x2fa8ff, emissiveIntensity: 1.5, roughness: 0.35 });
    const nucleusMats = [
      new THREE.MeshStandardMaterial({ color: 0x1f63e0, emissive: 0x1f63e0, emissiveIntensity: 1.3, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ color: 0x35c8f5, emissive: 0x35c8f5, emissiveIntensity: 1.5, roughness: 0.35 }),
    ];
    this.nucleusMats = nucleusMats;
    // núcleo: esferas agrupadas, repartidas en espiral alrededor del centro
    const ball = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 12; i++) {
      const y = 1 - ((i + 0.5) / 12) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      const m = new THREE.Mesh(ball, nucleusMats[i % 3 === 0 ? 1 : 0]);
      m.position.set(Math.cos(a) * r * 0.042, y * 0.042, Math.sin(a) * r * 0.042);
      m.scale.setScalar(0.03 + (i % 4) * 0.004);
      this.atom.add(m);
    }
    // tres órbitas cruzadas, cada una con su electrón
    const A = 0.27, B = 0.105;
    this.electrons = [];
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * A, Math.sin(a) * B, 0)); }
      const orbit = new THREE.Group();
      orbit.rotation.set(0.35 * (k - 1), 0, (k * Math.PI) / 3 + 0.25);
      orbit.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, 0.011, 6, true), orbitMat));
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), electronMat);
      orbit.add(e);
      this.atom.add(orbit);
      this.electrons.push({ mesh: e, phase: (k * Math.PI * 2) / 3 + 0.6 });
    }
    // resplandor
    const haloTex = softSpriteTexture('rgba(90,170,255,0.95)', 'rgba(40,110,255,0)');
    this.atomGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.atomGlow.position.y = 0.05;
    this.atomGlow.scale.setScalar(0.95);
    this.body.add(this.atomGlow);
    this.ELLIPSE = [A, B];
    // soft glow under
    const shadowTex = softSpriteTexture('rgba(10,40,60,0.35)', 'rgba(10,40,60,0)');
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    this.light = new THREE.PointLight(0x35e0ff, 2.2, 6, 2);
    this.light.position.set(0, 0.7, 0.6);
    this.body.add(this.light);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.scale.setScalar(0.55);
    scene.add(this.group);
    // state
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.mood = 'normal';
    this.blink = 0;
    this.nextBlink = 2;
    this.t = 0;
    this.talking = false;
    this.gesture = null; // 'wave' | 'celebrate' | 'point' | 'think'
    this.gestureT = 0;
    this.lookAt = null;
    this.mode = 'idle'; // idle | follow | goto
    this.goal = new THREE.Vector3();
    this._drawEyes();
  }
  setMood(m) { if (m !== this.mood) { this.mood = m; this._drawEyes(); } }
  doGesture(g, dur = 2) { this.gesture = g; this.gestureT = dur; }
  placeAt(x, z, yOff = 0) {
    this.pos.set(x, heightAt(x, z) + 1.0 + yOff, z);
    this.group.position.copy(this.pos);
  }
  _drawEyes() {
    const c = this.eyeCanvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.scale(2, 2);
    g.fillStyle = '#8ff8ff';
    g.strokeStyle = '#8ff8ff';
    g.shadowColor = '#35e0ff';
    g.shadowBlur = 52;
    g.lineCap = 'round';
    const L = 170, R = 342, Y = 128;
    const bl = this.blink;
    const eye = (x) => {
      const m = this.mood;
      if (m === 'happy') {
        g.lineWidth = 26;
        g.beginPath(); g.arc(x, Y + 24, 46, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      } else if (m === 'surprised') {
        g.beginPath(); g.ellipse(x, Y, 46, 58 * (1 - bl), 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#0c1a2b'; g.beginPath(); g.ellipse(x + 8, Y - 10, 14, 18 * (1 - bl), 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8ff8ff';
      } else if (m === 'think') {
        g.beginPath(); g.ellipse(x, Y + 6, 38, 22 * (1 - bl) + 2, 0, 0, Math.PI * 2); g.fill();
      } else if (m === 'sad') {
        g.beginPath(); g.ellipse(x, Y + 8, 34, 40 * (1 - bl) + 2, 0, 0, Math.PI * 2); g.fill();
        g.lineWidth = 12; g.beginPath(); g.moveTo(x - 40, Y - 52 + (x < 256 ? 14 : 0)); g.lineTo(x + 40, Y - 52 + (x < 256 ? 0 : 14)); g.stroke();
      } else {
        g.beginPath(); g.ellipse(x, Y, 38, 52 * (1 - bl) + 3, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8ffff'; g.beginPath(); g.ellipse(x + 12, Y - 18 * (1 - bl), 10, 12 * (1 - bl) + 1, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8ff8ff';
      }
    };
    eye(L); eye(R);
    // mouth when talking
    if (this.talking && this.mouth > 0.05) {
      g.lineWidth = 10;
      g.beginPath(); g.ellipse(256, 214, 26, 8 + this.mouth * 14, 0, 0, Math.PI * 2); g.stroke();
    } else if (this.mood === 'happy' || this.mood === 'normal') {
      g.lineWidth = 10;
      g.beginPath(); g.arc(256, 192, 26, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    }
    g.restore();
    this.eyeTex.needsUpdate = true;
  }
  update(dt, player, cam) {
    this.t += dt;
    const t = this.t;
    // movement
    let goal = null;
    if (this.mode === 'follow') {
      // hover beside the player, on the right side of the screen (never between camera and player)
      const f = cam ? new THREE.Vector3(player.pos.x - cam.position.x, 0, player.pos.z - cam.position.z) : new THREE.Vector3();
      if (f.lengthSq() < 1e-4) f.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      f.normalize();
      const right = new THREE.Vector3(-f.z, 0, f.x);
      goal = player.pos.clone().addScaledVector(right, this.side ?? (this.inRoom ? 2.6 : 1.3)).addScaledVector(f, this.fwd ?? (this.inRoom ? -0.3 : 0.35));
      goal.y = Math.max(heightAt(goal.x, goal.z), player.pos.y, 0) + (this.inRoom && this.side === undefined ? 0.9 : 0.85);
      if (this.pos.distanceTo(player.pos) > 30) this.pos.copy(goal).add(new THREE.Vector3(0, 3, 0));
    } else if (this.mode === 'goto') {
      goal = this.goal;
    }
    if (goal) {
      const to = goal.clone().sub(this.pos);
      const d = to.length();
      const follow = this.mode === 'follow';
      const maxV = follow ? Math.min(24, 6 + d * 6) : 9;
      const want = d > 0.05 ? to.multiplyScalar(Math.min(maxV, d * (follow ? 8 : 3)) / d) : to.set(0, 0, 0);
      this.vel.lerp(want, 1 - Math.exp(-(follow ? 11 : 4) * dt));
      this.pos.addScaledVector(this.vel, dt);
    } else this.vel.multiplyScalar(Math.exp(-5 * dt));
    const floor = Math.max(heightAt(this.pos.x, this.pos.z), 0) + 0.75; // sobre el agua, no debajo
    if (this.pos.y < floor) this.pos.y = floor;
    const bob = Math.sin(t * 2.6) * 0.07;
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    // facing: talk -> face player; moving -> face velocity; else face player
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let tgtYaw = this.yaw;
    const lookP = this.lookAt || player.pos;
    if (hs > 1.2 && !this.talking) tgtYaw = Math.atan2(this.vel.x, this.vel.z);
    else tgtYaw = Math.atan2(lookP.x - this.pos.x, lookP.z - this.pos.z);
    this.yaw = dampAngle(this.yaw, tgtYaw, 6, dt);
    this.group.rotation.y = this.yaw;
    this.group.scale.setScalar(this.inRoom && this.side === undefined ? 0.37 : 0.55);   // smaller in the challenge rooms
    // tilt into motion
    this.body.rotation.x = damp(this.body.rotation.x, Math.min(0.35, hs * 0.04), 5, dt);
    // head looks at camera a bit when talking
    const headTilt = this.talking ? Math.sin(t * 3.1) * 0.06 : Math.sin(t * 0.8) * 0.1;
    this.head.rotation.z = headTilt;
    this.head.rotation.x = this.gesture === 'think' ? -0.2 : Math.sin(t * 1.3) * 0.04;
    // arms
    const [la, ra] = this.arms;
    let lz = -0.35, rz = 0.35, lx = Math.sin(t * 2.6) * 0.15, rx = -Math.sin(t * 2.6) * 0.15;
    if (this.gestureT > 0) {
      this.gestureT -= dt;
      if (this.gesture === 'wave') { rz = 2.6 + Math.sin(t * 12) * 0.35; rx = 0; }
      if (this.gesture === 'celebrate') { lz = -2.6 + Math.sin(t * 14) * 0.3; rz = 2.6 - Math.sin(t * 14) * 0.3; this.body.position.y = Math.abs(Math.sin(t * 8)) * 0.25; }
      if (this.gesture === 'point') { rz = 1.4; rx = -1.2; }
      if (this.gesture === 'think') { rz = 2.2; rx = -1.5; }
      if (this.gestureT <= 0) { this.gesture = null; this.body.position.y = 0; }
    } else if (this.talking) { rz = 0.6 + Math.sin(t * 5) * 0.35; lz = -0.5 - Math.sin(t * 4) * 0.25; }
    la.rotation.z = damp(la.rotation.z, lz, 10, dt);
    ra.rotation.z = damp(ra.rotation.z, rz, 10, dt);
    la.rotation.x = damp(la.rotation.x, lx, 10, dt);
    ra.rotation.x = damp(ra.rotation.x, rx, 10, dt);
    // átomo: los electrones giran, el núcleo late y el resplandor crece con la velocidad
    const boost = Math.min(1, hs * 0.08);
    this.atomSpin = (this.atomSpin || 0) + dt * (2.4 + boost * 7);
    const [ea, eb] = this.ELLIPSE;
    for (const e of this.electrons) e.mesh.position.set(Math.cos(this.atomSpin + e.phase) * ea, Math.sin(this.atomSpin + e.phase) * eb, 0);
    this.atom.rotation.z = t * (0.25 + boost * 0.8);
    this.atom.rotation.y = Math.sin(t * 0.7) * 0.35;
    const beat = Math.sin(t * 4);
    this.nucleusMats[0].emissiveIntensity = 1.3 + beat * 0.3 + boost * 0.8;
    this.nucleusMats[1].emissiveIntensity = 1.5 + beat * 0.4 + boost * 1;
    this.atomGlow.scale.setScalar(0.95 + beat * 0.05 + boost * 0.35);
    this.atomGlow.material.opacity = 0.75 + beat * 0.08 + boost * 0.17;
    this.antTip.material.emissiveIntensity = 1.5 + Math.sin(t * 4) * 1;
    // blink + mouth
    this.nextBlink -= dt;
    let redraw = false;
    if (this.nextBlink <= 0) { this.blink = 1; this.nextBlink = 2.5 + Math.random() * 3; redraw = true; }
    if (this.blink > 0) { this.blink = Math.max(0, this.blink - dt * 8); redraw = true; }
    if (this.talking) { this.mouth = Math.abs(Math.sin(t * 13)) * (0.5 + 0.5 * Math.sin(t * 3.7)); redraw = true; }
    else if (this.mouth) { this.mouth = 0; redraw = true; }
    if (redraw) this._drawEyes();
    // ground shadow
    const gh = heightAt(this.pos.x, this.pos.z);
    this.shadow.position.set(this.pos.x, Math.max(gh, player.pos.y - 3) + 0.06, this.pos.z);
    this.shadow.material.opacity = Math.max(0, 1 - (this.pos.y - gh) / 4);
  }
}
