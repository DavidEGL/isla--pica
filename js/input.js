// Unified input: keyboard + mouse (pointer lock), touch (virtual joystick), gamepad.
export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };      // x right, y forward (-1..1)
    this.look = { x: 0, y: 0 };      // accumulated deltas this frame (radians-ish)
    this.sprint = false;
    this.pressed = new Set();        // edge-triggered actions: jump, interact, dash, pause, map, next, up, down
    this.held = { jump: false };
    this.sensitivity = 1;
    this.invertY = false;
    this.locked = false;
    this.touch = false;
    this.lastDevice = 'kb';
    this.gpPrev = [];
    this.enabled = true;
    this.zoom = 0;
    this._bind();
  }
  _press(a) { this.pressed.add(a); }
  consume(a) { const h = this.pressed.has(a); this.pressed.delete(a); return h; }
  _bind() {
    const map = {
      KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
    };
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (map[e.code]) e.preventDefault(); return; }
      this.lastDevice = 'kb';
      const k = map[e.code];
      if (k) { this.keys.add(k); e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.add('shift');
      if (e.code === 'Space') { this._press('jump'); this.held.jump = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'Enter') this._press('interact');
      if (e.code === 'KeyQ') this._press('dash');
      if (e.code === 'KeyM') this._press('map');
      if (e.code === 'KeyL') this._press('ach');
      if (e.code === 'KeyI') this._press('inv');
      if (e.code === 'KeyH') this._press('hint');
      if (e.code === 'Escape' || e.code === 'KeyP') this._press('pause');
      if (e.code === 'Digit1') this._press('choice0');
      if (e.code === 'Digit2') this._press('choice1');
      if (e.code === 'Digit3') this._press('choice2');
      if (e.code === 'ArrowUp') this._press('up');
      if (e.code === 'ArrowDown') this._press('down');
    });
    addEventListener('keyup', (e) => {
      const k = map[e.code];
      if (k) this.keys.delete(k);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.delete('shift');
      if (e.code === 'Space') this.held.jump = false;
    });
    addEventListener('blur', () => { this.keys.clear(); this.held.jump = false; });
    // mouse look
    this.canvas.addEventListener('click', () => {
      if (!this.touch && this.enabled && document.pointerLockElement !== this.canvas) {
        try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lastDevice = 'kb';
      this.look.x += e.movementX * 0.0023 * this.sensitivity;
      this.look.y += e.movementY * 0.0023 * this.sensitivity * (this.invertY ? -1 : 1);
    });
    // drag-look fallback when not locked (mouse)
    let drag = null;
    this.canvas.addEventListener('mousedown', (e) => { if (!this.locked && e.button === 0) drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', () => { drag = null; });
    addEventListener('mousemove', (e) => {
      if (!drag || this.locked) return;
      this.look.x += (e.clientX - drag.x) * 0.004 * this.sensitivity;
      this.look.y += (e.clientY - drag.y) * 0.004 * this.sensitivity;
      drag = { x: e.clientX, y: e.clientY };
    });
    addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('touchstart', () => { this.touch = true; this.lastDevice = 'touch'; document.body.classList.add('touch'); }, { once: true, passive: true });
    if (matchMedia('(pointer: coarse)').matches) { this.touch = true; document.body.classList.add('touch'); }
    this._bindTouch();
  }
  _bindTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    const lookZone = document.getElementById('look-zone');
    if (!stick || !lookZone) return;
    let sid = null, sx = 0, sy = 0;
    const R = 56;
    const startStick = (t) => {
      sid = t.identifier;
      const r = stick.getBoundingClientRect();
      sx = r.left + r.width / 2; sy = r.top + r.height / 2;
      moveStick(t);
    };
    const moveStick = (t) => {
      let dx = t.clientX - sx, dy = t.clientY - sy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.tmove = { x: dx / R, y: -dy / R };
      this.tsprint = d >= R * 0.98;
    };
    const endStick = () => { sid = null; this.tmove = null; this.tsprint = false; knob.style.transform = ''; };
    stick.addEventListener('touchstart', (e) => { e.preventDefault(); startStick(e.changedTouches[0]); }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) moveStick(t);
    }, { passive: true });
    addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === sid) endStick(); });
    addEventListener('touchcancel', endStick);
    const looks = new Map();
    lookZone.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) looks.set(t.identifier, { x: t.clientX, y: t.clientY });
    }, { passive: true });
    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const p = looks.get(t.identifier);
        if (!p) continue;
        this.look.x += (t.clientX - p.x) * 0.006 * this.sensitivity;
        this.look.y += (t.clientY - p.y) * 0.006 * this.sensitivity;
        looks.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }, { passive: true });
    const end = (e) => { for (const t of e.changedTouches) looks.delete(t.identifier); };
    lookZone.addEventListener('touchend', end);
    lookZone.addEventListener('touchcancel', end);
    const btn = (id, action, hold) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this._press(action); if (hold) this.held[hold] = true; el.classList.add('on'); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (hold) this.held[hold] = false; el.classList.remove('on'); }, { passive: false });
    };
    btn('btn-jump', 'jump', 'jump');
    btn('btn-act', 'interact');
    btn('btn-dash', 'dash');
    const sp = document.getElementById('btn-sprint');
    if (sp) sp.addEventListener('touchstart', (e) => { e.preventDefault(); this.tsprintToggle = !this.tsprintToggle; sp.classList.toggle('on', this.tsprintToggle); }, { passive: false });
  }
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.gp = gp;
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = (i, a) => { if (b(i) && !this.gpPrev[i]) { this._press(a); this.lastDevice = 'pad'; } };
    edge(0, 'jump'); edge(2, 'interact'); edge(1, 'dash'); edge(9, 'pause'); edge(8, 'map'); edge(3, 'map');
    edge(12, 'up'); edge(13, 'down');
    this.held.padJump = b(0);
    if (b(10) && !this.gpPrev[10]) this.padSprintToggle = !this.padSprintToggle;
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0) this.lastDevice = 'pad';
    // stick up/down for menus (edge)
    if (ly < -0.6 && !(this.gpPrevLy < -0.6)) this._press('up');
    if (ly > 0.6 && !(this.gpPrevLy > 0.6)) this._press('down');
    this.gpPrevLy = ly;
    this.gpPrev = gp.buttons.map((x) => x.pressed);
    return { lx, ly, rx, ry, sprint: b(7) || b(6) || b(5) || this.padSprintToggle };
  }
  update(dt) {
    const gp = this.pollGamepad();
    let x = 0, y = 0;
    if (this.keys.has('f')) y += 1;
    if (this.keys.has('b')) y -= 1;
    if (this.keys.has('r')) x += 1;
    if (this.keys.has('l')) x -= 1;
    let sprint = this.keys.has('shift');
    if (this.tmove) { x += this.tmove.x; y += this.tmove.y; sprint = sprint || this.tsprint || this.tsprintToggle; }
    else if (this.tsprintToggle) sprint = true;
    if (gp) {
      x += gp.lx; y -= gp.ly;
      sprint = sprint || gp.sprint;
      this.look.x += gp.rx * 2.6 * dt * this.sensitivity;
      this.look.y += gp.ry * 1.9 * dt * this.sensitivity * (this.invertY ? -1 : 1);
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.move.x = x; this.move.y = y;
    this.sprint = sprint;
    this.jumpHeld = this.held.jump || this.held.padJump;
    if (!this.enabled) { this.move.x = this.move.y = 0; this.sprint = false; }
  }
  takeLook() { const l = { x: this.look.x, y: this.look.y }; this.look.x = this.look.y = 0; return l; }
  takeZoom() { const z = this.zoom; this.zoom = 0; return z; }
}
