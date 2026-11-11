// HUD, dialogue, minimap, toasts, menus.
import { WORLD, heightAt, pathMask, PADS, riverDist, BRIDGE } from './terrain.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(audio) {
    this.audio = audio;
    this.dialogOpen = false;
    this._dlg = null;
    this.markers = [];       // {x,z,color,label,kind}
    this.objectiveTarget = null;
    this._buildMapBase();
    this._loadMapArt();
    this._drawFace();
    $('dialog').addEventListener('click', () => this._advance());
  }
  // ---------------- HUD
  setObjective(text, sub = '', target = null) {
    $('obj-text').textContent = text;
    $('obj-sub').textContent = sub;
    this.objectiveTarget = target;
    const o = $('objective');
    o.classList.remove('pulse'); void o.offsetWidth; o.classList.add('pulse');
  }
  setStats(s) {
    $('st-crystals').textContent = s.crystals;
    $('st-crystals-of').textContent = '/' + s.crystalsTotal;
    $('st-lvl').textContent = s.level;
    $('st-xp').textContent = `${Math.round(s.levelFrac * 250)} / 250 EXP`;
    $('st-xpbar').style.width = Math.round(s.levelFrac * 100) + '%';
    for (const el of $('st-parts').children) {
      const p = el.dataset.part;
      el.classList.toggle('on', !!s.parts[p]);
      el.classList.toggle('placed', !!(s.placed && s.placed[p]));
    }
  }
  // checklist under the active mission: [{text, done, cur}]
  setSteps(steps) {
    const key = JSON.stringify(steps || []);
    if (key === this._stepsKey) return;
    this._stepsKey = key;
    const ul = $('obj-steps');
    ul.innerHTML = (steps || []).map((st) => `<li class="${st.done ? 'done' : ''}${st.cur ? ' cur' : ''}"><i></i><span>${st.text}</span></li>`).join('');
  }
  setZone(name, sub) {
    const k = name + '|' + sub;
    if (k === this._zoneKey) return;
    this._zoneKey = k;
    $('zone-name').textContent = name;
    $('zone-sub').textContent = sub;
  }
  setHint(html) {
    const h = $('hintbar');
    if (!html) { h.classList.add('hidden'); this._hint = null; return; }
    if (this._hint !== html) { $('hint-text').innerHTML = html; this._hint = html; }
    h.classList.remove('hidden');
  }
  bump(which) {
    const el = which === 'crystal' ? $('st-crystals').parentElement : $('st-xp').parentElement;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  setPrompt(text, device) {
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); this._prompt = null; return; }
    const key = device === 'pad' ? 'X' : device === 'touch' ? '●' : 'E';
    $('hintbar').classList.toggle('under', !!text);
    if (this._prompt !== text + key) {
      $('prompt-text').textContent = text;
      $('prompt-key').textContent = key;
      p.classList.remove('hidden');
      this._prompt = text + key;
    }
  }
  setTimer(sec) {
    const t = $('timer');
    if (sec === null || sec === undefined) { t.classList.add('hidden'); return; }
    t.classList.remove('hidden');
    t.textContent = sec.toFixed(1) + ' s';
    t.classList.toggle('warn', sec < 3);
  }
  toast(text, sub = '', icon = '✨', ach = false, dur = 2.6) {
    const el = document.createElement('div');
    el.className = 'toast' + (ach ? ' ach' : '');
    el.style.setProperty('--d', dur + 's');
    el.innerHTML = `<span class="t-ico">${icon}</span><div>${text}${sub ? `<small>${sub}</small>` : ''}</div>`;
    $('toasts').appendChild(el);
    if (this.voice && !this.dialogOpen && text.startsWith('Neuri-X: ')) this.voice.speak(text.slice(9));
    setTimeout(() => el.remove(), (dur + 0.5) * 1000);
  }
  centerMsg(text, sub = '', dur = 2.4) {
    const c = $('center-msg');
    c.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    c.classList.remove('hidden');
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    clearTimeout(this._cm);
    this._cm = setTimeout(() => c.classList.add('hidden'), dur * 1000);
  }
  flash() {
    const f = $('flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }
  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  // ---------------- dialogue
  _drawFace() {
    const c = $('dlg-face'), g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#f6f9fb';
    g.beginPath(); g.ellipse(64, 66, 50, 44, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#19d3c5';
    g.beginPath(); g.ellipse(13, 66, 9, 15, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(115, 66, 9, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0c1a2b';
    g.beginPath(); g.ellipse(64, 70, 38, 28, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8ff8ff'; g.shadowColor = '#35e0ff'; g.shadowBlur = 10;
    const m = this._faceMood || 'normal';
    if (m === 'happy') {
      g.strokeStyle = '#8ff8ff'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(49, 74, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.arc(79, 74, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    } else {
      const h = m === 'surprised' ? 13 : m === 'think' ? 5 : 10;
      g.beginPath(); g.ellipse(49, 68, 7, h, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(79, 68, 7, h, 0, 0, Math.PI * 2); g.fill();
    }
    g.shadowBlur = 0;
    g.fillStyle = '#35e0ff';
    g.beginPath(); g.arc(70, 18, 5, 0, Math.PI * 2); g.fill();
    for (const o of document.querySelectorAll('canvas.nx-face')) { const og = o.getContext('2d'); og.clearRect(0, 0, 128, 128); og.drawImage(c, 0, 0); }
  }
  // lines: [{text, mood, choices:[{label,value}], gesture}]
  say(lines, hooks = {}) {
    return new Promise((resolve) => {
      this.dialogOpen = true;
      this._dlg = { lines, i: -1, resolve, hooks, typing: false, value: undefined };
      $('dialog').classList.remove('hidden');
      this._nextLine();
    });
  }
  _nextLine() {
    const d = this._dlg;
    d.i++;
    if (d.i >= d.lines.length) { this._close(); return; }
    const ln = d.lines[d.i];
    this._faceMood = ln.mood || 'normal';
    this._drawFace();
    d.hooks.onLine && d.hooks.onLine(ln);
    d.voiced = !!(this.voice && this.voice.speak(ln.text));
    d.full = ln.text;
    d.shown = 0;
    d.typing = true;
    d.sel = 0;
    $('dlg-choices').innerHTML = '';
    $('dlg-next').style.visibility = 'hidden';
    $('dlg-text').innerHTML = '';
  }
  _renderChoices() {
    const d = this._dlg, ln = d.lines[d.i];
    const box = $('dlg-choices');
    box.innerHTML = '';
    if (!ln.choices) { $('dlg-next').style.visibility = 'visible'; return; }
    ln.choices.forEach((c, k) => {
      const b = document.createElement('button');
      b.className = 'choice' + (k === d.sel ? ' sel' : '');
      b.innerHTML = `<span class="c-ico">${c.icon || '✦'}</span><span class="c-lab">${c.label}</span><span class="c-go">›</span><span class="n">${k + 1}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); this._choose(k); });
      box.appendChild(b);
    });
  }
  _choose(k) {
    const d = this._dlg;
    if (!d) return;
    const ln = d.lines[d.i];
    if (!ln.choices || d.typing) return;
    this.audio && this.audio.play('blip');
    d.value = ln.choices[k].value;
    d.hooks.onChoice && d.hooks.onChoice(d.value);
    this._close();
  }
  _advance() {
    const d = this._dlg;
    if (!d) return;
    const ln = d.lines[d.i];
    if (d.typing) { d.shown = d.full.length; return; }
    if (ln.choices) { this._choose(d.sel); return; }
    this.audio && this.audio.play('blip');
    this._nextLine();
  }
  _close() {
    const d = this._dlg;
    this._dlg = null;
    this.dialogOpen = false;
    $('dialog').classList.add('hidden');
    if (this.voice) this.voice.stop();
    d.hooks.onEnd && d.hooks.onEnd();
    d.resolve(d.value);
  }
  updateDialog(dt, input) {
    const d = this._dlg;
    if (!d) return;
    const ln = d.lines[d.i];
    if (d.typing) {
      const before = Math.floor(d.shown);
      d.shown = Math.min(d.full.length, d.shown + dt * 52);
      if (!d.voiced && Math.floor(d.shown) !== before && Math.floor(d.shown) % 3 === 0) this.audio && this.audio.play('talk');
      $('dlg-text').innerHTML = this._fmt(d.full.slice(0, Math.floor(d.shown)));
      if (d.shown >= d.full.length) { d.typing = false; $('dlg-text').innerHTML = this._fmt(d.full); this._renderChoices(); }
    }
    if (input.consume('interact') || input.consume('jump')) this._advance();
    if (ln && ln.choices && !d.typing) {
      if (input.consume('up')) { d.sel = (d.sel + ln.choices.length - 1) % ln.choices.length; this._renderChoices(); }
      if (input.consume('down')) { d.sel = (d.sel + 1) % ln.choices.length; this._renderChoices(); }
      for (let k = 0; k < 3; k++) if (input.consume('choice' + k) && k < ln.choices.length) this._choose(k);
    }
  }
  get talking() { return !!(this._dlg && this._dlg.typing) || !!(this.voice && this.voice.speaking); }
  _fmt(s) { return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*\*[^*]*$/, (m) => m.replace(/\*\*/g, '')); }

  // ---------------- minimap
  _buildMapBase() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    // agua real (mar, río y lago) para pintarla sobre la ilustración del minimapa
    const wc = document.createElement('canvas');
    wc.width = wc.height = S;
    const wg = wc.getContext('2d'), water = wg.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = -WORLD / 2 + (i + 0.5) / S * WORLD, z = -WORLD / 2 + (j + 0.5) / S * WORLD;
      const h = heightAt(x, z);
      let r, gg, b;
      if (h < 0) { const k = clamp(-h / 8, 0, 1); r = 60 - 45 * k; gg = 210 - 120 * k; b = 225 - 50 * k; }
      else if (h < 1.6) { r = 236; gg = 215; b = 160; }
      else { const k = clamp(h / 45, 0, 1); r = 95 + 90 * k; gg = 180 - 30 * k; b = 80 + 60 * k; }
      if (h > 0 && pathMask(x, z) > 0.5) { r = 245; gg = 228; b = 190; }
      const o = (j * S + i) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
      if (h < 0) {
        // turquesa de la orilla, algo más profundo al alejarse, con borde suave
        const k = clamp(-h / 3, 0, 0.5);
        water.data[o] = 40 - 39 * k; water.data[o + 1] = 205 - 68 * k; water.data[o + 2] = 215 - 43 * k;
        water.data[o + 3] = clamp(-h / 0.4, 0, 1) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    wg.putImageData(water, 0, 0);
    this.mapWater = wc;
    const toPx = (v) => (v + WORLD / 2) / WORLD * S;
    const padCols = { plaza: '#ffffff', neuro: '#ffcf70', steam: '#c4a8ff', english: '#9cc4ff', tech: '#8ef0b2' };
    for (const k in PADS) {
      const p = PADS[k];
      g.fillStyle = padCols[k] || '#fff';
      g.globalAlpha = 0.85;
      g.beginPath(); g.arc(toPx(p.x), toPx(p.z), p.r / WORLD * S, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    this.mapBase = c;
  }
  // ilustración del mapa: el mapa grande la usa tal cual y el minimapa con el agua y el puente reales encima
  _loadMapArt() {
    this._mapArt = new Image();
    this._mapArt.onload = () => {
      this._buildMiniArt(this._mapArt);
      if (!$('mapfull').classList.contains('hidden') && this._bigArgs) this.drawBigMap(...this._bigArgs);
    };
    this._mapArt.src = './assets/maps/epic-island-buildings.jpg';
  }
  _buildMiniArt(art) {
    const S = art.naturalWidth;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.drawImage(art, 0, 0, S, S);
    // el agua real solo se pinta donde la ilustración muestra tierra: el mar conserva sus olas
    const M = this.mapWater.width;
    const clip = document.createElement('canvas');
    clip.width = clip.height = M;
    const cg = clip.getContext('2d');
    cg.drawImage(art, 0, 0, M, M);
    const seen = cg.getImageData(0, 0, M, M).data;
    const water = this.mapWater.getContext('2d').getImageData(0, 0, M, M);
    for (let o = 0; o < seen.length; o += 4) {
      const r = seen[o], gr = seen[o + 1], b = seen[o + 2];
      if ((b > r * 1.1 && b > gr * 0.85) || Math.min(r, gr, b) > 200) water.data[o + 3] = 0; // azul o turquesa, o espuma blanca
    }
    cg.putImageData(water, 0, 0);
    g.drawImage(clip, 0, 0, S, S);
    const toPx = (v) => (v + WORLD / 2) / WORLD * S;
    const w = BRIDGE.w / WORLD * S;
    g.lineCap = 'butt';
    for (const [color, lw] of [['#7a5636', w * 1.35], ['#c8955f', w]]) {
      g.strokeStyle = color; g.lineWidth = lw;
      g.beginPath(); g.moveTo(toPx(BRIDGE.ax), toPx(BRIDGE.az)); g.lineTo(toPx(BRIDGE.bx), toPx(BRIDGE.bz)); g.stroke();
    }
    this.miniArt = c;
  }
  drawMinimap(player, extra) {
    const c = $('mm'), g = c.getContext('2d');
    const W = c.width;
    const base = this.miniArt || this.mapBase; // el mapa dibujado queda de respaldo hasta que cargue la ilustración
    const S = base.width;
    const viewM = 150; // meters across
    const scale = W / (viewM / WORLD * S);
    g.save();
    g.fillStyle = this.miniArt ? '#018aab' : '#0e5ea9'; g.fillRect(0, 0, W, W);
    const px = (player.pos.x + WORLD / 2) / WORLD * S, pz = (player.pos.z + WORLD / 2) / WORLD * S;
    g.translate(W / 2, W / 2);
    g.scale(scale, scale);
    g.translate(-px, -pz);
    g.drawImage(base, 0, 0);
    g.restore();
    const toMini = (x, z) => [W / 2 + (x - player.pos.x) / viewM * W, W / 2 + (z - player.pos.z) / viewM * W];
    // markers
    for (const m of this.markers) {
      if (m.hidden) continue;
      let [mx, my] = toMini(m.x, m.z);
      const dx = mx - W / 2, dy = my - W / 2, dd = Math.hypot(dx, dy), R = W / 2 - 14;
      const off = dd > R;
      if (off) { if (!m.edge) continue; mx = W / 2 + dx / dd * R; my = W / 2 + dy / dd * R; }
      g.fillStyle = m.color;
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(mx, my, m.size || 9, 0, Math.PI * 2); g.fill(); g.stroke();
      if (m.label) { g.fillStyle = '#0b1b3a'; g.font = '900 12px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(m.label, mx, my + 1); }
    }
    if (extra && extra.crystals) {
      g.fillStyle = '#7ff6ff';
      for (const cr of extra.crystals) {
        if (cr.taken) continue;
        const [mx, my] = toMini(cr.x, cr.z);
        if (Math.hypot(mx - W / 2, my - W / 2) < W / 2 - 6) { g.beginPath(); g.arc(mx, my, 3.5, 0, Math.PI * 2); g.fill(); }
      }
    }
    if (extra && extra.buddy) {
      const [mx, my] = toMini(extra.buddy.x, extra.buddy.z);
      g.fillStyle = '#35e0ff'; g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.arc(mx, my, 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // objective
    if (this.objectiveTarget) {
      const t = this.objectiveTarget;
      let [mx, my] = toMini(t.x, t.z);
      const dx = mx - W / 2, dy = my - W / 2, dd = Math.hypot(dx, dy), R = W / 2 - 16;
      if (dd > R) { mx = W / 2 + dx / dd * R; my = W / 2 + dy / dd * R; }
      const pul = 1 + Math.sin(performance.now() / 200) * 0.18;
      g.fillStyle = '#ffb020'; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(mx, my - 13 * pul); g.lineTo(mx + 10 * pul, my); g.lineTo(mx, my + 13 * pul); g.lineTo(mx - 10 * pul, my); g.closePath();
      g.fill(); g.stroke();
    }
    // player arrow
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(-player.yaw + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#0b1b3a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -15); g.lineTo(10, 11); g.lineTo(0, 5); g.lineTo(-10, 11); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  drawBigMap(player, extra) {
    this._bigArgs = [player, extra];
    const c = $('bigmap'), g = c.getContext('2d');
    const W = c.width, k = W / 1000;
    const art = this._mapArt;
    g.drawImage(art.complete && art.naturalWidth ? art : this.mapBase, 0, 0, W, W);
    const toP = (x, z) => [(x + WORLD / 2) / WORLD * W, (z + WORLD / 2) / WORLD * W];
    // Names sit below the illustrated buildings; indicators keep world coordinates.
    const layout = {
      'Plaza Central': [50, 60], 'Distrito Neuro': [27, 55], 'Distrito STEAM': [36, 35],
      'English (próx.)': [59, 35], 'Technology (próx.)': [76, 55],
      'Mirador': [39, 75], 'Viaje al Cerebro': [27, 57.8],
      'Sala de Matemáticas': [36, 37.8], 'Sala de Retos': [27, 60.6],
    };
    const stage = c.parentElement;
    let labels = stage.querySelector('.map-labels');
    if (!labels) { labels = document.createElement('div'); labels.className = 'map-labels'; stage.append(labels); }
    labels.replaceChildren();
    for (const m of this.markers) {
      const slot = layout[m.name];
      if (m.hidden || !slot) continue;
      const label = document.createElement('div'); label.className = 'map-zone-caption';
      label.style.left = slot[0] + '%'; label.style.top = slot[1] + '%';
      if (m.name === 'Viaje al Cerebro') label.style.top = 'calc(55% + var(--caption-step))';
      if (m.name === 'Sala de Retos') label.style.top = 'calc(55% + var(--caption-step) + var(--caption-step))';
      if (m.name === 'Sala de Matemáticas') label.style.top = 'calc(35% + var(--caption-step))';
      label.textContent = m.name.replace('English (próx.)', 'Distrito English').replace('Technology (próx.)', 'Distrito Technology');
      if (m.name.startsWith('Sala ') || m.name === 'Viaje al Cerebro') label.classList.add('minor');
      labels.append(label);
    }
    if (extra && extra.crystals) {
      g.fillStyle = '#7ff6ff'; g.strokeStyle = '#fff'; g.lineWidth = 2 * k;
      for (const cr of extra.crystals) if (!cr.taken) { const [x, y] = toP(cr.x, cr.z); g.beginPath(); g.arc(x, y, 9 * k, 0, Math.PI * 2); g.fill(); g.stroke(); }
      const t = extra.crystals.filter((cr) => cr.taken).length;
      $('map-crystals').textContent = `${t} / ${extra.crystals.length}`;
    }
    $('map-objective').textContent = $('obj-text').textContent || '—';
    if (this.objectiveTarget) {
      const [x, y] = toP(this.objectiveTarget.x, this.objectiveTarget.z);
      g.fillStyle = '#ffad34'; g.strokeStyle = '#fff'; g.lineWidth = 3 * k;
      g.beginPath(); g.moveTo(x, y - 18 * k); g.lineTo(x + 13 * k, y); g.lineTo(x, y + 18 * k); g.lineTo(x - 13 * k, y); g.closePath(); g.fill(); g.stroke();
    }
    const [x, y] = toP(player.pos.x, player.pos.z);
    g.save(); g.translate(x, y); g.rotate(-player.yaw + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#0b1b3a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -20); g.lineTo(13, 14); g.lineTo(0, 7); g.lineTo(-13, 14); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
