// Portals: animated surfaces, crossing detection and the screen transition used when travelling.
import * as THREE from 'three';
import { labelSprite } from './mission.js';

export function portalMaterial(color, opts = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: {
      time: { value: 0 },
      col: { value: new THREE.Color(color) },
      col2: { value: new THREE.Color(opts.color2 ?? 0xffffff) },
      shape: { value: opts.shape === 'rect' ? 1 : 0 },
      power: { value: opts.locked ? 0.32 : 1 },
      aspect: { value: opts.aspect ?? 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float time, shape, power, aspect; uniform vec3 col, col2; varying vec2 vUv;
      void main(){
        vec2 p = vUv*2.0-1.0;
        float edge, r;
        if (shape > 0.5) {
          vec2 q = abs(p);
          r = max(q.x, q.y);
          edge = 1.0 - smoothstep(0.9, 1.0, r);
          p.x *= aspect;
        } else {
          r = length(p);
          edge = 1.0 - smoothstep(0.93, 1.0, r);
        }
        float rr = length(p);
        float a = atan(p.y, p.x);
        float sw = sin(a*5.0 + rr*12.0 - time*3.2)*0.5+0.5;
        float rings = sin(rr*24.0 - time*4.5)*0.5+0.5;
        float core = 1.0 - smoothstep(0.0, 0.9, rr);
        vec3 c = mix(col*0.45, col, sw);
        c = mix(c, col2, pow(core, 3.0)*0.75 + rings*0.1);
        float rim = smoothstep(0.72, 0.97, r) * edge;
        c += col * rim * 1.4;
        float alpha = edge * (0.5 + 0.3*sw + 0.25*core + rim*0.5);
        gl_FragColor = vec4(c*(0.55 + 0.7*power), clamp(alpha*power, 0.0, 1.0));
      }`,
  });
  m.userData.base = opts.locked ? 0.32 : 1;
  return m;
}

// Fade a portal surface when the camera gets very close (so it never fills the screen).
export function fadePortal(mat, x, z, cam) {
  const d = Math.hypot(cam.position.x - x, cam.position.z - z);
  mat.uniforms.power.value = mat.userData.base * Math.min(1, Math.max(0.08, (d - 1.0) / 3.5));
}

// A vertical portal plane. n = horizontal normal; crossing along +n triggers (or both ways if twoSided).
export class Portal {
  constructor({ x, z, nx, nz, halfW, y0, y1, twoSided = false }) {
    Object.assign(this, { x, z, nx, nz, halfW, y0, y1, twoSided });
    this.prev = null;
  }
  reset() { this.prev = null; }
  check(p) {
    const dx = p.x - this.x, dz = p.z - this.z;
    const d = dx * this.nx + dz * this.nz;
    const lat = Math.abs(dx * this.nz - dz * this.nx);
    const inside = lat < this.halfW && p.y > this.y0 && p.y < this.y1;
    let crossed = false;
    if (inside && this.prev !== null) {
      if (this.prev < 0 && d >= 0) crossed = true;
      else if (this.twoSided && this.prev > 0 && d <= 0) crossed = true;
    }
    this.prev = Math.abs(d) < 4 && lat < this.halfW + 2 ? d : null;
    return crossed;
  }
}

// Portal surface inside one of the district arches (data from buildDistricts).
export function gatePortal(scene, g, locked) {
  const w = g.width - 1.6, h = 6.2;
  const mat = portalMaterial(g.color, { shape: 'rect', aspect: w / h, locked });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(g.x, g.baseY + 0.1 + h / 2, g.z);
  mesh.rotation.y = g.rotY;
  mesh.renderOrder = 4;
  scene.add(mesh);
  const out = { mesh, mat, portal: null, label: null };
  out.portal = new Portal({
    x: g.x, z: g.z, nx: Math.sin(g.rotY), nz: Math.cos(g.rotY), halfW: w / 2 - 0.25, y0: g.baseY - 1.5, y1: g.baseY + 4,
  });
  if (locked) {
    const lab = labelSprite(['PRÓXIMAMENTE'], '#' + new THREE.Color(g.color).getHexString(), 3.0, '🔒');
    lab.position.set(g.x, g.baseY + 3.4, g.z);
    scene.add(lab);
    out.label = lab;
  }
  return out;
}

// Full-screen flash/fade used while travelling through a portal.
export class Travel {
  constructor() {
    const el = document.createElement('div');
    el.id = 'portal-fade';
    Object.assign(el.style, {
      position: 'fixed', inset: '0', zIndex: '14', pointerEvents: 'none', opacity: '0', transition: 'opacity .32s ease',
    });
    document.body.appendChild(el);
    this.el = el;
    this.busy = false;
  }
  go({ color = '#35e0ff', apply, after }) {
    if (this.busy) return;
    this.busy = true;
    this.el.style.background = `radial-gradient(circle at 50% 50%, rgba(255,255,255,.98) 0%, ${color} 34%, rgba(8,18,44,.98) 78%)`;
    this.el.style.opacity = '1';
    setTimeout(() => {
      try { apply && apply(); } catch (e) { console.error(e); }
      setTimeout(() => {
        this.el.style.opacity = '0';
        setTimeout(() => { this.busy = false; after && after(); }, 260);
      }, 180);
    }, 360);
  }
}
