// Tiny synthesized sound engine (no audio files needed).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.vol = 0.7;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.ctx.destination);
      // noise buffer
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._ambience();
    } catch { this.ctx = null; }
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; }
  _ambience() {
    const c = this.ctx;
    // ocean: filtered noise with slow swell
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.09;
    const lg = c.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.ambGain = g;
    // waterfall bed (controlled by distance)
    const w = c.createBufferSource(); w.buffer = this.noise; w.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
    const wg = c.createGain(); wg.gain.value = 0;
    w.connect(bp); bp.connect(wg); wg.connect(this.master); w.start();
    this.fallGain = wg;
    // soft music pad: slow evolving chords
    this.padGain = c.createGain(); this.padGain.gain.value = 0.035; this.padGain.connect(this.master);
    const chords = [[261.6, 329.6, 392.0, 493.9], [220.0, 277.2, 329.6, 415.3], [174.6, 220.0, 261.6, 329.6], [196.0, 246.9, 293.7, 392.0]];
    let ci = 0;
    const playChord = () => {
      if (!this.ctx) return;
      const now = c.currentTime;
      chords[ci % chords.length].forEach((f, i) => {
        const o = c.createOscillator(); o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = f / 2;
        const og = c.createGain(); og.gain.setValueAtTime(0, now); og.gain.linearRampToValueAtTime(0.5, now + 2.5); og.gain.linearRampToValueAtTime(0, now + 8.5);
        o.connect(og); og.connect(this.padGain); o.start(now); o.stop(now + 9);
      });
      ci++;
      this._padTimer = setTimeout(playChord, 7000);
    };
    playChord();
  }
  setIndoor(on) { if (this.ambGain) this.ambGain.gain.value = on ? 0.012 : 0.05; }
  setWaterfall(d) { if (!Number.isFinite(d)) { if (!this._w) { this._w = 1; console.warn('wfNaN', d); } return; } if (this.fallGain) this.fallGain.gain.value = Math.max(0, 1 - d / 70) * 0.12; }
  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, freq, vol = 0.2, type = 'lowpass', delay = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  play(name, k = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'step': this.burst(0.07, 900 + Math.random() * 500, 0.06 * k); break;
      case 'jump': this.tone(330, 0.16, 'triangle', 0.08, 2.0); this.burst(0.12, 2500, 0.03, 'highpass'); break;
      case 'land': this.burst(0.16, 500, 0.12 * k); this.tone(110, 0.12, 'sine', 0.1 * k, 0.6); break;
      case 'dash': this.burst(0.22, 1800, 0.09, 'bandpass'); this.tone(500, 0.2, 'sawtooth', 0.03, 0.4); break;
      case 'crystal': [880, 1174.7, 1568].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.09, 1, i * 0.06)); break;
      case 'pick': this.tone(520, 0.14, 'triangle', 0.1, 1.5); break;
      case 'drop': this.tone(620, 0.14, 'triangle', 0.1, 0.6); break;
      case 'good': [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, 1, i * 0.08)); break;
      case 'bad': this.tone(220, 0.28, 'square', 0.05, 0.7); this.tone(185, 0.3, 'square', 0.04, 0.7, 0.12); break;
      case 'blip': this.tone(980, 0.05, 'square', 0.025); break;
      case 'talk': this.tone(600 + Math.random() * 300, 0.05, 'sine', 0.03); break;
      case 'switch': this.tone(300, 0.08, 'square', 0.05); this.tone(600, 0.1, 'square', 0.04, 1, 0.07); break;
      case 'pulse': this.tone(1200, 0.12, 'sine', 0.05, 0.5); break;
      case 'tick': this.tone(1400, 0.04, 'square', 0.03); break;
      case 'reward': [659.3, 784, 987.8, 1318.5, 1568].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.09, 1, i * 0.09)); break;
      case 'snap': this.tone(1046, 0.1, 'sine', 0.12); this.burst(0.08, 4000, 0.05, 'highpass'); this.tone(523, 0.3, 'triangle', 0.08, 1, 0.05); break;
      case 'fanfare': {
        const seq = [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5];
        seq.forEach((f, i) => { this.tone(f, 0.4, 'triangle', 0.11, 1, i * 0.13); this.tone(f / 2, 0.4, 'sine', 0.06, 1, i * 0.13); });
        break;
      }
      case 'portal': this.burst(0.8, 700, 0.12, 'bandpass'); this.tone(180, 0.75, 'sine', 0.09, 4); this.tone(360, 0.6, 'triangle', 0.05, 3, 0.08); break;
      case 'achieve': [784, 987.8, 1174.7].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.08, 1, i * 0.1)); break;
      default: break;
    }
  }
}
