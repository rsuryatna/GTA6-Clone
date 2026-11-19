// Living streets: AI cars looping the blocks and pedestrians strolling the
// sidewalks. Traffic cars follow rectangular loops around one block; walkers
// follow sidewalk edges and pick a new one at each corner. Both keep the city
// feeling inhabited while the player is elsewhere.
import * as THREE from 'three';
import { CITY, PALETTE, TRAFFIC } from './config.js';
import { makeCarMesh } from './vehicles.js';
import { pick, range, shuffle } from './random.js';

function loopForBlock(rng, streets, blockIndex) {
  // A rectangle around one block, on the road centrelines, with a lane offset.
  const i = blockIndex % (streets.length - 1);
  const j = Math.floor(blockIndex / (streets.length - 1)) % (streets.length - 1);
  const x0 = streets[i];
  const x1 = streets[i + 1];
  const z0 = streets[j];
  const z1 = streets[j + 1];
  const lane = 3.2;
  const points = [
    { x: x0 + lane, z: z0 + lane },
    { x: x1 - lane, z: z0 + lane },
    { x: x1 - lane, z: z1 - lane },
    { x: x0 + lane, z: z1 - lane },
  ];
  if (rng() < 0.5) points.reverse(); // Half the loops run clockwise, half anticlockwise, so oncoming traffic reads on every street.
  return points;
}

export function createTraffic(scene, world, rng) {
  const cars = [];
  const peds = [];
  const streets = world.streets;

  // Pedestrian shirts, shuffled once so the same seed still gives the same
  // city, but no two neighbours wear the same colour twice in a row.
  const pedShirts = shuffle(rng, [0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1]);
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });

  function makePed() {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, pedShirts) });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.95, 8), shirt);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin);
    head.position.y = 1.55;
    group.add(head);
    return group;
  }

  // One AI car on a rectangular loop around a block. Used for the initial
  // traffic and to replace cars the player carjacks, so the streets never
  // run empty.
  let respawnTimer = 0;
  function spawnCar() {
    const color = pick(rng, PALETTE.car);
    const mesh = makeCarMesh(color, false);
    const loop = loopForBlock(rng, streets, Math.floor(rng() * 24));
    const start = Math.floor(rng() * loop.length);
    mesh.position.set(loop[start].x, 0, loop[start].z);
    scene.add(mesh);
    const car = {
      mesh, loop, target: (start + 1) % loop.length,
      speed: TRAFFIC.carSpeed * range(rng, 0.8, 1.2),
      color, isPolice: false, parked: false,
    };
    cars.push(car);
    return car;
  }

  for (let i = 0; i < TRAFFIC.carCount; i += 1) spawnCar();

  for (let i = 0; i < TRAFFIC.pedCount; i += 1) {
    const mesh = makePed();
    const street = pick(rng, streets);
    const along = range(rng, -CITY.halfSize + 10, CITY.halfSize - 10);
    const vertical = rng() < 0.5;
    const x = vertical ? street + (rng() < 0.5 ? -9.5 : 9.5) : along;
    const z = vertical ? along : street + (rng() < 0.5 ? -9.5 : 9.5);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh,
      heading: rng() * Math.PI * 2,
      speed: TRAFFIC.pedSpeed * range(rng, 0.8, 1.4),
      panic: 0,
      wanderTimer: range(rng, 2, 6),
      vertical,
      dead: false,
    });
  }

  function updateCars(dt) {
    for (const car of cars) {
      const target = car.loop[car.target];
      const dx = target.x - car.mesh.position.x;
      const dz = target.z - car.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        car.target = (car.target + 1) % car.loop.length;
        continue;
      }
      const heading = Math.atan2(dx, dz);
      car.mesh.rotation.y = heading;
      car.mesh.position.x += Math.sin(heading) * car.speed * dt;
      car.mesh.position.z += Math.cos(heading) * car.speed * dt;
    }
  }

  function updatePeds(dt, playerPos, dangerPos) {
    for (const ped of peds) {
      if (ped.dead) continue;
      // A gunshot or a punch nearby sends walkers running.
      if (dangerPos && ped.mesh.position.distanceTo(dangerPos) < 14) ped.panic = 3;
      const speed = ped.panic > 0 ? ped.speed * 3.2 : ped.speed;
      if (ped.panic > 0) ped.panic -= dt;
      ped.wanderTimer -= dt;
      if (ped.wanderTimer <= 0) {
        ped.wanderTimer = range(rng, 3, 8);
        // Turn at a corner: rotate 90 degrees, or reverse.
        ped.heading += (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) * (rng() < 0.8 ? 1 : 2);
      }
      ped.mesh.position.x += Math.sin(ped.heading) * speed * dt;
      ped.mesh.position.z += Math.cos(ped.heading) * speed * dt;
      ped.mesh.rotation.y = ped.heading;
      // Keep walkers on the sidewalks: bounce off the road edges and the bounds.
      const x = ped.mesh.position.x;
      const z = ped.mesh.position.z;
      if (Math.abs(x) > CITY.halfSize - 4 || Math.abs(z) > CITY.halfSize - 4 || z > CITY.beachStartZ + 20) {
        ped.heading += Math.PI;
        ped.mesh.position.x = Math.max(-CITY.halfSize + 5, Math.min(CITY.halfSize - 5, x));
        ped.mesh.position.z = Math.max(-CITY.halfSize + 5, Math.min(CITY.beachStartZ + 18, z));
      }
      const bob = Math.sin(performance.now() * 0.008 + ped.mesh.position.x) * 0.03;
      ped.mesh.position.y = Math.abs(bob);
    }
  }

  return {
    cars,
    peds,
    update(dt, playerPos, dangerPos) {
      updateCars(dt);
      updatePeds(dt, playerPos, dangerPos);
      // A carjacked car is replaced after a while, so the streets stay busy.
      if (cars.length < TRAFFIC.carCount) {
        respawnTimer += dt;
        if (respawnTimer > 20) {
          respawnTimer = 0;
          spawnCar();
        }
      }
    },
    // Nearest moving traffic car to a point (for carjacking).
    nearestCar(pos, maxDist) {
      let best = null;
      let bestDist = maxDist;
      for (const car of cars) {
        const d = Math.hypot(car.mesh.position.x - pos.x, car.mesh.position.z - pos.z);
        if (d < bestDist) { bestDist = d; best = car; }
      }
      return best;
    },
    // Yank the driver out: the car leaves traffic and becomes the player's.
    // Nearby walkers see it happen and run.
    jackCar(car) {
      const index = cars.indexOf(car);
      if (index === -1) return null;
      cars.splice(index, 1);
      for (const ped of peds) {
        if (ped.dead) continue;
        const d = Math.hypot(ped.mesh.position.x - car.mesh.position.x, ped.mesh.position.z - car.mesh.position.z);
        if (d < 16) ped.panic = 4;
      }
      return { mesh: car.mesh, color: car.color, heading: car.mesh.rotation.y };
    },
    // Nearest living pedestrian to a point (for punches and bullets).
    nearestPed(pos, maxDist) {
      let best = null;
      let bestDist = maxDist;
      for (const ped of peds) {
        if (ped.dead) continue;
        const d = Math.hypot(ped.mesh.position.x - pos.x, ped.mesh.position.z - pos.z);
        if (d < bestDist) { bestDist = d; best = ped; }
      }
      return best;
    },
    killPed(ped) {
      ped.dead = true;
      // Fall flat: a grim little marker of the crime.
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.3;
    },
  };
}
