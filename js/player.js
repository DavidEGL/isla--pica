// Third-person character controller + avatar animation (real clips or procedural fallback).
import * as THREE from 'three';
// el jugador pisa la malla dibujada, no la fórmula del terreno
import { surfaceAt as heightAt, surfaceSlopeAt as slopeAt, SPAWN, riverDist, LAKE } from './terrain.js';
import { clamp, damp, dampAngle, lerp, smoothstep } from './util.js';

const FOOT_LIFT = 0.03; // sube el modelo 3 cm (solo visual): evita que los zapatos atraviesen el suelo en pendientes
const STATIC_POSE = false; // true: sin animaciones, el personaje queda siempre en A-pose (pose de reposo del esqueleto)
const CLIPS_ONLY = true; // true: los clips se ven tal cual; desactiva las capas procedurales calibradas para los clips viejos
// salto: fracciones del clip Jump donde los pies despegan y vuelven al suelo, y velocidad para cubrir el vuelo real (~0,66 s)
const JUMP_TAKEOFF = 0.37, JUMP_LAND = 0.58, JUMP_RATE = 0.7;
// apertura medida de la punta del pie al apoyar (rad): se corrige para que apunte al frente
const WALK_TOE_L = 0.39, WALK_TOE_R = 0.375, RUN_TOE_L = 0.48, RUN_TOE_R = 0.36;
const RUN_TORSO_LEAN = 0.23; // inclinación del torso al correr (rad, ~13°)
const RUN_HAND_INWARD = 0.21; // al correr, con el brazo adelante, las manos apuntan ~12° hacia el centro (rad)
const RUN_HAND_OUTWARD = 0.26; // al pasar por la columna y hacia atrás, las manos apuntan ~15° hacia afuera (rad)
const RUN_HAND_BLEND = 0.52; // el brazo va de 0° (columna) a +30° (adelante) entre afuera y adentro (rad)
const ARM_MIN_SIDE = 0.35; // al caminar/correr el brazo se separa al menos ~20° del torso (plano lateral), para no rozar el costado
// pose de vuelo (rad): muslo adelante, rodilla flexionada, brazo abierto respecto a la A-pose de reposo, codo
const AIR_THIGH = 0.45, AIR_KNEE = 0.9, AIR_ARM = 0.26, AIR_ELBOW = 0.35;
const airBones = (b) => [b.L.upLeg, b.R.upLeg, b.L.leg, b.R.leg, b.L.arm, b.R.arm, b.L.foreArm, b.R.foreArm].filter(Boolean);
const ARM_MAX = 0.63; // ángulo máximo hombro (brazo vs eje del torso) al caminar/correr: ~36° (con ARM_MIN_SIDE de 20° deja ~±27° de balanceo)
const SWIM_LIFT = 0.45; // tendido en horizontal: solo la espalda y la parte alta de la cabeza asoman del agua
const SWIM_Y = -0.95; // altura de los pies al nadar: la cabeza y los hombros quedan fuera del agua
const canSwim = (x, z) => riverDist(x, z) < 16 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 5; // río y lago; el mar sigue cerrado
const P = {
  walk: 2.6, run: 6.2, sprint: 9.2,
  accG: 34, decG: 28, accA: 12,
  grav: 27, jumpV: 9.4, maxFall: 42,
  step: 0.5, radius: 0.38, height: 1.7,
  dashV: 15, dashT: 0.2, dashCd: 0.9,
  maxSlope: 1.2,
  swim: 0.55, // velocidad al nadar, respecto a correr
  swimSprint: 2, // multiplicador de la velocidad de nado con Shift
};

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _list = [];
const _ha = new THREE.Quaternion(), _hb = new THREE.Quaternion(), _hc = new THREE.Quaternion(), _hd = new THREE.Quaternion();

function stripName(n) { return n.toLowerCase().replace(/^mixamorig[:_]?/, '').replace(/[^a-z0-9]/g, ''); }

function findBones(skeletonRoot) {
  const bones = [];
  skeletonRoot.traverse((o) => { if (o.isBone) bones.push(o); });
  const by = (test) => bones.find((b) => test(stripName(b.name)));
  const side = (s) => {
    const L = s === 'l';
    const has = (n) => (L ? /left|^l|l$/.test(n) : /right|^r|r$/.test(n)) && !(L ? /right/.test(n) : /left/.test(n));
    return {
      upLeg: by((n) => has(n) && /(upleg|thigh|upperleg)/.test(n)),
      leg: by((n) => has(n) && /(^(left|right)?leg$|calf|shin|knee|lowerleg|(left|right)leg$)/.test(n) && !/up/.test(n)),
      foot: by((n) => has(n) && /foot|ankle/.test(n)),
      toe: by((n) => has(n) && /toe/.test(n)),
      arm: by((n) => has(n) && /(arm$|upperarm)/.test(n) && !/fore|lower/.test(n)),
      foreArm: by((n) => has(n) && /(forearm|lowerarm)/.test(n)),
      shoulder: by((n) => has(n) && /shoulder|clavicle/.test(n)),
    };
  };
  return {
    all: bones,
    hips: by((n) => /hips|pelvis/.test(n)) || bones[0],
    spine: by((n) => /^spine$|spine0?1?$/.test(n)),
    chest: by((n) => /spine0?2$|chest|upperchest/.test(n)),
    head: by((n) => /^head$/.test(n)),
    L: side('l'), R: side('r'),
  };
}

// q = a * (a^-1 b)^k  (extrapolating slerp)
function extrap(out, a, b, k) {
  _q.copy(a).invert().multiply(b);
  if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
  const w = clamp(_q.w, -1, 1);
  const ang = 2 * Math.acos(w);
  const s = Math.sqrt(1 - w * w);
  if (s < 1e-5) return out.copy(b);
  const na = ang * k;
  _q2.set((_q.x / s) * Math.sin(na / 2), (_q.y / s) * Math.sin(na / 2), (_q.z / s) * Math.sin(na / 2), Math.cos(na / 2));
  return out.copy(a).multiply(_q2);
}

// Clips de nado (assets/models/swim_clips.json), ya convertidos a los huesos del personaje.
export function swimClipsFrom(data, scene) {
  const nodeOf = THREE.PropertyBinding.sanitizeNodeName;
  if (!scene.getObjectByName(nodeOf(data.hipsNode))) return []; // otro esqueleto: se queda sin ellos
  return Object.entries(data.clips).map(([name, c]) => {
    const tracks = Object.entries(c.rot).map(([bone, q]) => new THREE.QuaternionKeyframeTrack(nodeOf(bone) + '.quaternion', c.times, q));
    tracks.push(new THREE.VectorKeyframeTrack(nodeOf(data.hipsNode) + '.position', c.times, c.hipsPos));
    return new THREE.AnimationClip(name, c.duration, tracks);
  });
}

export class Avatar {
  constructor(gltf, opts = {}) {
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false;
        o.frustumCulled = false;
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => { m.transparent = false; m.alphaTest = 0; m.depthWrite = true; if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.2); });
        }
      }
    });
    this.inner.add(model);
    this.model = model;
    // normalize size + feet on the ground
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const target = opts.height || 1.5;
    const s = target / h;
    model.scale.multiplyScalar(s);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    model.position.y -= box.min.y - FOOT_LIFT;
    model.position.x -= (box.min.x + box.max.x) / 2;
    model.position.z -= (box.min.z + box.max.z) / 2;
    model.updateMatrixWorld(true);
    this.bones = findBones(model);
    // pose de reposo (bind pose) del esqueleto: es el standby estático (columna, cuello y cabeza rectos, pies planos)
    this.restPose = new Map(this.bones.all.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
    this.spineChain = ['spine', 'spine01', 'spine02'].map((n) => this.bones.all.find((b) => stripName(b.name) === n)).filter(Boolean);
    // detect facing from foot->toe direction
    let yaw = opts.yaw ?? null;
    if (yaw === null) {
      const f = this.bones.L.foot, t = this.bones.L.toe;
      const lu = this.bones.L.upLeg, ru = this.bones.R.upLeg;
      if (lu && ru) {
        // eje de caderas (izq - der): simétrico; el toe-out de los pies no debe torcer el frente
        const l = lu.getWorldPosition(new THREE.Vector3()).sub(ru.getWorldPosition(new THREE.Vector3()));
        yaw = Math.hypot(l.x, l.z) > 1e-6 ? Math.atan2(l.z, l.x) : 0;
      } else if (f && t) {
        const a = f.getWorldPosition(new THREE.Vector3()), b = t.getWorldPosition(new THREE.Vector3());
        const d = b.sub(a);
        d.y = 0;
        yaw = d.lengthSq() > 1e-6 ? -Math.atan2(d.x, d.z) : 0;
      } else yaw = 0;
    }
    this.inner.rotation.y = yaw;
    // rest (bind-pose) orientation of neck/head relative to the avatar root: used to keep the head upright
    this.bones.neck = this.bones.all.find((b) => /neck/.test(stripName(b.name)));
    this.root.updateMatrixWorld(true);
    const rInv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.headRest = {};
    for (const k of ['neck', 'head']) {
      const b = this.bones[k];
      if (b) this.headRest[k] = rInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
    }
    // clips
    this.mixer = new THREE.AnimationMixer(model);
    const clips = (gltf.animations || []).map((c) => c.clone());
    const hipsName = this.bones.hips ? this.bones.hips.name : null;
    // Idle conserva el balanceo de cadera: fijarlo haría deslizar los pies
    for (const c of clips) if (!/idle|stand/i.test(c.name)) this._inPlace(c, hipsName);
    const find = (re) => clips.find((c) => re.test(c.name));
    this.clips = {
      walk: find(/walk/i) || clips[0],
      idle: find(/idle|stand/i),
      run: find(/run|sprint/i),
      jump: find(/jump/i),
      cheer: find(/cheer|victory|dance|wave/i),
      swim: find(/^swim$/i),
      tread: find(/^swimtread$/i),
    };
    if (this.clips.jump) this._clampJumpY(this.clips.jump, hipsName);
    this.hasLimbs = !!(this.bones.L.upLeg && this.bones.R.upLeg && this.bones.L.arm && this.bones.R.arm);
    this.t = 0;
    this._setupActions();
  }
  _inPlace(clip, hipsName) {
    for (const tr of clip.tracks) {
      if (!tr.name.endsWith('.position')) continue;
      const node = tr.name.slice(0, -'.position'.length);
      const isRoot = (hipsName && node === hipsName) || /hips|pelvis|root/i.test(node);
      if (!isRoot) continue;
      const v = tr.values;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  _clampJumpY(clip, hipsName) {
    for (const tr of clip.tracks) {
      if (!tr.name.endsWith('.position')) continue;
      const node = tr.name.slice(0, -'.position'.length);
      if (!((hipsName && node === hipsName) || /hips|pelvis/i.test(node))) continue;
      const v = tr.values, y0 = v[1];
      for (let i = 1; i < v.length; i += 3) v[i] = Math.min(v[i], y0 + 0.02);
    }
  }
  _footDist() {
    const a = this.bones.L.foot, b = this.bones.R.foot;
    if (!a || !b) return 0;
    this.model.updateMatrixWorld(true);
    return a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
  }
  _setupActions() {
    const c = this.clips, m = this.mixer;
    this.act = {};
    const walk = c.walk;
    if (!walk) return;
    // find idle-ish (feet together) and leap (max stride) frames in the walk cycle
    let tIdle = 0, tLeap = 0, dMin = 1e9, dMax = -1;
    const probe = m.clipAction(walk);
    probe.play();
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * walk.duration;
      probe.time = t;
      m.update(0);
      const d = this._footDist();
      if (d < dMin) { dMin = d; tIdle = t; }
      if (d > dMax) { dMax = d; tLeap = t; }
    }
    this.act.walk = probe;
    const hold = (name, t) => {
      const cl = walk.clone();
      cl.name = name;
      const a = m.clipAction(cl);
      a.play();
      a.time = t;
      a.timeScale = 0;
      return a;
    };
    this.act.idle = c.idle ? m.clipAction(c.idle) : hold('idle_p', tIdle);
    this.act.run = c.run ? m.clipAction(c.run) : null;
    this.act.air = c.jump ? m.clipAction(c.jump) : hold('air_p', tLeap);
    this.act.cheer = c.cheer ? m.clipAction(c.cheer) : null;
    this.act.swim = c.swim ? m.clipAction(c.swim) : null;
    this.act.tread = c.tread ? m.clipAction(c.tread) : null;
    for (const k in this.act) if (this.act[k]) { this.act[k].play(); this.act[k].setEffectiveWeight(0); }
    this.act.idle.setEffectiveWeight(1);
    // capture idle pose for exaggeration
    this.mixer.update(0);
    this.idlePose = new Map();
    for (const b of this.bones.all) this.idlePose.set(b, b.quaternion.clone());
    this.realJump = !!c.jump;
    this.w = { idle: 1, walk: 0, run: 0, air: 0, cheer: 0, swim: 0, tread: 0 };
    this.swimLift = 0;
  }
  // rotate bone around an axis expressed in avatar-root space
  _rot(bone, axis, angle) {
    if (!bone || !bone.parent || Math.abs(angle) < 1e-4) return;
    bone.parent.updateWorldMatrix(true, false);
    const pw = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const axW = axis.clone().applyQuaternion(rootQ);
    const dW = new THREE.Quaternion().setFromAxisAngle(axW, angle);
    const dL = pw.clone().invert().multiply(dW).multiply(pw);
    bone.quaternion.premultiply(dL);
  }
  // pull a bone's world orientation toward its upright rest orientation (relative to the avatar root)
  _steady(bone, rest, w) {
    if (!bone || !rest || !bone.parent || w <= 0.001) return;
    bone.parent.updateWorldMatrix(true, false);
    const desired = _hb.copy(this.root.getWorldQuaternion(_ha)).multiply(rest);
    const pw = bone.parent.getWorldQuaternion(_hc);
    const cur = _hd.copy(pw).multiply(bone.quaternion);
    cur.slerp(desired, w);
    bone.quaternion.copy(pw.invert().multiply(cur));
  }
  _steadyHead() {
    const W = this.w || { idle: 1, walk: 0, run: 0, air: 0, cheer: 0 };
    const w = Math.min(0.92, 0.7 * (W.walk + W.run) + 0.55 * W.air + 0.4 * W.cheer);
    this._steady(this.bones.neck, this.headRest.neck, w * 0.6);
    this._steady(this.bones.head, this.headRest.head, w);
  }
  // caminar/correr: gira cada pie sobre el eje de la pierna para que la punta apunte al frente
  _feetForward(W) {
    const rq = this.root.getWorldQuaternion(_ha).invert();
    for (const [sd, sg, tw, tr] of [[this.bones.L, 1, WALK_TOE_L, RUN_TOE_L], [this.bones.R, -1, WALK_TOE_R, RUN_TOE_R]]) {
      const a = (W.walk * tw + W.run * tr) * (1 - W.air);
      if (!sd.leg || !sd.foot || a < 1e-3) continue;
      const shin = sd.foot.getWorldPosition(new THREE.Vector3()).sub(sd.leg.getWorldPosition(new THREE.Vector3())).applyQuaternion(rq).normalize();
      this._rot(sd.foot, shin, sg * a);
    }
  }
  update(dt, s) {
    if (STATIC_POSE) {
      for (const [b, r] of this.restPose) { b.quaternion.copy(r.q); b.position.copy(r.p); }
      return;
    }
    this.t += dt;
    const A = this.act;
    if (!A.walk) return;
    const speed = s.speed;
    const ground = s.grounded;
    // target weights
    let wIdle = 1 - smoothstep(0.15, 1.4, speed);
    let wRun = A.run ? smoothstep(3.4, 5.6, speed) : 0;
    let wWalk = Math.max(0, 1 - wIdle - wRun);
    let wAir = ground ? 0 : 1;
    let wCheer = s.cheer ? 1 : 0;
    if (wAir > 0) { wIdle *= 0; wWalk *= 0; wRun *= 0; }
    if (wCheer > 0 && A.cheer) { wIdle = wWalk = wRun = wAir = 0; }
    // en el agua: flotar quieto o nadar según la velocidad, si el modelo tiene esos clips
    const inWater = s.swimming && A.swim && A.tread;
    const wSwim = inWater ? smoothstep(0.25, 1.6, speed) : 0, wTread = inWater ? 1 - wSwim : 0;
    if (inWater) { wIdle = wWalk = wRun = wAir = wCheer = 0; }
    const k = 12;
    const W = this.w;
    W.idle = damp(W.idle, wIdle, k, dt);
    W.walk = damp(W.walk, wWalk, k, dt);
    W.run = damp(W.run, wRun, k, dt);
    W.air = damp(W.air, wAir, ground ? 14 : 18, dt);
    W.cheer = damp(W.cheer, A.cheer ? wCheer : 0, 8, dt);
    W.swim = damp(W.swim, wSwim, 8, dt);
    W.tread = damp(W.tread, wTread, 8, dt);
    A.idle.setEffectiveWeight(W.idle);
    A.walk.setEffectiveWeight(W.walk + (A.run ? 0 : 0));
    if (A.run) A.run.setEffectiveWeight(W.run);
    A.air.setEffectiveWeight(W.air);
    if (A.cheer) A.cheer.setEffectiveWeight(W.cheer);
    if (A.swim) {
      A.swim.setEffectiveWeight(W.swim);
      A.tread.setEffectiveWeight(W.tread);
      A.swim.timeScale = clamp(speed / 3.41, 0.7, 2) * 3.75; // brazada 3 veces más rápida que el ajuste anterior (1.25)
    }
    this.swimLift = W.swim * SWIM_LIFT; // al ir tendido, el cuerpo sube para dejar la cabeza fuera del agua
    // sync playback rates to ground speed (anti foot-sliding)
    const procRun = !A.run;
    if (procRun) {
      // walk clip drives everything; speed it up for running
      A.walk.timeScale = clamp(speed / 1.35, 0.6, 2.9) * (speed > 4 ? 0.82 : 1);
      if (wIdle > 0.99) A.walk.timeScale = 1;
      A.walk.setEffectiveWeight(Math.max(W.walk, 1 - W.idle - W.air - W.cheer));
    } else {
      // avance real de cada clip a la escala del juego: Walk ~1,19 m/s, Run ~3,94 m/s
      A.walk.timeScale = clamp(speed / 1.19, 0.6, 2.4);
      A.run.timeScale = clamp(speed / 3.94, 0.8, 2.5);
    }
    if (this.realJump) {
      // play jump: rise portion, hold near apex, finish on landing
      const d = A.air.getClip().duration;
      if (!ground) {
        if (!this._inAir) { A.air.reset(); A.air.time = d * JUMP_TAKEOFF; this._inAir = true; }
        A.air.timeScale = A.air.time > d * JUMP_LAND ? 0 : JUMP_RATE;
      } else if (this._inAir) { this._inAir = false; A.air.time = Math.max(A.air.time, d * JUMP_LAND); A.air.timeScale = 1.6; }
    }
    this.mixer.update(dt);
    this._feetForward(W);
    if (CLIPS_ONLY) return;
    // standby: pose de reposo del esqueleto, sin animación (se desvanece al caminar con W.idle)
    if (W.idle > 0.001) for (const [b, r] of this.restPose) { b.quaternion.slerp(r.q, W.idle); b.position.lerp(r.p, W.idle); }
    // salto (referencia): en el aire, piernas, brazos y columna parten de la pose de reposo; encima se aplica la pose de vuelo
    if (W.air > 0.001 && this.hasLimbs) {
      for (const b of [...airBones(this.bones), ...this.spineChain]) { const r = this.restPose.get(b); if (r) b.quaternion.slerp(r.q, W.air); }
    }
    // correr: torso rígido (columna en su pose de reposo respecto a la cadera) para que el pecho no se deforme
    if (W.run > 0.001) for (const b of this.spineChain) b.quaternion.slerp(this.restPose.get(b).q, W.run * (1 - W.air));
    // ---- procedural layers
    if (!this.hasLimbs) { this._steadyHead(); return; }
    const B = this.bones;
    const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
    const runBlend = smoothstep(3.0, 7.5, speed) * (1 - W.air);
    if (procRun && runBlend > 0.01) {
      const kx = 1 + 0.55 * runBlend;
      for (const sd of [B.L, B.R]) for (const bn of [sd.upLeg, sd.leg, sd.arm, sd.foreArm]) {
        if (!bn) continue;
        const ip = this.idlePose.get(bn);
        if (ip) extrap(bn.quaternion, ip, bn.quaternion, kx);
      }
      // bend elbows when running
      this._rot(B.L.foreArm, X, -0.9 * runBlend);
      this._rot(B.R.foreArm, X, -0.9 * runBlend);
    }
    // forward lean with speed / sprint
    const lean = ((0.04 + 0.16 * runBlend) * (1 - W.air) + s.accelLean) * (1 - W.run);
    this._rot(B.spine || B.hips, X, lean);
    // correr: el clip inclina desde la cadera (~50°). Se corrige ahí, con el torso rígido, y se contrarrotan las piernas
    // para que su movimiento siga idéntico al del clip
    if (W.run > 0.001 && B.hips && B.head) {
      this.root.updateMatrixWorld(true);
      const rq = this.root.getWorldQuaternion(_ha).invert();
      const d = B.head.getWorldPosition(_v).sub(B.hips.getWorldPosition(new THREE.Vector3())).applyQuaternion(rq);
      const dp = (Math.atan2(d.z, d.y) - RUN_TORSO_LEAN) * W.run * (1 - W.air);
      this._rot(B.hips, X, -dp);
      this._rot(B.L.upLeg, X, dp);
      this._rot(B.R.upLeg, X, dp);
    }
    // caminar/correr: el brazo no pasa de ARM_MAX respecto al eje del torso (hacia adelante ni hacia atrás)
    const wArm = (W.walk + W.run) * (1 - W.air);
    if (wArm > 0.001 && B.hips && B.chest) {
      for (const [sd, sg] of [[B.L, 1], [B.R, -1]]) {
        if (!sd.arm || !sd.foreArm) continue;
        this.root.updateMatrixWorld(true);
        const rq = this.root.getWorldQuaternion(_ha).invert();
        const pos = (b) => b.getWorldPosition(new THREE.Vector3()).applyQuaternion(rq);
        let a = pos(sd.foreArm).sub(pos(sd.arm)).normalize();
        const dn = pos(B.hips).sub(pos(B.chest)).normalize();
        // piso lateral: en el plano frontal del torso el brazo no baja de ARM_MIN_SIDE hacia afuera (vuelve al eje de standby, nunca hacia adentro)
        const out = new THREE.Vector3(sg, 0, 0).addScaledVector(dn, -sg * dn.x).normalize();
        const side = Math.atan2(a.dot(out), a.dot(dn));
        if (side < ARM_MIN_SIDE) {
          this._rot(sd.arm, dn.clone().cross(out).normalize(), (ARM_MIN_SIDE - side) * wArm);
          this.root.updateMatrixWorld(true);
          a = pos(sd.foreArm).sub(pos(sd.arm)).normalize();
        }
        const ang = Math.acos(clamp(a.dot(dn), -1, 1));
        if (ang > ARM_MAX) this._rot(sd.arm, a.clone().cross(dn).normalize(), (ang - ARM_MAX) * wArm);
      }
    }
    // correr: la inclinación lateral del antebrazo (codo→mano) depende del balanceo del brazo: adelante al centro, en la columna y atrás hacia afuera
    const wIn = W.run * (1 - W.air);
    if (wIn > 0.001) {
      this._hands ??= { L: B.all.find((b) => stripName(b.name) === 'lefthand'), R: B.all.find((b) => stripName(b.name) === 'righthand') };
      for (const [sd, hand, sg] of [[B.L, this._hands.L, 1], [B.R, this._hands.R, -1]]) {
        if (!sd.foreArm || !hand) continue;
        this.root.updateMatrixWorld(true);
        const rq = this.root.getWorldQuaternion(_ha).invert();
        const pos = (b) => b.getWorldPosition(new THREE.Vector3()).applyQuaternion(rq);
        const f = pos(hand).sub(pos(sd.foreArm)).normalize();
        const axis = f.clone().cross(new THREE.Vector3(-sg, 0, 0));
        if (axis.lengthSq() < 1e-8) continue;
        const inward = Math.asin(clamp(-f.x * sg, -1, 1));
        // balanceo adelante-atrás del brazo respecto a la columna (0 = alineado con el torso, + = adelante)
        const dn = pos(B.hips).sub(pos(B.chest)).normalize();
        const fw = new THREE.Vector3(0, 0, 1).addScaledVector(dn, -dn.z).normalize();
        const u = pos(sd.foreArm).sub(pos(sd.arm)).normalize();
        const swing = Math.atan2(u.dot(fw), u.dot(dn));
        // adelante: hacia el centro; en la columna y hacia atrás: hacia afuera (la mano se aleja del cuerpo)
        const t = clamp(swing / RUN_HAND_BLEND, 0, 1);
        const target = -RUN_HAND_OUTWARD + (RUN_HAND_INWARD + RUN_HAND_OUTWARD) * t;
        // se suaviza el objetivo para que el cambio afuera↔adentro no sea un salto de 1-2 frames
        this._hT ??= {};
        const hk = sd === B.L ? 'L' : 'R';
        this._hT[hk] = this._hT[hk] === undefined ? target : damp(this._hT[hk], target, 10, dt);
        this._rot(sd.foreArm, axis.normalize(), (this._hT[hk] - inward) * wIn);
      }
    }
    // salto (referencia): vuelo con torso erguido, rodillas flexionadas ~50° y pies recogidos bajo la cadera,
    // brazos abiertos ~45° del torso con codos ligeramente flexionados
    if (W.air > 0.01 && this.hasLimbs) {
      const a = W.air;
      this._rot(B.L.upLeg, X, -AIR_THIGH * a);
      this._rot(B.R.upLeg, X, -(AIR_THIGH - 0.1) * a);
      this._rot(B.L.leg, X, AIR_KNEE * a);
      this._rot(B.R.leg, X, (AIR_KNEE + 0.1) * a);
      this._rot(B.L.arm, Z, AIR_ARM * a);
      this._rot(B.R.arm, Z, -AIR_ARM * a);
      this._rot(B.L.foreArm, X, -AIR_ELBOW * a);
      this._rot(B.R.foreArm, X, -AIR_ELBOW * a);
    }
    // air pose for the procedural jump: tuck legs, arms out
    if (!this.realJump && W.air > 0.01) {
      const up = s.vy > 0 ? 1 : 0.6;
      this._rot(B.L.upLeg, X, -0.55 * W.air * up);
      this._rot(B.R.upLeg, X, -0.2 * W.air);
      this._rot(B.L.leg, X, 0.9 * W.air);
      this._rot(B.R.leg, X, 0.6 * W.air);
      this._rot(B.L.arm, Z, 0.75 * W.air);
      this._rot(B.R.arm, Z, -0.75 * W.air);
    }
    // standby: brazos pegados al cuerpo (la pose de reposo es una A-pose con los brazos ~30° separados)
    this._rot(B.L.arm, Z, -0.44 * W.idle);
    this._rot(B.R.arm, Z, 0.44 * W.idle);
    // procedural cheer
    if (!A.cheer && s.cheer) {
      const c = 1;
      const wave = Math.sin(this.t * 9) * 0.25;
      this._rot(B.L.arm, Z, (2.3 + wave) * c);
      this._rot(B.R.arm, Z, -(2.3 - wave) * c);
      this._rot(B.L.foreArm, Z, 0.3 * c);
      this._rot(B.R.foreArm, Z, -0.3 * c);
      this._rot(B.spine || B.hips, X, -0.12 * c);
    }
    // keep the head upright (generated idle clips tend to droop the head)
    this._steadyHead();
    // landing squash handled by controller via root scale
  }
}

const SMOKE_TONES = [0x8f8a84, 0xa0917f, 0x7d6e5f, 0x6b5644]; // humo de sprint: grises y cafés

// Simple dust particles
class Dust {
  constructor(scene, tex) {
    this.pool = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xf7ecd2 }));
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, life: 0, size: 1, alpha: 0.55, v: new THREE.Vector3() });
    }
    this.i = 0;
  }
  // bocanada de humo detrás del jugador; (dx,dz) es la dirección unitaria de su movimiento
  puff(pos, dx, dz) {
    const p = this.pool[this.i++ % this.pool.length];
    p.life = 1;
    p.size = 1;
    p.alpha = 0.8;
    p.s.visible = true;
    p.s.material.color.setHex(SMOKE_TONES[Math.floor(Math.random() * SMOKE_TONES.length)]);
    p.s.position.set(pos.x - dx * 0.35 + (Math.random() - 0.5) * 0.15, pos.y + 0.2, pos.z - dz * 0.35 + (Math.random() - 0.5) * 0.15);
    p.v.set(-dx * 0.6 + (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.4, -dz * 0.6 + (Math.random() - 0.5) * 0.3);
  }
  emit(pos, n = 4, spread = 1.2, up = 1) {
    for (let k = 0; k < n; k++) {
      const p = this.pool[this.i++ % this.pool.length];
      p.life = 1;
      p.size = 1;
      p.alpha = 0.55;
      p.s.material.color.setHex(0xf7ecd2);
      p.s.visible = true;
      p.s.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.15, pos.z + (Math.random() - 0.5) * 0.4);
      p.v.set((Math.random() - 0.5) * spread, Math.random() * up, (Math.random() - 0.5) * spread);
    }
  }
  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.8;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar((0.4 + (1 - p.life) * 1.2) * p.size);
      p.s.material.opacity = Math.max(0, p.life) * p.alpha;
      if (p.life <= 0) p.s.visible = false;
    }
  }
}

export class Player {
  constructor(scene, colliders, avatar, audio, dustTex) {
    this.scene = scene;
    this.col = colliders;
    this.avatar = avatar;
    this.audio = audio;
    this.pos = new THREE.Vector3(SPAWN.x, heightAt(SPAWN.x, SPAWN.z) + 0.3, SPAWN.z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI; // face north
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.airTime = 0;
    this.landSquash = 0;
    this.cheer = 0;
    this.stepAcc = 0;
    this.smokeAcc = 0;
    this.safe = this.pos.clone();
    this.groundKind = 'terrain';
    this.dust = new Dust(scene, dustTex);
    this.frozen = false;
    this.stats = { dashes: 0, jumps: 0, dist: 0 };
    scene.add(avatar.root);
    this.accelLean = 0;
    this.indoor = false;
    this.killY = -12;
  }
  groundAt(x, z, feetY) {
    let th = this.indoor ? -Infinity : heightAt(x, z);
    if (th < SWIM_Y && !this.indoor && canSwim(x, z)) th = SWIM_Y; // en el río se flota, no se hunde
    const sh = this.col.supportHeight(x, z, feetY, P.step, _list);
    if (sh > th) { this.groundKind = 'collider'; return sh; }
    this.groundKind = 'terrain';
    return th;
  }
  respawn(p) {
    this.pos.copy(p || this.safe);
    this.vel.set(0, 0, 0);
  }
  update(dt, input, camYaw) {
    dt = Math.min(dt, 0.05);
    const mv = this.frozen ? { x: 0, y: 0 } : input.move;
    const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
    const rgtX = Math.cos(camYaw), rgtZ = -Math.sin(camYaw);
    let wx = fwdX * mv.y + rgtX * mv.x;
    let wz = fwdZ * mv.y + rgtZ * mv.x;
    const mag = Math.min(1, Math.hypot(wx, wz));
    if (mag > 0.001) { const l = Math.hypot(wx, wz); wx /= l; wz /= l; }
    const analogWalk = mag < 0.55;
    const sprint = input.sprint && !this.frozen && !this.swimming;
    const targetSpeed = (mag < 0.05 ? 0 : (sprint ? P.sprint : (analogWalk ? P.walk + (P.run - P.walk) * smoothstep(0.25, 0.55, mag) : P.run))) * (this.swimming ? P.swim * (input.sprint ? P.swimSprint : 1) : 1);
    // timers
    if (!this.frozen && input.consume('jump')) this.jumpBuf = 0.14;
    this.jumpBuf -= dt;
    this.coyote -= dt;
    this.dashCd -= dt;
    // dash
    if (!this.frozen && input.consume('dash') && this.dashCd <= 0) {
      const dx = mag > 0.05 ? wx : Math.sin(this.yaw), dz = mag > 0.05 ? wz : Math.cos(this.yaw);
      this.vel.x = dx * P.dashV; this.vel.z = dz * P.dashV;
      if (!this.grounded) this.vel.y = Math.max(this.vel.y, 1.5);
      this.dashT = P.dashT; this.dashCd = P.dashCd * (this.dashCdMul || 1);
      this.stats.dashes++;
      this.audio && this.audio.play('dash');
      this.dust.emit(this.pos, 6, 2, 0.6);
    }
    // horizontal velocity
    const hv = _v.set(this.vel.x, 0, this.vel.z);
    if (this.dashT > 0) {
      this.dashT -= dt;
    } else {
      const tx = wx * targetSpeed, tz = wz * targetSpeed;
      const acc = this.grounded ? (targetSpeed > hv.length() ? P.accG : P.decG) : P.accA;
      const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
      const dl = Math.hypot(dvx, dvz);
      const stepMax = acc * dt;
      if (dl <= stepMax) { this.vel.x = tx; this.vel.z = tz; }
      else { this.vel.x += (dvx / dl) * stepMax; this.vel.z += (dvz / dl) * stepMax; }
      this.accelLean = damp(this.accelLean, clamp((targetSpeed - hv.length()) * 0.02, -0.08, 0.1), 6, dt);
    }
    // proposed move
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const next = { x: nx, z: nz };
    // steep slope / deep water blocking (terrain only)
    const tNext = heightAt(nx, nz);
    const blockedWater = tNext < -1.15 && !canSwim(nx, nz);
    const sl = slopeAt(nx, nz);
    const uphill = this.vel.x * sl.dx + this.vel.z * sl.dz > 0;
    const supNext = this.col.supportHeight(nx, nz, this.pos.y, P.step, _list);
    if (!this.indoor && supNext < tNext - 0.05) {
      if ((sl.m > P.maxSlope && uphill && tNext > this.pos.y + 0.25) || blockedWater) {
        // project out the blocked component
        const gl = Math.hypot(sl.dx, sl.dz) || 1;
        let gx = sl.dx / gl, gz = sl.dz / gl;
        if (blockedWater) { // water: push back toward land
          const back = slopeAt(this.pos.x, this.pos.z);
          const bl = Math.hypot(back.dx, back.dz) || 1;
          gx = -back.dx / bl; gz = -back.dz / bl;
        }
        const dot = this.vel.x * gx + this.vel.z * gz;
        if (dot > 0) { this.vel.x -= gx * dot; this.vel.z -= gz * dot; }
        next.x = this.pos.x + this.vel.x * dt;
        next.z = this.pos.z + this.vel.z * dt;
        if (heightAt(next.x, next.z) < -1.15 && !canSwim(next.x, next.z)) { next.x = this.pos.x; next.z = this.pos.z; }
      }
    }
    // world bounds
    const r = Math.hypot(next.x, next.z);
    if (!this.indoor && r > 240) { next.x *= 240 / r; next.z *= 240 / r; }
    // collide with solids
    this.col.resolve(next, this.pos.y, P.height, P.radius, P.step, _list);
    this.pos.x = next.x; this.pos.z = next.z;
    // vertical
    let g = P.grav;
    if (this.vel.y > 0 && !input.jumpHeld) g *= 2.1;
    if (this.vel.y < 0) g *= 1.25;
    if (this.dashT > 0) g *= 0.25;
    this.vel.y = Math.max(this.vel.y - g * dt, -P.maxFall);
    // jump
    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
      this.vel.y = P.jumpV;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.stats.jumps++;
      this.audio && this.audio.play('jump');
      this.dust.emit(this.pos, 5, 1.6, 0.8);
    }
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    // head bump on ceilings (rare): ignore
    const gy = this.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    const wasGrounded = this.grounded;
    if (this.pos.y <= gy) {
      if (!wasGrounded && this.airTime > 0.18) {
        const impact = -this.vel.y;
        this.landSquash = clamp(impact / 22, 0.15, 0.6);
        this.audio && this.audio.play('land', clamp(impact / 20, 0.3, 1));
        this.dust.emit(this.pos, Math.round(4 + impact / 3), 2.2, 0.9);
        this.onLand && this.onLand(impact);
      }
      this.pos.y = gy;
      this.vel.y = Math.max(this.vel.y, 0) === 0 ? 0 : this.vel.y;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
    } else if (wasGrounded && this.vel.y <= 0 && this.pos.y - gy < 0.6) {
      // stick to slopes / steps going down
      this.pos.y = gy;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      if (wasGrounded) this.coyote = 0.13;
      this.grounded = false;
    }
    if (this.grounded) {
      this.airTime = 0;
      if (gy > -0.6 && this.groundKind !== 'platform') {
        const ss = slopeAt(this.pos.x, this.pos.z);
        if (this.groundKind === 'collider' || ss.m < 0.9) this.safe.set(this.pos.x, this.pos.y + 0.2, this.pos.z);
      }
    } else this.airTime += dt;
    // fell into the void / deep water
    if (this.pos.y < this.killY) { this.respawn(); this.onRespawn && this.onRespawn(); }
    // facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.35 && !this.frozen) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), this.grounded ? 13 : 6, dt);
    if (this.faceTarget) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.faceTarget.x - this.pos.x, this.faceTarget.z - this.pos.z), 8, dt);
    }
    // footsteps + run dust
    if (this.grounded && hs > 0.8) {
      this.stepAcc += hs * dt;
      this.stats.dist += hs * dt;
      const stride = hs > 5 ? 1.55 : 1.0;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        if (!this.swimming) this.audio && this.audio.play('step', clamp(hs / 9, 0.25, 0.8));
      }
      // estela de humo solo en sprint
      if (sprint && hs > 7) {
        this.smokeAcc += hs * dt;
        if (this.smokeAcc > 0.4) {
          this.smokeAcc = 0;
          this.dust.puff(this.pos, this.vel.x / hs, this.vel.z / hs);
        }
      }
    }
    this.dust.update(dt);
    // avatar transform
    const root = this.avatar.root;
    root.position.copy(this.pos);
    // nadando: flota con un leve vaivén
    this.swimming = !this.indoor && this.grounded && this.pos.y <= SWIM_Y + 0.02 && heightAt(this.pos.x, this.pos.z) < SWIM_Y && canSwim(this.pos.x, this.pos.z);
    if (this.swimming) root.position.y += Math.sin(performance.now() * 0.004) * 0.05;
    root.position.y += this.avatar.swimLift || 0;
    root.rotation.y = this.yaw;
    this.landSquash = damp(this.landSquash, 0, 9, dt);
    const sq = this.landSquash;
    root.scale.set(1 + sq * 0.25, 1 - sq * 0.35, 1 + sq * 0.25);
    if (this.cheer > 0) this.cheer -= dt;
    this.speed = hs;
    this.avatar.update(dt, {
      speed: this.frozen ? 0 : hs, grounded: this.grounded, vy: this.vel.y, sprinting: sprint && hs > 7, swimming: this.swimming,
      cheer: this.cheer > 0, accelLean: this.accelLean,
    });
  }
}
