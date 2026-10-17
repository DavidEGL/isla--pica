// Modo VR (WebXR) — Meta Quest 3 / 3S and other headsets, same URL as the web game.
// First-person view, Touch-controller locomotion (snap turn), hands with the Guantes Reflejo,
// and a floating panel that mirrors the HTML interface (mission, Neuri-X dialogues, points,
// results, minimap) so every feature of the game is also playable inside the headset.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const PW = 1024, PH = 768;          // panel canvas
const PANEL_W = 1.05;               // metres
const TURN = Math.PI / 6;           // snap turn 30°
const _v = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(g, text, maxW) {
  const words = String(text || '').split(/\s+/), out = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
const txt = (id) => { const e = $(id); return e ? e.textContent.trim() : ''; };
const shown = (id) => { const e = $(id); return !!e && !e.classList.contains('hidden'); };

export class XRMode {
  constructor(ctx) {
    this.ctx = ctx;                 // { renderer, scene, camera, player, input, ui, audio, gear, onStart, onEnd, invOpen }
    this.active = false;
    this.supported = false;
    this.rig = new THREE.Group();
    this.rig.name = 'xr-rig';
    ctx.scene.add(this.rig);
    this.rig.add(ctx.camera);
    this.rigYaw = 0;
    this.yOff = 0;
    this.hPrev = null;
    this.viewCam = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);   // true head pose (world)
    this.nxCam = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);     // proxy "behind the head" so Neuri-X floats in view
    this.prev = {};
    this.turnLatch = false;
    this.inv = { open: false, sel: 0 };
    this._sig = '';
    this._mmT = 0;
    this._buildHands();
    this._buildPanel();
    this._check();
  }

  // ------------------------------------------------------------ support / session
  async _check() {
    try {
      this.supported = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'));
    } catch { this.supported = false; }
    document.body.classList.toggle('xr-ok', this.supported);
    for (const b of document.querySelectorAll('.btn-vr')) {
      b.classList.toggle('hidden', !this.supported);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.enter(); });
    }
  }
  async enter() {
    if (this.active || !navigator.xr) return;
    const r = this.ctx.renderer;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      r.xr.enabled = true;
      r.xr.setReferenceSpaceType('local-floor');
      try { r.xr.setFramebufferScaleFactor(0.9); } catch { /* ignore */ }
      await r.xr.setSession(session);
      try { r.xr.setFoveation(1); } catch { /* ignore */ }
      session.addEventListener('end', () => this._ended());
      this.session = session;
      this._started();
    } catch (e) {
      console.warn('XR', e);
      this.ctx.ui.toast('No se pudo iniciar el modo VR', 'Abre el juego desde el navegador del visor', '🥽', false, 4);
    }
  }
  exit() { if (this.session) this.session.end(); }
  _started() {
    const c = this.ctx;
    this.active = true;
    this.hPrev = null;
    this.calib = 0.6;
    this.yOff = 0;
    this.rigYaw = c.player.yaw + Math.PI;    // look where the avatar was facing
    c.player.avatar.root.visible = false;
    this.panel.visible = true;
    this.panelYaw = this.rigYaw;
    this._sig = '';
    for (const h of this.hands) h.visible = true;
    document.body.classList.add('in-xr');
    c.onStart && c.onStart();
  }
  _ended() {
    const c = this.ctx;
    this.active = false;
    this.session = null;
    c.renderer.xr.enabled = false;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.updateMatrixWorld(true);
    c.player.avatar.root.visible = true;
    this.panel.visible = false;
    for (const h of this.hands) h.visible = false;
    this.inv.open = false;
    document.body.classList.remove('in-xr');
    c.onEnd && c.onEnd();
  }

  // ------------------------------------------------------------ hands
  _buildHands() {
    const r = this.ctx.renderer;
    this.hands = [0, 1].map((i) => {
      const grip = r.xr.getControllerGrip(i);
      const g = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.6 });
      const sleeve = new THREE.MeshStandardMaterial({ color: 0x1fa3a8, roughness: 0.55 });
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 14), skin);
      palm.scale.set(1, 0.72, 1.25);
      palm.position.set(0, -0.01, 0.01);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 8), skin);
      thumb.position.set(i === 0 ? 0.04 : -0.04, 0, -0.01);
      thumb.rotation.set(0.4, 0, i === 0 ? -0.9 : 0.9);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.07, 16), sleeve);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(0, -0.005, 0.085);
      g.add(palm, thumb, cuff);
      grip.add(g);
      grip.visible = false;
      this.ctx.scene.add(grip);
      grip.addEventListener('connected', (e) => { grip.userData.hand = e.data && e.data.handedness; });
      return grip;
    });
  }

  // ------------------------------------------------------------ input (Touch controllers → game actions)
  // xr-standard: 0 trigger · 1 grip · 3 stick press · 4 A/X · 5 B/Y · axes[2..3] stick
  pollInput(input, dt) {
    if (!this.active || !this.session) return;
    let L = null, R = null;
    for (const s of this.session.inputSources) {
      if (!s.gamepad) continue;
      if (s.handedness === 'left') L = s.gamepad; else R = s.gamepad;
    }
    const pr = this.prev;
    const btn = (gp, i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
    const edge = (key, on) => { const was = pr[key]; pr[key] = on; return on && !was; };
    const ax = (gp, i) => { const v = gp && gp.axes[i] ? gp.axes[i] : 0; return Math.abs(v) < 0.15 ? 0 : v; };
    // inventory panel (Y) owns the controls while open
    if (edge('Y', btn(L, 5))) { this.inv.open = !this.inv.open; this.inv.sel = 0; this.ctx.audio.play('blip'); this._sig = ''; }
    const ry = ax(R, 3) || ax(L, 3) * (this.inv.open ? 1 : 0);
    const up = edge('up', ry < -0.6), down = edge('down', ry > 0.6);
    const trig = edge('trigR', btn(R, 0)) | edge('trigL', btn(L, 0)) | edge('gripR', btn(R, 1)) | edge('gripL', btn(L, 1));
    if (this.inv.open) {
      const G = this.ctx.gear, list = G.list();
      if (up) { this.inv.sel = (this.inv.sel + list.length - 1) % list.length; this.ctx.audio.play('blip'); }
      if (down) { this.inv.sel = (this.inv.sel + 1) % list.length; this.ctx.audio.play('blip'); }
      if (trig) G.toggle(list[this.inv.sel].key);
      if (edge('B', btn(R, 5))) this.inv.open = false;
      input.move.x = input.move.y = 0;
      this._sig = '';
      return;
    }
    if (!input.enabled) return;
    // locomotion: left stick (capped for comfort), snap turn on the right stick
    const lx = ax(L, 2), ly = ax(L, 3);
    if (lx || ly) {
      const m = Math.min(0.46, Math.hypot(lx, ly)) / Math.max(1e-3, Math.hypot(lx, ly));
      input.move.x += lx * m;
      input.move.y += -ly * m;
      input.lastDevice = 'xr';
    }
    const rx = ax(R, 2);
    if (Math.abs(rx) > 0.7 && !this.turnLatch) { this.turnLatch = true; this.rigYaw -= Math.sign(rx) * TURN; }
    if (Math.abs(rx) < 0.3) this.turnLatch = false;
    if (up) input._press('up');
    if (down) input._press('down');
    if (trig) input._press('interact');
    if (edge('A', btn(R, 4))) { input._press('jump'); }
    input.held.xrJump = btn(R, 4);
    if (input.held.xrJump) input.jumpHeld = true;
    if (edge('B', btn(R, 5))) input._press('dash');
    if (edge('X', btn(L, 4))) input._press('hint');
    if (edge('LS', btn(L, 3))) this.calib = 0.05;     // recentre height
  }
  // camera yaw for the movement basis = where the head looks
  viewYaw() {
    this.viewCam.getWorldDirection(_v);
    return Math.atan2(-_v.x, -_v.z);
  }
  // turn the view to a heading (after portals / teleports)
  face(yaw) {
    _e.setFromQuaternion(this.viewCam.quaternion);
    this.rigYaw += (yaw + Math.PI) - _e.y;
    this.hPrev = null;
  }
  haptic(strength = 0.5, ms = 60) {
    if (!this.session) return;
    for (const s of this.session.inputSources) {
      const h = s.gamepad && s.gamepad.hapticActuators && s.gamepad.hapticActuators[0];
      try { if (h && h.pulse) h.pulse(strength, ms); } catch { /* ignore */ }
    }
  }

  // ------------------------------------------------------------ rig: head follows the player
  update(dt, t) {
    if (!this.active) return;
    const c = this.ctx, P = c.player, cam = c.camera;
    const h = cam.position;                         // head pose in the reference space (from last XR frame)
    const cs = Math.cos(this.rigYaw), sn = Math.sin(this.rigYaw);
    // walking in the room moves the explorer too
    if (this.hPrev) {
      const dx = h.x - this.hPrev.x, dz = h.z - this.hPrev.z;
      if (Math.hypot(dx, dz) < 0.4 && !P.frozen) { P.pos.x += dx * cs + dz * sn; P.pos.z += -dx * sn + dz * cs; }
    }
    this.hPrev = (this.hPrev || new THREE.Vector3()).copy(h);
    // seated players: lift the view to explorer height (also on left-stick press)
    if (this.calib > 0) {
      this.calib -= dt;
      if (this.calib <= 0 && h.y > 0.2) this.yOff = Math.max(0, 1.3 - h.y);
    }
    const hx = h.x * cs + h.z * sn, hz = -h.x * sn + h.z * cs;
    this.rig.position.set(P.pos.x - hx, P.pos.y + this.yOff, P.pos.z - hz);
    this.rig.rotation.set(0, this.rigYaw, 0);
    this.rig.updateMatrixWorld(true);
    // world head pose for the game systems
    this.viewCam.position.copy(h).applyMatrix4(this.rig.matrixWorld);
    this.viewCam.quaternion.copy(this.rig.quaternion).multiply(cam.quaternion);
    this.viewCam.updateMatrixWorld(true);
    _e.setFromQuaternion(this.viewCam.quaternion);
    P.yaw = _e.y + Math.PI;
    this.viewCam.getWorldDirection(_v);
    _v.y = 0; _v.normalize();
    this.nxCam.position.copy(this.viewCam.position).addScaledVector(_v, -3);
    this.nxCam.updateMatrixWorld(true);
    this._panel(dt, t);
  }

  // ------------------------------------------------------------ floating panel (mirror of the HTML interface)
  _buildPanel() {
    const c = document.createElement('canvas');
    c.width = PW; c.height = PH;
    this.pc = c;
    this.pg = c.getContext('2d');
    this.ptex = new THREE.CanvasTexture(c);
    this.ptex.colorSpace = THREE.SRGBColorSpace;
    this.ptex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_W * PH / PW), new THREE.MeshBasicMaterial({ map: this.ptex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    m.renderOrder = 999;
    this.panel = m;
    this.panel.visible = false;
    this.ctx.scene.add(m);
    this.panelYaw = 0;
  }
  _state() {
    const ui = this.ctx.ui, d = ui._dlg, S = {};
    S.obj = [txt('obj-text'), txt('obj-sub')];
    S.prompt = shown('prompt') ? txt('prompt-text') : '';
    S.timer = shown('timer') ? txt('timer') : '';
    S.center = shown('center-msg') ? [($('center-msg').childNodes[0] || {}).textContent || '', ($('center-msg').querySelector('small') || {}).textContent || ''] : null;
    S.toasts = [...document.querySelectorAll('#toasts .toast')].slice(-2).map((e) => e.textContent.trim());
    S.arc = shown('arc-hud') ? [txt('arc-name'), txt('arc-phase'), txt('arc-pts'), shown('arc-combo') ? txt('arc-combo') : ''] : null;
    S.zone = txt('zone') ? [($('zone').querySelector('b') || {}).textContent || '', ''] : null;
    if (d) {
      const ln = d.lines[d.i] || {};
      S.dlg = { text: $('dlg-text').textContent, choices: ln.choices && !d.typing ? ln.choices.map((ch, k) => (k === d.sel ? '▶ ' : '   ') + (ch.icon ? ch.icon + ' ' : '') + ch.label) : null, typing: d.typing };
    }
    if (shown('arc-results')) {
      S.res = {
        title: txt('arcr-title'), tag: txt('arcr-tag'), msg: txt('arcr-msg'),
        stars: [...$('arcr-stars').children].filter((e) => e.classList.contains('on')).length,
        rewards: [...document.querySelectorAll('#arcr-rewards .rw')].map((e) => [e.querySelector('.rw-ico').textContent, e.querySelector('b').textContent, e.querySelector('small').textContent]),
        btns: [...$('arcr-btns').children].map((b) => [b.textContent.replace(/^\d/, '').replace('›', '').trim(), b.classList.contains('sel')]),
      };
    }
    if (this.inv.open) S.inv = { sel: this.inv.sel, list: this.ctx.gear.list().map((g) => [g.icon, g.name, g.has ? (g.on ? 'EQUIPADO' : 'GUARDADO') : '🔒 ' + g.from, g.effect]) };
    return S;
  }
  _draw(S) {
    const g = this.pg;
    g.clearRect(0, 0, PW, PH);
    g.textBaseline = 'top';
    const card = (x, y, w, h, border = 'rgba(127,246,255,0.85)') => {
      g.fillStyle = 'rgba(9,22,46,0.84)'; roundRect(g, x, y, w, h, 26); g.fill();
      g.lineWidth = 4; g.strokeStyle = border; g.stroke();
    };
    const F = (w, s) => `${w} ${s}px Nunito, system-ui, sans-serif`;
    // --- top: level HUD / center message / toasts
    let y = 8;
    if (S.arc) {
      card(40, y, PW - 80, 96, 'rgba(255,201,90,0.9)');
      g.fillStyle = '#fff'; g.font = F(900, 30); g.fillText(S.arc[0], 66, y + 14);
      g.fillStyle = '#ffc95a'; g.font = F(800, 24); g.fillText(S.arc[1] + (S.arc[3] ? '   ·   ' + S.arc[3] : ''), 66, y + 54);
      g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = F(900, 44); g.fillText(S.arc[2] + ' pts', PW - 70, y + 12);
      if (S.timer) { g.fillStyle = '#7ff6ff'; g.font = F(900, 26); g.fillText('⏱ ' + S.timer, PW - 70, y + 60); }
      g.textAlign = 'left';
      y += 108;
    } else if (S.timer) {
      card(PW / 2 - 110, y, 220, 64, 'rgba(255,201,90,0.9)');
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = F(900, 36); g.fillText(S.timer, PW / 2, y + 12); g.textAlign = 'left';
      y += 76;
    }
    if (S.center && S.center[0]) {
      g.textAlign = 'center';
      g.fillStyle = '#ffffff'; g.font = F(900, 70);
      g.shadowColor = 'rgba(0,30,80,0.9)'; g.shadowBlur = 16;
      g.fillText(S.center[0], PW / 2, y + 6);
      if (S.center[1]) { g.font = F(800, 30); g.fillText(S.center[1], PW / 2, y + 86); }
      g.shadowBlur = 0; g.textAlign = 'left';
      y += S.center[1] ? 130 : 92;
    }
    // --- middle: dialogue / results / inventory
    const mid = y + 6;
    if (S.res && !S.inv) {
      const R = S.res;
      const h = 420;
      card(30, mid, PW - 60, h, 'rgba(255,201,90,0.95)');
      g.textAlign = 'center';
      g.fillStyle = '#ffd23f'; g.font = F(900, 46); g.fillText('★'.repeat(R.stars) + '☆'.repeat(3 - R.stars), PW / 2, mid + 14);
      g.fillStyle = '#fff'; g.font = F(900, 46); g.fillText(R.title, PW / 2, mid + 66);
      g.fillStyle = '#bcd7f5'; g.font = F(800, 24); g.fillText(R.tag, PW / 2, mid + 120);
      g.textAlign = 'left';
      const tw = (PW - 120) / Math.max(1, R.rewards.length);
      R.rewards.forEach((rw, k) => {
        const x = 60 + k * tw;
        g.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(g, x + 4, mid + 160, tw - 8, 110, 16); g.fill();
        g.textAlign = 'center';
        g.font = F(800, 34); g.fillStyle = '#fff'; g.fillText(rw[0], x + tw / 2, mid + 168);
        g.font = F(900, 22); g.fillText(rw[1], x + tw / 2, mid + 212);
        g.font = F(700, 18); g.fillStyle = '#bcd7f5'; g.fillText(rw[2], x + tw / 2, mid + 242);
        g.textAlign = 'left';
      });
      const bw = (PW - 120) / Math.max(1, R.btns.length);
      R.btns.forEach((b, k) => {
        const x = 60 + k * bw;
        g.fillStyle = b[1] ? '#35e0ff' : 'rgba(255,255,255,0.1)'; roundRect(g, x + 6, mid + 300, bw - 12, 70, 35); g.fill();
        g.textAlign = 'center'; g.font = F(900, 24); g.fillStyle = b[1] ? '#06213a' : '#fff';
        g.fillText(b[0].slice(0, 26), x + bw / 2, mid + 322);
        g.textAlign = 'left';
      });
      g.font = F(700, 20); g.fillStyle = '#bcd7f5'; g.textAlign = 'center';
      g.fillText('Stick derecho ↑↓ para elegir · Gatillo para confirmar', PW / 2, mid + 386); g.textAlign = 'left';
      y = mid + h + 8;
    } else if (S.inv) {
      const h = 470;
      card(30, mid, PW - 60, h);
      g.fillStyle = '#ffc95a'; g.font = F(900, 22); g.fillText('INVENTARIO · MEJORAS DE TU EXPLORADOR', 60, mid + 18);
      S.inv.list.forEach((it, k) => {
        const yy = mid + 56 + k * 74, sel = k === S.inv.sel;
        g.fillStyle = sel ? 'rgba(53,224,255,0.22)' : 'rgba(255,255,255,0.05)'; roundRect(g, 50, yy, PW - 100, 66, 16); g.fill();
        if (sel) { g.lineWidth = 3; g.strokeStyle = '#7ff6ff'; g.stroke(); }
        g.font = F(800, 36); g.fillStyle = '#fff'; g.fillText(it[0], 66, yy + 12);
        g.font = F(900, 26); g.fillText(it[1], 124, yy + 8);
        g.font = F(700, 18); g.fillStyle = '#bcd7f5'; g.fillText(it[3].slice(0, 70), 124, yy + 40);
        g.textAlign = 'right'; g.font = F(900, 20); g.fillStyle = it[2] === 'EQUIPADO' ? '#22e07a' : '#d6e6f7'; g.fillText(it[2], PW - 70, yy + 12); g.textAlign = 'left';
      });
      g.font = F(700, 20); g.fillStyle = '#bcd7f5'; g.textAlign = 'center';
      g.fillText('Stick ↑↓ elegir · Gatillo equipar/guardar · Y o B cerrar', PW / 2, mid + h - 34); g.textAlign = 'left';
      y = mid + h + 8;
    } else if (S.dlg) {
      g.font = F(700, 30);
      const lines = wrap(g, S.dlg.text, PW - 220);
      const ch = S.dlg.choices || [];
      const h = 70 + lines.length * 40 + ch.length * 52 + 46;
      card(30, mid, PW - 60, h);
      // Neuri-X face
      const face = $('dlg-face');
      g.save(); g.beginPath(); g.arc(98, mid + 76, 46, 0, Math.PI * 2); g.closePath(); g.fillStyle = '#10306a'; g.fill(); g.clip();
      try { g.drawImage(face, 52, mid + 30, 92, 92); } catch { /* ignore */ }
      g.restore();
      g.fillStyle = '#35e0ff'; g.font = F(900, 22); g.fillText('NEURI-X', 168, mid + 20);
      g.fillStyle = '#fff'; g.font = F(700, 30);
      lines.forEach((l, k) => g.fillText(l, 168, mid + 54 + k * 40));
      let yy = mid + 62 + lines.length * 40;
      for (const c2 of ch) {
        const sel = c2.startsWith('▶');
        g.fillStyle = sel ? '#35e0ff' : 'rgba(255,255,255,0.1)'; roundRect(g, 168, yy, PW - 260, 44, 22); g.fill();
        g.fillStyle = sel ? '#06213a' : '#fff'; g.font = F(900, 24); g.fillText(c2.replace('▶ ', '').trim(), 190, yy + 9);
        yy += 52;
      }
      g.font = F(700, 20); g.fillStyle = '#bcd7f5';
      g.fillText(ch.length ? 'Stick ↑↓ para elegir · Gatillo para confirmar' : (S.dlg.typing ? '' : 'Gatillo ▶ continuar'), 168, yy + 4);
      y = mid + h + 8;
    }
    // --- toasts
    for (const tt of S.toasts) {
      if (y > PH - 230) break;
      g.font = F(800, 22);
      const ls = wrap(g, tt, PW - 200).slice(0, 2);
      const h = 18 + ls.length * 30;
      g.fillStyle = 'rgba(9,22,46,0.8)'; roundRect(g, 100, y, PW - 200, h, 18); g.fill();
      g.fillStyle = '#fff'; ls.forEach((l, k) => g.fillText(l, 120, y + 9 + k * 30));
      y += h + 6;
    }
    // --- bottom strip: minimap · mission · prompt
    const by = PH - 200;
    if (!S.res && !S.inv) {
      card(30, by, PW - 60, 190);
      const mm = $('mm');
      if (mm) {
        g.save(); g.beginPath(); g.arc(122, by + 95, 78, 0, Math.PI * 2); g.closePath(); g.clip();
        try { g.drawImage(mm, 44, by + 17, 156, 156); } catch { /* ignore */ }
        g.restore();
        g.lineWidth = 4; g.strokeStyle = '#7ff6ff'; g.beginPath(); g.arc(122, by + 95, 78, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = '#ffc95a'; g.font = F(900, 18); g.fillText('MISIÓN ACTIVA' + (S.zone && S.zone[0] ? '  ·  ' + S.zone[0].toUpperCase() : ''), 224, by + 18);
      g.fillStyle = '#fff'; g.font = F(900, 28); g.fillText(S.obj[0].slice(0, 46), 224, by + 44);
      g.fillStyle = '#bcd7f5'; g.font = F(700, 21);
      wrap(g, S.obj[1], PW - 300).slice(0, 2).forEach((l, k) => g.fillText(l, 224, by + 82 + k * 27));
      if (S.prompt) {
        g.fillStyle = '#35e0ff'; roundRect(g, 224, by + 138, PW - 290, 40, 20); g.fill();
        g.fillStyle = '#06213a'; g.font = F(900, 22); g.fillText('Gatillo  ▶  ' + S.prompt, 244, by + 146);
      } else {
        g.fillStyle = '#7f9bb8'; g.font = F(700, 18);
        g.fillText('A saltar · B impulso · X pista · Y inventario · stick derecho girar', 224, by + 150);
      }
    }
    this.ptex.needsUpdate = true;
  }
  _panel(dt, t) {
    const S = this._state();
    const sig = JSON.stringify(S);
    this._mmT -= dt;
    if (sig !== this._sig || this._mmT <= 0) { this._sig = sig; this._mmT = 0.25; this._draw(S); }
    // tag-along placement: re-centre when the view drifts away, lock in front for dialogues and menus
    const vc = this.viewCam;
    _e.setFromQuaternion(vc.quaternion);
    const headYaw = _e.y;
    const focus = !!(S.dlg || S.res || S.inv || (S.center && S.center[0]));
    let d = headYaw - this.panelYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 0.6) this.follow = true;
    if (Math.abs(d) < 0.05) this.follow = false;
    if (focus || this.follow) this.panelYaw += d * Math.min(1, dt * (focus ? 6 : 3));
    const dist = 1.15;
    const fx = -Math.sin(this.panelYaw), fz = -Math.cos(this.panelYaw);
    const drop = focus ? 0.12 : 0.36;
    this.panel.position.set(vc.position.x + fx * dist, vc.position.y - drop, vc.position.z + fz * dist);
    this.panel.lookAt(vc.position.x, vc.position.y - drop * 0.6, vc.position.z);
  }
}
