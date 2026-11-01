import * as THREE from 'three';

const OFFSET = new THREE.Vector3(1.5, 33, 25);
const OVERVIEW = new THREE.Vector3(0, .35, -.05);

export class CameraDirector {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'auto';
    this.zoom = 1;
    this.aspect = 16 / 9;
    this.target = OVERVIEW.clone();
    this.vertical = 20;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  resize(width, height) { this.aspect = width / Math.max(1, height); }
  setMode(mode) { this.mode = ['auto', 'overview', 'track'].includes(mode) ? mode : 'auto'; }
  setZoom(value) { this.zoom = THREE.MathUtils.clamp(Number(value) || 1, .85, 1.35); }
  update(dt, state, selected) {
    const desired = OVERVIEW.clone();
    let vertical = Math.max(15.5, 23.8 / this.aspect);
    if (this.mode === 'track' && selected) {
      desired.set(selected.x * .42, .35, selected.z * .35);
      vertical *= .84;
    } else if (this.mode === 'auto') {
      if (state?.phase === 'betting') vertical *= 1.035;
      if (state?.phase === 'racing' && state.elapsed < 2.5) vertical *= 1 + .035 * (1 - state.elapsed / 2.5);
      // Results keep the shared arena visible while giving the delivery a little emphasis.
      if (state?.phase === 'results' && state.winner) { desired.set(.7, .35, -.1); vertical *= .96; }
    }
    vertical /= this.zoom;
    const blend = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5);
    this.target.lerp(desired, blend);
    this.vertical = THREE.MathUtils.lerp(this.vertical, vertical, blend);
    this.camera.position.copy(this.target).add(OFFSET);
    this.camera.lookAt(this.target);
    const half = this.vertical / 2;
    Object.assign(this.camera, { left: -half * this.aspect, right: half * this.aspect, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
  }
}
