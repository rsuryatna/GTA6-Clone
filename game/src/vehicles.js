// Cars: building them from boxes, parking them, stealing them and
// driving them. Driving is arcade physics — throttle, steering that
// bites harder at speed, and a circle collider that slides along
// buildings. A carjacked traffic car becomes drivable the same way a
// parked one does, and a car with the garage's NOS upgrade boosts on
// Shift while its meter lasts.
//
// Cars have health now. Bullets and hard wall hits wear a car down,
// and a car at zero health blows up — which is how Job 11's rival
// armoured car is dealt with. The driven car's health shows in the
// HUD; the garage can repair it, and a wrecked drive leaves Jules
// on foot.
import * as THREE from 'three';
import { CAR, CAR_HEALTH, GARAGE, PALETTE, SPIKES } from './config.js';
import { pick } from './random.js';

// One box (or cylinder) placed on a car body, so the mesh builders
// below read as a parts list instead of a wall of constructors.
function putOn(group, geo, mat, x, y, z, shadow = false) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  group.add(mesh);
  return mesh;
}

// The light bar and white stripe are what make a cruiser read as
// police at a glance. The bar keeps its name: combat checks for it.
function addPoliceTrim(group) {
  const bar = putOn(
    group,
    new THREE.BoxGeometry(1.2, 0.16, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    0, 1.38, -0.2,
  );
  bar.name = 'lightbar';
  putOn(
    group,
    new THREE.BoxGeometry(2.02, 0.2, 4.22),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    0, 0.62, 0,
  );
}

// The rival crew's car: matte black with a gold stripe down the middle.
function addRivalTrim(group) {
  putOn(
    group,
    new THREE.BoxGeometry(0.5, 0.2, 4.22),
    new THREE.MeshBasicMaterial({ color: PALETTE.rivalStripe }),
    0, 0.62, 0,
  );
}

// Build one car mesh: a box body, a glass cabin, four wheels,
// headlights, and — for police and the rival crew — a stripe that
// reads at a glance.
export function makeCarMesh(color, isPolice, isRival) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x141414 });

  putOn(group, new THREE.BoxGeometry(2.0, 0.55, 4.2), paint, 0, 0.55, 0, true);
  putOn(group, new THREE.BoxGeometry(1.7, 0.5, 2.0), glass, 0, 1.05, -0.2, true);

  const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  tyreGeo.rotateZ(Math.PI / 2);
  const wheelSpots = [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]];
  for (const [wx, wz] of wheelSpots) putOn(group, tyreGeo, rubber, wx, 0.36, wz);

  // Headlights, so night driving reads and police read as police.
  const lampMat = new THREE.MeshBasicMaterial({ color: isPolice ? 0x4488ff : 0xfff2b0 });
  for (const lx of [-0.65, 0.65]) {
    putOn(group, new THREE.BoxGeometry(0.3, 0.18, 0.1), lampMat, lx, 0.6, 2.12);
  }

  if (isPolice) addPoliceTrim(group);
  if (isRival) addRivalTrim(group);
  return group;
}

export function createVehicleManager(scene, world, rng) {
  const parked = [];
  const driven = {
    car: null, speed: 0, nos: false, armor: false,
    nosMeter: 1, boosting: false, slowed: 0, steer: 0,
  };

  // Every car the player can touch lives in `parked`, driven or not,
  // so combat and the HUD can find it by mesh.
  function register(mesh, color, heading, health, isParked) {
    const record = {
      mesh, color, heading, speed: 0, isPolice: false, parked: isParked,
      x: mesh.position.x, z: mesh.position.z,
      health, maxHealth: health,
    };
    parked.push(record);
    return record;
  }

  function addParked(x, z, heading) {
    const color = pick(rng, PALETTE.car);
    const mesh = makeCarMesh(color, false, false);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    return register(mesh, color, heading, CAR_HEALTH.street, true);
  }

  // Fill a spread of the kerb spots with parked cars to steal.
  for (const spot of world.parkingSpots) {
    if (rng() < 0.45) addParked(spot.x, spot.z, spot.heading);
  }

  function nearestParked(pos, maxDist) {
    const limit = maxDist * maxDist;
    let best = null;
    let bestD2 = limit;
    for (const car of parked) {
      if (!car.parked) continue;
      const dx = car.mesh.position.x - pos.x;
      const dz = car.mesh.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = car;
      }
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
    const car = register(mesh, color, heading, CAR_HEALTH.street, false);
    driven.car = car;
    driven.speed = 0;
    return car;
  }

  // A stored garage car comes back out as a fresh car of the same
  // colour, placed at the garage door. A stored health value (from
  // when the car went in) is kept; without one the car comes out at
  // full health.
  function spawnStoredCar(color, x, z, heading, health) {
    const mesh = makeCarMesh(color, false, false);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = register(mesh, color, heading, CAR_HEALTH.street, false);
    if (typeof health === 'number') {
      car.health = Math.max(1, Math.min(car.maxHealth, health));
    }
    driven.car = car;
    driven.speed = 0;
    return car;
  }

  function exitCar() {
    const car = driven.car;
    if (!car) return null;
    car.parked = true;
    car.speed = 0;
    // Step out to the driver's side: the car's local +X, rotated by
    // its heading. Around Y, (x, z) -> (x cos h, -x sin h).
    car.x = car.mesh.position.x + Math.cos(car.heading) * 1.4;
    car.z = car.mesh.position.z - Math.sin(car.heading) * 1.4;
    driven.car = null;
    driven.speed = 0;
    return { x: car.x, z: car.z };
  }

  // Damage a parked or driven car. Returns 'destroyed' when its health
  // hits zero (the caller plays the explosion and removes it),
  // 'damaged' otherwise, or 'none' when the car is not one of ours.
  function damageCar(car, amount) {
    if (!car || typeof car.health !== 'number') return 'none';
    car.health -= amount;
    if (car.health <= 0) {
      car.health = 0;
      return 'destroyed';
    }
    return 'damaged';
  }

  // The garage's repair bench: the driven car back to full health.
  function repairCurrent() {
    if (!driven.car) return false;
    driven.car.health = driven.car.maxHealth;
    return true;
  }

  function currentHealth() {
    if (!driven.car) return null;
    return { health: driven.car.health, max: driven.car.maxHealth };
  }

  // NOS: hold Shift for a boost while the meter lasts; it refills when
  // the player is not boosting. Armour does not change the drive — it
  // softens police rams, which main.js reads through isArmored().
  function updateNos(dt, input, gas) {
    const shiftHeld = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    driven.boosting = false;
    if (driven.nos && shiftHeld && driven.nosMeter > 0.01 && gas > 0) {
      driven.boosting = true;
      driven.nosMeter = Math.max(0, driven.nosMeter - GARAGE.nosDrain * dt);
    } else {
      driven.nosMeter = Math.min(1, driven.nosMeter + GARAGE.nosRefill * dt);
    }
  }

  // Spike strips pop the tyres: the car crawls while the slow timer runs.
  function updateSlow(dt, slowed) {
    if (slowed) driven.slowed = SPIKES.slowSeconds;
    else if (driven.slowed > 0) driven.slowed -= dt;
  }

  function topSpeedNow() {
    const base = driven.boosting ? CAR.maxSpeed * GARAGE.nosBoost : CAR.maxSpeed;
    return driven.slowed > 0 ? base * SPIKES.slowFactor : base;
  }

  function integrateSpeed(dt, gas, top) {
    if (gas > 0) {
      driven.speed += CAR.accel * (driven.boosting ? 1.6 : 1) * dt;
    } else if (gas < 0) {
      driven.speed -= (driven.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
    } else {
      // Rolling resistance.
      const drag = Math.min(Math.abs(driven.speed), 8 * dt);
      driven.speed -= Math.sign(driven.speed) * drag;
    }
    driven.speed = Math.max(-CAR.maxReverse, Math.min(top, driven.speed));
  }

  function steerCar(dt, wheel, car) {
    const grip = Math.min(1, Math.abs(driven.speed) / 12);
    car.heading += wheel * CAR.steer * grip * dt * Math.sign(driven.speed || 1);
    car.mesh.rotation.y = car.heading;
    // Lean into corners a touch, for feel.
    car.mesh.rotation.z = -wheel * grip * 0.05;
  }

  function rollForward(dt, car) {
    car.mesh.position.x += Math.sin(car.heading) * driven.speed * dt;
    car.mesh.position.z += Math.cos(car.heading) * driven.speed * dt;
  }

  // A wall hit is a step that moved much less than the speed promised.
  // A hard one dents the car — fast enough and it costs health.
  function checkWallHit(car, prevX, prevZ, dt, onHitBuilding) {
    const moved = Math.hypot(car.mesh.position.x - prevX, car.mesh.position.z - prevZ);
    if (moved >= Math.abs(driven.speed) * dt * 0.5 || Math.abs(driven.speed) <= 6) return;
    driven.speed *= 0.4;
    if (Math.abs(driven.speed) <= 14) {
      if (onHitBuilding) onHitBuilding(false);
      return;
    }
    const result = damageCar(car, CAR_HEALTH.ramDamage);
    if (onHitBuilding) onHitBuilding(result === 'destroyed');
  }

  function updateDriving(dt, input, world, onHitBuilding, slowed) {
    const car = driven.car;
    if (!car) return 0;
    const gas = input.moveForward();
    const wheel = input.moveStrafe();
    driven.steer = wheel;
    updateNos(dt, input, gas);
    updateSlow(dt, slowed);
    integrateSpeed(dt, gas, topSpeedNow());
    steerCar(dt, wheel, car);
    const prevX = car.mesh.position.x;
    const prevZ = car.mesh.position.z;
    rollForward(dt, car);
    world.resolveCircle(car.mesh.position, CAR.radius);
    checkWallHit(car, prevX, prevZ, dt, onHitBuilding);
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
    damageCar,
    repairCurrent,
    currentHealth,
    updateDriving,
    setUpgrades({ nos, armor }) {
      driven.nos = nos === true;
      driven.armor = armor === true;
      if (!driven.nos) driven.nosMeter = 1;
    },
    isArmored() { return driven.armor; },
    isBoosting() { return driven.boosting; },
    isSlowed() { return driven.slowed > 0; },
    // Sliding sideways at speed: true when steering hard while fast,
    // for the tyre-smoke effect in main.js.
    isSliding() {
      return driven.car !== null
        && Math.abs(driven.steer) > 0.5
        && Math.abs(driven.speed) > 15;
    },
    nosMeter() { return driven.nosMeter; },
    isDriving() { return driven.car !== null; },
    currentCar() { return driven.car; },
  };
}
