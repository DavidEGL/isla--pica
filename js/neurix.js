// Neuri-X: procedural companion robot with expressive visor eyes, articulated arms/legs and hover thrusters.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { damp, dampAngle, softSpriteTexture } from './util.js';

function eyeCanvas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
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
    // torso
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), shell);
    torso.scale.set(1, 1.05, 0.9);
    torso.position.y = 0.62;
    this.body.add(torso);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 8, 40), teal);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.52;
    this.body.add(belt);
    // chest emblem (neuron)
    const ec = document.createElement('canvas');
    ec.width = ec.height = 128;
    const g = ec.getContext('2d');
    g.strokeStyle = '#7ff6ff'; g.fillStyle = '#7ff6ff'; g.lineWidth = 7; g.lineCap = 'round';
    g.shadowColor = '#35e0ff'; g.shadowBlur = 14;
    g.beginPath(); g.arc(64, 64, 15, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + 0.3;
      g.beginPath(); g.moveTo(64 + Math.cos(a) * 15, 64 + Math.sin(a) * 15);
      g.quadraticCurveTo(64 + Math.cos(a + 0.4) * 34, 64 + Math.sin(a + 0.4) * 34, 64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); g.stroke();
      g.beginPath(); g.arc(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50, 5, 0, Math.PI * 2); g.fill();
    }
    const et = new THREE.CanvasTexture(ec);
    et.colorSpace = THREE.SRGBColorSpace;
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ map: et, transparent: true, toneMapped: false }));
    emblem.position.set(0, 0.66, 0.31);
    this.body.add(emblem);
    // head
    this.head = new THREE.Group();
    this.head.position.y = 1.18;
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 30), shell);
    skull.scale.set(1.12, 0.95, 1);
    this.head.add(skull);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.4, 40, 30, Math.PI / 2 - Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.28, Math.PI * 0.42), dark);
    visor.scale.set(1.1, 0.95, 1.02);
    visor.rotation.y = 0;
    visor.position.z = 0.035;
    this.head.add(visor);
    // eyes drawn on a canvas, mapped onto a curved patch over the visor
    this.eyeCanvas = eyeCanvas();
    this.eyeTex = new THREE.CanvasTexture(this.eyeCanvas);
    this.eyeTex.colorSpace = THREE.SRGBColorSpace;
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
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), dark);
    ant.position.set(0.08, 0.47, 0);
    ant.rotation.z = -0.25;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), glow);
    tip.position.set(0.115, 0.58, 0);
    this.antTip = tip;
    this.head.add(ant, tip);
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.36, 0.78, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), teal);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 6, 12), shell);
      arm.position.y = -0.17;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), shell);
      hand.position.y = -0.33;
      sh.add(ball, arm, hand);
      sh.rotation.z = s * 0.35;
      this.body.add(sh);
      this.arms.push(sh);
    }
    // legs with thrusters
    this.legs = [];
    const thrTex = softSpriteTexture('rgba(130,245,255,1)', 'rgba(53,224,255,0)');
    this.flames = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.15, 0.32, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.1, 6, 12), shell);
      leg.position.y = -0.1;
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), teal);
      foot.position.y = -0.24;
      foot.rotation.x = Math.PI;
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: thrTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      fl.position.y = -0.32;
      fl.scale.set(0.22, 0.38, 1);
      hip.add(leg, foot, fl);
      this.body.add(hip);
      this.legs.push(hip);
      this.flames.push(fl);
    }
    // soft glow under
    const shadowTex = softSpriteTexture('rgba(10,40,60,0.35)', 'rgba(10,40,60,0)');
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    this.light = new THREE.PointLight(0x35e0ff, 2.2, 6, 2);
    this.light.position.set(0, 0.7, 0.6);
    this.body.add(this.light);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.scale.setScalar(1.05);
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
    g.fillStyle = '#8ff8ff';
    g.strokeStyle = '#8ff8ff';
    g.shadowColor = '#35e0ff';
    g.shadowBlur = 26;
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
      goal = player.pos.clone().addScaledVector(right, this.side ?? (this.inRoom ? 2.6 : 2.1)).addScaledVector(f, this.fwd ?? (this.inRoom ? -0.3 : 0.8));
      goal.y = Math.max(heightAt(goal.x, goal.z), player.pos.y) + (this.inRoom && this.side === undefined ? 0.9 : 1.25);
      if (this.pos.distanceTo(player.pos) > 30) this.pos.copy(goal).add(new THREE.Vector3(0, 3, 0));
    } else if (this.mode === 'goto') {
      goal = this.goal;
    }
    if (goal) {
      const to = goal.clone().sub(this.pos);
      const d = to.length();
      const maxV = this.mode === 'goto' ? 9 : Math.min(14, 3 + d * 2.2);
      const want = d > 0.05 ? to.multiplyScalar(Math.min(maxV, d * 3) / d) : to.set(0, 0, 0);
      this.vel.lerp(want, 1 - Math.exp(-4 * dt));
      this.pos.addScaledVector(this.vel, dt);
    } else this.vel.multiplyScalar(Math.exp(-5 * dt));
    const floor = heightAt(this.pos.x, this.pos.z) + 0.75;
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
    this.group.scale.setScalar(this.inRoom && this.side === undefined ? 0.7 : 1.05);   // smaller in the challenge rooms
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
    // legs dangle
    this.legs[0].rotation.x = Math.sin(t * 2.6) * 0.18 - hs * 0.03;
    this.legs[1].rotation.x = -Math.sin(t * 2.6) * 0.18 - hs * 0.03;
    this.flames.forEach((f, i) => { f.scale.set(0.22, 0.32 + Math.sin(t * 30 + i) * 0.06 + hs * 0.02, 1); });
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
