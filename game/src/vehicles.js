// Cars: building them from boxes, parking them, stealing them and driving
// them. Driving is arcade physics — throttle, steering that bites harder at
// speed, and a circle collider that slides along buildings.
import * as THREE from 'three';
import { CAR, PALETTE } from './config.js';
import { pick } from './random.js';

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.2), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.0), glass);
  cabin.position.set(0, 1.05, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
  }
  // Headlights, so night driving reads and police read as police.
  const lightMat = new THREE.MeshBasicMaterial({ color: isPolice ? 0x4488ff : 0xfff2b0 });
  for (const x of [-0.65, 0.65]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.1), lightMat);
    light.position.set(x, 0.6, 2.12);
    group.add(light);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.38, -0.2);
    bar.name = 'lightbar';
    group.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.22),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.62;
    group.add(stripe);
  }
  return group;
}

export function createVehicleManager(scene, world, rng) {
  const parked = [];
  const driven = { car: null, speed: 0 };

  function addParked(x, z, heading) {
    const color = pick(rng, PALETTE.car);
    const mesh = makeCarMesh(color, false);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = { mesh, color, heading, speed: 0, isPolice: false, parked: true, x, z };
    parked.push(car);
    return car;
  }

  // Fill a spread of the kerb spots with parked cars to steal.
  for (const spot of world.parkingSpots) {
    if (rng() < 0.45) addParked(spot.x, spot.z, spot.heading);
  }

  function nearestParked(pos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of parked) {
      if (!car.parked) continue;
      const d = Math.hypot(car.mesh.position.x - pos.x, car.mesh.position.z - pos.z);
      if (d < bestDist) { bestDist = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    car.parked = false;
    driven.car = car;
    driven.speed = 0;
    return car;
  }

  function exitCar() {
    const car = driven.car;
    if (!car) return null;
    car.parked = true;
    car.speed = 0;
    // Step out to the driver's side.
    const side = new THREE.Vector3(1.4, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
    car.x = car.mesh.position.x + side.x;
    car.z = car.mesh.position.z + side.z;
    driven.car = null;
    driven.speed = 0;
    return { x: car.x, z: car.z };
  }

  function updateDriving(dt, input, world, onHitBuilding) {
    const car = driven.car;
    if (!car) return 0;
    const throttle = input.moveForward();
    const steer = input.moveStrafe();
    if (throttle > 0) driven.speed += CAR.accel * dt;
    else if (throttle < 0) {
      driven.speed -= (driven.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
    } else {
      // Rolling resistance.
      driven.speed -= Math.sign(driven.speed) * Math.min(Math.abs(driven.speed), 8 * dt);
    }
    driven.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, driven.speed));
    const speedFactor = Math.min(1, Math.abs(driven.speed) / 12);
    car.heading += steer * CAR.steer * speedFactor * dt * Math.sign(driven.speed || 1);
    const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    const before = car.mesh.position.clone();
    car.mesh.position.addScaledVector(forward, driven.speed * dt);
    car.mesh.rotation.y = car.heading;
    // Lean into corners a touch, for feel.
    car.mesh.rotation.z = -steer * speedFactor * 0.05;
    world.resolveCircle(car.mesh.position, CAR.radius);
    const hitWall = car.mesh.position.distanceTo(before) < Math.abs(driven.speed) * dt * 0.5;
    if (hitWall && Math.abs(driven.speed) > 6) {
      driven.speed *= 0.4;
      if (onHitBuilding) onHitBuilding();
    }
    car.speed = driven.speed;
    return driven.speed;
  }

  return {
    parked,
    driven,
    addParked,
    nearestParked,
    enterCar,
    exitCar,
    updateDriving,
    isDriving() { return driven.car !== null; },
    currentCar() { return driven.car; },
  };
}
