// Environment: sky, terrain, water, waterfall, vegetation, bridge, parkour, floating islands, clouds, crystals.
import * as THREE from 'three';
import {
  WORLD, heightAt, slopeAt, pathMask, insidePad, riverDist, PADS, MESA, LAKE, WATERFALL,
  BRIDGE, PILLAR, SPAWN,
} from './terrain.js';
import { mulberry32, clamp, lerp, smoothstep, fbm, softSpriteTexture, makeSign, bakeStatic } from './util.js';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.78, 0.43).normalize();
export const COLORS = {
  turquoise: 0x19d3c5, cyan: 0x35e0ff, purple: 0x8b5cf6, gold: 0xffb020, green: 0x22c55e, blue: 0x3b82f6,
  orange: 0xff8a3d, white: 0xf3f7fa,
};

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f7fe0) }, mid: { value: new THREE.Color(0x8fd3ff) },
      horizon: { value: new THREE.Color(0xd8f3ff) }, sunDir: { value: SUN_DIR }, sunCol: { value: new THREE.Color(0xfff2c9) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, mid, horizon, sunDir, sunCol; varying vec3 vDir;
      void main(){ float y = vDir.y; vec3 c = mix(horizon, mid, smoothstep(0.0,0.25,y)); c = mix(c, top, smoothstep(0.25,0.9,y));
        c = mix(c, horizon*0.95, smoothstep(0.0,-0.2,y));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunCol * (pow(s, 900.0)*2.5 + pow(s, 24.0)*0.35);
        gl_FragColor = vec4(c,1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(0xc8ecff, 0.0021);
  return sky;
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xcdeeff, 0x5f8a4a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 10; s.far = 300;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

// ------------------------------------------------------------------ terrain
export function buildTerrain(scene) {
  const SEG = 260;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const n = pos.count;
  const heights = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const h = heightAt(pos.getX(i), pos.getZ(i));
    heights[i] = h;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  const sand = new THREE.Color(0xf2dcaa), wet = new THREE.Color(0xcfae74), grassA = new THREE.Color(0x58b947),
    grassB = new THREE.Color(0x8fd052), grassC = new THREE.Color(0x3e9b45), rock = new THREE.Color(0xa49a90),
    rockD = new THREE.Color(0x7d746d), path = new THREE.Color(0xe9d3a3), under = new THREE.Color(0xd2b47b),
    moss = new THREE.Color(0x6f9a52);
  const nrm = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heights[i];
    const ny = nrm.getY(i);
    const slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 0.05);
    const nv = fbm(x * 0.05, z * 0.05, 3);
    c.copy(grassA).lerp(grassB, smoothstep(0.35, 0.75, nv)).lerp(grassC, smoothstep(0.55, 0.85, fbm(x * 0.013 + 9, z * 0.013, 2)) * 0.6);
    // altitude: more moss/rock
    c.lerp(moss, smoothstep(22, 40, h) * 0.5);
    // beach
    const beach = 1 - smoothstep(1.2, 2.6, h + (nv - 0.5) * 0.8);
    c.lerp(sand, beach);
    if (h < 0.3) c.copy(wet).lerp(under, smoothstep(0.3, -2, h));
    // river banks
    const rd = riverDist(x, z);
    if (rd < 13 && h > -0.5) c.lerp(sand, (1 - smoothstep(7, 13, rd)) * 0.85);
    // rock on slopes / peaks
    const rk = smoothstep(0.75, 1.25, slope) + smoothstep(42, 58, h);
    c.lerp(rockD.clone().lerp(rock, nv), clamp(rk, 0, 1));
    // paths
    const pm = pathMask(x, z);
    if (pm > 0) c.lerp(path, pm * 0.95);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return { mesh, heights, seg: SEG };
}

// Depth texture for the water shader + minimap base
export function buildHeightTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = -WORLD / 2 + (i + 0.5) / S * WORLD;
    const z = -WORLD / 2 + (j + 0.5) / S * WORLD;
    const h = heightAt(x, z);
    const k = (j * S + i) * 4;
    data[k] = clamp(-h / 10, 0, 1) * 255;
    data[k + 1] = h > 0 ? 255 : 0;
    data[k + 2] = 0; data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildWater(scene, heightTex) {
  const geo = new THREE.PlaneGeometry(1800, 1800, 120, 120);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, hTex: { value: heightTex }, world: { value: WORLD }, sunDir: { value: SUN_DIR },
      shallow: { value: new THREE.Color(0x63f0dd) }, mid: { value: new THREE.Color(0x1cb4d8) }, deep: { value: new THREE.Color(0x0d5ea9) },
      skyCol: { value: new THREE.Color(0xbfe6ff) },
    }]),
    vertexShader: `uniform float time; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec3 p = position; vec4 w = modelMatrix*vec4(p,1.0);
        w.y += sin(w.x*0.12+time*0.9)*0.07 + sin(w.z*0.17+time*1.2)*0.06;
        vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time, world; uniform sampler2D hTex; uniform vec3 sunDir, shallow, mid, deep, skyCol; varying vec3 vW;
      #include <fog_pars_fragment>
      float n2(vec2 p){ return sin(p.x)*sin(p.y); }
      void main(){
        vec2 uv = (vW.xz + world*0.5)/world;
        float depth = 10.0;
        if (uv.x>0.0 && uv.x<1.0 && uv.y>0.0 && uv.y<1.0) depth = texture2D(hTex, uv).r*10.0;
        vec3 col = mix(shallow, mid, smoothstep(0.0, 2.6, depth));
        col = mix(col, deep, smoothstep(2.6, 9.5, depth));
        vec2 q = vW.xz*0.35;
        float dx = cos(q.x*1.3+time*1.4)*0.5 + cos(q.x*2.7-q.y*1.9+time*2.1)*0.3 + n2(q*3.1+time)*0.2;
        float dz = cos(q.y*1.1+time*1.1)*0.5 + cos(q.y*2.3+q.x*1.7-time*1.8)*0.3;
        vec3 nrm = normalize(vec3(dx*0.12, 1.0, dz*0.12));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(nrm, V), 0.0), 4.0);
        col = mix(col, skyCol, fres*0.55);
        vec3 H = normalize(sunDir + V);
        float spec = pow(max(dot(nrm, H), 0.0), 220.0);
        col += vec3(1.0,0.97,0.88)*spec*1.6;
        float foamBand = 1.0 - smoothstep(0.0, 0.55, depth);
        float waves = 0.5+0.5*sin(depth*26.0 - time*2.4 + dx*2.0);
        col = mix(col, vec3(1.0), foamBand*(0.45+0.45*waves));
        float a = mix(0.62, 0.95, smoothstep(0.0, 3.5, depth));
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = 0;
  water.renderOrder = 1;
  scene.add(water);
  return water;
}

// ------------------------------------------------------------------ waterfall
function waterfallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; varying vec2 vUv;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vec2(vUv.x*14.0, vUv.y*6.0 + time*2.6);
        float s = n(p) * 0.6 + n(p*2.3 + 3.0)*0.4;
        vec3 c = mix(vec3(0.55,0.88,1.0), vec3(1.0), smoothstep(0.45, 0.8, s));
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float a = edge * (0.62 + 0.35*s) * smoothstep(0.0, 0.04, 1.0 - vUv.y);
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
  });
}

export function buildWaterfalls(scene) {
  const mats = [];
  // main cliff cascade: follow the cliff face
  const COLS = 8, ROWS = 26;
  const w = WATERFALL.width;
  const positions = [], uvs = [], idx = [];
  const topY = heightAt(WATERFALL.x, MESA.z + MESA.r - 4) + 0.4;
  for (let r = 0; r <= ROWS; r++) {
    const v = r / ROWS;
    const y = lerp(topY, -0.3, v);
    for (let cI = 0; cI <= COLS; cI++) {
      const u = cI / COLS;
      const x = WATERFALL.x - w / 2 + u * w;
      // find cliff face z at height y scanning outward (south)
      let zf = MESA.z + MESA.r - 6;
      for (let z = MESA.z + MESA.r - 6; z < MESA.z + MESA.r + 8; z += 0.1) {
        if (heightAt(x, z) < y) { zf = z; break; }
      }
      const out = 0.6 + 1.6 * Math.sqrt(v) * (1 - v * 0.3);
      positions.push(x, y, zf + out);
      uvs.push(u, 1 - v);
    }
  }
  for (let r = 0; r < ROWS; r++) for (let cI = 0; cI < COLS; cI++) {
    const a = r * (COLS + 1) + cI, b = a + 1, c = a + COLS + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  const m = waterfallMaterial();
  mats.push(m);
  const fall = new THREE.Mesh(geo, m);
  fall.renderOrder = 2;
  scene.add(fall);
  // river on the mesa top feeding it
  const tex = softSpriteTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  const mist = [];
  const baseZ = positions[positions.length - 1];
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55 }));
    s.position.set(WATERFALL.x + (Math.random() - 0.5) * w, 0.6 + Math.random() * 2, baseZ + Math.random() * 3);
    s.scale.setScalar(3 + Math.random() * 3);
    s.userData.ph = Math.random() * 6.28;
    scene.add(s);
    mist.push(s);
  }
  return {
    mats, mist,
    pos: new THREE.Vector3(WATERFALL.x, 2, baseZ),
    update(t) {
      for (const mm of mats) mm.uniforms.time.value = t;
      for (const s of mist) {
        const k = (t * 0.35 + s.userData.ph) % 1;
        s.position.y = 0.4 + k * 4;
        s.material.opacity = 0.55 * (1 - k);
        s.scale.setScalar(3 + k * 4);
      }
    },
  };
}

// ------------------------------------------------------------------ vegetation
function mergeGeos(list) {
  // simple merge of non-indexed geometries with color attribute
  let total = 0;
  const parts = list.map(({ geo, color, mtx }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (mtx) g.applyMatrix4(mtx);
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(color) };
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color } of parts) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      col[(o + i) * 3] = color.r; col[(o + i) * 3 + 1] = color.g; col[(o + i) * 3 + 2] = color.b;
    }
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const M4 = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
};

function treeGeo() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, 3.2, 7);
  const blob = new THREE.IcosahedronGeometry(1, 1);
  return mergeGeos([
    { geo: trunk, color: 0x8a5a3c, mtx: M4(0, 1.6, 0) },
    { geo: blob, color: 0xffffff, mtx: M4(0, 3.9, 0, 2.1, 1.8, 2.1) },
    { geo: blob, color: 0xe6ffe0, mtx: M4(0.9, 4.9, 0.3, 1.4, 1.3, 1.4) },
    { geo: blob, color: 0xf0fff0, mtx: M4(-0.7, 4.7, -0.5, 1.3, 1.2, 1.3) },
  ]);
}
function pineGeo() {
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, 2, 6);
  const cone = new THREE.ConeGeometry(1, 1, 7);
  return mergeGeos([
    { geo: trunk, color: 0x7a4e33, mtx: M4(0, 1, 0) },
    { geo: cone, color: 0xffffff, mtx: M4(0, 2.6, 0, 2.2, 2.4, 2.2) },
    { geo: cone, color: 0xf2fff2, mtx: M4(0, 4.0, 0, 1.7, 2.1, 1.7) },
    { geo: cone, color: 0xe8ffe8, mtx: M4(0, 5.3, 0, 1.2, 1.8, 1.2) },
  ]);
}
function palmGeo() {
  const parts = [];
  const seg = new THREE.CylinderGeometry(0.2, 0.26, 1.1, 6);
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    parts.push({ geo: seg, color: i % 2 ? 0x9c6b45 : 0x8a5d3b, mtx: M4(t * t * 1.4, 0.55 + i * 1.0, 0, 1, 1, 1, 0, 0, -t * 0.35) });
  }
  const leaf = new THREE.ConeGeometry(0.55, 3.4, 4);
  const top = new THREE.Vector3(1.4 * 0.7, 6.3, 0);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2 - 0.35)));
    const off = new THREE.Vector3(1.5, -0.35, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    m.compose(top.clone().add(off), q, new THREE.Vector3(1, 1, 0.25));
    parts.push({ geo: leaf, color: 0xffffff, mtx: m });
  }
  parts.push({ geo: new THREE.IcosahedronGeometry(0.35, 0), color: 0x6b4a2a, mtx: M4(top.x, top.y - 0.2, 0) });
  return mergeGeos(parts);
}
function rockGeo() {
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const k = 0.78 + 0.35 * fbm(v.x * 2 + 5, v.z * 2 + v.y * 3, 2);
    p.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k);
  }
  return mergeGeos([{ geo: g, color: 0xffffff }]);
}
function bushGeo() {
  const b = new THREE.IcosahedronGeometry(1, 1);
  return mergeGeos([
    { geo: b, color: 0xffffff, mtx: M4(0, 0.5, 0, 1, 0.75, 1) },
    { geo: b, color: 0xf0fff0, mtx: M4(0.7, 0.4, 0.2, 0.7, 0.6, 0.7) },
  ]);
}
function grassGeo() {
  const c = new THREE.ConeGeometry(0.06, 0.6, 3);
  return mergeGeos([
    { geo: c, color: 0xffffff, mtx: M4(0, 0.3, 0, 1, 1, 1, 0, 0.15, 0.1) },
    { geo: c, color: 0xf4fff0, mtx: M4(0.1, 0.25, 0.05, 1, 0.8, 1, 0, -0.2, 0.2) },
    { geo: c, color: 0xeaffea, mtx: M4(-0.08, 0.28, -0.06, 1, 0.9, 1, 0, 0.1, -0.25) },
  ]);
}
function flowerGeo() {
  const s = new THREE.IcosahedronGeometry(0.13, 0);
  const st = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 3);
  return mergeGeos([{ geo: st, color: 0x3f9a43, mtx: M4(0, 0.2, 0) }, { geo: s, color: 0xffffff, mtx: M4(0, 0.42, 0) }]);
}

export function buildVegetation(scene, colliders, quality) {
  const rnd = mulberry32(1337);
  const blocked = (x, z, extra = 0) => {
    if (pathMask(x, z) > 0.02) return true;
    if (insidePad(x, z, 6 + extra)) return true;
    if (riverDist(x, z) < 11) return true;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4) return true;
    if (Math.hypot(x - PILLAR.x, z - PILLAR.z) < 17) return true;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 9) return true;
    const bd = Math.hypot(x - (BRIDGE.ax + BRIDGE.bx) / 2, z - (BRIDGE.az + BRIDGE.bz) / 2);
    if (bd < 20) return true;
    return false;
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const groups = [];
  const CELL = 104;
  const make = (geo, count, place, shadow = true) => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const cells = new Map();
    let k = 0, tries = 0;
    while (k < count && tries < count * 40) {
      tries++;
      const r = place(rnd);
      if (!r) continue;
      p.set(r.x, r.y, r.z);
      q.setFromEuler(new THREE.Euler(r.rx || 0, r.ry || rnd() * 6.28, r.rz || 0));
      sc.set(r.s * (r.sx || 1), r.s * (r.sy || 1), r.s * (r.sz || 1));
      m.compose(p, q, sc);
      const key = Math.floor((r.x + 260) / CELL) + ':' + Math.floor((r.z + 260) / CELL);
      let arr = cells.get(key);
      if (!arr) { arr = []; cells.set(key, arr); }
      arr.push({ m: m.clone(), c: r.c });
      k++;
    }
    const col = new THREE.Color();
    for (const arr of cells.values()) {
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      im.castShadow = shadow;
      im.receiveShadow = true;
      arr.forEach((it, i) => { im.setMatrixAt(i, it.m); col.set(it.c); im.setColorAt(i, col); });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.userData.full = arr.length;
      scene.add(im);
      groups.push(im);
    }
  };
  const greens = [0x4caf50, 0x5cc45a, 0x3f9f4a, 0x78c850, 0x2f8f46, 0x66bb6a];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const randPt = () => ({ x: (rnd() - 0.5) * 440, z: (rnd() - 0.5) * 440 });
  // round trees
  make(treeGeo(), 520, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 2.4 || h > 34) return null;
    if (slopeAt(x, z).m > 0.55 || blocked(x, z)) return null;
    // clustering via noise
    if (fbm(x * 0.02 + 40, z * 0.02, 2) < 0.42) return null;
    const s = 0.85 + rnd() * 0.7;
    colliders.addCircle(x, z, 0.5 * s, h - 1, h + 4 * s, 'tree');
    return { x, y: h - 0.2, z, s, c: pick(greens) };
  });
  // pines on higher ground
  make(pineGeo(), 260, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 14 || h > 52) return null;
    if (slopeAt(x, z).m > 0.75 || blocked(x, z)) return null;
    const s = 0.9 + rnd() * 0.8;
    colliders.addCircle(x, z, 0.4 * s, h - 1, h + 4 * s, 'tree');
    return { x, y: h - 0.2, z, s, c: pick([0x2e7d4f, 0x3b8f5a, 0x2b6e46]) };
  });
  // palms on beaches
  make(palmGeo(), 130, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 0.8 || h > 4.2 || slopeAt(x, z).m > 0.4 || blocked(x, z)) return null;
    const s = 0.9 + rnd() * 0.45;
    colliders.addCircle(x, z, 0.35, h - 1, h + 5, 'tree');
    return { x, y: h - 0.2, z, s, c: pick([0x5cc45a, 0x6fd06a, 0x4fb85a]) };
  });
  // rocks
  make(rockGeo(), 220, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < -1 || blocked(x, z, -3)) return null;
    const s = 0.6 + rnd() * rnd() * 3.2;
    if (s > 1.4) colliders.addCircle(x, z, s * 0.85, h - 2, h + s * 0.7, 'rock');
    return { x, y: h - s * 0.15, z, s, c: pick([0xb3aaa1, 0x9c948b, 0xc4bcb2, 0x8d8780]) };
  });
  // bushes
  make(bushGeo(), 420, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 2 || h > 36 || slopeAt(x, z).m > 0.6 || blocked(x, z, -2)) return null;
    return { x, y: h - 0.1, z, s: 0.6 + rnd() * 0.7, c: pick([0x4fae4a, 0x63c05a, 0x3d9644, 0x7bc95a]) };
  }, false);
  // grass tufts
  make(grassGeo(), quality === 'low' ? 1200 : 3200, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 2 || h > 30 || pathMask(x, z) > 0.1 || riverDist(x, z) < 9) return null;
    const pad = insidePad(x, z, 1);
    if (pad) return null;
    return { x, y: h - 0.05, z, s: 0.8 + rnd() * 0.9, c: pick([0x5dbb4a, 0x7ccf52, 0x4aa743]) };
  }, false);
  // flowers
  make(flowerGeo(), quality === 'low' ? 300 : 800, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 2.2 || h > 26 || blocked(x, z, -4)) return null;
    return { x, y: h - 0.03, z, s: 0.9 + rnd() * 0.6, c: pick([0xff6fa8, 0xffd23f, 0xffffff, 0xb57bff, 0xff8a3d, 0x6ad1ff]) };
  }, false);
  return {
    groups,
    setDensity(f) {
      for (const g of groups) g.count = Math.floor(g.userData.full * f);
    },
  };
}

// ------------------------------------------------------------------ bridge
export function buildBridge(scene, colliders) {
  const ax = BRIDGE.ax, az = BRIDGE.az, bx = BRIDGE.bx, bz = BRIDGE.bz;
  const ha = heightAt(ax, az) + 0.15, hb = heightAt(bx, bz) + 0.15;
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax); // rotation about Y so local +x points A->B
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xc8955f, roughness: 0.8 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x35e0ff, emissive: 0x35e0ff, emissiveIntensity: 1.6 });
  const N = 16;
  const deckY = (t) => lerp(ha, hb, t) + Math.sin(t * Math.PI) * 1.6;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, tm = (t0 + t1) / 2;
    const x = lerp(ax, bx, tm), z = lerp(az, bz, tm), y = deckY(tm);
    const segLen = len / N + 0.05;
    const pitch = Math.atan2(deckY(t1) - deckY(t0), len / N);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.35, BRIDGE.w), wood);
    plank.position.set(x, y - 0.17, z);
    plank.rotation.set(0, rot, pitch, 'YXZ');
    plank.castShadow = plank.receiveShadow = true;
    group.add(plank);
    colliders.addBox(x, z, segLen / 2, BRIDGE.w / 2, rot, y - 3, y, 'bridge');
    // rails posts
    for (const side of [-1, 1]) {
      const px = x + Math.sin(rot) * side * (BRIDGE.w / 2 - 0.15);
      const pz = z + Math.cos(rot) * side * (BRIDGE.w / 2 - 0.15);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), stone);
      post.position.set(px, y + 0.55, pz);
      group.add(post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow);
      lamp.position.set(px, y + 1.15, pz);
      if (i % 3 === 0) group.add(lamp);
      colliders.addCircle(px, pz, 0.25, y - 1, y + 1.1, 'rail');
    }
  }
  // side arches
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = lerp(ax, bx, t) + Math.sin(rot) * side * (BRIDGE.w / 2), z = lerp(az, bz, t) + Math.cos(rot) * side * (BRIDGE.w / 2);
      pts.push(new THREE.Vector3(x, deckY(t) + 1.1 + Math.sin(t * Math.PI) * 0.4, z));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.08, 6), stone);
    group.add(tube);
  }
  bakeStatic(group);
  scene.add(group);
  return group;
}

// ------------------------------------------------------------------ parkour pillar + mesa stairs
export function buildParkour(scene, colliders, kenney) {
  const group = new THREE.Group();
  const base = heightAt(PILLAR.x, PILLAR.z);
  const H = PILLAR.top - base + 2;
  const geo = new THREE.CylinderGeometry(PILLAR.r, PILLAR.r + 2.2, H, 18, 10);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const k = 1 + (fbm(a * 2 + 3, v.y * 0.15, 3) - 0.5) * 0.35;
    if (Math.abs(v.y - H / 2) > 0.01) { v.x *= k; v.z *= k; }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const rock = new THREE.MeshStandardMaterial({ color: 0xd9c7b0, roughness: 0.9, flatShading: true });
  const pillar = new THREE.Mesh(geo, rock);
  pillar.position.set(PILLAR.x, base - 2 + H / 2, PILLAR.z);
  pillar.castShadow = pillar.receiveShadow = true;
  group.add(pillar);
  const topY = base - 2 + H;
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR.r * 0.98, PILLAR.r, 0.4, 18), new THREE.MeshStandardMaterial({ color: 0x6cc455, roughness: 0.9 }));
  grass.position.set(PILLAR.x, topY + 0.05, PILLAR.z);
  grass.receiveShadow = true;
  group.add(grass);
  colliders.addCircle(PILLAR.x, PILLAR.z, PILLAR.r + 0.4, base - 5, topY + 0.25, 'pillar');
  // viewpoint sign + telescope-ish
  const sign = makeSign(['MIRADOR', '¡Lo lograste!'], 4.6, 1.15, { border: '#ffb020', sub: '#ffe3a1' });
  sign.position.set(PILLAR.x, topY + 3.2, PILLAR.z - 2.5);
  group.add(sign);
  const scope = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a3b55, metalness: 0.6, roughness: 0.35 });
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.2, 6), metal);
  leg.position.y = 0.6;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.3, 10), new THREE.MeshStandardMaterial({ color: 0xffb020, metalness: 0.5, roughness: 0.3 }));
  tube.rotation.z = Math.PI / 2.4;
  tube.position.y = 1.35;
  scope.add(leg, tube);
  scope.position.set(PILLAR.x + 2.5, topY + 0.25, PILLAR.z + 1);
  group.add(scope);
  // spiral platforms
  const platforms = [];
  const n = Math.ceil((topY - base - 0.4) / 1.3);
  const platMat = new THREE.MeshStandardMaterial({ color: 0xf3f7fa, roughness: 0.5 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x35e0ff, emissive: 0x19c2e6, emissiveIntensity: 1.2 });
  let a0 = Math.atan2(76 - PILLAR.z, -44 - PILLAR.x); // start towards path end
  for (let i = 0; i < n; i++) {
    const a = a0 - i * 0.48;
    const R = PILLAR.r + 4.2;
    const x = PILLAR.x + Math.cos(a) * R, z = PILLAR.z + Math.sin(a) * R;
    const y = base + 1.0 + i * 1.3;
    let mesh;
    if (kenney && kenney.platform) {
      mesh = kenney.platform.clone();
      mesh.scale.setScalar(kenney.platformScale);
      mesh.position.set(x, y - kenney.platformTop * kenney.platformScale, z);
    } else {
      mesh = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.5, 14), platMat);
      top.position.y = -0.25;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.07, 6, 24), rimMat);
      rim.rotation.x = Math.PI / 2;
      mesh.add(top, rim);
      mesh.position.set(x, y, z);
    }
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(mesh);
    colliders.addCircle(x, z, 1.55, y - 0.6, y, 'platform');
    platforms.push({ x, y, z });
  }
  // hidden stairway up the back of the mesa
  const steps = [];
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd9d1c4, roughness: 0.9, flatShading: true });
  const mesaTopY = heightAt(MESA.x + 6, MESA.z - 6);
  const sx0 = MESA.x + MESA.r + 7, sz0 = MESA.z - 4;
  const g0 = heightAt(sx0, sz0);
  const count = Math.max(4, Math.ceil((mesaTopY - g0) / 1.15));
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const ang = -0.2 + t * 1.6;
    const R = MESA.r + 6 - t * 4.5;
    const x = MESA.x + Math.cos(ang) * R, z = MESA.z + Math.sin(ang) * R - 4;
    const y = lerp(g0 + 0.9, mesaTopY + 0.2, t);
    const st = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 2.6), stoneMat);
    st.position.set(x, y - 0.3, z);
    st.rotation.y = ang;
    st.castShadow = st.receiveShadow = true;
    group.add(st);
    colliders.addBox(x, z, 1.3, 1.3, ang, y - 8, y, 'step');
    steps.push({ x, y, z });
  }
  bakeStatic(group);
  scene.add(group);
  return { group, platforms, steps, topY, mesaTopY };
}

// ------------------------------------------------------------------ floating islands + clouds
export function buildSkyDecor(scene) {
  const group = new THREE.Group();
  const rnd = mulberry32(99);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xa08d7c, roughness: 0.95, flatShading: true });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x6cc455, roughness: 0.9, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.9, flatShading: true });
  const wfMats = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd() * 0.4;
    const R = 330 + rnd() * 90;
    const y = 45 + rnd() * 80;
    const s = 14 + rnd() * 22;
    const isl = new THREE.Group();
    const cone = new THREE.ConeGeometry(s, s * 1.6, 9, 4);
    const pp = cone.attributes.position;
    for (let k = 0; k < pp.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(pp, k);
      const f = 1 + (fbm(v.x * 0.2 + i, v.y * 0.2, 2) - 0.5) * 0.5;
      pp.setXYZ(k, v.x * f, v.y, v.z * f);
    }
    cone.computeVertexNormals();
    const body = new THREE.Mesh(cone, rockMat);
    body.rotation.x = Math.PI;
    body.position.y = -s * 0.8;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.02, s, s * 0.18, 9), grassMat);
    isl.add(body, top);
    for (let t = 0; t < 5; t++) {
      const tr = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.12, 0), leafMat);
      tr.position.set((rnd() - 0.5) * s, s * 0.18, (rnd() - 0.5) * s);
      tr.scale.y = 1.3;
      isl.add(tr);
    }
    // small waterfall off the edge
    const m = waterfallMaterial();
    wfMats.push(m);
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.18, s * 2.4), m);
    wf.position.set(0, -s * 1.1, s * 0.98);
    isl.add(wf);
    isl.position.set(Math.cos(a) * R, y, Math.sin(a) * R);
    isl.rotation.y = -a + Math.PI / 2;
    isl.userData.base = y;
    isl.userData.ph = rnd() * 6.28;
    group.add(isl);
  }
  // clouds: one sprite per cloud with a pre-composited puffy texture (few draw calls)
  const cloudTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const puff = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.8})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    const pr = mulberry32(5);
    for (let k = 0; k < 14; k++) puff(90 + pr() * 330, 120 + (pr() - 0.5) * 60, 50 + pr() * 60, 0.75);
    for (let k = 0; k < 6; k++) puff(140 + pr() * 230, 90 + pr() * 30, 40 + pr() * 40, 0.9);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const R = 170 + rnd() * 380;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.9, fog: false }));
    const sc = 60 + rnd() * 70;
    sp.scale.set(sc * 2, sc, 1);
    sp.position.set(Math.cos(a) * R, 70 + rnd() * 90, Math.sin(a) * R);
    group.add(sp);
    clouds.push(sp);
  }
  scene.add(group);
  return {
    group,
    update(t) {
      for (const m of wfMats) m.uniforms.time.value = t;
      for (const isl of group.children) {
        if (isl.userData.base !== undefined) isl.position.y = isl.userData.base + Math.sin(t * 0.3 + isl.userData.ph) * 1.5;
      }
      for (const c of clouds) {
        c.position.x += 0.6 * (1 / 60);
        if (c.position.x > 560) c.position.x = -560;
      }
    },
  };
}

// ------------------------------------------------------------------ crystals
export function buildCrystals(scene, positions) {
  const geo = new THREE.OctahedronGeometry(0.42, 0);
  geo.scale(1, 1.7, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x7ff6ff, emissive: 0x19c2e6, emissiveIntensity: 1.7, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95 });
  const im = new THREE.InstancedMesh(geo, mat, positions.length);
  im.castShadow = false;
  const glowTex = softSpriteTexture('rgba(120,240,255,0.9)', 'rgba(120,240,255,0)');
  const glows = [];
  positions.forEach((p, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    s.scale.setScalar(2.4);
    s.position.set(p.x, p.y, p.z);
    scene.add(s);
    glows.push(s);
  });
  scene.add(im);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  const state = positions.map((p) => ({ ...p, taken: false, pop: 0 }));
  return {
    mesh: im, state,
    update(t, dt, focus) {
      state.forEach((c, i) => {
        if (focus) glows[i].material.visible = Math.abs(c.x - focus.x) + Math.abs(c.z - focus.z) < 90;
        if (c.taken && c.pop <= 0) {
          sc.set(0, 0, 0);
          glows[i].visible = false;
        } else {
          let s = 1;
          if (c.taken) { c.pop -= dt * 3; s = 1 + (1 - c.pop) * 0.8; glows[i].material.opacity = c.pop * 0.7; if (c.pop <= 0) s = 0; }
          sc.setScalar(s);
        }
        q.setFromEuler(new THREE.Euler(0, t * 1.6 + i, 0));
        v.set(c.x, c.y + Math.sin(t * 2 + i) * 0.18, c.z);
        m.compose(v, q, sc);
        im.setMatrixAt(i, m);
        glows[i].position.y = v.y;
      });
      im.instanceMatrix.needsUpdate = true;
    },
    take(i) { state[i].taken = true; state[i].pop = 1; },
    restore(i) { state[i].taken = true; state[i].pop = 0; },
  };
}
