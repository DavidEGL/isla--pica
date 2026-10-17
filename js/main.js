// EPIC ADVENTURES — EPIC ISLAND · EpicGroup Lab
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt, PADS, MESA, LAKE, SPAWN, PILLAR, BRIDGE, insidePad, pathMask, riverDist, slopeAt } from './terrain.js';
import { Colliders } from './colliders.js';
import {
  buildSky, buildLights, buildTerrain, buildHeightTexture, buildWater, buildWaterfalls, buildVegetation,
  buildBridge, buildParkour, buildSkyDecor, buildCrystals, SUN_DIR,
} from './world.js';
import { STEAM_GEO } from './districts.js';
import { buildDistricts } from './districts.js';
import { Avatar, Player } from './player.js';
import { FollowCam } from './camera.js';
import { Input } from './input.js';
import { NeuriX } from './neurix.js';
import { Mission } from './mission.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';
import { mulberry32, safeStorage, softSpriteTexture, lerp } from './util.js';
import { gatePortal, Travel, fadePortal } from './portals.js';
import { BrainLab, LAB_RETURN } from './brainlab.js';
import { Voice } from './voice.js';
import { Arcade, ARCADE_RETURN } from './arcade.js';
import { Gear } from './gear.js';
import { XRMode } from './xr.js';

const params = new URLSearchParams(location.search);
const store = safeStorage();
const SAVE_KEY = 'epic-island-save-v1';
const $ = (id) => document.getElementById(id);
const setLoad = (p, txt) => { $('load-fill').style.width = Math.round(p * 100) + '%'; if (txt) $('load-text').textContent = txt; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------------------------------------------------------------- save
const save = {
  data: {},
  load() {
    try { this.data = JSON.parse(store.get(SAVE_KEY) || '{}') || {}; } catch { this.data = {}; }
    const d = this.data;
    d.crystals = d.crystals || [];
    d.xp = d.xp || 0;
    d.ach = d.ach || {};
    d.visited = d.visited || {};
    d.settings = d.settings || {};
    d.time = d.time || 0;
    return d;
  },
  persist() { try { store.set(SAVE_KEY, JSON.stringify(this.data)); } catch { /* ignore */ } },
  reset() { store.del(SAVE_KEY); },
};
save.load();
const settings = save.data.settings;
let quality = params.get('q') || settings.quality || (matchMedia('(pointer: coarse)').matches ? 'low' : 'medium');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: !!params.get('pdb') });
renderer.domElement.id = 'game';
document.getElementById('app').prepend(renderer.domElement);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 2000);
function applyQuality(q) {
  quality = q;
  settings.quality = q;
  const dpr = devicePixelRatio || 1;
  renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 0.85) : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 1.75));
  renderer.shadowMap.enabled = q !== 'low';
  if (G.lights) {
    G.lights.sun.castShadow = q !== 'low';
    const sz = q === 'high' ? 2048 : 1024;
    if (G.lights.sun.shadow.mapSize.x !== sz) {
      G.lights.sun.shadow.mapSize.set(sz, sz);
      if (G.lights.sun.shadow.map) { G.lights.sun.shadow.map.dispose(); G.lights.sun.shadow.map = null; }
    }
  }
  if (G.veg) G.veg.setDensity(q === 'low' ? 0.45 : q === 'medium' ? 0.8 : 1);
  if (!(G.lab && G.lab.inside) && !(G.arcade && G.arcade.inside)) scene.fog.density = q === 'low' ? 0.0028 : 0.0021;
  camera.far = q === 'low' ? 900 : 2000;
  camera.updateProjectionMatrix();
  save.persist();
}
function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);
onResize();

const G = { renderer, scene, camera }; // game objects
window.__game = G;
window.__tp = (x, z, yaw = 0, pitch = 0.3, dist = 7, y = null) => {
  const p = G.player;
  p.pos.set(x, y ?? heightAt(x, z) + 0.2, z);
  p.vel.set(0, 0, 0);
  p.safe.copy(p.pos);
  G.cam.yaw = yaw; G.cam.pitch = pitch; G.cam.wantDist = dist; G.cam.curDist = dist;
  G.cam.target.set(p.pos.x, p.pos.y + 1.5, p.pos.z);
  G.neurix.pos.set(x + 2, p.pos.y + 1.2, z + 1);
  return 1;
};

// ---------------------------------------------------------------- assets
const loader = new GLTFLoader();
const loadGLB = (url) => new Promise((res) => loader.load(url, res, undefined, () => res(null)));

async function loadAssets() {
  const base = './assets/models/';
  const kp = 'kenney-platformer/', kc = 'kenney-city/';
  const want = [
    ['platform', base + kp + 'platform.glb'],
    ['b1', base + kc + 'building-small-a.glb'], ['b2', base + kc + 'building-small-b.glb'],
    ['b3', base + kc + 'building-small-c.glb'], ['b4', base + kc + 'building-small-d.glb'],
    ['b5', base + kc + 'building-garage.glb'],
  ];
  const out = {};
  let i = 0;
  for (const [k, url] of want) {
    out[k] = await loadGLB(url);
    setLoad(0.08 + (++i / want.length) * 0.22, 'Construyendo los distritos…');
  }
  // avatar: generated model, then fallback
  const avatarUrl = params.get('avatar') ? base + params.get('avatar') : base + 'avatar.glb';
  setLoad(0.32, 'Preparando a tu explorador…');
  let av = await loadGLB(avatarUrl);
  if (av && params.get('clips')) {
    const keep = params.get('clips').split(',');
    av.animations = av.animations.filter((a) => keep.includes(a.name));
  }
  if (!av) av = await loadGLB(base + 'avatar.glb'); // retry: always our own Epic avatar
  out.avatar = av;
  return out;
}

// ---------------------------------------------------------------- crystals
function crystalPositions(parkour) {
  const pts = [];
  const add = (x, z, y = null) => pts.push({ x, z, y: y ?? heightAt(x, z) + 1.05 });
  // path to the plaza
  [[5, 136], [5.5, 112], [3, 86], [1.5, 64]].forEach(([x, z]) => add(x, z));
  // plaza ring
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.78; add(Math.cos(a) * 23, 20 + Math.sin(a) * 23, PADS.plaza.h + 1.05); }
  // parkour platforms + pillar top
  parkour.platforms.forEach((p, i) => { if (i % 4 === 2) add(p.x, p.z, p.y + 1.0); });
  for (let k = 0; k < 3; k++) { const a = k * 2.1; add(PILLAR.x + Math.cos(a) * 3, PILLAR.z + Math.sin(a) * 3, parkour.topY + 1.25); }
  // secret mesa top
  [[0, 0], [5, -5], [-5, -6]].forEach(([dx, dz]) => add(MESA.x + dx, MESA.z + dz - 4));
  // lake shore + bridge
  add(LAKE.x - 24, LAKE.z + 6); add(LAKE.x + 22, LAKE.z + 8);
  const bmx = (BRIDGE.ax + BRIDGE.bx) / 2, bmz = (BRIDGE.az + BRIDGE.bz) / 2;
  add(bmx, bmz, lerp(heightAt(BRIDGE.ax, BRIDGE.az), heightAt(BRIDGE.bx, BRIDGE.bz), 0.5) + 1.6 + 1.2);
  // beaches all around (ray-march from center)
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + 0.3;
    let last = null;
    for (let r = 60; r < 240; r += 2) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (heightAt(x, z) > 1.2) last = [x, z]; }
    if (last && !insidePad(last[0], last[1], 4)) add(last[0], last[1]);
  }
  // neuro district
  add(-112, -8); add(-90, 10); add(-140, 30);
  // outside locked districts (towards plaza)
  for (const k of ['steam', 'english', 'tech']) {
    const p = PADS[k], a = Math.atan2(PADS.plaza.z - p.z, PADS.plaza.x - p.x);
    add(p.x + Math.cos(a) * (p.r + 7), p.z + Math.sin(a) * (p.r + 7));
  }
  // forests & hills
  const rnd = mulberry32(77);
  let guard = 0;
  while (pts.length < 40 && guard++ < 4000) {
    const x = (rnd() - 0.5) * 400, z = (rnd() - 0.5) * 400, h = heightAt(x, z);
    if (h < 3 || h > 30 || slopeAt(x, z).m > 0.5 || insidePad(x, z, 4) || riverDist(x, z) < 10) continue;
    if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 25)) continue;
    add(x, z);
  }
  return pts.slice(0, 40);
}

// ---------------------------------------------------------------- achievements
const ACH = {
  inicio: { t: 'Primeros pasos', d: 'Llegaste a Epic Island', i: '🏝️' },
  cristales10: { t: 'Cazador de cristales', d: 'Reúne 10 cristales', i: '💎' },
  cristales40: { t: 'Coleccionista total', d: 'Reúne los 40 cristales', i: '🏆' },
  mirador: { t: 'Vista de águila', d: 'Llega a la cima del Mirador', i: '🦅' },
  mesa: { t: 'Secreto de la cascada', d: 'Descubre la meseta oculta', i: '🌊' },
  explorador: { t: 'Explorador de distritos', d: 'Visita los 4 distritos', i: '🧭' },
  impulso: { t: 'Velocista', d: 'Usa el impulso 10 veces', i: '⚡' },
  guardian: { t: 'Guardián Neuronal', d: 'Completa NeuroAventura', i: '🧠' },
  portal: { t: 'Viajero de portales', d: 'Cruza tu primer portal', i: '🌀' },
  cerebro: { t: 'Viajero del Cerebro', d: 'Activa los 4 lóbulos del cerebro', i: '✨' },
  equilibrio: { t: 'Maestro del equilibrio', d: 'Supera el reto del cerebelo', i: '⚖️' },
  retos: { t: 'Campeón de la Sala de Retos', d: 'Supera los 4 niveles', i: '🎮' },
  mate: { t: 'Mente matemática', d: 'Supera los 4 niveles de la Sala de Matemáticas', i: '🧮' },
  estrellas: { t: 'Lluvia de estrellas', d: 'Consigue las 12 estrellas de la Sala de Retos', i: '🌟' },
};

// ---------------------------------------------------------------- boot
async function boot() {
  setLoad(0.04, 'Cargando la isla…');
  await nextFrame();
  const assets = await loadAssets();
  setLoad(0.38, 'Moldeando el terreno…');
  await nextFrame();
  G.colliders = new Colliders();
  buildSky(scene);
  G.lights = buildLights(scene);
  G.terrain = buildTerrain(scene);
  setLoad(0.5, 'Llenando el océano…');
  await nextFrame();
  const hTex = buildHeightTexture();
  G.water = buildWater(scene, hTex);
  G.falls = buildWaterfalls(scene);
  setLoad(0.58, 'Plantando la selva…');
  await nextFrame();
  G.veg = buildVegetation(scene, G.colliders, quality);
  G.bridge = buildBridge(scene, G.colliders);
  // kenney helpers
  const kenney = {};
  if (assets.platform) {
    const pl = assets.platform.scene;
    const box = new THREE.Box3().setFromObject(pl);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    kenney.platform = pl;
    kenney.platformScale = 3.2 / w;
    kenney.platformTop = box.max.y;
  }
  kenney.city = ['b1', 'b2', 'b3', 'b4', 'b5'].map((k) => assets[k] && assets[k].scene).filter(Boolean);
  setLoad(0.68, 'Levantando los distritos…');
  await nextFrame();
  G.parkour = buildParkour(scene, G.colliders, kenney);
  G.districts = buildDistricts(scene, G.colliders, kenney);
  G.sky = buildSkyDecor(scene);
  G.crystalPts = crystalPositions(G.parkour);
  G.crystals = buildCrystals(scene, G.crystalPts);
  for (const i of save.data.crystals) if (G.crystals.state[i]) G.crystals.restore(i);
  // portals + the brain interior
  G.lab = new BrainLab(scene, G.colliders);
  G.arcade = new Arcade(scene, G.colliders);
  const OPEN = { neuro: 'toNeuro', steam: 'toSteam' };
  G.gatePortals = G.districts.gates.map((g) => ({ ...gatePortal(scene, g, !OPEN[g.key]), kind: OPEN[g.key] || 'locked', key: g.key }));
  G.gatePortals.push({ ...gatePortal(scene, G.districts.neuroGate, false), kind: 'toPlaza', key: 'plaza' });
  G.gatePortals.push({ ...gatePortal(scene, G.districts.steamGate, false), kind: 'toPlaza', key: 'steam' });
  G.portalMats = G.gatePortals.map((e) => e.mat);
  G.worldObjs = scene.children.filter((o) => o !== G.lab.root && o !== G.arcade.root && !o.isLight && o !== G.lights.sun.target);
  setLoad(0.8, 'Despertando a Neuri-X…');
  await nextFrame();
  G.audio = new Sfx();
  G.ui = new UI(G.audio);
  G.voice = new Voice(G.audio);
  G.voice.enabled = settings.voice !== false;
  G.ui.voice = G.voice;
  G.input = new Input(renderer.domElement, G.ui);
  G.input.sensitivity = settings.sens || 1;
  G.input.invertY = !!settings.invertY;
  const avatar = new Avatar(assets.avatar, { height: 1.5 });
  G.avatar = avatar;
  G.player = new Player(scene, G.colliders, avatar, G.audio, softSpriteTexture('rgba(255,248,230,0.9)', 'rgba(255,248,230,0)'));
  if (save.data.pos && !params.get('pos')) {
    const [x, y, z] = save.data.pos;
    G.player.pos.set(x, Math.max(y, heightAt(x, z)) + 0.2, z);
    G.player.yaw = save.data.yaw || Math.PI;
  }
  if (params.get('pos')) {
    const [x, z] = params.get('pos').split(',').map(Number);
    G.player.pos.set(x, heightAt(x, z) + 0.5, z);
  }
  G.neurix = new NeuriX(scene);
  G.cam = new FollowCam(camera, G.colliders);
  G.cam.snapBehind(G.player.yaw);
  G.cam.target.copy(G.player.pos).add(new THREE.Vector3(0, 1.5, 0));
  if (params.get('stage')) save.data.stage = params.get('stage');
  G.mission = new Mission({
    scene, colliders: G.colliders, ui: G.ui, audio: G.audio, player: G.player, neurix: G.neurix, cam: G.cam, save,
    dome: G.districts.dome, locked: G.districts.locked,
    addXP, unlock, unlockVisit, persist: () => persistAll(),
    openMap: () => toggleMap(true), mapOpen: () => mapOpen, showComplete,
  });
  if (params.get('parts')) for (const p of params.get('parts').split(',')) { save.data.parts[p] = true; }
  if (params.get('done')) for (const p of params.get('done').split(',')) { save.data.stations[p] = true; }
  G.mission.ctx.arcade = G.arcade;
  G.arcade.init({
    scene, lights: G.lights, save, ui: G.ui, audio: G.audio, player: G.player, mission: G.mission, cam: G.cam, neurix: G.neurix,
    addXP, unlock, persist: () => persistAll(), portal: (k, key) => handlePortal(k, key), teleport,
    worldObjs: () => G.worldObjs.concat([G.mission.root]), fogDensity: () => (quality === 'low' ? 0.0028 : 0.0021),
  });
  G.mission.restore();
  G.lab.init({
    scene, lights: G.lights, save, ui: G.ui, audio: G.audio, player: G.player, mission: G.mission, cam: G.cam, addXP, unlock,
    persist: () => persistAll(), worldObjs: () => G.worldObjs.concat([G.mission.root]),
    fogDensity: () => (quality === 'low' ? 0.0028 : 0.0021),
  });
  G.gear = new Gear(scene, {
    save, player: G.player, arcade: G.arcade, lab: G.lab, ui: G.ui, audio: G.audio, mission: G.mission,
    persist: () => persistAll(), crystals: () => G.crystals.state, portrait: () => makePortrait(),
  });
  G.gear.onClose = () => toggleInv(false);
  G.arcade.ctx.gear = G.gear;
  G.xr = new XRMode({
    renderer, scene, camera, player: G.player, input: G.input, ui: G.ui, audio: G.audio, gear: G.gear,
    onStart: () => xrStart(), onEnd: () => xrEnd(),
  });
  G.gear.ctx.xr = G.xr;
  const _play = G.audio.play.bind(G.audio);
  const HAPTIC = { good: 0.45, pick: 0.3, snap: 0.5, reward: 0.7, bad: 0.6, achieve: 0.6, crystal: 0.4, dash: 0.25, portal: 0.5, switch: 0.3 };
  G.audio.play = (n, ...a) => { if (G.xr.active && HAPTIC[n]) G.xr.haptic(HAPTIC[n], 50); return _play(n, ...a); };
  G.travel = new Travel();
  G.portalList = G.gatePortals.map((e) => ({ portal: e.portal, kind: e.kind, key: e.key, where: 'world' }));
  G.portalList.push({ portal: G.lab.entrancePortal, kind: 'enterLab', where: 'world' }, { portal: G.lab.exitPortal, kind: 'exitLab', where: 'lab' });
  G.portalList.push(...G.arcade.portals);
  const st = save.data.stage;
  if (st === 'intro') { G.neurix.placeAt(0, 33, 0.4); G.neurix.yaw = 0; G.neurix.mode = 'idle'; }
  else { G.neurix.placeAt(G.player.pos.x + 1.5, G.player.pos.z + 1.5); G.neurix.mode = 'follow'; }
  applyQuality(quality);
  G.player.onLand = (impact) => { if (impact > 14) G.cam.shake = Math.min(0.6, impact / 40); };
  G.player.onRespawn = () => G.ui.toast('¡Cuidado! Regresaste a tierra firme', '', '🌊');
  setLoad(0.92, 'Compilando efectos…');
  await nextFrame();
  G.lab.root.visible = true;   // compile the interior shaders now, so entering the portal does not stutter
  G.arcade.root.visible = true;
  for (const k in G.arcade.levels) G.arcade.levels[k].g.visible = true;
  for (const k in G.arcade.sets) G.arcade.sets[k].decor.visible = true;
  renderer.compile(scene, camera);
  G.lab.root.visible = false;
  G.arcade.root.visible = false;
  for (const k in G.arcade.levels) G.arcade.levels[k].g.visible = false;
  for (const k in G.arcade.sets) G.arcade.sets[k].decor.visible = k === G.arcade.set;
  setLoad(1, '¡Listo!');
  refreshStats();
  setupMenus();
  $('loading').classList.add('hidden');
  if (params.get('test')) startGame();
  else showTitle();
  lastT = performance.now();
  renderer.setAnimationLoop(loop);
}

// ---------------------------------------------------------------- progression
function levelInfo(xp) { const lvl = 1 + Math.floor(xp / 250); return { lvl, frac: (xp % 250) / 250 }; }
function refreshStats() {
  const li = levelInfo(save.data.xp);
  G.ui.setStats({
    crystals: save.data.crystals.length, crystalsTotal: G.crystalPts.length, level: li.lvl, levelFrac: li.frac,
    xp: save.data.xp, parts: save.data.parts || {}, placed: save.data.placed || {},
  });
}
function addXP(n, reason) {
  const before = levelInfo(save.data.xp).lvl;
  save.data.xp += n;
  const after = levelInfo(save.data.xp).lvl;
  refreshStats();
  G.ui.bump('xp');
  if (after > before) { G.ui.toast(`¡Subiste al nivel ${after}!`, reason || '', '⭐', true, 3); G.audio.play('achieve'); }
}
function unlock(id) {
  if (save.data.ach[id] || !ACH[id]) return;
  save.data.ach[id] = Date.now();
  const a = ACH[id];
  G.ui.toast(`Logro: ${a.t}`, a.d, a.i, true, 3.4);
  G.audio.play('achieve');
  addXP(50, a.t);
  persistAll();
}
function unlockVisit(k) {
  save.data.visited[k] = true;
  if (['neuro', 'steam', 'english', 'tech'].every((x) => save.data.visited[x])) unlock('explorador');
  persistAll();
}
function persistAll() {
  if (G.player) { save.data.pos = [G.player.safe.x, G.player.safe.y, G.player.safe.z]; save.data.yaw = G.player.yaw; }
  if (G.lab && G.lab.inside) { save.data.pos = [LAB_RETURN.x, PADS.neuro.h + 0.2, LAB_RETURN.z]; save.data.yaw = LAB_RETURN.yaw; }
  if (G.arcade && G.arcade.inside) { const r = G.arcade.returnSpot(); save.data.pos = [r.x, r.y, r.z]; save.data.yaw = r.yaw; }
  save.persist();
}
setInterval(() => { if (playing) persistAll(); }, 5000);

// ---------------------------------------------------------------- portals / travel
function teleport(x, y, z, yaw, force = false) {
  const p = G.player;
  p.pos.set(x, y, z);
  p.vel.set(0, 0, 0);
  p.safe.copy(p.pos);
  p.yaw = yaw;
  p.grounded = false;
  p.avatar.root.position.copy(p.pos);
  p.avatar.root.rotation.y = yaw;
  if (G.xr && G.xr.active) G.xr.face(yaw);
  G.cam.snapBehind(yaw);
  G.cam.target.set(x, y + 1.5, z);
  G.cam.curDist = G.cam.wantDist;
  if (force || G.neurix.mode === 'follow') {
    G.neurix.mode = 'follow';
    G.neurix.pos.set(x - Math.sin(yaw) * 1.6 + Math.cos(yaw) * 1.3, y + 1.4, z - Math.cos(yaw) * 1.6 - Math.sin(yaw) * 1.3);
  }
}
const lockToastT = {};
function handlePortal(kind, key) {
  const N = PADS.neuro, P = PADS.plaza;
  if (kind === 'locked') {
    if (simT - (lockToastT[key] ?? -99) > 6) {
      lockToastT[key] = simT;
      G.ui.toast('Este portal se activará muy pronto', 'Distrito en construcción', '🔒', false, 3);
      G.audio.play('bad');
    }
    return;
  }
  if (kind === 'gate') { G.arcade.gate(key); return; }
  const lm = kind === 'level' ? G.arcade.meta(key) : null;
  const dests = {
    toNeuro: { color: '#ffb020', msg: ['DISTRITO NEURO', 'Neurociencia · Bienestar'], apply: () => teleport(-89, N.h + 0.2, 4, -Math.PI / 2) },
    toPlaza: {
      color: '#35e0ff', msg: ['PLAZA CENTRAL', 'Tu punto de partida'],
      apply: () => {
        if (key !== 'steam') { teleport(-26.5, P.h + 0.2, 20, Math.PI / 2); return; }
        const g = G.districts.gates.find((x) => x.key === 'steam'), dx = P.x - g.x, dz = P.z - g.z, d = Math.hypot(dx, dz);
        teleport(g.x + (dx / d) * 4.5, P.h + 0.2, g.z + (dz / d) * 4.5, Math.atan2(dx, dz));
      },
    },
    toSteam: {
      color: '#8b5cf6', msg: ['DISTRITO STEAM', 'Ciencia · Arte · Creatividad'],
      apply: () => teleport(STEAM_GEO.arrive.x, PADS.steam.h + 0.2, STEAM_GEO.arrive.z, STEAM_GEO.arrive.yaw),
      after: () => {
        if (!save.data.visited.steam) G.ui.toast('Neuri-X: ¡Bienvenido al Distrito STEAM! Cruza el portal morado para entrar a la Sala de Matemáticas.', '', '🧮', false, 5);
        unlockVisit('steam');
      },
    },
    home: {
      color: '#35e0ff', msg: ['PLAZA CENTRAL', 'Tu punto de partida'],
      apply: () => { G.lab.exit(); G.arcade.exit(); teleport(0, P.h + 0.2, 37, Math.PI, true); if (save.data.stage === 'intro') { G.neurix.placeAt(0, 33, 0.4); G.neurix.mode = 'idle'; } },
      after: () => G.mission.stageObjective(),
    },
    enterLab: {
      color: '#ff6fd8', msg: ['VIAJE AL CEREBRO', 'Activa los 4 lóbulos'],
      apply: () => { G.lab.enter(); const s = G.lab.spawnWorld(); teleport(s.x, s.y, s.z, s.yaw, true); },
      after: () => G.lab.onEntered(),
    },
    exitLab: {
      color: '#ffb020', msg: ['DISTRITO NEURO', 'De regreso del cerebro'],
      apply: () => {
        G.lab.exit();
        teleport(LAB_RETURN.x, N.h + 0.2, LAB_RETURN.z, LAB_RETURN.yaw, true);
        if (save.data.stage === 'intro') { G.neurix.placeAt(0, 33, 0.4); G.neurix.mode = 'idle'; }
      },
      after: () => G.mission.stageObjective(),
    },
    enterArcade: {
      color: '#' + new THREE.Color(G.arcade.cfgOf(key).doorColor).getHexString(), msg: G.arcade.cfgOf(key).sign,
      apply: () => { G.arcade.enter(key); const s = G.arcade.hubSpawn(); teleport(s.x, s.y, s.z, s.yaw, true); },
      after: () => G.arcade.onEnteredHub(),
    },
    exitArcade: {
      color: '#ffb020', msg: [G.arcade.cfg.district, `De regreso de la ${G.arcade.cfg.hall}`],
      apply: () => { const r = G.arcade.returnSpot(); G.arcade.exit(); teleport(r.x, r.y, r.z, r.yaw, true); },
      after: () => G.mission.stageObjective(),
    },
    level: lm && {
      color: '#' + new THREE.Color(lm.color).getHexString(), msg: [lm.tag || `NIVEL ${lm.n}`, lm.name],
      apply: () => { const s = G.arcade.startLevel(key); teleport(s.x, s.y, s.z, s.yaw, true); },
      after: () => G.arcade.beginLevel(),
    },
    toHub: {
      color: '#22c55e', msg: [G.arcade.cfg.hall.toUpperCase(), 'Elige un nivel'],
      apply: () => { const s = G.arcade.toHub(); teleport(s.x, s.y, s.z, s.yaw, true); },
      after: () => G.arcade.hubObjective(),
    },
    finalBoss: {
      color: '#ffd36b', msg: ['NIVEL FINAL', 'Reconstruye la neurona en el Laboratorio Central'],
      apply: () => { G.arcade.exit(); teleport(-114, N.h + 0.2, 2, -Math.PI / 2, true); },
      after: () => G.mission.stageObjective(),
    },
  };
  const d = dests[kind];
  if (!d) return;
  G.mission.busy = true;
  G.player.frozen = true;
  G.audio.play('portal');
  G.travel.go({
    color: d.color,
    apply: () => { d.apply(); for (const e of G.portalList) e.portal.reset(); },
    after: () => {
      G.mission.busy = false;
      G.ui.centerMsg(d.msg[0], d.msg[1], 2.2);
      if (kind !== 'home') unlock('portal');
      persistAll();
      if (d.after) d.after();
    },
  });
}
window.__portal = (k, key) => { handlePortal(k, key); return 1; };

// ---------------------------------------------------------------- menus
let playing = false, paused = false, mapOpen = false, started = false, completeOpen = false, achOpen = false, invOpen = false;
let xrPrevQ = null;
function xrStart() {
  if (!started) startGame();
  if (paused) { paused = false; $('pause').classList.add('hidden'); }
  if (mapOpen) toggleMap(false);
  if (achOpen) toggleAch(false);
  if (invOpen) toggleInv(false);
  xrPrevQ = quality;
  applyQuality('low');
  settings.quality = xrPrevQ;
  save.persist();
  G.neurix.side = 1.2; G.neurix.fwd = 2.1;   // keep Neuri-X inside the field of view
  G.ui.toast('¡Modo VR activado!', 'Stick izquierdo: moverte · A: saltar · Gatillo: interactuar', '🥽', false, 5);
}
function xrEnd() {
  G.neurix.side = G.neurix.fwd = undefined;
  if (xrPrevQ) applyQuality(xrPrevQ);
  G.cam.snapBehind(G.player.yaw);
}
function toggleInv(on = !invOpen) {
  invOpen = on;
  G.gear.show(on);
  if (on && document.pointerLockElement) document.exitPointerLock();
}
function toggleAch(on = !achOpen) {
  achOpen = on;
  $('achv').classList.toggle('hidden', !on);
  if (!on) return;
  const ids = Object.keys(ACH);
  const got = ids.filter((k) => save.data.ach[k]).length;
  $('achv-title').textContent = `Logros · ${got}/${ids.length}`;
  $('achv-grid').innerHTML = ids.map((k) => `<div class="achv-card${save.data.ach[k] ? ' on' : ''}"><div class="ai">${ACH[k].i}</div><div><b>${ACH[k].t}</b><small>${ACH[k].d}</small></div></div>`).join('');
  if (document.pointerLockElement) document.exitPointerLock();
}
function showHint() {
  let txt;
  if (G.arcade.inside) txt = G.arcade.hintText();
  else if (G.lab.inside) txt = 'Toca el cristal de cada lóbulo para activarlo. ¡Cada camino es diferente!';
  else txt = G.mission.hintText();
  if (txt) G.ui.toast('Neuri-X: ' + txt, '', '💡', false, 5);
  $('ab-hint').classList.remove('flash'); void $('ab-hint').offsetWidth; $('ab-hint').classList.add('flash');
}
// HUD context: zone name under the minimap + checklist of the active mission
const ZONES = [['plaza', 'Plaza Central'], ['neuro', 'Distrito Neuro'], ['steam', 'Distrito STEAM'], ['english', 'Distrito English'], ['tech', 'Distrito Technology']];
function hudContext() {
  const p = G.player.pos;
  if (G.lab.inside) {
    G.ui.setZone('Viaje al Cerebro', 'Interior del cerebro');
    const z = G.lab.zones;
    G.ui.setSteps(z.map((x) => ({ text: `Activa el ${x.title.toLowerCase()}`, done: x.on })).concat([{ text: 'Reto de equilibrio (cerebelo)', done: !!G.lab.S.star }]).map((x, i, a) => ({ ...x, cur: !x.done && a.findIndex((y) => !y.done) === i })));
    return;
  }
  if (G.arcade.inside) {
    const cur = G.arcade.cur;
    G.ui.setZone(cur ? `${cur.lv.def.tag || 'Nivel ' + cur.lv.def.n} · ${cur.lv.def.name}` : G.arcade.cfg.hall, G.arcade.set === 'math' ? 'Distrito STEAM' : 'Laboratorio EpicGroup');
    G.ui.setSteps(G.arcade.steps());
    return;
  }
  let name = 'Epic Island', sub = 'Zona de exploración';
  for (const [k, n] of ZONES) { const d = PADS[k]; if (d && Math.hypot(p.x - d.x, p.z - d.z) < d.r + 4) { name = n; sub = k === 'neuro' ? 'Laboratorio EpicGroup' : k === 'plaza' ? 'Epic Island' : k === 'steam' ? 'Sala de Matemáticas' : 'Próximamente'; } }
  G.ui.setZone(name, sub);
  G.ui.setSteps(G.mission.steps());
}
// portrait of OUR avatar for the explorer card, rendered from the live 3D model
function makePortrait() {
  if (G.xr && G.xr.active) return;
  try {
    const N = 160, rt = new THREE.WebGLRenderTarget(N, N);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const P = G.player, pc = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    const head = P.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
    const f = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    pc.position.copy(head).addScaledVector(f, 1.7).add(new THREE.Vector3(0, 0.12, 0));
    pc.lookAt(head);
    const nx = G.neurix.group, was = nx ? nx.visible : true;
    const ga = G.gear && G.gear.arrow, gav = ga && ga.visible;
    if (ga) ga.visible = false;
    if (nx) nx.visible = false;
    renderer.setRenderTarget(rt);
    renderer.render(scene, pc);
    const buf = new Uint8Array(N * N * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf);
    renderer.setRenderTarget(null);
    if (nx) nx.visible = was;
    if (ga) ga.visible = gav;
    rt.dispose();
    const c = $('pf-face'), g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) img.data.set(buf.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);
    g.putImageData(img, 0, 0);
  } catch (e) { console.warn('portrait', e); }
}
function showTitle() {
  $('title').classList.remove('hidden');
  $('title-quality').value = quality;
  const has = save.data.stage && save.data.stage !== 'intro' || save.data.crystals.length > 0;
  $('btn-play').textContent = has ? 'CONTINUAR' : 'JUGAR';
  $('btn-new').classList.toggle('hidden', !has);
  // title camera orbit
  G.titleCam = true;
}
function startGame() {
  G.audio.init();
  G.audio.setMuted(settings.sound === false);
  $('title').classList.add('hidden');
  G.ui.show('hud', true);
  document.body.classList.add('playing');
  G.titleCam = false;
  playing = true;
  started = true;
  if (!G.input.touch) { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
  G.mission.stageObjective();
  setTimeout(makePortrait, 700);
  hintUntil = simT + 40;
  if (!save.data.ach.inicio) setTimeout(() => unlock('inicio'), 1200);
  if (save.data.stage === 'intro') setTimeout(() => G.ui.centerMsg('EPIC ISLAND', 'Explora · Aprende · Crea', 3), 300);
}
function setPause(on) {
  if (!started || completeOpen) return;
  paused = on;
  $('pause').classList.toggle('hidden', !on);
  if (on) {
    $('p-quality').value = quality;
    $('p-sens').value = G.input.sensitivity;
    $('p-invert').checked = G.input.invertY;
    $('p-sound').checked = !G.audio.muted;
    $('p-voice').checked = G.voice.enabled;
    $('p-reset-confirm').classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (!G.input.touch) {
    try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
  }
}
function toggleMap(on = !mapOpen) {
  mapOpen = on;
  $('mapfull').classList.toggle('hidden', !on);
  if (on) {
    G.ui.drawBigMap(G.player, { crystals: G.crystals.state });
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
function showComplete() {
  completeOpen = true;
  const secs = Math.round(save.data.time);
  const mm = Math.floor(secs / 60), ss = secs % 60;
  $('c-stats').innerHTML = `
    <div><b>${save.data.crystals.length}/${G.crystalPts.length}</b>Cristales</div>
    <div><b>${save.data.xp}</b>Experiencia</div>
    <div><b>${mm}:${String(ss).padStart(2, '0')}</b>Tiempo de juego</div>
    <div><b>${Object.keys(save.data.ach).length}/${Object.keys(ACH).length}</b>Logros</div>`;
  $('complete').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function setupMenus() {
  $('btn-play').addEventListener('click', startGame);
  $('btn-new').addEventListener('click', () => { save.reset(); location.reload(); });
  $('title-quality').addEventListener('change', (e) => { const q = e.target.value; const needReload = (q === 'low') !== (quality === 'low'); applyQuality(q); if (needReload) location.reload(); });
  $('p-resume').addEventListener('click', () => setPause(false));
  $('p-quality').addEventListener('change', (e) => applyQuality(e.target.value));
  $('p-sens').addEventListener('input', (e) => { G.input.sensitivity = +e.target.value; settings.sens = +e.target.value; save.persist(); });
  $('p-invert').addEventListener('change', (e) => { G.input.invertY = e.target.checked; settings.invertY = e.target.checked; save.persist(); });
  $('p-sound').addEventListener('change', (e) => { G.audio.setMuted(!e.target.checked); settings.sound = e.target.checked; if (!e.target.checked) G.voice.stop(); save.persist(); });
  $('p-voice').addEventListener('change', (e) => { G.voice.enabled = e.target.checked; settings.voice = e.target.checked; if (!e.target.checked) G.voice.stop(); save.persist(); });
  $('p-map').addEventListener('click', () => { setPause(false); toggleMap(true); });
  $('p-home').addEventListener('click', () => {
    setPause(false);
    if (G.mission.busy || G.ui.dialogOpen || G.travel.busy) { G.ui.toast('Termina primero lo que estás haciendo', '', '⏳'); return; }
    handlePortal('home');
  });
  $('p-reset').addEventListener('click', () => $('p-reset-confirm').classList.remove('hidden'));
  $('p-reset-no').addEventListener('click', () => $('p-reset-confirm').classList.add('hidden'));
  $('p-reset-yes').addEventListener('click', () => { save.reset(); location.reload(); });
  $('mapfull').addEventListener('click', () => toggleMap(false));
  $('btn-pause').addEventListener('click', () => setPause(true));
  $('btn-gear').addEventListener('click', () => setPause(true));
  $('ab-map').addEventListener('click', () => toggleMap(true));
  $('ab-inv').addEventListener('click', () => toggleInv(true));
  $('ab-ach').addEventListener('click', () => toggleAch(true));
  $('ab-hint').addEventListener('click', () => showHint());
  $('achv').addEventListener('click', () => toggleAch(false));
  $('c-continue').addEventListener('click', () => {
    completeOpen = false;
    $('complete').classList.add('hidden');
    if (!G.input.touch) { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
  });
  G.input.onLockChange = (locked) => {
    if (!locked && playing && !paused && !mapOpen && !achOpen && !invOpen && !completeOpen && !(G.xr && G.xr.active) && !G.ui.dialogOpen && !G.arcade.modal && !G.input.touch) setPause(true);
  };
}

// ---------------------------------------------------------------- loop
let lastT = 0, simT = 0, hudT = -1, hintUntil = 0;
const fpsWin = { n: 0, acc: 0, checked: false, t: 0 };
const _sunOff = SUN_DIR.clone().multiplyScalar(110);
const SUBSTEPS = +(params.get('fast') || 1);
function loop(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  if (!(dt >= 0)) dt = 0;
  if (SUBSTEPS > 1) dt = 0.1;
  for (let i = 0; i < SUBSTEPS; i++) step(dt, i === SUBSTEPS - 1);
}
function step(dt, last) {
  simT += dt;
  const t = simT;
  const { input, player, cam, ui, mission, neurix } = G;
  input.update(dt);
  G.xr.pollInput(input, dt);
  // global keys
  if (started) {
    if (input.consume('pause')) { if (mapOpen) toggleMap(false); else if (achOpen) toggleAch(false); else if (invOpen) toggleInv(false); else if (!completeOpen) setPause(!paused); }
    if (input.consume('map') && !paused && !completeOpen && !achOpen && !invOpen) toggleMap();
    if (input.consume('ach') && !paused && !completeOpen && !mapOpen && !invOpen) toggleAch();
    if (input.consume('inv') && !paused && !completeOpen && !mapOpen && !achOpen) toggleInv();
    if (input.consume('hint') && !paused && !completeOpen && playing) showHint();
  }
  const frozenUI = paused || mapOpen || achOpen || invOpen || completeOpen || !playing;
  input.enabled = !frozenUI;
  if (!frozenUI) {
    save.data.time += dt;
    if (ui.dialogOpen) { ui.setPrompt(null); ui.updateDialog(dt, input); }
    else if (G.arcade.modal) { ui.setPrompt(null); G.arcade.updateModal(dt, input); }
    else {
      // interactions
      const acts = G.arcade.interactions(player).concat(G.lab.interactions(player), mission.interactions());
      const a = acts[0];
      ui.setPrompt(a && !mission.busy ? a.label : null, input.lastDevice);
      if (input.consume('interact') && a && !mission.busy && !G.lab.busy && !G.arcade.busy) a.act();
    }
    if (!ui.dialogOpen && !mission.busy) player.frozen = false;
    const _pre = [player.pos.x, player.pos.y, player.pos.z, player.vel.x, player.vel.y, player.vel.z, player.yaw, dt, cam.yaw];
    player.update(dt, input, G.xr.active ? G.xr.viewYaw() : cam.yaw);
    if (params.get('dbg') && !window.__nanw && !Number.isFinite(player.pos.x + player.pos.y + player.pos.z + player.yaw + player.landSquash)) { window.__nanw = 1; console.warn('NAN player', JSON.stringify(_pre), JSON.stringify([player.pos, player.vel, player.yaw, player.landSquash, player.accelLean])); }
    // portals
    if (!ui.dialogOpen && !mission.busy && !G.travel.busy && !G.arcade.busy) {
      const loc = G.lab.inside ? 'lab' : G.arcade.inside ? G.arcade.where : 'world';
      for (const e of G.portalList) {
        if (e.where !== loc || (e.set && e.set !== G.arcade.set)) { e.portal.reset(); continue; }
        if (e.portal.check(player.pos)) { handlePortal(e.kind, e.key); break; }
      }
    }
    // crystals
    const cs = G.crystals.state, cr = G.gear.magnet() ? 2.6 : 1.4;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.taken) continue;
      if (Math.abs(c.x - player.pos.x) < cr && Math.abs(c.z - player.pos.z) < cr && Math.abs(c.y - (player.pos.y + 0.9)) < 1.6) {
        G.crystals.take(i);
        save.data.crystals.push(i);
        G.audio.play('crystal');
        G.ui.bump('crystal');
        addXP(10);
        const n = save.data.crystals.length;
        if (n === 10) unlock('cristales10');
        if (n === cs.length) unlock('cristales40');
        persistAll();
      }
    }
    // location achievements
    if (player.grounded && player.pos.y > G.parkour.topY - 0.5 && Math.hypot(player.pos.x - PILLAR.x, player.pos.z - PILLAR.z) < PILLAR.r + 0.5) unlock('mirador');
    if (player.grounded && Math.hypot(player.pos.x - MESA.x, player.pos.z - MESA.z) < MESA.r - 2 && player.pos.y > G.parkour.mesaTopY - 2) unlock('mesa');
    if (player.stats.dashes >= 10) unlock('impulso');
    // jump-input not consumed by the player while frozen should not linger
    if (player.frozen) input.consume('jump');
    // fps watchdog: step quality down once if too slow
    if (!fpsWin.checked) {
      fpsWin.t += dt; fpsWin.n++;
      if (fpsWin.t > 6) {
        fpsWin.checked = true;
        const fps = fpsWin.n / fpsWin.t;
        if (fps < 26 && quality !== 'low') {
          applyQuality(quality === 'high' ? 'medium' : 'low');
          ui.toast('Ajustamos la calidad gráfica para que el juego vaya más fluido', 'Puedes cambiarla en Pausa', '⚙️', false, 4);
        }
      }
    }
  } else {
    ui.setPrompt(null);
    input.takeLook();
  }
  // camera
  if (G.xr.active) {
    G.xr.update(dt, t);
  } else if (G.titleCam) {
    const a = t * 0.05;
    camera.position.set(Math.cos(a) * 150, 70, 20 + Math.sin(a) * 150);
    camera.lookAt(0, 8, 0);
  } else if (!paused && !completeOpen) {
    cam.update(dt, input, player);
  }
  const vcam = G.xr.active ? G.xr.viewCam : camera;
  neurix.update(dt, player, G.xr.active ? G.xr.nxCam : camera);
  neurix.talking = ui.talking;
  mission.update(dt, t, vcam);
  G.lab.update(dt, t, player, vcam);
  G.arcade.update(dt, t, player, vcam);
  G.gear.update(dt, t, vcam, started && !frozenUI && !ui.dialogOpen && !mission.busy && !G.travel.busy && !G.arcade.modal && !G.arcade.busy && !G.lab.busy);
  for (const e of G.gatePortals) { e.mat.uniforms.time.value = t; fadePortal(e.mat, e.mesh.position.x, e.mesh.position.z, vcam); }
  // world animation
  G.water.material.uniforms.time.value = t;
  G.falls.update(t);
  G.sky.update(t);
  G.crystals.update(t, dt, player.pos);
  G.districts.update(t, vcam);
  G.audio.setWaterfall(player.pos.distanceTo(G.falls.pos));
  // shadow follows player
  const sun = G.lights.sun;
  const focus = G.titleCam ? new THREE.Vector3(0, 8, 0) : player.pos;
  sun.position.copy(focus).add(_sunOff);
  sun.target.position.copy(focus);
  if (!last) return;
  if (started && simT - hudT > 0.25) {
    hudT = simT;
    hudContext();
    G.ui.setHint(simT < hintUntil && !G.ui.dialogOpen ? 'Usa <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> para moverte y <kbd>Espacio</kbd> para saltar. ¡Explora y habla con Neuri-X!' : null);
  }
  if (started && !frozenUI) {
    if (G.lab.inside) G.lab.drawMap(player, neurix.pos);
    else if (G.arcade.inside) G.arcade.drawMap(player, neurix.pos);
    else ui.drawMinimap(player, { crystals: G.crystals.state, buddy: neurix.pos });
  }
  renderer.render(scene, camera);
  if (!window.__ready) window.__ready = { ok: true };
}

boot().catch((e) => {
  console.error(e);
  $('load-text').textContent = 'No se pudo cargar el juego. Recarga la página.';
});
