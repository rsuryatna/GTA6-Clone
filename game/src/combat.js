// SOLMARINA combat — Jules' fists and the four-gun weapon wheel.
//
// Every trigger pull is hitscan from the camera. Each pellet of a burst
// flies down its own jittered ray, and every candidate the pellets touch
// — a pedestrian, a parked car, a traffic car — is gathered up first;
// the closest touch wins. The result names the hit kind, the impact
// point and, for cars, the exact car record, so main.js can raise the
// wanted level, damage the car and pick the right sound.
//
// Ammo lives per weapon as a magazine count. Reloading is free and tops
// the magazine back up; buying a gun at Ammu-Nation only unlocks it.

import * as THREE from 'three';
import { WANTED, WEAPONS } from './config.js';

const FLASH_HEX = 0xffc861;
const FLASH_POWER = 60;
const FLASH_SPAN = 0.06;
const FLASH_REACH = 14;
const TRACER_HEX = 0xffe9a8;
const TRACER_SPAN = 0.07;
const HEAD_LIFT = 1;
const PED_HIT_RADIUS = 1.2;
const PUNCH_REACH = 2.2;
const PUNCH_HALF_ARC = 1.1;
const PUNCH_SHOVE = 1.5;
const RELOAD_SPAN = 1.1;
const UP = new THREE.Vector3(0, 1, 0);

function blankShot() {
  return { hit: 'none', point: null, car: null, list: null };
}

export function createCombat(scene, camera) {
  const magazines = new Map();
  const ownedIds = new Set(['pistol']);
  for (const spec of WEAPONS) magazines.set(spec.id, spec.magSize);

  let selected = 0;
  let coolDown = 0;
  let reloadLeft = 0;

  let flashLight = null;
  let flashLeft = 0;
  let tracer = null;
  let tracerLeft = 0;

  const caster = new THREE.Raycaster();
  const aimRay = new THREE.Ray();
  const scratchA = new THREE.Vector3();
  const scratchB = new THREE.Vector3();
  const scratchC = new THREE.Vector3();

  function spec() { return WEAPONS[selected]; }

  function lightFlash(origin, direction) {
    if (!flashLight) {
      flashLight = new THREE.PointLight(FLASH_HEX, 0, FLASH_REACH, 1.5);
      scene.add(flashLight);
    }
    flashLight.position.copy(origin).addScaledVector(direction, 1.2);
    flashLight.intensity = FLASH_POWER;
    flashLeft = FLASH_SPAN;
  }

  function paintTracer(from, to) {
    if (!tracer) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: TRACER_HEX, transparent: true, opacity: 0.9,
      }));
      tracer.frustumCulled = false;
      scene.add(tracer);
    }
    const slot = tracer.geometry.attributes.position.array;
    slot[0] = from.x; slot[1] = from.y; slot[2] = from.z;
    slot[3] = to.x; slot[4] = to.y; slot[5] = to.z;
    tracer.geometry.attributes.position.needsUpdate = true;
    tracer.material.opacity = 0.9;
    tracerLeft = TRACER_SPAN;
  }

  // A jittered copy of the aim direction: a small random cone around it,
  // wide for the shotgun, almost nothing for the rifle.
  function jittered(base, spread, out) {
    scratchA.crossVectors(base, UP);
    if (scratchA.lengthSq() < 0.001) scratchA.set(1, 0, 0);
    scratchA.normalize();
    scratchB.crossVectors(scratchA, base).normalize();
    out.copy(base)
      .addScaledVector(scratchA, (Math.random() * 2 - 1) * spread)
      .addScaledVector(scratchB, (Math.random() * 2 - 1) * spread)
      .normalize();
    return out;
  }

  // Walk from a hit mesh up to the child of the scene, then match that
  // root against the parked and traffic lists.
  function identifyCar(object, vehicles, traffic) {
    let node = object;
    while (node.parent && node.parent !== scene) node = node.parent;
    for (const car of vehicles.parked) {
      if (car.mesh === node) return { car, list: 'parked' };
    }
    for (const car of traffic.cars) {
      if (car.mesh === node) return { car, list: 'traffic' };
    }
    return null;
  }

  function hasLightbar(object) {
    const siblings = object.parent?.children;
    return Array.isArray(siblings) && siblings.some((c) => c.name === 'lightbar');
  }

  // Pedestrians are tested as a point (the head) against the ray: how far
  // along the ray the closest approach sits, and how far off the ray it is.
  function pedTouches(origin, dir, limit, traffic) {
    const touches = [];
    aimRay.set(origin, dir);
    for (const ped of traffic.peds) {
      if (ped.dead) continue;
      scratchA.copy(ped.mesh.position);
      scratchA.y += HEAD_LIFT;
      aimRay.closestPointToPoint(scratchA, scratchB);
      scratchB.sub(origin);
      const along = scratchB.dot(dir);
      if (along <= 0 || along > limit) continue;
      scratchC.copy(scratchB).addScaledVector(dir, -along);
      if (scratchC.length() >= PED_HIT_RADIUS) continue;
      touches.push({
        kind: 'ped', target: ped, dist: along,
        point: origin.clone().add(scratchB), car: null, list: null,
      });
    }
    return touches;
  }

  // Cars go through the raycaster against every parked and traffic mesh;
  // only the nearest mesh hit of this pellet counts.
  function carTouches(origin, dir, limit, vehicles, traffic) {
    const meshes = [];
    for (const car of vehicles.parked) meshes.push(car.mesh);
    for (const car of traffic.cars) meshes.push(car.mesh);
    caster.set(origin, dir);
    caster.near = 0.1;
    caster.far = limit;
    const hits = caster.intersectObjects(meshes, true);
    if (hits.length === 0) return [];
    const hit = hits[0];
    const record = identifyCar(hit.object, vehicles, traffic);
    const cop = record ? record.car.isPolice === true : hasLightbar(hit.object);
    return [{
      kind: cop ? 'cop' : 'car', dist: hit.distance, point: hit.point,
      car: record ? record.car : null, list: record ? record.list : null,
    }];
  }

  function shoot(origin, direction, traffic, police, vehicles) {
    const gun = spec();
    if (reloadLeft > 0 || coolDown > 0 || magazines.get(gun.id) <= 0) {
      return blankShot();
    }
    magazines.set(gun.id, magazines.get(gun.id) - 1);
    coolDown = gun.fireRate;
    lightFlash(origin, direction);
    const touches = [];
    const dir = new THREE.Vector3();
    for (let pellet = 0; pellet < gun.pellets; pellet += 1) {
      jittered(direction, gun.spread, dir);
      touches.push(...pedTouches(origin, dir, gun.range, traffic));
      touches.push(...carTouches(origin, dir, gun.range, vehicles, traffic));
    }
    let winner = null;
    for (const touch of touches) {
      if (!winner || touch.dist < winner.dist) winner = touch;
    }
    if (winner) {
      paintTracer(origin, winner.point);
      return {
        hit: winner.kind, point: winner.point,
        car: winner.car || null, list: winner.list || null,
      };
    }
    const far = origin.clone().addScaledVector(direction, gun.range);
    paintTracer(origin, far);
    return { hit: 'none', point: far, car: null, list: null };
  }

  // A punch lands on the nearest living ped inside the arc in front,
  // and shoves the victim away from the player.
  function punch(origin, heading, traffic) {
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    let victim = null;
    let victimDist = PUNCH_REACH;
    for (const ped of traffic.peds) {
      if (ped.dead) continue;
      scratchA.subVectors(ped.mesh.position, origin);
      const dist = scratchA.length();
      if (dist > victimDist) continue;
      scratchA.y = 0;
      scratchA.normalize();
      if (scratchA.dot(forward) < Math.cos(PUNCH_HALF_ARC)) continue;
      victim = ped;
      victimDist = dist;
    }
    if (!victim) return null;
    scratchA.subVectors(victim.mesh.position, origin).setY(0).normalize();
    victim.mesh.position.addScaledVector(scratchA, PUNCH_SHOVE);
    return victim;
  }

  return {
    shoot,
    punch,
    // The weapon wheel: switch by index (keys 1-4). Only owned weapons.
    switchWeapon(index) {
      if (index < 0 || index >= WEAPONS.length) return false;
      if (!ownedIds.has(WEAPONS[index].id)) return false;
      if (index === selected) return true;
      selected = index;
      reloadLeft = 0;
      return true;
    },
    currentWeapon() { return spec(); },
    weaponList() {
      return WEAPONS.map((w, i) => ({
        id: w.id, name: w.name, owned: ownedIds.has(w.id),
        ammo: magazines.get(w.id), magSize: w.magSize, active: i === selected,
      }));
    },
    buyWeapon(id) {
      const found = WEAPONS.find((w) => w.id === id);
      if (!found) return false;
      ownedIds.add(id);
      magazines.set(id, found.magSize);
      return true;
    },
    ownsWeapon(id) { return ownedIds.has(id); },
    refillAmmo() {
      for (const w of WEAPONS) magazines.set(w.id, w.magSize);
    },
    getAmmo() { return magazines.get(spec().id); },
    getAmmoFor(id) { return magazines.get(id) ?? 0; },
    reload() {
      const gun = spec();
      if (reloadLeft > 0 || magazines.get(gun.id) === gun.magSize) return false;
      reloadLeft = RELOAD_SPAN;
      return true;
    },
    update(dt) {
      if (coolDown > 0) coolDown -= dt;
      if (reloadLeft > 0) {
        reloadLeft -= dt;
        if (reloadLeft <= 0) magazines.set(spec().id, spec().magSize);
      }
      if (flashLeft > 0) {
        flashLeft -= dt;
        if (flashLeft <= 0 && flashLight) flashLight.intensity = 0;
      }
      if (tracerLeft > 0) {
        tracerLeft -= dt;
        if (tracer) {
          tracer.material.opacity = Math.max(0, tracerLeft / TRACER_SPAN) * 0.9;
        }
      }
    },
    wantedFor(hit) {
      if (hit === 'ped') return WANTED.shootPed;
      if (hit === 'cop') return WANTED.shootCop;
      return 0;
    },
    getState() {
      const owned = {};
      for (const id of ownedIds) owned[id] = true;
      const ammo = {};
      for (const [id, count] of magazines) ammo[id] = count;
      return { current: selected, owned, ammo };
    },
    setState(data) {
      // No data (a fresh game) resets to the starting loadout: pistol only.
      if (!data) {
        selected = 0;
        ownedIds.clear();
        ownedIds.add('pistol');
        for (const w of WEAPONS) magazines.set(w.id, w.magSize);
        return;
      }
      if (typeof data.current === 'number') {
        selected = Math.max(0, Math.min(WEAPONS.length - 1, data.current));
      }
      if (data.owned) {
        ownedIds.clear();
        for (const w of WEAPONS) {
          if (data.owned[w.id] === true || w.id === 'pistol') ownedIds.add(w.id);
        }
      }
      if (data.ammo) {
        for (const w of WEAPONS) {
          magazines.set(w.id, typeof data.ammo[w.id] === 'number' ? data.ammo[w.id] : w.magSize);
        }
      }
    },
  };
}
