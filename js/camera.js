// Third-person follow camera with smoothing and collision avoidance.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { clamp, damp, dampAngle } from './util.js';

const _list = [];

export class FollowCam {
  constructor(camera, colliders) {
    this.cam = camera;
    this.col = colliders;
    this.yaw = 0;          // camera located at +Z of target when yaw=0
    this.pitch = 0.32;
    this.dist = 6.2;
    this.wantDist = 6.2;
    this.curDist = 6.2;
    this.target = new THREE.Vector3();
    this.shake = 0;
    this.cine = null;      // {pos, look, t}
    this.cineBlend = 0;
    this.fov = 60;
    this._look = new THREE.Vector3();
    this._pos = new THREE.Vector3();
  }
  snapBehind(yaw) { this.yaw = yaw + Math.PI; }
  update(dt, input, player) {
    const look = input.takeLook();
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch + look.y, -0.35, 1.25);
    const z = input.takeZoom();
    if (z) this.wantDist = clamp(this.wantDist + z * 0.7, 3.2, 10);
    // follow target with mild lag (vertical lag larger)
    const tx = player.pos.x, ty = player.pos.y + 1.5, tz = player.pos.z;
    this.target.x = damp(this.target.x, tx, 22, dt);
    this.target.z = damp(this.target.z, tz, 22, dt);
    this.target.y = damp(this.target.y, ty, player.grounded ? 14 : 7, dt);
    if (Math.abs(this.target.x - tx) > 6 || Math.abs(this.target.z - tz) > 6) this.target.set(tx, ty, tz);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    // collision: march toward desired position
    let allowed = this.wantDist;
    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * this.wantDist;
      const px = this.target.x + dir.x * d, py = this.target.y + dir.y * d, pz = this.target.z + dir.z * d;
      if (heightAt(px, pz) + 0.4 > py || this.col.pointBlocked(px, py, pz, _list)) { allowed = Math.max(1.2, d - 0.45); break; }
    }
    const lam = allowed < this.curDist ? 30 : 4;
    this.curDist = damp(this.curDist, allowed, lam, dt);
    const pos = this._pos.copy(this.target).addScaledVector(dir, this.curDist);
    // keep above terrain
    const gh = heightAt(pos.x, pos.z) + 0.5;
    if (pos.y < gh) pos.y = gh;
    // shoulder offset (slight right)
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const lookAt = this._look.copy(this.target).addScaledVector(right, 0.0);
    // shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.12;
      pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s;
    }
    // cinematic override
    if (this.cine) {
      this.cineBlend = damp(this.cineBlend, 1, 3, dt);
      this.cine.t += dt;
      const c = this.cine;
      const cpos = typeof c.pos === 'function' ? c.pos(c.t) : c.pos;
      const clook = typeof c.look === 'function' ? c.look(c.t) : c.look;
      pos.lerp(cpos, this.cineBlend);
      lookAt.lerp(clook, this.cineBlend);
    } else this.cineBlend = damp(this.cineBlend, 0, 4, dt);
    this.cam.position.copy(pos);
    this.cam.lookAt(lookAt);
    // FOV kick when sprinting
    const wantFov = player.speed > 7.5 ? 68 : 60;
    this.fov = damp(this.fov, wantFov, 4, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
  startCine(c) { this.cine = { ...c, t: 0 }; }
  endCine() { this.cine = null; }
}
