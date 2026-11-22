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

// "POLICE" lettering: one canvas texture, drawn once and reused by every
// cruiser, so the word reads on the doors (and hood) without a canvas per
// car. Black bold letters on a transparent background, to sit on the
// white door panels and read at screenshot distance.
let policeLettering = null;
function getPoliceTexture() {
  if (policeLettering) return policeLettering;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Auto-fit: the word fills ~90% of the canvas width, so it reads at
  // screenshot distance instead of sitting small in the middle.
  let size = 118;
  ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
  while (size > 40 && ctx.measureText('POLICE').width > 470) {
    size -= 4;
    ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillText('POLICE', 256, 70);
  policeLettering = new THREE.CanvasTexture(canvas);
  policeLettering.anisotropy = 4;
  return policeLettering;
}

// A thin "POLICE" plane. rotY turns it to face a side (+PI/2 for +X,
// -PI/2 for -X); rotX -PI/2 lays it flat on the hood, facing up.
function addPoliceLettering(group, w, h, x, y, z, rotY, rotX) {
  const mat = new THREE.MeshBasicMaterial({ map: getPoliceTexture(), transparent: true });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plane.position.set(x, y, z);
  if (rotY) plane.rotation.y = rotY;
  if (rotX) plane.rotation.x = rotX;
  group.add(plane);
  return plane;
}

// The cruiser's American police look: black body, white doors and roof
// (the classic black-and-white), a big two-colour light bar, a push bar
// on the front bumper, and "POLICE" on both doors and the hood. The
// light-bar housing keeps the name 'lightbar': combat and main.js find
// cruisers by it. The two lenses are separate meshes so the strobe can
// light them alternately (see police.js flashLightbars).
function addPoliceTrim(group) {
  const white = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const darkMetal = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  // White door panels on both sides of the black body.
  for (const sx of [-1, 1]) {
    putOn(group, new THREE.BoxGeometry(0.08, 0.5, 1.9), white, sx * 1.0, 0.55, -0.1);
    addPoliceLettering(group, 1.9, 0.48, sx * 1.05, 0.55, -0.1, sx * Math.PI / 2, 0);
  }
  // White roof panel over the glass cabin.
  putOn(group, new THREE.BoxGeometry(1.72, 0.06, 1.9), white, 0, 1.32, -0.45);
  // "POLICE" on the hood, reading from the front of the car.
  addPoliceLettering(group, 1.7, 0.45, 0, 0.86, 1.3, 0, -Math.PI / 2);
  // Push bar: a dark frame on the front bumper.
  putOn(group, new THREE.BoxGeometry(1.7, 0.28, 0.12), darkMetal, 0, 0.45, 2.18);
  for (const sx of [-0.5, 0.5]) {
    putOn(group, new THREE.BoxGeometry(0.12, 0.38, 0.12), darkMetal, sx, 0.5, 2.18);
  }
  // Light-bar housing (keeps the name 'lightbar'), with a red lens on
  // the left and a blue lens on the right, side by side. The bar is
  // tall and proud of the roof so both colours read in a still frame
  // even from behind the cruiser. The lenses are PROUD of the housing
  // (taller and deeper than it) so their coloured faces stick out of
  // the dark box and are actually visible — a lens buried inside the
  // housing is hidden by it, and the bar reads as a plain dark box.
  const housing = putOn(
    group,
    new THREE.BoxGeometry(1.7, 0.28, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
    0, 1.48, -0.45,
  );
  housing.name = 'lightbar';
  const redLens = putOn(
    group,
    new THREE.BoxGeometry(0.78, 0.34, 0.65),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    -0.42, 1.48, -0.45,
  );
  redLens.name = 'lightbar-red';
  const blueLens = putOn(
    group,
    new THREE.BoxGeometry(0.78, 0.34, 0.65),
    new THREE.MeshBasicMaterial({ color: 0x2266ff }),
    0.42, 1.48, -0.45,
  );
  blueLens.name = 'lightbar-blue';
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

// Body types: [bodyW, bodyH, bodyLen, bodyY, bodyZ] and
// [cabinW, cabinH, cabinLen, cabinY, cabinZ]. Every type keeps the same
// ~2.0-wide footprint, the same wheel spots and the same ground
// clearance, so parking, driving and collision never notice the shape.
const BODY_TYPES = {
  sedan: { body: [2.0, 0.55, 4.2, 0.55, 0], cabin: [1.7, 0.5, 2.0, 1.05, -0.2], kind: 'sedan' },
  hatch: { body: [2.0, 0.55, 3.8, 0.55, 0], cabin: [1.7, 0.5, 2.3, 1.05, -0.35], kind: 'hatch' },
  sport: { body: [2.0, 0.42, 4.2, 0.48, 0], cabin: [1.6, 0.42, 1.8, 0.9, -0.3], kind: 'sport' },
  suv: { body: [2.0, 0.75, 4.2, 0.65, 0], cabin: [1.8, 0.6, 2.6, 1.3, 0], kind: 'suv' },
  pickup: { body: [2.0, 0.55, 4.2, 0.55, 0], cabin: [1.7, 0.5, 1.4, 1.05, -0.9], kind: 'pickup' },
  // The American interceptor: long hood (cabin shifted rearward), a
  // distinct trunk, a broad stance. Black body; the white doors, roof
  // and lettering come from addPoliceTrim.
  police: { body: [2.0, 0.55, 4.2, 0.55, 0], cabin: [1.7, 0.5, 1.9, 1.05, -0.45], kind: 'police' },
};

// Build one car mesh from its body type: a box body, a glass cabin,
// four wheels, headlights, bumpers and mirrors, plus the type's own
// details — a sloped hood and spoiler for the sports car, roof rails
// for the SUV, an open bed for the pickup, a long hood and a distinct
// trunk for the police interceptor. Police always get the police body
// (black) and the rival always the sedan; traffic and parked cars take
// the type their caller passes. The footprint stays ~2.0 x ~4.2 and the
// wheels stay put, so nothing about driving or collision changes.
export function makeCarMesh(color, isPolice, isRival, bodyType) {
  const type = BODY_TYPES[isPolice ? 'police' : (isRival ? 'sedan' : (bodyType || 'sedan'))] || BODY_TYPES.sedan;
  const group = new THREE.Group();
  // Police bodies are black; the white doors, roof and lettering come
  // from addPoliceTrim. Every other car wears its own paint.
  const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0x111111 : color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x222222 });

  const [bw, bh, bl, by, bz] = type.body;
  const [cw, ch, cl, cy, cz] = type.cabin;
  putOn(group, new THREE.BoxGeometry(bw, bh, bl), paint, 0, by, bz, true);
  putOn(group, new THREE.BoxGeometry(cw, ch, cl), glass, 0, cy, cz, true);

  const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  tyreGeo.rotateZ(Math.PI / 2);
  const wheelSpots = [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]];
  for (const [wx, wz] of wheelSpots) putOn(group, tyreGeo, rubber, wx, 0.36, wz);

  // Headlights, so night driving reads and police read as police.
  const lampMat = new THREE.MeshBasicMaterial({ color: isPolice ? 0x4488ff : 0xfff2b0 });
  for (const lx of [-0.65, 0.65]) {
    putOn(group, new THREE.BoxGeometry(0.3, 0.18, 0.1), lampMat, lx, 0.6, bl / 2 + 0.02);
  }
  // Headlight beam: a translucent cone from the lamps widening forward,
  // plus a bright pool on the road ahead. A fake beam (no real light),
  // so it costs one cheap mesh per car and always reads in a still —
  // a real SpotLight per car would be far heavier and subtler in
  // daylight. The beam is a child of the car, so it follows the car as
  // it drives. Police beams run a little brighter and cooler. The cone
  // is deliberately SHORT (3.5 m, not 6): a 6 m cone reaches the arrest
  // camera when the cars face it and swallows the whole frame — and
  // even a 4.5 m cone filled the foreground of the night chase with a
  // pale wedge whenever an oncoming car was close to the camera. The
  // shorter cone ends before the camera and stays a beam, not a wall.
  const beamMat = new THREE.MeshBasicMaterial({
    color: isPolice ? 0xdde8ff : 0xfff2b0,
    transparent: true, opacity: isPolice ? 0.2 : 0.13,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  // The night brightener in daynight.js re-scans these materials and
  // multiplies their opacity — it must multiply the ORIGINAL opacity,
  // not the already-brightened one, or the beams blow out exponentially
  // (one re-scan every 2 s, x3+ each time) into giant white cones.
  beamMat.userData.baseOpacity = beamMat.opacity;
  const beam = new THREE.Group();
  beam.name = 'headlight-beam';
  const coneGeo = new THREE.ConeGeometry(0.95, 3.5, 12, 1, true);
  const cone = new THREE.Mesh(coneGeo, beamMat);
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(0, 0.65, bl / 2 + 1.75);
  beam.add(cone);
  const poolMat = new THREE.MeshBasicMaterial({
    color: isPolice ? 0xdde8ff : 0xfff2b0,
    transparent: true, opacity: isPolice ? 0.16 : 0.11,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  poolMat.userData.baseOpacity = poolMat.opacity;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.04, bl / 2 + 2.8);
  pool.scale.set(1, 2, 1);
  beam.add(pool);
  group.add(beam);
  // Bumpers front and rear, and side mirrors, on every car.
  putOn(group, new THREE.BoxGeometry(bw, 0.18, 0.12), trim, 0, 0.32, bl / 2 + 0.02);
  putOn(group, new THREE.BoxGeometry(bw, 0.18, 0.12), trim, 0, 0.32, -bl / 2 - 0.02);
  for (const sx of [-1, 1]) {
    putOn(group, new THREE.BoxGeometry(0.08, 0.12, 0.18), trim, sx * (bw / 2 + 0.03), 1.0, 0.5);
  }

  // The type's own details.
  if (type.kind === 'sport') {
    // A sloped hood and a rear spoiler.
    const hood = putOn(group, new THREE.BoxGeometry(1.8, 0.07, 1.3), paint, 0, 0.74, 1.35, true);
    hood.rotation.x = 0.1;
    putOn(group, new THREE.BoxGeometry(1.7, 0.06, 0.3), trim, 0, 0.86, -1.95);
    putOn(group, new THREE.BoxGeometry(0.08, 0.18, 0.08), trim, -0.6, 0.78, -1.95);
    putOn(group, new THREE.BoxGeometry(0.08, 0.18, 0.08), trim, 0.6, 0.78, -1.95);
  } else if (type.kind === 'suv') {
    // Roof rails along the tall cabin.
    for (const sx of [-0.7, 0.7]) {
      putOn(group, new THREE.BoxGeometry(0.08, 0.08, 2.4), trim, sx, 1.64, 0);
    }
  } else if (type.kind === 'pickup') {
    // An open bed behind the cab: low walls on three sides.
    putOn(group, new THREE.BoxGeometry(1.9, 0.28, 0.12), paint, 0, 0.72, 1.95, true);
    putOn(group, new THREE.BoxGeometry(1.9, 0.28, 0.12), paint, 0, 0.72, 0.35, true);
    for (const sx of [-0.92, 0.92]) {
      putOn(group, new THREE.BoxGeometry(0.08, 0.28, 1.7), paint, sx, 0.72, 1.15, true);
    }
  } else if (type.kind === 'hatch') {
    // A sloped rear window: the cabin already runs long, the tilt sells it.
    const rear = putOn(group, new THREE.BoxGeometry(1.6, 0.06, 0.9), glass, 0, 1.18, -1.35, true);
    rear.rotation.x = -0.45;
  } else if (type.kind === 'police') {
    // A distinct trunk deck at the rear of the long hood.
    putOn(group, new THREE.BoxGeometry(1.7, 0.12, 0.55), paint, 0, 0.86, -1.8, true);
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
    // Parked cars cycle through the body types too, so the kerbs read
    // as varied vehicles. (The driven/garage car stays a sedan.)
    const bodyType = ['sedan', 'hatch', 'sport', 'suv', 'pickup'][parked.length % 5];
    const mesh = makeCarMesh(color, false, false, bodyType);
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
