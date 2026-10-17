// NeuroAventura — Misión Señal Vital: stations, dialogue, rewards and final neuron assembly.
import * as THREE from 'three';
import { PADS, heightAt } from './terrain.js';
import { holoMaterial } from './districts.js';
import { buildBrain, PART_INFO } from './neuroparts.js';
import { makeSign, softSpriteTexture, roundRect, damp } from './util.js';

const N = PADS.neuro;
const Y = N.h;

export const LABELS = [];
const _lp = new THREE.Vector3();
export function fadeLabels(cam) {
  for (const l of LABELS) {
    if (!l.visible) continue;
    l.getWorldPosition(_lp);
    const d = _lp.distanceTo(cam.position);
    const o = Math.min(1, Math.max(0, (d - 2.2) / 3.5)) * (1 - Math.min(1, Math.max(0, (d - 40) / 15)));
    l.material.opacity = o;
    l.material.visible = o > 0.01;
  }
}
export function labelSprite(lines, color = '#35e0ff', w = 3.2, emoji = '') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,22,44,0.88)';
  roundRect(g, 6, 6, 500, 244, 44); g.fill();
  g.lineWidth = 8; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 18; g.stroke(); g.shadowBlur = 0;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (emoji) {
    g.font = '110px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText(emoji, 110, 128);
  }
  const cx = emoji ? 310 : 256;
  g.fillStyle = '#fff';
  g.font = `900 ${lines.length > 1 ? 54 : 64}px Nunito, system-ui, sans-serif`;
  lines.forEach((ln, i) => g.fillText(ln, cx, lines.length === 1 ? 128 : 92 + i * 76, emoji ? 360 : 470));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sp.scale.set(w, w / 2, 1);
  LABELS.push(sp);
  return sp;
}

function ringPad(color, r = 1.6) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.15, 0.24, 36), new THREE.MeshStandardMaterial({ color: 0xf1f5f8, roughness: 0.4 }));
  base.position.y = 0.12;
  base.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.12, 0.07, 6, 48), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.26;
  g.add(base, ring);
  g.userData.ring = ring;
  return g;
}

function setGlow(obj, color, intensity) {
  obj.traverse((o) => { if (o.material && o.material.emissive) { o.material.emissive.set(color); o.material.emissiveIntensity = intensity; } });
}

export class Mission {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene } = ctx;
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.holoMats = [];
    this.anim = [];
    this.carry = null;
    this.t = 0;
    this.glowTex = softSpriteTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    this.idleHintT = 0;
    this.lockedSeen = {};
    const s = ctx.save.data;
    s.stations = s.stations || {};
    s.parts = s.parts || {};
    s.placed = s.placed || {};
    s.stage = s.stage || 'intro';
    this._buildDomeContent();
    this.busy = false;
  }
  get S() { return this.ctx.save.data; }

  // ------------------------------------------------------------- build
  _buildDomeContent() {
    const d = this.ctx.dome;
    this.dome = d;
    // central brain hologram (fades when assembling)
    const bm = holoMaterial(0x35e0ff, { intensity: 1.0, lines: 26 });
    const bm2 = holoMaterial(0x7fd6ff, { intensity: 0.9, lines: 26 });
    this.holoMats.push(bm, bm2);
    const brain = buildBrain(bm, bm2);
    brain.scale.setScalar(3.1);
    brain.position.set(d.x, d.y + 5.6, d.z);
    this.root.add(brain);
    this.bigBrain = brain;
    this.anim.push((t) => { brain.rotation.y = t * 0.2; brain.position.y = d.y + 5.6 + Math.sin(t * 0.9) * 0.2; });
    // neuron assembly (ghost + real parts)
    const nGroup = new THREE.Group();
    nGroup.position.set(d.x, d.y + 6.2, d.z - 2.4);
    nGroup.scale.setScalar(0.95);
    nGroup.visible = false;
    this.root.add(nGroup);
    this.neuron = nGroup;
    this.ghosts = {};
    this.realParts = {};
    for (const key of Object.keys(PART_INFO)) {
      const info = PART_INFO[key];
      const gm = holoMaterial(info.color === 0xffffff ? 0x9fdcff : info.color, { intensity: 0.45, lines: 18 });
      this.holoMats.push(gm);
      const ghost = info.build(gm);
      ghost.position.z = info.z;
      nGroup.add(ghost);
      this.ghosts[key] = ghost;
      const real = info.build();
      real.position.z = info.z;
      real.visible = false;
      nGroup.add(real);
      this.realParts[key] = real;
    }
    // placement slots on the floor around pedestal
    const slotKeys = ['dendritas', 'soma', 'axon', 'sinapsis'];
    this.slots = slotKeys.map((key, i) => {
      const a = -0.95 + (i / 3) * 1.9; // arc facing the entrance (+x)
      const sx = d.x + Math.cos(a) * 7.6, sz = d.z + Math.sin(a) * 7.6;
      const pad = ringPad(PART_INFO[key].color === 0xffffff ? 0x9fdcff : PART_INFO[key].color, 1.3);
      pad.position.set(sx, d.y + 0.02, sz);
      pad.visible = false;
      this.root.add(pad);
      const lab = labelSprite([PART_INFO[key].name], '#' + new THREE.Color(PART_INFO[key].color === 0xffffff ? 0x9fdcff : PART_INFO[key].color).getHexString(), 2.4);
      lab.position.set(sx, d.y + 2.3, sz);
      lab.visible = false;
      this.root.add(lab);
      return { key, pad, lab, pos: new THREE.Vector3(sx, d.y, sz) };
    });
    // signal pulse along neuron
    this.signal = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xfff3a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.signal.scale.setScalar(2.4);
    this.signal.visible = false;
    nGroup.add(this.signal);
    // network arcs to other places (revealed at the end)
    const targets = [[0, 20, 16], [-78, -108, 22], [46, -124, 20], [128, -18, 16], [-58, 94, 30]];
    this.arcs = targets.map(([x, z, h]) => {
      const a = new THREE.Vector3(d.x, d.y + 13, d.z), b = new THREE.Vector3(x, h + 8, z);
      const mid = a.clone().lerp(b, 0.5); mid.y += 40;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const m = holoMaterial(0xffd36b, { intensity: 1.6, lines: 2 });
      this.holoMats.push(m);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.35, 6), m);
      tube.geometry.setDrawRange(0, 0);
      tube.userData.total = tube.geometry.index.count;
      this.root.add(tube);
      return tube;
    });
    // fireworks pool
    this.sparks = [];
    for (let i = 0; i < 160; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      s.scale.setScalar(0.8);
      this.root.add(s);
      this.sparks.push({ s, v: new THREE.Vector3(), life: 0 });
    }
  }

  // ------------------------------------------------------------- helpers
  say(lines, opts = {}) {
    const { neurix, ui, player } = this.ctx;
    player.frozen = true;
    neurix.talking = false;
    const p = ui.say(lines, {
      onLine: (ln) => { neurix.setMood(ln.mood || 'normal'); if (ln.gesture) neurix.doGesture(ln.gesture, 2.2); neurix.talking = true; },
      onEnd: () => { neurix.talking = false; neurix.setMood('normal'); player.frozen = !!opts.keepFrozen; },
    });
    return p;
  }
  stageObjective() {
    const { ui } = this.ctx;
    const S = this.S;
    if (S.stage === 'intro') ui.setObjective('Ve a la Plaza Central', 'Alguien te está esperando…', { x: 0, z: 30 });
    else if (S.stage === 'toNeuro') ui.setObjective('Llega al Distrito Neuro', 'Cruza el portal dorado al oeste de la plaza', { x: -30, z: 20 });
    else if (S.stage === 'stations') {
      const A = this.ctx.arcade;
      const col = ['soma', 'axon', 'sinapsis', 'dendritas'].filter((p) => S.parts[p]).length;
      ui.setObjective('Entra a la Sala de Retos', `Cruza el portal verde · Piezas de neurona: ${col}/4`, A ? { x: A.door.x, z: A.door.z } : null);
    } else if (S.stage === 'final') {
      const placed = Object.keys(S.placed).length;
      ui.setObjective('Reconstruye la neurona', `Laboratorio Central · piezas colocadas ${placed}/4`, { x: this.dome.x, z: this.dome.z });
    } else if (S.stage === 'done') {
      ui.setObjective('¡Misión completada!', 'Explora la isla y encuentra todos los cristales', null);
    }
    this._updateMarkers();
    if (this.ctx.arcade && this.ctx.arcade.inside) this.ctx.arcade.objective();
  }
  // checklist shown under the active mission
  steps() {
    const S = this.S, st = S.stage;
    const order = ['intro', 'toNeuro', 'stations', 'final', 'done'];
    const at = order.indexOf(st);
    const done = ['soma', 'axon', 'sinapsis', 'dendritas'].filter((p) => S.parts[p]).length;
    const list = [
      { text: 'Habla con Neuri-X', done: at > 0 },
      { text: 'Llega al Distrito Neuro', done: at > 1 },
      { text: `Supera los niveles de la Sala de Retos (${done}/4)`, done: at > 2 },
      { text: 'Reconstruye la neurona', done: at > 3 },
    ];
    const cur = list.find((x) => !x.done);
    if (cur) cur.cur = true;
    return list;
  }
  hintText() {
    return {
      intro: 'La Plaza Central está al norte. ¡Sigue el camino de piedra!',
      toNeuro: 'El portal dorado al oeste de la plaza te lleva al Distrito Neuro. ¡Crúzalo!',
      stations: 'La Sala de Retos te espera: cruza el portal verde del Distrito Neuro.',
      final: 'Entra al domo de cristal y coloca las piezas sobre los círculos brillantes.',
      done: '¿Ya encontraste todos los cristales? ¡Algunos están en lugares secretos!',
    }[this.S.stage];
  }
  _updateMarkers() {
    const { ui } = this.ctx;
    const S = this.S;
    const m = [
      { x: 0, z: 20, color: '#ffffff', name: 'Plaza Central', size: 7 },
      { x: N.x, z: N.z, color: '#ffb020', name: 'Distrito Neuro', size: 8 },
      { x: -78, z: -108, color: '#8b5cf6', name: 'Distrito STEAM', size: 8 },
      { x: 46, z: -124, color: '#3b82f6', name: 'English (próx.)', size: 7 },
      { x: 128, z: -18, color: '#22c55e', name: 'Technology (próx.)', size: 7 },
      { x: -58, z: 94, color: '#ff8a3d', name: 'Mirador', size: 6 },
      { x: -109, z: -12, color: '#ff6fd8', name: 'Viaje al Cerebro', size: 6 },
    ];
    const A = this.ctx.arcade;
    if (A && A.mathDoor) m.push({ x: A.mathDoor.x, z: A.mathDoor.z, color: '#8b5cf6', name: 'Sala de Matemáticas', label: '∑', size: 8 });
    if (A && S.stage !== 'intro') m.push({ x: A.door.x, z: A.door.z, color: '#22c55e', name: 'Sala de Retos', label: '★', size: 9, edge: S.stage === 'stations' });
    ui.markers = m;
  }
  _fx(pos, color, n = 30, speed = 7) {
    let c = 0;
    for (const sp of this.sparks) {
      if (sp.life > 0) continue;
      sp.life = 1 + Math.random() * 0.4;
      sp.s.visible = true;
      sp.s.material.color.set(color);
      sp.s.position.copy(pos);
      sp.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      if (++c >= n) break;
    }
  }

  // ------------------------------------------------------------- interactions
  interactions() {
    const { player } = this.ctx;
    const S = this.S;
    const out = [];
    const near = (v, r) => Math.hypot(player.pos.x - v.x, player.pos.z - v.z) < r && Math.abs(player.pos.y - v.y) < 3;
    // final slots
    if (S.stage === 'final') {
      for (const sl of this.slots) {
        if (S.parts[sl.key] && !S.placed[sl.key] && near(sl.pos, 2.2)) out.push({ label: `Colocar ${PART_INFO[sl.key].name}`, act: () => this._place(sl) });
      }
    }
    return out;
  }

  // ------------------------------------------------------------- flow
  async startIntro() {
    const { neurix, player, cam } = this.ctx;
    this.busy = true;
    player.faceTarget = neurix.pos;
    neurix.mode = 'idle';
    neurix.doGesture('wave', 2.5);
    const choice = await this.say([
      { text: '¡Hola, explorador! Soy **Neuri-X**.', mood: 'happy', gesture: 'wave' },
      { text: 'Algo extraño está ocurriendo en nuestro laboratorio. Las **conexiones neuronales** están fallando y necesitamos tu ayuda.', mood: 'sad' },
      { text: '¿Estás listo para salvar el sistema nervioso?', mood: 'normal', choices: [{ label: '¡Sí, vamos!', value: 'yes', icon: '🚀' }, { label: 'Cuéntame más', value: 'more', icon: '💬' }, { label: 'Ver el mapa', value: 'map', icon: '🗺️' }] },
    ]);
    if (choice === 'more') {
      await this.say([
        { text: 'Tu sistema nervioso es una red de **mensajeros**: miles de millones de neuronas que se pasan señales eléctricas y químicas.', mood: 'think', gesture: 'think' },
        { text: 'Gracias a esa red puedes pensar, recordar, moverte y sentir. En el **Distrito Neuro** esa red se apagó… ¡y solo tú puedes repararla!', mood: 'surprised' },
      ]);
    } else if (choice === 'map') {
      this.ctx.openMap && this.ctx.openMap();
      await new Promise((r) => { const iv = setInterval(() => { if (!this.ctx.mapOpen()) { clearInterval(iv); r(); } }, 200); });
    }
    await this.say([
      { text: '¡Genial! El **Distrito Neuro** está al oeste de la plaza. Cruza el **portal dorado** y llegarás en un instante… ¡yo te acompaño!', mood: 'happy', gesture: 'point' },
    ]);
    player.faceTarget = null;
    this.S.stage = 'toNeuro';
    this.ctx.addXP(20, 'Conociste a Neuri-X');
    neurix.mode = 'follow';
    this.ctx.persist();
    this.stageObjective();
    this.busy = false;
  }
  async arriveNeuro() {
    this.busy = true;
    const { neurix } = this.ctx;
    this.S.stage = 'stations';
    this.ctx.unlockVisit('neuro');
    await this.say([
      { text: '¡Bienvenido al **Distrito Neuro**! Este es el centro de investigación del cerebro.', mood: 'happy', gesture: 'celebrate' },
      { text: 'Para reparar la red necesitamos las cuatro piezas de una neurona: el **SOMA**, el **AXÓN**, la **SINAPSIS** y las **DENDRITAS**.', mood: 'think' },
      { text: 'Cada pieza se gana superando un nivel en la **Sala de Retos**. ¡Cruza el **portal verde**, cerca de la entrada del distrito!', mood: 'normal', gesture: 'point' },
    ]);
    neurix.mode = 'follow';
    this.ctx.addXP(20, 'Llegaste al Distrito Neuro');
    this.ctx.persist();
    this.stageObjective();
    this.busy = false;
  }
  // Called by the Sala de Retos the first time a level is completed.
  async awardPart(key) {
    if (this.S.parts[key]) return;
    this.S.parts[key] = true;
    this.ctx.audio.play('fanfare');
    this.ctx.addXP(25, `Pieza: ${PART_INFO[key].name}`);
    this.ctx.ui.toast(`¡Obtuviste: ${PART_INFO[key].name}!`, 'Pieza de neurona', '🧠', true, 3);
    this.ctx.player.cheer = 1.6;
    this.ctx.persist();
    const desc = {
      soma: '¡Ganaste el **SOMA**! Es el cuerpo de la neurona: su centro de control, donde está el núcleo.',
      axon: '¡Ganaste el **AXÓN**! Es el “cable” largo de la neurona que transporta la señal eléctrica.',
      sinapsis: '¡Ganaste la **SINAPSIS**! Es el punto donde una neurona le pasa su mensaje a la siguiente.',
      dendritas: '¡Ganaste las **DENDRITAS**! Son las ramitas que reciben los mensajes de otras neuronas.',
    }[key];
    this.busy = true;
    await this.say([{ text: desc, mood: 'happy', gesture: 'celebrate' }]);
    const all = ['soma', 'axon', 'sinapsis', 'dendritas'].every((p) => this.S.parts[p]);
    if (all && this.S.stage === 'stations') {
      this.S.stage = 'final';
      await this.say([
        { text: '¡Tienes las **cuatro piezas**! Vuelve al **Laboratorio Central**, el gran domo de cristal, para reconstruir la neurona.', mood: 'surprised', gesture: 'point' },
      ]);
      this._enterFinal();
    }
    this.busy = false;
    this.ctx.persist();
    this.stageObjective();
  }
  _enterFinal() {
    this.neuron.visible = true;
    this.bigBrain.visible = false;
    for (const sl of this.slots) { sl.pad.visible = !this.S.placed[sl.key]; sl.lab.visible = !this.S.placed[sl.key]; }
    for (const k in this.realParts) { this.realParts[k].visible = !!this.S.placed[k]; this.ghosts[k].visible = !this.S.placed[k]; }
  }
  // ----- final
  async _place(sl) {
    const key = sl.key;
    this.S.placed[key] = true;
    sl.pad.visible = false;
    sl.lab.visible = false;
    const real = this.realParts[key];
    const ghost = this.ghosts[key];
    real.visible = true;
    real.userData.snap = 1;
    ghost.visible = false;
    this.ctx.audio.play('snap');
    const wp = new THREE.Vector3();
    real.getWorldPosition(wp);
    this._fx(wp, PART_INFO[key].color === 0xffffff ? 0x9fdcff : PART_INFO[key].color, 40, 6);
    this.ctx.ui.flash();
    this.ctx.cam.shake = 0.5;
    this.ctx.addXP(30, `${PART_INFO[key].name} colocada`);
    this.ctx.persist();
    this.stageObjective();
    if (['soma', 'axon', 'sinapsis', 'dendritas'].every((p) => this.S.placed[p])) {
      this.busy = true;
      setTimeout(() => this._finale(), 900);
    }
  }
  async _finale() {
    const { cam, neurix, player, ui, audio } = this.ctx;
    const d = this.dome;
    player.frozen = true;
    const center = new THREE.Vector3(d.x, d.y + 6.2, d.z + 1);
    cam.startCine({
      pos: (t) => new THREE.Vector3(d.x + Math.cos(t * 0.35 + 0.2) * 13, d.y + 6 + Math.sin(t * 0.5) * 1.5, d.z + Math.sin(t * 0.35 + 0.2) * 13),
      look: center,
    });
    this.finaleT = 0;
    this.signal.visible = true;
    this.bigBrain.visible = false;
    audio.play('fanfare');
    await new Promise((r) => setTimeout(r, 4200));
    ui.centerMsg('¡RED NEURONAL RESTAURADA!', 'La señal vuelve a viajar: dendritas → soma → axón → sinapsis', 4);
    this.networkOn = true;
    neurix.doGesture('celebrate', 6);
    neurix.setMood('happy');
    player.cheer = 6;
    // fireworks burst series
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        audio.play('reward');
        const p = new THREE.Vector3(d.x + (Math.random() - 0.5) * 30, d.y + 22 + Math.random() * 10, d.z + (Math.random() - 0.5) * 30);
        this._fx(p, [0xffb020, 0x35e0ff, 0xb57bff, 0x22c55e][i % 4], 45, 10);
      }, i * 600);
    }
    await new Promise((r) => setTimeout(r, 4600));
    cam.endCine();
    this.S.stage = 'done';
    this.S.doneAt = Date.now();
    this.ctx.addXP(250, 'Misión completada');
    this.ctx.unlock('guardian');
    this.ctx.persist();
    this.stageObjective();
    await this.say([
      { text: '¡Lo lograste, **Guardián Neuronal**! Gracias a ti, el Distrito Neuro vuelve a brillar.', mood: 'happy', gesture: 'celebrate' },
      { text: 'Los demás distritos abrirán muy pronto. Mientras tanto, ¡explora la isla y busca todos los **cristales de energía**!', mood: 'normal', gesture: 'point' },
    ]);
    this.busy = false;
    this.ctx.showComplete();
  }

  // ------------------------------------------------------------- update
  update(dt, t, cam) {
    this.t = t;
    const { player, neurix, ui, audio } = this.ctx;
    const S = this.S;
    for (const m of this.holoMats) m.uniforms.time.value = t;
    for (const f of this.anim) f(t, cam);
    if (cam) fadeLabels(cam);
    // stage triggers
    if (!this.busy && !ui.dialogOpen) {
      if (S.stage === 'intro' && player.pos.distanceTo(neurix.pos) < 9) this.startIntro();
      else if (S.stage === 'toNeuro' && Math.hypot(player.pos.x - N.x, player.pos.z - N.z) < N.r) this.arriveNeuro();
    }
    // locked districts
    for (const L of this.ctx.locked) {
      if (Math.hypot(player.pos.x - L.x, player.pos.z - L.z) < L.r + 6) {
        if (!this.lockedSeen[L.key]) {
          this.lockedSeen[L.key] = true;
          ui.toast(`${L.title} — ¡Próximamente!`, 'Este distrito abrirá en una próxima actualización', '🔒', false, 3.2);
          this.ctx.unlockVisit(L.key);
        }
      } else if (Math.hypot(player.pos.x - L.x, player.pos.z - L.z) > L.r + 20) this.lockedSeen[L.key] = false;
    }
    // ---- final assembly
    if (this.neuron.visible) {
      this.neuron.rotation.y = Math.sin(t * 0.3) * 0.25;
      for (const k in this.realParts) {
        const rp = this.realParts[k];
        if (rp.userData.snap > 0) {
          rp.userData.snap = Math.max(0, rp.userData.snap - dt * 2.5);
          const s = 1 + Math.sin(rp.userData.snap * Math.PI) * 0.35;
          rp.scale.setScalar(s);
        }
      }
      for (const sl of this.slots) if (sl.pad.visible) sl.pad.userData.ring.material.emissiveIntensity = 1.4 + Math.sin(t * 5) * 0.8;
    }
    if (this.signal.visible) {
      // dendrites -> soma -> axon -> synapse loop
      const k = (t * 0.45) % 1;
      const z = k < 0.15 ? -3.2 + k / 0.15 * 3.2 : k < 0.25 ? 0 : 0.9 + (k - 0.25) / 0.75 * 6.8;
      this.signal.position.set(0, 0, z);
    }
    if (this.networkOn) {
      for (const a of this.arcs) {
        const cur = a.geometry.drawRange.count;
        if (cur < a.userData.total) a.geometry.setDrawRange(0, Math.min(a.userData.total, cur + Math.ceil(a.userData.total * dt * 0.6)));
      }
    }
    // sparks
    for (const sp of this.sparks) {
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.v.y -= 6 * dt;
      sp.s.position.addScaledVector(sp.v, dt);
      sp.s.material.opacity = Math.max(0, sp.life);
      sp.s.scale.setScalar(0.5 + sp.life * 0.6);
      if (sp.life <= 0) sp.s.visible = false;
    }
    // idle hint
    if (!ui.dialogOpen && !this.busy && player.speed < 0.2) this.idleHintT += dt; else this.idleHintT = Math.max(0, this.idleHintT - dt * 0.2);
    if (this.idleHintT > 40) {
      this.idleHintT = 0;
      const hint = {
        intro: 'La Plaza Central está al norte. ¡Sigue el camino de piedra!',
        toNeuro: 'El portal dorado al oeste de la plaza te lleva al Distrito Neuro. ¡Crúzalo!',
        stations: 'La Sala de Retos te espera: cruza el portal verde del Distrito Neuro.',
        final: 'Entra al domo de cristal y coloca las piezas sobre los círculos brillantes.',
        done: '¿Ya encontraste todos los cristales? ¡Algunos están en lugares secretos!',
      }[S.stage];
      if (hint) ui.toast('Neuri-X: ' + hint, '', '🤖', false, 4);
    }
  }
  // restore visual state from save
  restore() {
    const S = this.S;
    if (S.stage === 'final' || S.stage === 'done') this._enterFinal();
    if (S.stage === 'done') { this.bigBrain.visible = false; this.signal.visible = true; this.networkOn = true; }
  }
}
