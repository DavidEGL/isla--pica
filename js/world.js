// Environment: sky, terrain, water, waterfall, vegetation, bridge, parkour, floating islands, clouds, crystals.
import * as THREE from 'three';
import { meshShape } from './colliders.js';
import {
  WORLD, TERRAIN_SEG, surfaceAt, heightAt, slopeAt, pathMask, insidePad, riverDist, PADS, MESA, LAKE, WATERFALL,
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
  const SEG = TERRAIN_SEG;
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
      const gc = g.attributes.color; // degradado propio (ej. hojas del bush) se multiplica por el color de la parte
      col[(o + i) * 3] = color.r * (gc ? gc.getX(i) : 1); col[(o + i) * 3 + 1] = color.g * (gc ? gc.getY(i) : 1); col[(o + i) * 3 + 2] = color.b * (gc ? gc.getZ(i) : 1);
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

// ---- árboles y pinos low-poly (hojas con color propio, el tinte por instancia es casi blanco)
const LEAF = [0x7cc43c, 0x8fd048, 0x6bb534, 0x5aa832], BARK = 0x6b4a33;
// bola facetada: icosaedro con vértices desplazados (los coincidentes juntos) y escala por eje
function facetBlob(r, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    if (!seen.has(key)) seen.set(key, 0.85 + r() * 0.3);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz);
  }
  return g;
}
// tronco/rama como un solo tubo: los segmentos comparten el anillo de cada codo, así no quedan huecos
function tube(points, radii, color, sides = 6) {
  const P = points.map((a) => new THREE.Vector3(...a));
  const rings = [];
  let u = new THREE.Vector3(1, 0, 0.01);
  P.forEach((pt, i) => {
    const prev = P[Math.max(0, i - 1)], next = P[Math.min(P.length - 1, i + 1)];
    const T = next.clone().sub(prev).normalize(); // en un codo, la dirección media de ambos segmentos
    u = u.clone().addScaledVector(T, -u.dot(T)).normalize();
    const v = new THREE.Vector3().crossVectors(T, u);
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      ring.push(pt.clone().addScaledVector(u, Math.cos(a) * radii[i]).addScaledVector(v, Math.sin(a) * radii[i]));
    }
    rings.push(ring);
  });
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % sides];
      tri(a, b, c); tri(b, d, c);
    }
  }
  const top = rings[rings.length - 1], tip = P[P.length - 1]; // tapa superior
  for (let k = 0; k < sides; k++) tri(top[k], top[(k + 1) % sides], tip);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return { geo, color };
}
const limb = (a, b, r0, r1, color) => tube([a, b], [r0, r1], color);
const blobPart = (r, x, y, z, sx, sy, sz, ci = 0) => ({ geo: facetBlob(r, 1, 1, 1), color: LEAF[ci % LEAF.length], mtx: M4(x, y, z, sx, sy, sz, r() * 6) });

// colliders por variante, en unidades locales: [x, z, radio, y0, y1]. Mismo orden que treeVariants.
const STRAIGHT_TRUNK = [[0, 0, 0.36, -1, 4]];
const TREE_COLLIDERS = [
  STRAIGHT_TRUNK, STRAIGHT_TRUNK, STRAIGHT_TRUNK,
  [[0.1, 0, 0.36, -1, 1.2], [0.35, 0, 0.3, 0.8, 1.9], [0.95, 0, 0.26, 1.7, 2.9]], // sigue la curva del inclinado
  STRAIGHT_TRUNK,
];
// huella de cada variante, en unidades locales: desplazamiento y radio de copa, desplazamiento y radio a ras de suelo
const TREE_FOOTPRINTS = [[0, 1.1, 0, 1.1], [0, 2.4, 0, 0.45], [0, 2.9, 0, 0.45], [1.8, 2.8, 0.4, 0.85], [0, 1.8, 0, 0.45]];
function treeVariants() {
  const r = mulberry32(5);
  return [
    // 1 ciprés: copa alta y estrecha
    () => mergeGeos([limb([0, 0, 0], [0, 3.7, 0], 0.3, 0.16, BARK), blobPart(r, 0, 3.7, 0, 1.05, 2.0, 1.05, 0)]),
    // 2 sombrilla: tronco alto, 3 copas planas
    () => mergeGeos([
      limb([0, 0, 0], [0.2, 4.6, 0], 0.32, 0.16, BARK), limb([0.13, 3.2, 0], [-1.2, 4.2, 0.3], 0.18, 0.08, BARK), limb([0.13, 3.2, 0], [1.0, 4.4, -0.5], 0.18, 0.08, BARK),
      blobPart(r, 0.2, 4.6, 0, 1.9, 0.95, 1.7, 1), blobPart(r, -1.2, 4.2, 0.3, 1.2, 0.8, 1.2, 0), blobPart(r, 1.0, 4.4, -0.5, 1.3, 0.85, 1.2, 2),
    ]),
    // 3 acacia: ramas en Y y tres copas anchas
    () => mergeGeos([
      limb([0, 0, 0], [0, 4.5, 0], 0.32, 0.14, BARK), limb([0, 3.0, 0], [-1.7, 4.1, 0], 0.16, 0.08, BARK), limb([0, 3.0, 0], [1.7, 4.0, 0.1], 0.16, 0.08, BARK),
      blobPart(r, 0, 4.5, 0, 1.8, 0.9, 1.6, 1), blobPart(r, -1.7, 4.1, 0, 1.2, 0.75, 1.1, 0), blobPart(r, 1.7, 4.0, 0.1, 1.3, 0.8, 1.2, 2),
    ]),
    // 4 inclinado: tronco curvado, copa grande y dos chicas (la base queda en el origen, donde va el collider)
    () => mergeGeos([
      tube([[0, 0, 0], [0.4, 1.6, 0], [1.5, 2.9, 0], [2.3, 3.6, 0]], [0.34, 0.26, 0.15, 0.1], BARK),
      limb([1.3, 2.7, 0], [0, 4.0, 0.3], 0.1, 0.07, BARK), limb([0.95, 2.25, 0], [0.4, 3.3, 0.6], 0.1, 0.07, BARK),
      blobPart(r, 2.3, 3.6, 0, 2.2, 0.8, 1.5, 1), blobPart(r, 0, 4.0, 0.3, 1.0, 0.6, 1.0, 0), blobPart(r, 0.4, 3.3, 0.6, 0.8, 0.5, 0.8, 2),
    ]),
    // 5 redondo: tronco fino y racimo de 4 bolas
    () => mergeGeos([
      limb([0, 0, 0], [0, 3.7, 0], 0.26, 0.13, BARK),
      blobPart(r, 0, 3.7, 0, 1.2, 1.1, 1.2, 1), blobPart(r, -0.9, 3.4, 0.2, 0.9, 0.85, 0.9, 0), blobPart(r, 0.9, 3.5, -0.2, 0.85, 0.8, 0.85, 2), blobPart(r, 0.1, 3.0, 0.8, 0.8, 0.75, 0.8, 3),
    ]),
  ].map((f) => f());
}

// pisos, radio base, radio arriba, altura del primer piso, separación, alto del cono: 3 anchos, 5 estrecho, 4
const PINE_SPECS = [[3, 2.3, 1.1, 1.2, 1.5, 2.4], [5, 1.9, 0.6, 1.0, 1.05, 1.5], [4, 2.1, 0.9, 1.1, 1.25, 2.0]];
// pino: troncos + conos apilados (8 lados), cada piso más ancho que el de arriba
function pineVariants() {
  const tiers = (n, baseR, topR, y0, step, h) => {
    const parts = [limb([0, 0, 0], [0, y0 + 0.3, 0], 0.3, 0.22, BARK)];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), rad = baseR + (topR - baseR) * t;
      parts.push({ geo: new THREE.ConeGeometry(1, 1, 8), color: LEAF[i % 3], mtx: M4(0, y0 + i * step + h * 0.5 * (1 - t * 0.3), 0, rad, h * (1 - t * 0.3), rad) });
    }
    return mergeGeos(parts);
  };
  return PINE_SPECS.map((p) => tiers(...p));
}

// modelo palma.glb (assets/models): cada material pasa a color de vértice, como el resto de la vegetación
function palmGeo(gltf) {
  if (gltf) {
    gltf.scene.updateMatrixWorld(true);
    const list = [];
    gltf.scene.traverse((o) => { if (o.isMesh) list.push({ geo: o.geometry, color: o.material.color, mtx: o.matrixWorld }); });
    return mergeGeos(list);
  }
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
// Bush: racimo de 5 bolas facetadas (icosaedros deformados), verde liso flat-shaded.
function bushGeo() {
  const r = mulberry32(21);
  const blob = (sx, sy, sz) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) {
      // mismo desplazamiento para vértices coincidentes, así no se abre la malla
      const key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
      if (!seen.has(key)) seen.set(key, 0.8 + r() * 0.4);
      const k = seen.get(key);
      p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz);
    }
    return g;
  };
  return mergeGeos([
    { geo: blob(1, 0.85, 1), color: 0xffffff, mtx: M4(0.1, 1.1, -0.1, 1.15, 1.15, 1.15, 0.4) },
    { geo: blob(1, 0.8, 1), color: 0xe8ffe8, mtx: M4(-0.95, 0.8, 0.45, 0.8, 0.8, 0.8, 1.2) },
    { geo: blob(1, 0.85, 1), color: 0xf4fff4, mtx: M4(0.75, 0.75, 0.75, 0.9, 0.9, 0.9, 2.1) },
    { geo: blob(1, 0.8, 1), color: 0xdcf5dc, mtx: M4(0.95, 0.65, -0.7, 0.65, 0.65, 0.65, 0.7) },
    { geo: blob(1, 0.8, 1), color: 0xd0f0d0, mtx: M4(-0.5, 0.6, -0.85, 0.6, 0.6, 0.6, 2.6) },
  ]);
}
// Dense clump of tall, curved, tapered blades (cartoon low-poly, same flat-shaded
// vertex-color look as the palm). Blade shades go dark->light like the reference.
function grassClumpGeo() {
  const r = mulberry32(7);
  const shades = [0x2f8f46, 0x3f9f4a, 0x4caf50, 0x5dbb4a, 0x7ccf52, 0x9be26a];
  const parts = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const h = 0.7 + r() * 0.8;
    const w = 0.05 + r() * 0.03;
    const blade = new THREE.ConeGeometry(w, h, 3, 3, true);
    const p = blade.attributes.position;
    const bend = 0.12 + r() * 0.35;
    for (let k = 0; k < p.count; k++) {
      const t = (p.getY(k) + h / 2) / h; // 0 base .. 1 tip
      p.setX(k, p.getX(k) * 1.0 + bend * t * t * h);
      p.setY(k, p.getY(k) + h / 2);
    }
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.28;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3)),
      new THREE.Vector3(1, 1, 1)
    );
    // lighter blades toward the outside / taller ones, like the sunlit tips in the reference
    const shade = shades[Math.min(shades.length - 1, Math.floor((0.35 * rad / 0.28 + 0.65 * (h - 0.7) / 0.8) * shades.length))];
    parts.push({ geo: blade, color: shade, mtx: m });
  }
  return mergeGeos(parts);
}
// Margarita low-poly: tallo curvo, botón amarillo hexagonal y pétalos blancos. withLeaf añade una hoja al tallo.
function daisyGeo(withLeaf, tilt) {
  const flat = (pos) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  // pétalo radial sobre +X: angosto en la base, ancho hacia la punta, con la punta algo caída
  const outline = [[0.05, -0.025, 0], [0.17, -0.07, -0.012], [0.27, -0.05, -0.03], [0.31, 0, -0.04], [0.27, 0.05, -0.03], [0.17, 0.07, -0.012], [0.05, 0.025, 0]];
  const pos = [];
  for (let i = 1; i < outline.length - 1; i++) {
    for (const [x, z, y] of [outline[0], outline[i], outline[i + 1]]) pos.push(x, y, z);
  }
  const petal = flat(pos);
  const top = [withLeaf ? 0.07 : -0.04, 0.68, 0];
  const headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, withLeaf ? -0.3 : 0.25));
  const head = (y, ry, sc = 1) => new THREE.Matrix4().compose(
    new THREE.Vector3(...top), headQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))), new THREE.Vector3(sc, 1, sc)
  ).multiply(new THREE.Matrix4().makeTranslation(0, y, 0));
  const parts = [tube([[0, 0, 0], [top[0] * 0.2, 0.35, 0], top], [0.026, 0.022, 0.018], 0x3f9a5a, 5)];
  parts.push(calyx([top[0], top[1] - 0.06, top[2]], 0.07, 0x3f9a5a)); // más bajo: la cabeza inclinada no debe dejar asomar su borde
  parts.push({ geo: new THREE.CylinderGeometry(0.075, 0.085, 0.035, 6), color: 0xffe11a, mtx: head(0.012, 0) });
  const N = 7;
  for (let k = 0; k < N; k++) parts.push({ geo: petal, color: 0xffffff, mtx: head(0, (k / N) * Math.PI * 2 + (k % 2) * 0.07, 0.92 + (k % 3) * 0.06) });
  if (withLeaf) {
    const leaf = flat([0, 0, 0, 0.07, 0.035, 0.04, 0.17, 0.07, 0, 0, 0, 0, 0.17, 0.07, 0, 0.07, 0.035, -0.04]);
    parts.push({ geo: leaf, color: 0x3f9a5a, mtx: M4(0.01, 0.28, 0) });
  }
  return mergeGeos(parts);
}
// ---- piezas de flores: lámina plegada que sale hacia +X. profile(t) da [radio, altura] a lo largo de la lámina,
// widthAt(t) el medio ancho, fold cuánto se desplazan los bordes respecto al nervio central: [radial, vertical].
function bladeGeo(profile, widthAt, segs = 3, fold = [0, 0.25]) {
  const pos = [];
  const ringAt = (t) => {
    const [r, y] = profile(t), w = widthAt(t);
    const ex = r + fold[0] * w, ey = y + fold[1] * w;
    return { c: [r, y, 0], l: [ex, ey, -w], rr: [ex, ey, w] };
  };
  for (let i = 0; i < segs; i++) {
    const A = ringAt(i / segs), B = ringAt((i + 1) / segs);
    pos.push(...A.c, ...A.l, ...B.c, ...A.l, ...B.l, ...B.c, ...A.c, ...B.c, ...A.rr, ...A.rr, ...B.c, ...B.rr);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
// ancho en punta, pero con base: la lámina nace con grosor del tallo o del cáliz, no de un vértice suelto
const pointedWidth = (W) => (t) => Math.max(W * Math.sin(Math.PI * Math.pow(t, 0.8)), W * 0.28 * (1 - t));
// cáliz: ensancha el final del tallo hasta recibir los pétalos
const calyx = (top, r, color) => tube([[top[0], top[1] - 0.08, top[2]], [top[0], top[1] + 0.025, top[2]]], [0.02, r], color, 6);
const stemLeaf = (L, W, rise, droop, color, at, ry) => ({
  geo: bladeGeo((t) => [L * t, rise * t - droop * t * t], pointedWidth(W), 2),
  color, mtx: M4(at[0], at[1], at[2], 1, 1, 1, ry),
});
// repite una lámina en círculo alrededor de la cabeza de la flor
const petalRing = (parts, base, geo, n, color, startAngle = 0) => {
  for (let k = 0; k < n; k++) {
    parts.push({ geo, color, mtx: base.clone().multiply(M4(0, 0, 0, 1, 1, 1, startAngle + (k / n) * Math.PI * 2)) });
  }
};
function lilacGeo() {
  const top = [0.03, 0.55, 0], STEM = 0x3f7f3a, LEAF = 0x7cc43c;
  const base = M4(top[0], top[1], top[2], 1, 1, 1, 0, 0.12, -0.08);
  const parts = [
    tube([[0, 0, 0], [0.01, 0.3, 0], top], [0.03, 0.027, 0.024], STEM, 5),
    calyx(top, 0.075, STEM),
    stemLeaf(0.24, 0.075, 0.12, 0.04, LEAF, [0.012, 0.3, 0], 0.5),
    stemLeaf(0.24, 0.075, 0.08, 0.06, LEAF, [0.006, 0.2, 0], 3.5),
    { geo: new THREE.IcosahedronGeometry(0.06, 0), color: 0x8f8ce0, mtx: base.clone().multiply(M4(0, 0.015, 0, 1, 0.6, 1)) },
  ];
  // cinco pétalos anchos en cuenco, sin estambres
  petalRing(parts, base, bladeGeo((t) => [0.36 * t, 0.34 * t - 0.2 * t * t], pointedWidth(0.16), 3, [-0.1, 0.35]), 5, 0xa9a6ee, 0.3);
  return mergeGeos(parts);
}
function lilyGeo() {
  const top = [0, 0.85, 0], STEM = 0x4fc46a, LEAF = 0x5ccf74;
  const base = M4(top[0], top[1], top[2], 1, 1, 1, 0, 0.08, 0.06);
  const parts = [tube([[0, 0, 0], [0.01, 0.45, 0], top], [0.026, 0.024, 0.02], STEM, 5), calyx(top, 0.075, STEM)];
  [[0.12, 0.3], [0.28, 2.4], [0.44, 4.4], [0.6, 1.2], [0.74, 3.5]].forEach(([y, ry]) => parts.push(stemLeaf(0.28, 0.085, 0.15, 0.09, LEAF, [0.01, y, 0], ry)));
  // garganta pálida en lugar de estambres; seis pétalos largos que abren y se curvan hacia fuera
  parts.push({ geo: new THREE.ConeGeometry(0.06, 0.12, 6, 1, true), color: 0xd8f4b0, mtx: base.clone().multiply(M4(0, 0.06, 0, 1, -1, 1)) });
  petalRing(parts, base, bladeGeo((t) => [0.44 * Math.pow(t, 1.15), 0.42 * t - 0.2 * t * t], pointedWidth(0.1), 4, [0, 0.12]), 3, 0x25b4e8, 0);
  petalRing(parts, base, bladeGeo((t) => [0.4 * Math.pow(t, 1.15), 0.34 * t - 0.14 * t * t], pointedWidth(0.1), 4, [0, 0.12]), 3, 0x4cc8f2, Math.PI / 3);
  return mergeGeos(parts);
}
function tulipGeo() {
  const top = [0.02, 0.56, 0], STEM = 0x55c46a;
  const base = M4(top[0], top[1], top[2]);
  const parts = [
    tube([[0, 0, 0], [0.005, 0.3, 0], top], [0.024, 0.022, 0.02], STEM, 5),
    calyx(top, 0.075, STEM),
    { geo: new THREE.IcosahedronGeometry(0.05, 0), color: 0xd9820a, mtx: M4(top[0], top[1] + 0.01, top[2]) },
    // hoja larga casi vertical junto al tallo
    { geo: bladeGeo((t) => [0.26 * t - 0.06 * t * t, 0.58 * t], pointedWidth(0.1), 3, [-0.25, 0.1]), color: 0x66cc66, mtx: M4(0, 0.02, 0, 1, 1, 1, 0.8) },
  ];
  // copa en dos anillos: el exterior más oscuro; el borde forma las puntas
  const cup = (R, H, W) => bladeGeo((t) => [R * Math.sin(Math.PI * (0.1 + t * 0.62)), H * t], (t) => W * Math.sin(Math.PI * (0.12 + 0.8 * t)), 3, [-0.3, 0]);
  petalRing(parts, base, cup(0.15, 0.36, 0.12), 3, 0xffb52e, Math.PI / 3);
  petalRing(parts, base, cup(0.17, 0.33, 0.13), 3, 0xf79a12, 0);
  return mergeGeos(parts);
}
function roseGeo() {
  const top = [0.02, 0.62, 0], STEM = 0x45b85c;
  const base = M4(top[0], top[1], top[2], 1, 1, 1, 0, 0.14, -0.1);
  const parts = [
    tube([[0, 0, 0], [0.012, 0.32, 0], top], [0.02, 0.018, 0.018], STEM, 5),
    calyx(top, 0.08, STEM),
    stemLeaf(0.28, 0.08, 0.06, 0.06, STEM, [0.02, 0.5, 0], 1.0),
    stemLeaf(0.28, 0.08, 0.06, 0.06, STEM, [0.02, 0.5, 0], 4.1),
    { geo: new THREE.IcosahedronGeometry(0.07, 0), color: 0xa30d26, mtx: base.clone().multiply(M4(0, 0.1, 0, 1.3, 1.3, 1.3)) },
  ];
  // de dentro hacia fuera los pétalos se abren y aclaran
  const ring = (R, H, W, n, color, a) => petalRing(parts, base, bladeGeo((t) => [R * t, H * t - 0.3 * H * t * t], (t) => W * Math.sin(Math.PI * (0.15 + 0.75 * t)), 2, [-0.25, 0.1]), n, color, a);
  ring(0.11, 0.26, 0.1, 3, 0xb80f2a, 0);
  ring(0.17, 0.25, 0.12, 4, 0xc8112f, 0.8);
  ring(0.25, 0.22, 0.14, 5, 0xdc1638, 0.3);
  ring(0.34, 0.15, 0.15, 6, 0xee2a50, 0.1);
  return mergeGeos(parts);
}

export function buildVegetation(scene, colliders, quality, palmAsset) {
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
  // registro de espacio para que la vegetación no se monte: se ocupa en el orden en que se genera
  const SPACE_CELL = 12; // mayor que la distancia máxima entre dos huellas
  const spaceLayer = () => {
    const cells = new Map();
    const key = (ix, iz) => ix * 100003 + iz;
    return {
      free(x, z, r, k = 1) {
        const ix = Math.floor(x / SPACE_CELL), iz = Math.floor(z / SPACE_CELL);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          for (const e of cells.get(key(ix + a, iz + b)) || []) if (Math.hypot(x - e.x, z - e.z) < Math.max((r + e.r) * k, r, e.r)) return false;
        }
        return true;
      },
      claim(x, z, r) {
        const c = key(Math.floor(x / SPACE_CELL), Math.floor(z / SPACE_CELL));
        if (!cells.has(c)) cells.set(c, []);
        cells.get(c).push({ x, z, r });
      },
    };
  };
  const crowns = spaceLayer(), ground = spaceLayer();
  const CROWN_TOUCH = 0.8; // las copas pueden rozarse, pero ningún tronco queda dentro de otra copa
  const reserveTall = (cx, cz, crownR, fx, fz, footR) => {
    if (!crowns.free(cx, cz, crownR, CROWN_TOUCH) || !ground.free(fx, fz, footR)) return false;
    // copa desplazada (árbol inclinado): su tronco tampoco puede quedar bajo otra copa
    const offset = cx !== fx || cz !== fz;
    if (offset && !crowns.free(fx, fz, footR)) return false;
    crowns.claim(cx, cz, crownR);
    if (offset) crowns.claim(fx, fz, footR);
    ground.claim(fx, fz, footR);
    return true;
  };
  const reserveLow = (x, z, r) => {
    if (!ground.free(x, z, r)) return false;
    ground.claim(x, z, r);
    return true;
  };
  const make = (geo, count, place, shadow = true, material = mat) => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const cells = new Map();
    let k = 0, tries = 0;
    while (k < count && tries < count * 150) {
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
      arr.push({ m: m.clone(), c: r.c, cols: r.cols || null });
      k++;
    }
    const col = new THREE.Color();
    for (const arr of cells.values()) {
      const im = new THREE.InstancedMesh(geo, material, arr.length);
      im.castShadow = shadow;
      im.receiveShadow = true;
      arr.forEach((it, i) => { im.setMatrixAt(i, it.m); col.set(it.c); im.setColorAt(i, col); });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.userData.full = arr.length;
      im.userData.cols = arr.map((it) => it.cols); // por instancia, para apagarlos con setDensity
      scene.add(im);
      groups.push(im);
    }
  };
  const greens = [0x4caf50, 0x5cc45a, 0x3f9f4a, 0x78c850, 0x2f8f46, 0x66bb6a];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const randPt = () => ({ x: (rnd() - 0.5) * 440, z: (rnd() - 0.5) * 440 });
  // pinos en terreno alto (3 variantes); van primero porque tienen menos terreno disponible
  const pineTints = [0xffffff, 0xe8f8e0, 0xd6eed8];
  const pinePlace = (variant) => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 14 || h > 52) return null;
    if (slopeAt(x, z).m > 0.75 || blocked(x, z)) return null;
    const s = 0.9 + rnd() * 0.8, y = h - 0.2;
    const [, baseR, , y0, , coneH] = PINE_SPECS[variant];
    const reach = baseR * 0.8 * s; // el piso bajo bloquea hasta casi su borde
    // ese radio no puede invadir caminos, plataformas ni otras zonas despejadas
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (blocked(x + Math.cos(a) * reach, z + Math.sin(a) * reach)) return null;
    }
    if (!reserveTall(x, z, baseR * s, x, z, reach)) return null;
    const cols = [
      colliders.addCircle(x, z, 0.34 * s, h - 1, h + 4 * s, 'tree'),
      // solo cuenta si la cabeza alcanza el piso bajo; bajo un pino grande se sigue pasando
      colliders.addCircle(x, z, reach, y + y0 * s, y + (y0 + coneH) * s, 'tree'),
    ];
    return { x, y, z, s, c: pick(pineTints), cols };
  };
  const pines = pineVariants();
  // 150: lo que cabe en terreno alto sin solaparse, repartido parejo entre variantes
  pines.forEach((g, i) => make(g, Math.round(150 / pines.length), () => pinePlace(i)));
  // árboles (5 variantes)
  const treeTints = [0xffffff, 0xf0ffe0, 0xe2f5d2, 0xfffbe0];
  const treePlace = (variant) => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 2.4 || h > 34) return null;
    if (slopeAt(x, z).m > 0.55 || blocked(x, z)) return null;
    // clustering via noise
    if (fbm(x * 0.02 + 40, z * 0.02, 2) < 0.42) return null;
    const s = 0.85 + rnd() * 0.7, ry = 0.01 + rnd() * 6.27, y = h - 0.2;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const [crownOff, crownR, footOff, footR] = TREE_FOOTPRINTS[variant];
    if (!reserveTall(x + crownOff * cos * s, z - crownOff * sin * s, crownR * s, x + footOff * cos * s, z - footOff * sin * s, footR * s)) return null;
    // la rotación se elige aquí para que el collider coincida con el tronco visible
    const cols = TREE_COLLIDERS[variant].map(([lx, lz, r, y0, y1]) => colliders.addCircle(
      x + (lx * cos + lz * sin) * s, z + (-lx * sin + lz * cos) * s, r * s, y + y0 * s, y + y1 * s, 'tree'));
    return { x, y, z, s, ry, c: pick(treeTints), cols };
  };
  const trees = treeVariants();
  trees.forEach((g, i) => make(g, Math.round(520 / trees.length), () => treePlace(i)));
  // palms on beaches
  // las hojas son una sola lámina: doble cara para verlas también desde abajo
  const palmMat = palmAsset ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide }) : mat;
  make(palmGeo(palmAsset), 130, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 0.8 || h > 4.2 || slopeAt(x, z).m > 0.4 || blocked(x, z)) return null;
    const s = 0.9 + rnd() * 0.45;
    if (!reserveTall(x, z, 1.6 * s, x, z, 0.5 * s)) return null;
    const col = colliders.addCircle(x, z, 0.35, h - 1, h + 5, 'tree');
    // con modelo, el tinte es casi blanco para no teñir tronco ni cocos
    const tints = palmAsset ? [0xffffff, 0xf3ffe8, 0xfff6e0] : [0x5cc45a, 0x6fd06a, 0x4fb85a];
    return { x, y: h - 0.2, z, s, c: pick(tints), cols: [col] };
  }, true, palmMat);
  // rocks
  const rock = rockGeo();
  const rockShape = meshShape(rock.attributes.position.array);
  make(rock, 220, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < -1 || blocked(x, z, -3)) return null;
    const s = 0.6 + rnd() * rnd() * 3.2;
    if (!reserveLow(x, z, 0.9 * s)) return null;
    const c = pick([0xb3aaa1, 0x9c948b, 0xc4bcb2, 0x8d8780]);
    // el giro se tira aquí, en el mismo punto de la secuencia que en make: el collider lo necesita y nada cambia de lugar
    const ry = rnd() * 6.28, y = h - s * 0.15;
    return { x, y, z, s, c, ry, cols: [colliders.addMesh(x, y, z, s, ry, rockShape, 'rock')] };
  });
  // bushes (hojas de una sola lámina: doble cara)
  const bushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
  make(bushGeo(), 420, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 2 || h > 36 || slopeAt(x, z).m > 0.6 || blocked(x, z, -2)) return null;
    const s = 0.4 + rnd() * 0.45;
    if (!reserveLow(x, z, 1.7 * s)) return null;
    // verde liso como la referencia; el tinte varía entre bushes
    return { x, y: h - 0.1, z, s, c: pick([0x4fae4a, 0x63c05a, 0x3d9644, 0x58b84e]) };
  }, false, bushMat);
  // tall grass clumps (meadows)
  make(grassClumpGeo(), quality === 'low' ? 900 : 2600, () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 2 || h > 30 || pathMask(x, z) > 0.1 || riverDist(x, z) < 9 || insidePad(x, z, 1)) return null;
    // patchy meadows via noise
    if (fbm(x * 0.03 - 70, z * 0.03 + 20, 2) < 0.3) return null;
    const s = 0.8 + rnd() * 0.7;
    if (!reserveLow(x, z, 0.45 * s)) return null;
    return { x, y: h - 0.05, z, s, c: pick([0xffffff, 0xf4fff0, 0xeaffea]) };
  }, false);
  // flores: 5 tipos a partes iguales (la margarita en sus dos variantes). Colores propios, por eso sin tinte.
  const FLOWERS_PER_TYPE = quality === 'low' ? 60 : 160;
  [
    [daisyGeo(true, 0.2), 0.32, 0.5], [daisyGeo(false, 0.1), 0.32, 0.5],
    [lilacGeo(), 0.42, 1], [lilyGeo(), 0.5, 1], [tulipGeo(), 0.25, 1], [roseGeo(), 0.42, 1],
  ].forEach(([g, footR, share]) => make(g, Math.round(FLOWERS_PER_TYPE * share), () => {
    const { x, z } = randPt();
    const h = heightAt(x, z);
    if (h < 2.2 || h > 26 || blocked(x, z, -4)) return null;
    const s = 0.6 + rnd() * rnd() * 1.1; // de 0.6 a 1.7: muchas pequeñas y medianas, pocas grandes
    if (!reserveLow(x, z, footR * s)) return null;
    return { x, y: h - 0.03, z, s, c: 0xffffff };
  }, false, bushMat)); // pétalos de una lámina: doble cara
  return {
    groups,
    setDensity(f) {
      for (const g of groups) {
        g.count = Math.floor(g.userData.full * f);
        // lo que no se dibuja tampoco choca (si no, quedan paredes invisibles)
        g.userData.cols.forEach((cols, i) => { if (cols) for (const c of cols) c.on = i < g.count; });
      }
    },
  };
}

// ------------------------------------------------------------------ bridge
export function buildBridge(scene, colliders) {
  const ax = BRIDGE.ax, az = BRIDGE.az, bx = BRIDGE.bx, bz = BRIDGE.bz, W = BRIDGE.w;
  const ha = heightAt(ax, az) + 0.15, hb = heightAt(bx, bz) + 0.15;
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax); // rotation about Y so local +x points A->B
  const sideX = Math.sin(rot), sideZ = Math.cos(rot); // eje lateral del puente
  const deckY = (t) => lerp(ha, hb, t) + Math.sin(t * Math.PI) * 1.6;
  const at = (t, side = 0, up = 0) => new THREE.Vector3(lerp(ax, bx, t) + sideX * side, deckY(t) + up, lerp(az, bz, t) + sideZ * side);
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc8232c, roughness: 0.55, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.85, flatShading: true });
  const wood2 = new THREE.MeshStandardMaterial({ color: 0x77593e, roughness: 0.85, flatShading: true });
  const under = new THREE.MeshStandardMaterial({ color: 0x4b3a2c, roughness: 0.9, flatShading: true });
  const N = 48;
  // pieza continua a lo largo del puente, de sección rectangular (halfW a los lados, de y0 a y1 respecto al tablero)
  const sweep = (side, halfW, y0, y1, extra = () => 0) => {
    const stations = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = extra(t);
      stations.push([at(t, side - halfW, y0 + u), at(t, side + halfW, y0 + u), at(t, side + halfW, y1 + u), at(t, side - halfW, y1 + u)]);
    }
    const pos = [], tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
    for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) quad(stations[i][k], stations[i + 1][k], stations[i + 1][(k + 1) % 4], stations[i][(k + 1) % 4]);
    quad(stations[0][3], stations[0][2], stations[0][1], stations[0][0]);
    quad(stations[N][0], stations[N][1], stations[N][2], stations[N][3]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  // bloque de orientación libre entre dos puntos
  const postBetween = (a, b, w, d, mat) => {
    const dir = b.clone().sub(a), m = new THREE.Mesh(new THREE.BoxGeometry(w, dir.length(), d), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.rotation.y = rot;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  // colisión: la superficie del tablero, igual a la que se pisa
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const deckCol = sweep(0, W / 2, -0.35, 0);
  const tris = deckCol.attributes.position.array.slice();
  for (let i = 0; i < tris.length; i += 3) { tris[i] -= mx; tris[i + 2] -= mz; }
  colliders.addMesh(mx, 0, mz, 1, 0, meshShape(tris), 'bridge');
  // tablero: base oscura y tablas de madera atravesadas
  add(sweep(0, W / 2 - 0.08, -0.34, -0.045), under);
  const boards = Math.round(len / 0.86);
  for (let i = 0; i < boards; i++) {
    const t0 = i / boards, t1 = (i + 1) / boards, tm = (t0 + t1) / 2, a = at(tm);
    const pitch = Math.atan2(deckY(t1) - deckY(t0), len / boards);
    const b = new THREE.Mesh(new THREE.BoxGeometry((len / boards) * 0.97, 0.05, W - 0.46), i % 3 === 1 ? wood2 : wood);
    b.position.set(a.x, a.y - 0.025, a.z);
    b.rotation.set(0, rot, pitch, 'YXZ');
    b.receiveShadow = true;
    group.add(b);
  }
  // barandales rojos: viga lateral, pasamanos medio y pasamanos superior en arco, todos continuos
  const railTop = (t) => Math.sin(t * Math.PI) * 0.22;
  const inset = W / 2 - 0.13;
  for (const s of [-1, 1]) {
    add(sweep(s * (W / 2 - 0.1), 0.13, -0.5, 0.06), red);
    add(sweep(s * inset, 0.06, 0.62, 0.74), red);
    add(sweep(s * inset, 0.11, 1.16, 1.3, railTop), red);
    // postes: entran en la viga y en el pasamanos superior, sin separación
    const posts = 8;
    for (let k = 1; k < posts; k++) {
      const t = k / posts;
      postBetween(at(t, s * inset, -0.45), at(t, s * inset, 1.26 + railTop(t)), 0.26, 0.22, red);
    }
    // listones cortos entre el pasamanos medio y el superior
    for (let k = 0; k < posts; k++) for (let j = 1; j < 3; j++) {
      const t = (k + j / 3) / posts;
      postBetween(at(t, s * inset, 0.68), at(t, s * inset, 1.2 + railTop(t)), 0.09, 0.09, red);
    }
    // listones bajos, de la viga al pasamanos medio
    for (let k = 0; k < posts; k++) for (let j = 1; j < 3; j++) {
      const t = (k + j / 3) / posts;
      postBetween(at(t, s * inset, 0), at(t, s * inset, 0.66), 0.09, 0.09, red);
    }
    // postes de los extremos, más altos y con remate redondeado
    for (const t of [0, 1]) {
      const base = at(t, s * inset, -0.6), top = at(t, s * inset, 1.62);
      postBetween(base, top, 0.48, 0.44, red);
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.52), red);
      collar.position.copy(top);
      collar.rotation.y = rot;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), red);
      knob.position.copy(top).add(new THREE.Vector3(0, 0.2, 0));
      group.add(collar, knob);
      colliders.addBox(top.x, top.z, 0.26, 0.24, rot, top.y - 2.3, top.y + 0.3, 'rail');
    }
  }
  // colisión lateral continua, tramo a tramo, a la altura del barandal
  const RAILS = 24;
  for (const s of [-1, 1]) for (let i = 0; i < RAILS; i++) {
    const t0 = i / RAILS, t1 = (i + 1) / RAILS, tm = (t0 + t1) / 2, c = at(tm, s * inset), y = Math.max(deckY(t0), deckY(t1));
    colliders.addBox(c.x, c.z, len / RAILS / 2 + 0.05, 0.14, rot, Math.min(deckY(t0), deckY(t1)) - 0.5, y + 1.3, 'rail');
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
  const rockTris = (geo.index ? geo.toNonIndexed() : geo).attributes.position.array.slice();
  for (let i = 1; i < rockTris.length; i += 3) rockTris[i] += base - 2 + H / 2;
  colliders.addMesh(PILLAR.x, 0, PILLAR.z, 1, 0, meshShape(rockTris), 'pillar');
  colliders.addCircle(PILLAR.x, PILLAR.z, PILLAR.r * 0.98, topY - 0.5, topY + 0.25, 'pillar');
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
  // la escalera termina a la altura del borde de la meseta por donde llega
  const stairTopY = surfaceAt(MESA.x + Math.cos(1.4) * (MESA.r - 4), MESA.z - 4 + Math.sin(1.4) * (MESA.r - 4)) + 0.3;
  const count = Math.max(4, Math.ceil((stairTopY - g0 - 0.9) / 1.15) + 1);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const ang = -0.2 + t * 1.6;
    const y = lerp(g0 + 0.9, stairTopY, t);
    // subida pareja: si el acantilado tapa el escalón, este se aleja hasta quedar sobre el terreno
    let R = MESA.r + 6 - t * 4.5, x = 0, z = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = MESA.x + Math.cos(ang) * R;
      z = MESA.z + Math.sin(ang) * R - 4;
      let top = -Infinity;
      for (const [ox, oz] of [[0, 0], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]]) top = Math.max(top, surfaceAt(x + ox, z + oz));
      if (top <= y - 0.1) break;
      R += 0.5;
    }
    const st = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 2.6), stoneMat);
    st.position.set(x, y - 0.3, z);
    st.rotation.y = ang;
    st.castShadow = st.receiveShadow = true;
    group.add(st);
    colliders.addBox(x, z, 1.3, 1.3, ang, y - 0.6, y, 'step');
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
