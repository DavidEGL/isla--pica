// Avatar upgrades ("mejoras"): rewards for beating the Sala de Retos levels, shown on OUR avatar.
// Visor Neural (L1) · Botas de Mielina (L2) · Guantes Reflejo (L3) · Núcleo Neuronal (L4) · Aura de Guardián (mission).
import * as THREE from 'three';
import { softSpriteTexture } from './util.js';

export const GEAR = [
  { key: 'visor', lv: 's1', icon: '🥽', name: 'Visor Neural', from: 'Supera el Nivel 1', effect: 'Una flecha de luz te muestra hacia dónde ir. Al terminar la misión, ¡te lleva a los cristales!' },
  { key: 'boots', lv: 's2', icon: '👟', name: 'Botas de Mielina', from: 'Supera el Nivel 2', effect: 'Tu impulso (Q) se recarga casi el doble de rápido y dejas una estela de luz al correr.' },
  { key: 'gloves', lv: 's3', icon: '🧤', name: 'Guantes Reflejo', from: 'Supera el Nivel 3', effect: '+2 segundos en todos los retos con reloj de la Sala de Retos.' },
  { key: 'core', lv: 's4', icon: '🔮', name: 'Núcleo Neuronal', from: 'Supera el Nivel 4', effect: 'Tu mochila atrae las burbujas de mensajeros y los cristales cercanos.' },
  { key: 'aura', lv: 'final', icon: '✨', name: 'Aura de Guardián', from: 'Completa la misión', effect: 'Un aura dorada te rodea: ¡eres Guardián del Cerebro!' },
];
export const GEAR_BY = Object.fromEntries(GEAR.map((g) => [g.key, g]));
export const TIERS = [
  { stars: 0, name: 'Cian', color: 0x35e0ff },
  { stars: 3, name: 'Verde', color: 0x22e07a },
  { stars: 6, name: 'Violeta', color: 0xb57bff },
  { stars: 9, name: 'Dorado', color: 0xffc93a },
  { stars: 12, name: 'Arcoíris', color: null },
];
// spoken by Neuri-X when an upgrade is unlocked (voiced: keep in sync with assets/voice)
const SAY = {
  intro: { text: '¡Tengo una sorpresa! Por superar los retos, tu explorador ganó **mejoras nuevas**.', mood: 'happy', gesture: 'wave' },
  visor: { text: '¡Ganaste el **Visor Neural**! Ahora una flecha de luz te muestra hacia dónde ir. Puedes verlo en tu **Inventario**.', mood: 'happy', gesture: 'celebrate' },
  boots: { text: '¡Ganaste las **Botas de Mielina**! Igual que la señal en el axón, ahora tu impulso se recarga mucho más rápido.', mood: 'happy', gesture: 'celebrate' },
  gloves: { text: '¡Ganaste los **Guantes Reflejo**! En los retos con reloj tendrás **dos segundos extra**.', mood: 'happy', gesture: 'celebrate' },
  core: { text: '¡Tu mochila tiene un **Núcleo Neuronal**! Ahora atrae hacia ti las burbujas de mensajeros y los cristales cercanos.', mood: 'surprised', gesture: 'celebrate' },
  aura: { text: '¡Lo lograste! Ganaste el **Aura de Guardián del Cerebro**. ¡Brillas como una verdadera neurona!', mood: 'happy', gesture: 'celebrate' },
};
const TIER_TOAST = 'Neuri-X: ¡Mira! Desbloqueaste un nuevo color de energía. Cámbialo en tu Inventario.';

const $ = (id) => document.getElementById(id);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Color();
const hexCss = (n) => '#' + new THREE.Color(n).getHexString();

function basic(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });
}

export class Gear {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    const d = ctx.save.data;
    d.gear = d.gear || {};
    this.S = d.gear;
    this.S.eq = this.S.eq || {};
    this.S.seen = this.S.seen || {};
    this.S.color = this.S.color || 0;
    this.S.tierSeen = this.S.tierSeen || 0;
    this.busy = false;
    this.open = false;
    this.glowTex = softSpriteTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
    this.mats = [];   // materials tinted with the energy color
    this.root = new THREE.Group();
    scene.add(this.root);
    this._build();
    this._buildDom();
    this._measure();
  }

  // ------------------------------------------------------------ state
  has(k) {
    const g = GEAR_BY[k];
    if (!g) return false;
    if (g.lv === 'final') return this.ctx.save.data.stage === 'done';
    return this.ctx.arcade.rec(g.lv).done;
  }
  on(k) { return this.has(k) && this.S.eq[k] !== false; }
  timeBonus() { return this.on('gloves') ? 2 : 0; }
  magnet() { return this.on('core'); }
  stars() { return this.ctx.arcade.totals('all').stars; }
  maxTier() { const s = this.stars(); let t = 0; TIERS.forEach((x, i) => { if (s >= x.stars) t = i; }); return t; }
  count() { return GEAR.filter((g) => this.has(g.key)).length; }
  forLevel(lv) { return GEAR.find((g) => g.lv === lv); }
  list() { return GEAR.map((g) => ({ ...g, has: this.has(g.key), on: this.on(g.key) })); }
  toggle(k) {
    if (!this.has(k)) { this.ctx.audio.play('bad'); return; }
    this.S.eq[k] = !this.on(k);
    this.ctx.audio.play(this.S.eq[k] ? 'switch' : 'blip');
    this.ctx.persist();
    if (this.open) this.render();
  }
  color(t) {
    const T = TIERS[Math.min(this.S.color, this.maxTier())];
    if (T.color === null) return _c.setHSL((t * 0.12) % 1, 0.85, 0.6);
    return _c.set(T.color);
  }

  // ------------------------------------------------------------ meshes
  _glow(size, color = 0xffffff, opacity = 0.9) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    s.scale.setScalar(size);
    return s;
  }
  _tint(m) { this.mats.push(m); return m; }
  _build() {
    const R = this.root;
    // Visor: a glass band in front of the eyes with a bright rim
    this.visor = new THREE.Group();
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true, -1.25, 2.5), this._tint(new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })));
    const rimT = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40, 2.5), this._tint(basic(0x35e0ff)));
    rimT.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.25);
    rimT.position.y = 0.5;
    const rimB = rimT.clone();
    rimB.position.y = -0.5;
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40, Math.PI * 2 - 2.5), basic(0xe9f3ff));
    band.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 1.25);
    const dot = this._glow(0.5, 0xffffff, 0.8);
    dot.position.set(0, 0, 1.05);
    this.visorDot = dot;
    this.visor.add(lens, rimT, rimB, band, dot);
    R.add(this.visor);
    // Boots: glowing cuffs at the ankles
    this.boots = [0, 1].map(() => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 8, 28), this._tint(basic(0x35e0ff)));
      ring.rotation.x = Math.PI / 2;
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 6, 28), basic(0xffffff));
      ring2.rotation.x = Math.PI / 2;
      ring2.position.y = -0.05;
      const glow = this._glow(0.42);
      this._tint(glow.material);
      g.add(ring, ring2, glow);
      R.add(g);
      return g;
    });
    // Gloves: energy orbs on the hands
    this.gloves = [0, 1].map(() => {
      const g = new THREE.Group();
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), basic(0xffffff));
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), this._tint(new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.5, wireframe: true, toneMapped: false })));
      const glow = this._glow(0.3);
      this._tint(glow.material);
      g.add(orb, shell, glow);
      g.userData.shell = shell;
      R.add(g);
      return g;
    });
    // Core: a spinning crystal on the backpack
    this.core = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), this._tint(basic(0x35e0ff)));
    const gemIn = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), basic(0xffffff));
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.007, 6, 32), this._tint(basic(0x35e0ff)));
    const cglow = this._glow(0.5);
    this._tint(cglow.material);
    this.core.add(gem, gemIn, orbit, cglow);
    this.coreGem = gem; this.coreOrbit = orbit;
    R.add(this.core);
    // Aura: golden rings at the feet + rising sparkles
    this.aura = new THREE.Group();
    const a1 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.03, 6, 64), basic(0xffd36b, 0.9));
    a1.rotation.x = Math.PI / 2;
    const a2 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.015, 6, 64), this._tint(basic(0x35e0ff, 0.8)));
    a2.rotation.x = Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 48), new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0xffd36b, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    disc.rotation.x = -Math.PI / 2;
    this.aura.add(a1, a2, disc);
    this.auraRings = [a1, a2];
    this.auraSparks = [];
    for (let i = 0; i < 14; i++) {
      const s = this._glow(0.12, 0xffe08a, 0.9);
      this.aura.add(s);
      this.auraSparks.push({ s, a: Math.random() * Math.PI * 2, y: Math.random() * 1.8, r: 0.45 + Math.random() * 0.3, v: 0.5 + Math.random() * 0.6 });
    }
    R.add(this.aura);
    // Trail of light (boots)
    this.trail = [];
    for (let i = 0; i < 48; i++) {
      const s = this._glow(0.35);
      s.visible = false;
      R.add(s);
      this.trail.push({ s, life: 0 });
    }
    this.trailT = 0;
    // Guide arrow (visor)
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.75); sh.lineTo(0.5, 0.05); sh.lineTo(0.2, 0.05); sh.lineTo(0.2, -0.55);
    sh.lineTo(-0.2, -0.55); sh.lineTo(-0.2, 0.05); sh.lineTo(-0.5, 0.05); sh.closePath();
    const ag = new THREE.ShapeGeometry(sh);
    ag.rotateX(-Math.PI / 2);   // lie flat, tip toward -z…
    ag.rotateY(Math.PI);         // …then toward +z
    this.arrow = new THREE.Group();
    const am = new THREE.Mesh(ag, this._tint(new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
    const aw = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    aw.scale.setScalar(0.55);
    aw.position.y = 0.01;
    this.arrow.add(am, aw);
    this.arrow.visible = false;
    R.add(this.arrow);
    this.arrowA = 0;
  }
  // proportions of OUR avatar (bind pose): head size / eye height, backpack depth
  _measure() {
    const P = this.ctx.player, B = P.avatar.bones;
    P.avatar.root.updateMatrixWorld(true);
    const rootY = P.avatar.root.position.y;
    const top = rootY + 1.5;
    this.hands = ['L', 'R'].map((s) => {
      const fa = B[s].foreArm;
      if (!fa) return null;
      return fa.children.find((c) => c.isBone) || fa;
    });
    const hy = B.head ? B.head.getWorldPosition(_a).y : rootY + 1.2;
    const hs = Math.max(0.12, top - hy);
    this.eyeUp = hs * 0.22;
    this.headR = hs * 0.5;
    this.headFwd = hs * 0.08;
    this.backBone = B.chest || B.spine || B.hips;
    this.backOff = 0.24;
    this.backUp = 0;
  }

  // ------------------------------------------------------------ per-frame
  update(dt, t, cam, idle) {
    const P = this.ctx.player, B = P.avatar.bones;
    const col = this.color(t);
    for (const m of this.mats) m.color.copy(col);
    const yaw = P.yaw;
    const xr = !!(this.ctx.xr && this.ctx.xr.active);
    _f.set(Math.sin(yaw), 0, Math.cos(yaw));
    // boots effect lives on the player controller
    P.dashCdMul = this.on('boots') ? 0.55 : 1;
    // visor
    this.visor.visible = this.on('visor') && !!B.head && !xr;
    if (this.visor.visible) {
      B.head.getWorldPosition(_a);
      this.visor.position.copy(_a).addScaledVector(_f, this.headFwd);
      this.visor.position.y += this.eyeUp;
      this.visor.scale.set(this.headR * 1.14, this.headR * 0.42, this.headR * 1.14);
      this.visor.rotation.set(0, yaw, 0);
      this.visorDot.material.opacity = 0.5 + Math.sin(t * 4) * 0.3;
    }
    // boots
    const bootsOn = this.on('boots');
    ['L', 'R'].forEach((s, i) => {
      const g = this.boots[i], foot = B[s].foot;
      g.visible = bootsOn && !!foot;
      if (!g.visible) return;
      foot.getWorldPosition(g.position);
      g.position.y = Math.max(g.position.y, P.pos.y + 0.08);
      g.rotation.y = yaw;
      g.children[2].material.opacity = 0.55 + Math.sin(t * 6 + i) * 0.25;
    });
    // gloves
    const glovesOn = this.on('gloves');
    this.gloves.forEach((g, i) => {
      const h = xr ? this.ctx.xr.hands[i] : this.hands[i];
      g.visible = glovesOn && !!h;
      if (!g.visible) return;
      h.getWorldPosition(g.position);
      g.userData.shell.rotation.set(t * 1.7, t * 2.3 + i, 0);
      g.children[2].material.opacity = 0.6 + Math.sin(t * 5 + i * 2) * 0.25;
    });
    // core on the backpack
    this.core.visible = this.on('core') && !!this.backBone && !xr;
    if (this.core.visible) {
      this.backBone.getWorldPosition(_a);
      this.core.position.copy(_a).addScaledVector(_f, -this.backOff);
      this.core.position.y += this.backUp;
      this.coreGem.rotation.y = t * 2.4;
      this.coreOrbit.rotation.set(Math.PI / 2 + Math.sin(t * 1.3) * 0.6, t * 1.8, 0);
      this.core.children[3].scale.setScalar(0.45 + Math.sin(t * 5) * 0.08);
    }
    // aura
    this.aura.visible = this.on('aura');
    if (this.aura.visible) {
      this.aura.position.set(P.pos.x, P.pos.y + 0.04, P.pos.z);
      this.auraRings[0].rotation.z = t * 0.6;
      this.auraRings[1].rotation.z = -t * 0.9;
      this.auraRings[0].scale.setScalar(1 + Math.sin(t * 2.2) * 0.04);
      for (const sp of this.auraSparks) {
        sp.y += sp.v * dt;
        sp.a += dt * 0.8;
        if (sp.y > 1.9) { sp.y = 0; sp.a = Math.random() * Math.PI * 2; }
        sp.s.position.set(Math.cos(sp.a) * sp.r, sp.y, Math.sin(sp.a) * sp.r);
        sp.s.material.opacity = Math.sin((sp.y / 1.9) * Math.PI) * 0.9;
      }
    }
    // light trail
    this.trailT -= dt;
    const fast = (P.grounded && (P.speed || 0) > 5.4) || P.dashT > 0;
    if (bootsOn && fast && this.trailT <= 0) {
      this.trailT = P.dashT > 0 ? 0.012 : 0.035;
      for (const s of ['L', 'R']) {
        const foot = B[s].foot;
        const tr = this.trail.find((x) => x.life <= 0);
        if (!tr || !foot) break;
        foot.getWorldPosition(tr.s.position);
        tr.s.position.y = Math.max(tr.s.position.y, P.pos.y + 0.1);
        tr.life = 0.55;
        tr.s.visible = true;
        tr.s.material.color.copy(col);
      }
    }
    for (const tr of this.trail) {
      if (tr.life <= 0) continue;
      tr.life -= dt;
      tr.s.material.opacity = Math.max(0, tr.life / 0.55) * 0.8;
      tr.s.scale.setScalar(0.12 + tr.life * 0.45);
      tr.s.position.y += dt * 0.25;
      if (tr.life <= 0) tr.s.visible = false;
    }
    // guide arrow
    this._arrow(dt, t, idle);
    // rewards waiting to be presented (players coming from older versions, mission completion)
    if (idle && !this.busy) this._pending();
  }
  target() {
    const c = this.ctx, A = c.arcade;
    if (c.lab.inside) return null;
    if (A.inside) {
      if (A.where !== 'hub' || A.cur) return null;
      const st = c.save.data.stage;
      const g = A.gates.find((x) => x.key !== 'final' && A.unlocked(x.key) && !A.rec(x.key).done)
        || (st === 'final' ? A.gates.find((x) => x.key === 'final') : null);
      return g ? { x: A.root.position.x + g.x, z: A.root.position.z + g.z } : null;
    }
    const tg = c.ui.objectiveTarget;
    if (tg) return tg;
    if (c.save.data.stage === 'done') {
      const P = c.player.pos;
      let best = null, bd = Infinity;
      for (const cr of c.crystals()) {
        if (cr.taken) continue;
        const d = Math.hypot(cr.x - P.x, cr.z - P.z);
        if (d < bd) { bd = d; best = cr; }
      }
      return best;
    }
    return null;
  }
  _arrow(dt, t, idle) {
    const P = this.ctx.player;
    let show = false;
    if (this.on('visor') && idle) {
      const tg = this.target();
      if (tg) {
        const dx = tg.x - P.pos.x, dz = tg.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > 6) {
          show = true;
          const a = Math.atan2(dx, dz);
          let da = a - this.arrowA;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          this.arrowA += da * Math.min(1, dt * 8);
          const r = 1.7 + Math.sin(t * 5) * 0.12;
          this.arrow.position.set(P.pos.x + Math.sin(this.arrowA) * r, P.pos.y + 0.12, P.pos.z + Math.cos(this.arrowA) * r);
          this.arrow.rotation.y = this.arrowA;
          this.arrow.scale.setScalar(0.45);
        }
      }
    }
    this.arrow.visible = show;
  }

  // ------------------------------------------------------------ rewards
  async _pending() {
    const ctx = this.ctx;
    const tier = this.maxTier();
    if (tier > this.S.tierSeen) {
      this.S.tierSeen = tier;
      this.S.color = tier;
      ctx.persist();
      ctx.ui.toast(TIER_TOAST, `Color ${TIERS[tier].name} · ${TIERS[tier].stars} estrellas`, '🎨', true, 4);
      ctx.audio.play('achieve');
      ctx.portrait();
    }
    if (ctx.arcade.inside && (ctx.arcade.cur || ctx.arcade.where !== 'hub')) return;
    const todo = GEAR.filter((g) => this.has(g.key) && !this.S.seen[g.key]).map((g) => g.key);
    if (!todo.length) return;
    this.busy = true;
    if (todo.length > 1) await this._say([SAY.intro]);
    for (const k of todo) {
      if (ctx.arcade.cur) break;   // a level started: the rest waits for the next calm moment
      await this.present(k, true);
    }
    this.busy = false;
  }
  async _say(lines) {
    const m = this.ctx.mission;
    m.busy = true;
    await m.say(lines);
    m.busy = false;
  }
  // Neuri-X presents a new upgrade (voiced) while it lights up on the avatar
  async present(k, inner = false) {
    const g = GEAR_BY[k], ctx = this.ctx;
    if (!g) return;
    if (!inner) this.busy = true;
    this.S.seen[k] = true;
    this.S.eq[k] = true;
    ctx.persist();
    ctx.audio.play('reward');
    ctx.player.cheer = 2.2;
    ctx.ui.centerMsg('¡NUEVA MEJORA!', `${g.icon} ${g.name}`, 2.6);
    this._burst(k);
    await new Promise((r) => setTimeout(r, 900));
    await this._say([SAY[k]]);
    ctx.portrait();
    if (!inner) this.busy = false;
  }
  _burst() {
    const P = this.ctx.player, col = this.color(0);
    let n = 0;
    for (const tr of this.trail) {
      if (n++ > 30) break;
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6;
      tr.s.position.set(P.pos.x + Math.cos(a) * r, P.pos.y + 0.2 + Math.random() * 1.6, P.pos.z + Math.sin(a) * r);
      tr.s.material.color.copy(col);
      tr.s.visible = true;
      tr.life = 0.55;
    }
  }

  // ------------------------------------------------------------ inventory panel
  _buildDom() {
    const el = document.createElement('div');
    el.id = 'inv';
    el.className = 'hidden';
    el.innerHTML = `<div class="panel inv-panel">
      <div class="c-tag">INVENTARIO</div><h2>Mejoras de tu explorador</h2>
      <div class="inv-body">
        <div class="inv-hero"><div class="pf-face inv-face"><canvas id="inv-face" width="160" height="160"></canvas></div><b id="inv-count"></b><small>Supera los niveles de la Sala de Retos para ganar mejoras. Toca una mejora para equiparla o guardarla.</small></div>
        <div class="inv-grid" id="inv-grid"></div>
      </div>
      <div class="inv-colors"><div class="inv-h">COLOR DE ENERGÍA <small id="inv-stars"></small></div><div class="inv-chips" id="inv-chips"></div></div>
      <div class="small">Pulsa <b>I</b> o toca fuera del panel para cerrar</div>
    </div>`;
    $('app').appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) this.onClose && this.onClose(); });
    $('inv-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.inv-card');
      if (!b || !this.has(b.dataset.k)) return;
      this.S.eq[b.dataset.k] = !this.on(b.dataset.k);
      this.ctx.audio.play(this.S.eq[b.dataset.k] ? 'switch' : 'blip');
      this.ctx.persist();
      this.render();
    });
    $('inv-chips').addEventListener('click', (e) => {
      const b = e.target.closest('.inv-chip');
      if (!b) return;
      const i = +b.dataset.i;
      if (i > this.maxTier()) { this.ctx.audio.play('bad'); return; }
      this.S.color = i;
      this.ctx.audio.play('switch');
      this.ctx.persist();
      this.render();
    });
  }
  show(on) {
    this.open = on;
    $('inv').classList.toggle('hidden', !on);
    if (on) this.render();
  }
  render() {
    $('inv-count').textContent = `${this.count()} / ${GEAR.length} mejoras`;
    $('inv-grid').innerHTML = GEAR.map((g) => {
      const has = this.has(g.key), on = this.on(g.key);
      const st = !has ? `🔒 ${g.from}` : on ? '✓ EQUIPADO' : 'GUARDADO';
      return `<button class="inv-card ${has ? (on ? 'on' : 'off') : 'locked'}" data-k="${g.key}"><div class="ii">${g.icon}</div><div class="it"><b>${g.name}</b><small>${g.effect}</small><span class="is">${st}</span></div></button>`;
    }).join('');
    const mt = this.maxTier();
    $('inv-stars').textContent = `★ ${this.stars()} / 12`;
    $('inv-chips').innerHTML = TIERS.map((T, i) => {
      const c = T.color === null ? 'conic-gradient(#ff5d73,#ffb020,#ffd23f,#22e07a,#35e0ff,#b57bff,#ff5d73)' : hexCss(T.color);
      return `<button class="inv-chip${i === Math.min(this.S.color, mt) ? ' sel' : ''}${i > mt ? ' locked' : ''}" data-i="${i}"><i style="background:${c}"></i><span>${i > mt ? `🔒 ${T.stars}★` : T.name}</span></button>`;
    }).join('');
    try { $('inv-face').getContext('2d').drawImage($('pf-face'), 0, 0); } catch { /* ignore */ }
  }
}
