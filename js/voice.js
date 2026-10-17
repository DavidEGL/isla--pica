// Neuri-X voice: pre-generated speech clips (looked up by a hash of the line) with a Web Speech fallback.
export function voiceKey(text) {
  const n = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (const ch of n) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class Voice {
  constructor(sfx) {
    this.sfx = sfx;
    this.map = null;
    this.audio = null;
    this.enabled = true;
    this.cache = new Map();
    this._tts = false;
    fetch('./assets/voice/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => { this.map = m; }).catch(() => {});
  }
  get speaking() {
    if (this.audio && !this.audio.paused && !this.audio.ended) return true;
    try { return this._tts && window.speechSynthesis.speaking; } catch { return false; }
  }
  speak(text) {
    this.stop();
    if (!this.enabled || (this.sfx && this.sfx.muted) || !text) return false;
    const k = voiceKey(text);
    const file = this.map && this.map[k];
    if (file) {
      let a = this.cache.get(k);
      if (!a) { a = new Audio('./assets/voice/' + file); a.preload = 'auto'; this.cache.set(k, a); }
      try { a.currentTime = 0; } catch { /* not loaded yet */ }
      a.volume = 1;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
      this.audio = a;
      return true;
    }
    return this._fallback(text);
  }
  // Browser speech synthesis for any line without a recorded clip
  _fallback(text) {
    try {
      const ss = window.speechSynthesis;
      if (!ss) return false;
      const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, '').replace(/Neuri-X/g, 'Neuri Equis'));
      const vs = ss.getVoices();
      const v = vs.find((x) => /^es[-_](MX|US|419)/i.test(x.lang)) || vs.find((x) => /^es/i.test(x.lang));
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'es-MX';
      u.rate = 1.05;
      u.pitch = 1.15;
      ss.speak(u);
      this._tts = true;
      return true;
    } catch { return false; }
  }
  stop() {
    if (this.audio) { try { this.audio.pause(); } catch { /* ignore */ } this.audio = null; }
    if (this._tts) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } this._tts = false; }
  }
}
