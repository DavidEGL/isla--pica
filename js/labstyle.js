// Bright "Laboratorio EpicGroup" look shared by the interiors: pearl floors with cyan/gold light lines,
// glass hologram capsules, planters, slogan panels and a sunny sky with floating islands.
import * as THREE from 'three';
import { mulberry32, roundRect } from './util.js';

export const SKY = { top: 0x7cc4ff, mid: 0xcfeaff, low: 0xfff1dc, fog: 0xdff0ff };

export function pearlMat() { return new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.28, metalness: 0.18 }); }
export function silverMat() { return new THREE.MeshStandardMaterial({ color: 0xd9e2ee, roughness: 0.3, metalness: 0.55 }); }
export function goldMat() { return new THREE.MeshStandardMaterial({ color: 0xffc95a, roughness: 0.25, metalness: 0.75, emissive: 0x6b4200, emissiveIntensity: 0.25 }); }
export function glassMat(tint = 0xcff3ff) { return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }); }
export function lightMat(c, i = 1.8) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 }); }

// Top texture for a round floor: pearl tiles, concentric light rings and radial strips
export function roundFloorTexture(accent = '#35e0ff', gold = '#ffc95a') {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#eef3f9'); gr.addColorStop(1, '#dfe7f1');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(120,150,190,0.22)'; g.lineWidth = 2;
  for (let r = 60; r < S / 2; r += 64) { g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke(); }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * 60, S / 2 + Math.sin(a) * 60); g.lineTo(S / 2 + Math.cos(a) * S / 2, S / 2 + Math.sin(a) * S / 2); g.stroke(); }
  const glow = (r, col, w) => { g.save(); g.shadowColor = col; g.shadowBlur = 18; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke(); g.restore(); };
  glow(S * 0.2, accent, 6); glow(S * 0.36, gold, 4); glow(S * 0.485, accent, 8);
  g.save(); g.shadowColor = accent; g.shadowBlur = 14; g.strokeStyle = accent; g.lineWidth = 5;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.21, S / 2 + Math.sin(a) * S * 0.21); g.lineTo(S / 2 + Math.cos(a) * S * 0.35, S / 2 + Math.sin(a) * S * 0.35); g.stroke(); }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
export function rectFloorTexture(w, h, accent = '#35e0ff') {
  const k = 32, c = document.createElement('canvas');
  c.width = w * k; c.height = h * k;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f6fb'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(120,150,190,0.25)'; g.lineWidth = 2;
  for (let x = 0; x <= w; x += 2) { g.beginPath(); g.moveTo(x * k, 0); g.lineTo(x * k, c.height); g.stroke(); }
  for (let z = 0; z <= h; z += 2) { g.beginPath(); g.moveTo(0, z * k); g.lineTo(c.width, z * k); g.stroke(); }
  g.save(); g.shadowColor = accent; g.shadowBlur = 16; g.strokeStyle = accent; g.lineWidth = 7;
  roundRect(g, 10, 10, c.width - 20, c.height - 20, 40); g.stroke(); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// floor top disk (sits just above a collider-backed platform)
export function floorDisk(R, accent) {
  const tex = roundFloorTexture(accent);
  const m = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.22, metalness: 0.1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.receiveShadow = true;
  return m;
}

// Gradient sky sphere (no fog) for the interiors
export function skyDome(radius = 900) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(SKY.top) }, mid: { value: new THREE.Color(SKY.mid) }, low: { value: new THREE.Color(SKY.low) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, mid, low; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, low, smoothstep(0.0, -0.35, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// Floating islands with trees and waterfalls, scattered on a ring around the origin
export function floatingIslands(seed = 9, n = 16, r0 = 230, r1 = 330) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: 0xc9a27e, roughness: 0.9, flatShading: true });
  const rock2 = new THREE.MeshStandardMaterial({ color: 0xa88566, roughness: 0.9, flatShading: true });
  const grass = new THREE.MeshStandardMaterial({ color: 0x7ccf5f, roughness: 0.8, flatShading: true });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4fb35a, roughness: 0.8, flatShading: true });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.9 });
  const water = new THREE.MeshBasicMaterial({ color: 0xd8f3ff, transparent: true, opacity: 0.75, fog: true });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
    const r = r0 + rnd() * (r1 - r0);
    const s = 10 + rnd() * 22;
    const isl = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(s, s * (1.4 + rnd()), 7, 1), rnd() < 0.5 ? rock : rock2);
    body.rotation.x = Math.PI;
    body.position.y = -s * 0.75;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.02, s * 0.98, s * 0.18, 7), grass);
    isl.add(body, top);
    const trees = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < trees; k++) {
      const ta = rnd() * Math.PI * 2, tr = rnd() * s * 0.6, h = s * (0.35 + rnd() * 0.3);
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.03, s * 0.04, h, 5), trunk);
      t1.position.set(Math.cos(ta) * tr, h / 2, Math.sin(ta) * tr);
      const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(s * (0.16 + rnd() * 0.1), 0), leaf);
      c1.position.set(t1.position.x, h, t1.position.z);
      isl.add(t1, c1);
    }
    if (rnd() < 0.55) {
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.18, s * 2.2), water);
      fall.position.set(0, -s * 1.1, s * 0.95);
      isl.add(fall);
    }
    isl.position.set(Math.cos(a) * r, -40 + rnd() * 90, Math.sin(a) * r);
    isl.rotation.y = rnd() * Math.PI;
    g.add(isl);
  }
  // soft clouds
  const cloud = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2, r = 160 + rnd() * 220;
    const cg = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + rnd() * 7, 1), cloud);
      p.position.set((k - 2) * 7 + rnd() * 3, rnd() * 4, rnd() * 5);
      p.scale.y = 0.6;
      cg.add(p);
    }
    cg.position.set(Math.cos(a) * r, -60 + rnd() * 30, Math.sin(a) * r);
    g.add(cg);
  }
  return g;
}

// Planter with a rounded bush and a few flowers
export function planter(rnd = Math.random) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.9, 20), pearlMat());
  pot.position.y = 0.45;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 32), lightMat(0x35e0ff, 1.4));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.9;
  g.add(pot, rim);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x55c46a, roughness: 0.75, flatShading: true });
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + rnd() * 0.25, 1), leaf);
    b.position.set((rnd() - 0.5) * 0.8, 1.15 + rnd() * 0.5, (rnd() - 0.5) * 0.8);
    g.add(b);
  }
  const fl = [0xff8fd0, 0xffd23f, 0xffffff];
  for (let k = 0; k < 5; k++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: fl[k % 3], emissive: fl[k % 3], emissiveIntensity: 0.3 }));
    f.position.set((rnd() - 0.5) * 1.1, 1.4 + rnd() * 0.6, (rnd() - 0.5) * 1.1);
    g.add(f);
  }
  return g;
}

// Slanted glass wall panel with a slogan (like the lab screens in the reference)
export function sloganPanel(lines, accent = '#35e0ff', w = 6, h = 3.4) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = Math.round(768 * h / w);
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, c.height);
  gr.addColorStop(0, 'rgba(20,60,140,0.86)'); gr.addColorStop(1, 'rgba(10,30,80,0.9)');
  g.fillStyle = gr;
  roundRect(g, 8, 8, c.width - 16, c.height - 16, 36); g.fill();
  g.lineWidth = 8; g.strokeStyle = accent; g.shadowColor = accent; g.shadowBlur = 20; g.stroke(); g.shadowBlur = 0;
  g.fillStyle = '#e9fbff';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const fs = Math.min(92, (c.height - 80) / lines.length * 0.82);
  g.font = `900 ${fs}px Nunito, system-ui, sans-serif`;
  g.shadowColor = accent; g.shadowBlur = 16;
  lines.forEach((ln, i) => g.fillText(ln, 56, 40 + (i + 0.5) * ((c.height - 80) / lines.length), c.width - 100));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const grp = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.12), silverMat());
  frame.position.z = -0.08;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 10), silverMat());
  post.position.y = -h / 2 - 1.0;
  grp.add(frame, m, post);
  return grp;
}

// Glass capsule (cylinder) with silver caps and cyan rings; hologram content goes inside
export function glassCapsule(r = 1.25, h = 3.4, accent = 0x35e0ff) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.25, r + 0.4, 0.5, 32), silverMat());
  base.position.y = 0.25;
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(r + 0.18, 0.06, 6, 48), lightMat(accent, 2));
  ring1.rotation.x = Math.PI / 2; ring1.position.y = 0.52;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32, 1, true), glassMat());
  glass.position.y = 0.5 + h / 2;
  glass.renderOrder = 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.2, r + 0.1, 0.35, 32), silverMat());
  cap.position.y = 0.5 + h + 0.17;
  const ring2 = ring1.clone();
  ring2.position.y = 0.5 + h - 0.02;
  g.add(base, ring1, glass, cap, ring2);
  g.userData.center = 0.5 + h / 2;
  return g;
}
