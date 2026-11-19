// Cars: building them from boxes, parking them, stealing them and driving
// them. Driving is arcade physics — throttle, steering that bites harder at
// speed, and a circle collider that slides along buildings. A carjacked
// traffic car becomes drivable the same way a parked one does, and a car
// with the garage's NOS upgrade boosts on Shift while its meter lasts.
import * as THREE from 'three';
import { CAR, GARAGE, PALETTE } from './config.js';
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
    // The light bar and white stripe are what make a cruiser read as police at a glance.
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
  const driven = { car: null, speed: 0, nos: false, armor: false, nosMeter: 1, boosting: false };

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

  // Remove a car from the world entirely (the garage stores it by colour).
  function removeCar(car) {
    const index = parked.indexOf(car);
    if (index !== -1) parked.splice(index, 1);
    if (driven.car === car) {
      driven.car = null;
      driven.speed = 0;
    }
    scene.remove(car.mesh);
  }
  function adoptCar(mesh, color, heading) {
    const car = { mesh, color, heading, speed: 0, isPolice: false, parked: false, x: mesh.position.x, z: mesh.position.z };
    parked.push(car);
    driven.car = car;
    driven.speed = 0;
    return car;
  }

  // A stored garage car comes back out as a fresh car of the same colour,
  // placed at the garage door.
  function spawnStoredCar(color, x, z, heading) {
    const mesh = makeCarMesh(color, false);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = { mesh, color, heading, speed: 0, isPolice: false, parked: false, x, z };
    parked.push(car);
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
    // NOS: hold Shift for a boost while the meter lasts; it refills when
    // the player is not boosting. Armour does not change the drive — it
    // softens police rams, which main.js reads through isArmored().
    driven.boosting = false;
    if (driven.nos && (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && driven.nosMeter > 0.01 && throttle > 0) {
      driven.boosting = true;
      driven.nosMeter = Math.max(0, driven.nosMeter - GARAGE.nosDrain * dt);
    } else {
      driven.nosMeter = Math.min(1, driven.nosMeter + GARAGE.nosRefill * dt);
    }
    const topSpeed = driven.boosting ? CAR.maxSpeed * GARAGE.nosBoost : CAR.maxSpeed;
    if (throttle > 0) driven.speed += CAR.accel * (driven.boosting ? 1.6 : 1) * dt;
    else if (throttle < 0) {
      driven.speed -= (driven.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
    } else {
      // Rolling resistance.
      driven.speed -= Math.sign(driven.speed) * Math.min(Math.abs(driven.speed), 8 * dt);
    }
    driven.speed = Math.max(-CAR.maxReverse, Math.min(topSpeed, driven.speed));
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
    adoptCar,
    spawnStoredCar,
    removeCar,
    updateDriving,
    setUpgrades({ nos, armor }) {
      driven.nos = nos === true;
      driven.armor = armor === true;
      if (!driven.nos) driven.nosMeter = 1;
    },
    isArmored() { return driven.armor; },
    isBoosting() { return driven.boosting; },
    nosMeter() { return driven.nosMeter; },
    isDriving() { return driven.car !== null; },
    currentCar() { return driven.car; },
  };
}
