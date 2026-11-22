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
import { torsoGeometry, taperedLimb } from './human.js';
import { pick, range, shuffle } from './random.js';

// A circuit is inset from the road centrelines by one lane, so cars
// drive on their own side of the street instead of down the middle.
const LANE = 3.2;
const ARRIVE_DIST = 1.2;
const PANIC_MULT = 3.2;
const DANGER_RADIUS = 14;
const FLEE_RADIUS = 12;
const JACK_SCARE_RADIUS = 16;

// NPC talk: a chat lasts a few seconds, and the same pedestrian will
// not chat again for a while, so the player cannot spam one NPC.
const TALK_SECONDS = 2.5;
const TALK_COOLDOWN = 20;
const TALK_RADIUS = 2.5;

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

  // A shuffled deck dealt in turn: call the returned function for the
  // next colour, so the crowd varies without ever repeating a neighbour.
  function makeDeck(colors) {
    const deck = shuffle(rng, colors);
    let at = 0;
    return () => { const c = deck[at % deck.length]; at += 1; return c; };
  }
  const nextSkin = makeDeck([0xd9a066, 0xc68863, 0x8d5524, 0xffdbac, 0xf1c27d, 0xe0ac69]);
  const nextHair = makeDeck([0x1a1a1a, 0x3b2a1a, 0x6b4a1f, 0xd9c27a, 0x8a8a8a, 0x4a2c14]);
  const nextPants = makeDeck([0x2c313a, 0x3a4a6b, 0x5a4632, 0x1a1a1a, 0x6b3a2a, 0x2e4a3a]);
  const nextJacket = makeDeck([0x2e86c1, 0xc0392b, 0x27ae60, 0x8e44ad, 0x34495e, 0x7f8c8d]);
  const nextHat = makeDeck([0xc0392b, 0x2e86c1, 0xf1c40f, 0x1a1a1a, 0xecf0f1]);

  function nextShirt() {
    const colour = shirtDeck[shirtNext % shirtDeck.length];
    shirtNext += 1;
    return colour;
  }

  // A walker is a person now: a shaped torso (shoulders, chest, waist,
  // hips), a neck, an ellipsoid head with eyes and hair (or a hat), legs
  // in trousers and arms in sleeves — each limb in two tapered segments
  // that bend at the knee and elbow, with hands and feet. The returned
  // limbs are the pivots stepWalker rotates. The body shapes come from
  // human.js: a real human silhouette, not a cylinder.
  function buildWalkerMesh() {
    const group = new THREE.Group();
    const shirtMat = new THREE.MeshLambertMaterial({ color: nextShirt() });
    const skinMat = new THREE.MeshLambertMaterial({ color: nextSkin() });
    const pantsMat = new THREE.MeshLambertMaterial({ color: nextPants() });
    const hairMat = new THREE.MeshLambertMaterial({ color: nextHair() });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x141414 });
    const limbs = {};
    function addPart(geo, mat, x, y, z, name, shadow) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      if (shadow) mesh.castShadow = true;
      if (name) { mesh.name = name; limbs[name] = mesh; }
      group.add(mesh);
      return mesh;
    }
    function addPivot(parent, x, y, z, name) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      parent.add(pivot);
      if (name) limbs[name] = pivot;
      return pivot;
    }
    // Torso: the human silhouette, shirt-coloured, from the hips (0.78)
    // to the shoulders (1.46).
    const torso = new THREE.Mesh(torsoGeometry(0.78, 0), shirtMat);
    torso.castShadow = true;
    group.add(torso);
    limbs.torso = torso;
    // Neck, then the head: an ellipsoid (taller than wide) with eyes and
    // a small nose, so the face reads from the front and the side.
    addPart(new THREE.BoxGeometry(0.09, 0.12, 0.09), skinMat, 0, 1.51, 0, null, false);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 10), skinMat);
    head.scale.set(0.95, 1.2, 1.0);
    head.position.set(0, 1.68, 0);
    group.add(head);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), eyeMat);
      eye.position.set(sx * 0.035, 1.69, 0.096);
      group.add(eye);
    }
    addPart(new THREE.BoxGeometry(0.03, 0.05, 0.03), skinMat, 0, 1.65, 0.095, null, false);
    // Hair: a cap over the top of the head, in one of three lengths.
    // A hat replaces the hair for about a quarter of walkers.
    if (rng() < 0.25) {
      const hatMat = new THREE.MeshLambertMaterial({ color: nextHat() });
      addPart(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 10), hatMat, 0, 1.82, 0, null, false);
      addPart(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 10), hatMat, 0, 1.79, 0.01, null, false);
    } else {
      const hairGeo = new THREE.SphereGeometry(0.105, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const hair = addPart(hairGeo, hairMat, 0, 1.70, -0.01, null, false);
      hair.scale.y = pick(rng, [0.5, 0.8, 1.2]);
    }
    // A jacket over the shirt for about two in five walkers: a slightly
    // larger torso from the waist up, so the shirt shows below it.
    const hasJacket = rng() < 0.4;
    const jacketColour = hasJacket ? nextJacket() : null;
    if (hasJacket) {
      const jacketMat = new THREE.MeshLambertMaterial({ color: jacketColour });
      const jacket = new THREE.Mesh(torsoGeometry(1.00, 0.025), jacketMat);
      jacket.scale.z = 1.15;
      jacket.castShadow = true;
      group.add(jacket);
    }
    const sleeveMat = hasJacket
      ? new THREE.MeshLambertMaterial({ color: jacketColour })
      : shirtMat;
    // Legs: thigh + shin, pivoting at the hip and the knee, with feet
    // pointing forward. The knee bends when the leg swings forward.
    for (const side of [-1, 1]) {
      const hip = addPivot(group, side * 0.11, 0.88, 0, side < 0 ? 'legL' : 'legR');
      const thigh = new THREE.Mesh(taperedLimb(0.17, 0.13, 0.42, 0.17, 0.13), pantsMat);
      hip.add(thigh);
      const knee = addPivot(hip, 0, -0.42, 0, side < 0 ? 'kneeL' : 'kneeR');
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), pantsMat);
      knee.add(kneeCap);
      const shin = new THREE.Mesh(taperedLimb(0.13, 0.10, 0.39, 0.13, 0.10), pantsMat);
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.26), shoeMat);
      foot.position.set(0, -0.40, 0.07);
      knee.add(foot);
    }
    // Arms: upper arm + forearm, pivoting at the shoulder and the elbow,
    // with hands. The arms counter-swing against the legs.
    for (const side of [-1, 1]) {
      const shoulder = addPivot(group, side * 0.235, 1.42, 0, side < 0 ? 'armL' : 'armR');
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), sleeveMat);
      shoulder.add(cap);
      const upper = new THREE.Mesh(taperedLimb(0.12, 0.095, 0.30, 0.12, 0.095), sleeveMat);
      shoulder.add(upper);
      const elbow = addPivot(shoulder, 0, -0.30, 0, side < 0 ? 'elbowL' : 'elbowR');
      const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), sleeveMat);
      elbow.add(elbowCap);
      const fore = new THREE.Mesh(taperedLimb(0.095, 0.075, 0.28, 0.095, 0.075), sleeveMat);
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.045), skinMat);
      hand.position.set(0, -0.32, 0);
      elbow.add(hand);
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
    return { group, limbs };
  }

  // One car on the streets, street or rival spec. The rival is matte
  // black with a gold stripe, twice the steel of a street car, on a
  // fixed downtown circuit; a street car gets a random paint job and a
  // random block. Both are replaced the same way when they leave.
  // Street cars cycle through the body types in order, so the same seed
  // always builds the same shapes and the street reads as varied
  // vehicles instead of identical boxes. The rival keeps the sedan.
  const BODY_CYCLE = ['sedan', 'hatch', 'sport', 'suv', 'pickup'];
  let rival = null;
  function spawnTrafficCar(kind) {
    const isRival = kind === 'rival';
    const paint = isRival ? PALETTE.rival : pick(rng, PALETTE.car);
    const bodyType = isRival ? 'sedan' : BODY_CYCLE[(cars.length - 1) % BODY_CYCLE.length];
    const mesh = makeCarMesh(paint, false, isRival, bodyType);
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
  // side, at a random point along it. Each one gets its own height
  // (the group scales about the ground, so the feet stay planted) and
  // a walk phase, so the crowd reads as varied people, not clones.
  function spawnWalker() {
    const { group: mesh, limbs } = buildWalkerMesh();
    const line = pick(rng, streets);
    const along = range(rng, -CITY.halfSize + 10, CITY.halfSize - 10);
    const vertical = rng() < 0.5;
    const side = rng() < 0.5 ? -9.5 : 9.5;
    mesh.position.set(vertical ? line + side : along, 0, vertical ? along : line + side);
    mesh.scale.setScalar(range(rng, 0.92, 1.08));
    scene.add(mesh);
    peds.push({
      mesh,
      limbs,
      phase: rng() * Math.PI * 2,
      heading: rng() * Math.PI * 2,
      speed: TRAFFIC.pedSpeed * range(rng, 0.8, 1.4),
      panic: 0,
      witness: 0,
      talkTimer: 0,
      talkCooldown: 0,
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
    // Talking: a pedestrian in conversation stands still, faces the
    // player and stops walking until the chat ends. A crime interrupts
    // the chat — a witness goes back to calling the police.
    if (ped.talkTimer > 0) {
      if (ped.witness > 0) {
        ped.talkTimer = 0;
      } else {
        ped.talkTimer -= dt;
        if (ped.talkTimer > 0) {
          ped.heading = Math.atan2(playerPos.x - px, playerPos.z - pz);
          ped.mesh.rotation.y = ped.heading;
          ped.mesh.position.y = 0;
          if (ped.limbs) {
            ped.limbs.legL.rotation.x = 0;
            ped.limbs.legR.rotation.x = 0;
            ped.limbs.armL.rotation.x = 0;
            ped.limbs.armR.rotation.x = 0;
            ped.limbs.kneeL.rotation.x = 0;
            ped.limbs.kneeR.rotation.x = 0;
            ped.limbs.elbowL.rotation.x = 0;
            ped.limbs.elbowR.rotation.x = 0;
          }
          return;
        }
      }
    }
    if (ped.talkCooldown > 0) ped.talkCooldown -= dt;
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
    // Walk cycle: the legs swing from the hip and the arms counter-swing
    // from the shoulder, advanced by distance walked so the stride stays
    // in step with the feet at any frame rate. The knee bends as its leg
    // swings forward through the air, and the elbow carries a slight
    // bend — a human walk, not two rods swinging.
    ped.phase += pace * dt * 1.8;
    const swing = Math.sin(ped.phase) * 0.45;
    const fwdL = Math.max(0, -Math.sin(ped.phase));
    const fwdR = Math.max(0, Math.sin(ped.phase));
    if (ped.limbs) {
      ped.limbs.legL.rotation.x = swing;
      ped.limbs.legR.rotation.x = -swing;
      ped.limbs.kneeL.rotation.x = fwdL * 0.8;
      ped.limbs.kneeR.rotation.x = fwdR * 0.8;
      ped.limbs.armL.rotation.x = -swing * 0.7;
      ped.limbs.armR.rotation.x = swing * 0.7;
      ped.limbs.elbowL.rotation.x = -(0.25 + fwdR * 0.2);
      ped.limbs.elbowR.rotation.x = -(0.25 + fwdL * 0.2);
    }
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

  // NPC talk: a pedestrian who is alive, not a witness, not already
  // chatting and not on cooldown can be talked to. Starting a chat
  // stops them for a few seconds and starts their cooldown.
  function canTalk(ped) {
    return !!ped && !ped.dead && ped.witness <= 0 && ped.talkTimer <= 0 && ped.talkCooldown <= 0;
  }

  function startTalk(ped, playerPos) {
    if (!canTalk(ped)) return false;
    ped.talkTimer = TALK_SECONDS;
    ped.talkCooldown = TALK_COOLDOWN;
    ped.heading = Math.atan2(playerPos.x - ped.mesh.position.x, playerPos.z - ped.mesh.position.z);
    ped.mesh.rotation.y = ped.heading;
    return true;
  }

  // Nearest pedestrian who can be talked to (for the talk prompt and
  // the E-key chat).
  function nearestTalkablePed(pos, maxDist) {
    const limit = (maxDist || TALK_RADIUS) * (maxDist || TALK_RADIUS);
    let best = null;
    let bestD2 = limit;
    for (const ped of peds) {
      if (!canTalk(ped)) continue;
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
    canTalk,
    startTalk,
    nearestTalkablePed,
    talkRadius: TALK_RADIUS,
  };
}
