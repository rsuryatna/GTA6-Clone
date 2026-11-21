// Solmarina street life: the traffic stream and the people on the
// sidewalks, organised around circuits instead of corner lists.
//
// Every street car owns one rectangular circuit — the block it laps —
// plus the leg it is driving toward and the direction it travels the
// circuit in. Walkers are simpler: a heading, a stroll speed, and two
// countdowns, one for panic and one for the phone call a witness makes
// after watching a crime. The rival crew's armoured car is just a
// street car built from a different spec on a downtown circuit.
import * as THREE from 'three';
import { CAR_HEALTH, CITY, PALETTE, TRAFFIC, WITNESS } from './config.js';
import { makeCarMesh } from './vehicles.js';
import { pick, range, shuffle } from './random.js';

// A circuit is inset from the road centrelines by one lane, so cars
// drive on their own side of the street instead of down the middle.
const LANE = 3.2;
const ARRIVE_DIST = 1.2;
const PANIC_MULT = 3.2;
const DANGER_RADIUS = 14;
const FLEE_RADIUS = 12;
const JACK_SCARE_RADIUS = 16;

// Square of a distance, so the hot loops below compare without a
// square root per candidate.
function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// One block's worth of road: the four inset edges of the rectangle
// between two neighbouring streets in each direction, plus which way
// around it this car travels.
function circuitFor(rng, streets, blockIndex) {
  const span = streets.length - 1;
  const col = blockIndex % span;
  const row = Math.floor(blockIndex / span) % span;
  return {
    west: streets[col] + LANE,
    east: streets[col + 1] - LANE,
    north: streets[row] + LANE,
    south: streets[row + 1] - LANE,
    forward: rng() < 0.5 ? 1 : -1,
  };
}

// The corner a leg points at. Legs run clockwise from the north-west
// corner; driving the other way walks the same four corners in
// reverse, so oncoming traffic reads on every street.
function cornerAt(circuit, leg) {
  const n = ((leg % 4) + 4) % 4;
  if (n === 0) return { x: circuit.west, z: circuit.north };
  if (n === 1) return { x: circuit.east, z: circuit.north };
  if (n === 2) return { x: circuit.east, z: circuit.south };
  return { x: circuit.west, z: circuit.south };
}

export function createTraffic(scene, world, rng, callbacks = {}) {
  const cars = [];
  const peds = [];
  const streets = world.streets;

  // Shirt colours come from a shuffled deck dealt in turn, so the same
  // seed still builds the same city but no two neighbours ever match.
  const shirtDeck = shuffle(rng, [0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1]);
  let shirtNext = 0;
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });

  function nextShirt() {
    const colour = shirtDeck[shirtNext % shirtDeck.length];
    shirtNext += 1;
    return colour;
  }

  // A walker is a torso, a head and a hidden phone, assembled from a
  // parts list so the shape stays in one place.
  function buildWalkerMesh() {
    const group = new THREE.Group();
    const shirtMat = new THREE.MeshLambertMaterial({ color: nextShirt() });
    const pieces = [
      { geo: new THREE.CylinderGeometry(0.28, 0.34, 0.95, 8), mat: shirtMat, y: 0.9, shadow: true },
      { geo: new THREE.SphereGeometry(0.23, 10, 8), mat: skinMat, y: 1.55, shadow: false },
    ];
    for (const piece of pieces) {
      const mesh = new THREE.Mesh(piece.geo, piece.mat);
      mesh.position.y = piece.y;
      mesh.castShadow = piece.shadow;
      group.add(mesh);
    }
    // The witness phone: invisible until this pedestrian sees a crime.
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.16, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xecf0f1 }),
    );
    phone.position.set(0.3, 1.25, 0.3);
    phone.visible = false;
    phone.name = 'witness-phone';
    group.add(phone);
    return group;
  }

  // One car on the streets, street or rival spec. The rival is matte
  // black with a gold stripe, twice the steel of a street car, on a
  // fixed downtown circuit; a street car gets a random paint job and a
  // random block. Both are replaced the same way when they leave.
  let rival = null;
  function spawnTrafficCar(kind) {
    const isRival = kind === 'rival';
    const paint = isRival ? PALETTE.rival : pick(rng, PALETTE.car);
    const mesh = makeCarMesh(paint, false, isRival);
    const circuit = circuitFor(rng, streets, isRival ? 12 : Math.floor(rng() * 24));
    const startLeg = isRival ? 0 : Math.floor(rng() * 4);
    const start = cornerAt(circuit, startLeg);
    mesh.position.set(start.x, 0, start.z);
    scene.add(mesh);
    const hp = isRival ? CAR_HEALTH.armoured : CAR_HEALTH.street;
    const car = {
      mesh,
      circuit,
      leg: (startLeg + circuit.forward + 4) % 4,
      speed: TRAFFIC.carSpeed * (isRival ? 1.15 : range(rng, 0.8, 1.2)),
      color: paint,
      isPolice: false,
      parked: false,
      health: hp,
      maxHealth: hp,
      rival: isRival,
    };
    cars.push(car);
    if (isRival) rival = car;
    return car;
  }

  // Walkers start on a sidewalk: beside a street line, offset to one
  // side, at a random point along it.
  function spawnWalker() {
    const mesh = buildWalkerMesh();
    const line = pick(rng, streets);
    const along = range(rng, -CITY.halfSize + 10, CITY.halfSize - 10);
    const vertical = rng() < 0.5;
    const side = rng() < 0.5 ? -9.5 : 9.5;
    mesh.position.set(vertical ? line + side : along, 0, vertical ? along : line + side);
    scene.add(mesh);
    peds.push({
      mesh,
      heading: rng() * Math.PI * 2,
      speed: TRAFFIC.pedSpeed * range(rng, 0.8, 1.4),
      panic: 0,
      witness: 0,
      wanderTimer: range(rng, 2, 6),
      vertical,
      dead: false,
    });
  }

  spawnTrafficCar('rival');
  for (let i = 0; i < TRAFFIC.carCount; i += 1) spawnTrafficCar('street');
  for (let i = 0; i < TRAFFIC.pedCount; i += 1) spawnWalker();

  function copIsClose(x, z, policeDots) {
    if (!policeDots) return false;
    const reach = TRAFFIC.yieldRadius * TRAFFIC.yieldRadius;
    for (const cop of policeDots) {
      if (dist2(x, z, cop.x, cop.z) < reach) return true;
    }
    return false;
  }

  function stepCar(car, dt, policeDots) {
    const goal = cornerAt(car.circuit, car.leg);
    const dx = goal.x - car.mesh.position.x;
    const dz = goal.z - car.mesh.position.z;
    if (Math.hypot(dx, dz) < ARRIVE_DIST) {
      car.leg = (car.leg + car.circuit.forward + 4) % 4;
      return;
    }
    // Yield: a cruiser nearby makes traffic crawl and edge to the kerb.
    let pace = car.speed;
    if (copIsClose(car.mesh.position.x, car.mesh.position.z, policeDots)) {
      pace = Math.min(pace, TRAFFIC.yieldSpeed);
    }
    const heading = Math.atan2(dx, dz);
    car.mesh.rotation.y = heading;
    car.mesh.position.x += Math.sin(heading) * pace * dt;
    car.mesh.position.z += Math.cos(heading) * pace * dt;
  }

  function moveCars(dt, policeDots) {
    for (const car of cars) stepCar(car, dt, policeDots);
  }

  // A witness on the phone: the call goes through after a few seconds
  // unless the player has already left the area, in which case the
  // witness gives up and the phone stays out.
  function tickWitness(ped, dt, playerPos) {
    if (ped.witness <= 0) return;
    ped.witness -= dt;
    const d = Math.hypot(ped.mesh.position.x - playerPos.x, ped.mesh.position.z - playerPos.z);
    if (d > WITNESS.seeRadius + 10) {
      ped.witness = 0;
      return;
    }
    if (ped.witness <= 0) {
      ped.mesh.getObjectByName('witness-phone').visible = false;
      if (callbacks.onWitness) callbacks.onWitness(ped);
    }
  }

  // Keep walkers on the sidewalks: bounce off the road edges and the
  // bounds, turning around instead of walking into the sea.
  function keepInside(ped) {
    const pos = ped.mesh.position;
    const edge = CITY.halfSize - 4;
    const south = CITY.beachStartZ + 20;
    if (Math.abs(pos.x) > edge || Math.abs(pos.z) > edge || pos.z > south) {
      ped.heading += Math.PI;
      pos.x = Math.max(-CITY.halfSize + 5, Math.min(CITY.halfSize - 5, pos.x));
      pos.z = Math.max(-CITY.halfSize + 5, Math.min(CITY.beachStartZ + 18, pos.z));
    }
  }

  function stepWalker(ped, dt, playerPos, dangerPos, wanted) {
    if (ped.dead) return;
    const px = ped.mesh.position.x;
    const pz = ped.mesh.position.z;
    // A gunshot or a punch nearby sends walkers running.
    if (dangerPos && dist2(px, pz, dangerPos.x, dangerPos.z) < DANGER_RADIUS * DANGER_RADIUS) {
      ped.panic = 3;
    }
    // Heat on the streets: walkers near the player run away from him.
    if (wanted >= 2 && dist2(px, pz, playerPos.x, playerPos.z) < FLEE_RADIUS * FLEE_RADIUS) {
      ped.heading = Math.atan2(px - playerPos.x, pz - playerPos.z);
      if (ped.panic < 1.5) ped.panic = 1.5;
    }
    tickWitness(ped, dt, playerPos);
    const running = ped.panic > 0;
    if (running) ped.panic -= dt;
    ped.wanderTimer -= dt;
    if (ped.wanderTimer <= 0) {
      ped.wanderTimer = range(rng, 3, 8);
      // Turn at a corner: rotate 90 degrees, or reverse.
      const quarter = Math.PI / 2;
      ped.heading += (rng() < 0.5 ? quarter : -quarter) * (rng() < 0.8 ? 1 : 2);
    }
    const pace = running ? ped.speed * PANIC_MULT : ped.speed;
    ped.mesh.position.x += Math.sin(ped.heading) * pace * dt;
    ped.mesh.position.z += Math.cos(ped.heading) * pace * dt;
    ped.mesh.rotation.y = ped.heading;
    keepInside(ped);
    const bob = Math.sin(performance.now() * 0.008 + ped.mesh.position.x) * 0.03;
    ped.mesh.position.y = Math.abs(bob);
  }

  function movePeds(dt, playerPos, dangerPos, wanted) {
    for (const ped of peds) stepWalker(ped, dt, playerPos, dangerPos, wanted);
  }

  // A carjacked car is replaced after a while, so the streets stay busy.
  let refillIn = 0;
  function topUp(dt) {
    if (cars.length >= TRAFFIC.carCount + 1) return;
    refillIn += dt;
    if (refillIn > 20) {
      refillIn = 0;
      spawnTrafficCar('street');
    }
  }

  // A crime at a point: nearby walkers pull out their phones and
  // become witnesses. Called by main.js whenever Jules commits a crime.
  function reportCrime(pos) {
    const reach = WITNESS.seeRadius * WITNESS.seeRadius;
    for (const ped of peds) {
      if (ped.dead || ped.witness > 0) continue;
      if (dist2(ped.mesh.position.x, ped.mesh.position.z, pos.x, pos.z) >= reach) continue;
      ped.witness = WITNESS.callSeconds;
      ped.mesh.getObjectByName('witness-phone').visible = true;
    }
  }

  // Damage a traffic car (bullets). Returns 'destroyed' at zero health
  // — the caller plays the explosion — 'damaged', or 'none'.
  function damageCar(car, amount) {
    if (!car || typeof car.health !== 'number') return 'none';
    car.health -= amount;
    if (car.health <= 0) {
      car.health = 0;
      return 'destroyed';
    }
    return 'damaged';
  }

  // Take a wrecked traffic car off the street entirely.
  function removeCar(car) {
    const index = cars.indexOf(car);
    if (index !== -1) cars.splice(index, 1);
    scene.remove(car.mesh);
    if (car === rival) rival = null;
  }

  // Nearest moving traffic car to a point (for carjacking).
  function nearestCar(pos, maxDist) {
    const limit = maxDist * maxDist;
    let best = null;
    let bestD2 = limit;
    for (const car of cars) {
      const d2 = dist2(car.mesh.position.x, car.mesh.position.z, pos.x, pos.z);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = car;
      }
    }
    return best;
  }

  // Yank the driver out: the car leaves traffic and becomes the
  // player's. Nearby walkers see it happen and run.
  function jackCar(car) {
    const index = cars.indexOf(car);
    if (index === -1) return null;
    cars.splice(index, 1);
    const scare = JACK_SCARE_RADIUS * JACK_SCARE_RADIUS;
    for (const ped of peds) {
      if (ped.dead) continue;
      if (dist2(ped.mesh.position.x, ped.mesh.position.z, car.mesh.position.x, car.mesh.position.z) < scare) {
        ped.panic = 4;
      }
    }
    return { mesh: car.mesh, color: car.color, heading: car.mesh.rotation.y };
  }

  // Nearest living pedestrian to a point (for punches and bullets).
  function nearestPed(pos, maxDist) {
    const limit = maxDist * maxDist;
    let best = null;
    let bestD2 = limit;
    for (const ped of peds) {
      if (ped.dead) continue;
      const d2 = dist2(ped.mesh.position.x, ped.mesh.position.z, pos.x, pos.z);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = ped;
      }
    }
    return best;
  }

  function killPed(ped) {
    ped.dead = true;
    // Fall flat: a grim little marker of the crime.
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
  }

  return {
    cars,
    peds,
    rivalCar() { return rival; },
    addRival() { return spawnTrafficCar('rival'); },
    update(dt, playerPos, dangerPos, policeDots, wanted) {
      moveCars(dt, policeDots);
      movePeds(dt, playerPos, dangerPos, wanted || 0);
      topUp(dt);
    },
    moveCars,
    movePeds,
    reportCrime,
    damageCar,
    removeCar,
    nearestCar,
    jackCar,
    nearestPed,
    killPed,
  };
}
