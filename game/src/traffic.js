// SOLMARINA — traffic.js
// One job: dense, believable traffic. Cars pick a road, drive a lane, slow
// for the car ahead, stop at nothing in particular — and keep the avenues
// full, because an empty road is what the old screenshots got wrong.

import { randomCarModel } from './vehicles.js';

export function createTraffic(scene, world, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const model = randomCarModel(rng);
    const car = {
      model,
      speed: rng.range(6, 11),
      targetSpeed: rng.range(6, 11),
      vertical: rng.chance(0.5),
      lane: rng.pick([-1, 1]),
      offset: rng.range(0, 600),
    };
    const spot = world.randomRoadPoint(rng);
    car.model.group.position.set(spot.x, 0, spot.z);
    scene.add(car.model.group);
    cars.push(car);
  }

  // Parked cars along the kerbs: every block edge gets one or two.
  const parked = [];
  for (let i = 0; i < 26; i++) {
    const model = randomCarModel(rng);
    const spot = world.randomRoadPoint(rng);
    const alongX = rng.chance(0.5);
    model.group.position.set(
      spot.x + (alongX ? 0 : rng.pick([-1, 1]) * 5.6),
      0,
      spot.z + (alongX ? rng.pick([-1, 1]) * 5.6 : 0),
    );
    model.group.rotation.y = alongX ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    scene.add(model.group);
    parked.push(model);
  }

  return {
    cars,
    parked,
    update(dt) {
      const spanX = world.halfX * 2 + 40;
      const spanZ = world.halfZ * 2 + 40;
      for (const car of cars) {
        // Ease toward target speed; brake if a car is close ahead.
        let ahead = Infinity;
        for (const other of cars) {
          if (other === car || other.vertical !== car.vertical) continue;
          const d = car.vertical
            ? (other.model.group.position.z - car.model.group.position.z) * car.lane
            : (other.model.group.position.x - car.model.group.position.x) * car.lane;
          if (d > 0 && d < ahead) ahead = d;
        }
        const want = ahead < 12 ? Math.max(0, car.targetSpeed * (ahead / 12)) : car.targetSpeed;
        car.speed += (want - car.speed) * Math.min(1, dt * 1.5);
        const step = car.speed * dt;
        const g = car.model.group;
        if (car.vertical) {
          g.position.z += step * car.lane;
          g.rotation.y = car.lane > 0 ? 0 : Math.PI;
          if (g.position.z > spanZ / 2) g.position.z = -spanZ / 2;
          if (g.position.z < -spanZ / 2) g.position.z = spanZ / 2;
        } else {
          g.position.x += step * car.lane;
          g.rotation.y = car.lane > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (g.position.x > spanX / 2) g.position.x = -spanX / 2;
          if (g.position.x < -spanX / 2) g.position.x = spanX / 2;
        }
        // Snap the car onto its lane so traffic reads as lanes, not noise.
        if (car.vertical) {
          const nearest = world.roadCentersX.reduce((a, b) => (
            Math.abs(b - g.position.x) < Math.abs(a - g.position.x) ? b : a
          ));
          g.position.x += (nearest + car.lane * 3.4 - g.position.x) * Math.min(1, dt * 2);
        } else {
          const nearest = world.roadCentersZ.reduce((a, b) => (
            Math.abs(b - g.position.z) < Math.abs(a - g.position.z) ? b : a
          ));
          g.position.z += (nearest + car.lane * 3.4 - g.position.z) * Math.min(1, dt * 2);
        }
        car.model.steer(0, car.speed);
      }
    },
    // Pull traffic onto one street for a staged shot.
    gatherNear(x, z, n) {
      let placed = 0;
      for (const car of cars) {
        if (placed >= n) break;
        const a = (placed / n) * Math.PI * 2;
        car.model.group.position.set(x + Math.cos(a) * 14, 0, z + Math.sin(a) * 14);
        car.model.group.rotation.y = a;
        car.speed = 2;
        car.targetSpeed = 2;
        placed++;
      }
      return placed;
    },
    // How many moving cars are currently within a radius — the HUD's
    // "streets alive" readout and a quick health check for staging.
    nearbyCount(x, z, radius) {
      let n = 0;
      for (const car of cars) {
        const dx = car.model.group.position.x - x;
        const dz = car.model.group.position.z - z;
        if (dx * dx + dz * dz < radius * radius) n++;
      }
      return n;
    },
    count() {
      return cars.length + parked.length;
    },
  };
}
