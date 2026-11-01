import RAPIER from '@dimforge/rapier3d-compat';

let initialization;
let initialized = false;
export function initializePhysics() {
  initialization ??= RAPIER.init().then(() => { initialized = true; });
  return initialization;
}

export function createPhysicsWorld() {
  if (!initialized) throw new Error('Await initializePhysics() before creating a simulation.');
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.numSolverIterations = 6;
  return world;
}

export { RAPIER };
