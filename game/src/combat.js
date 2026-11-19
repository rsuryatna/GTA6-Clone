// Fists and the weapon wheel: punching arcs in front of the player, and
// four switchable weapons (keys 1-4) — pistol, shotgun, SMG and rifle —
// with their own damage, range, fire rate, spread and magazine. Shots are
// hitscan from the camera, with a muzzle flash; combat reports what it hit
// so the game can raise the wanted level and play the right sound. The
// pistol is Jules' from the start; the other three come from Ammu-Nation.
import * as THREE from 'three';
import { WANTED, WEAPONS } from './config.js';

export function createCombat(scene, camera) {
  // One ammo count per weapon (the magazine); reloads are free at any time.
  // Ammo starts full for every weapon, owned or not — buying a weapon at
  // Ammu-Nation only unlocks it.
  const ammo = {};
  const owned = { pistol: true };
  for (const weapon of WEAPONS) ammo[weapon.id] = weapon.magSize;
  let current = 0;
  let cooldown = 0;
  let reloadTimer = 0;
  let flash = null;
  let flashTimer = 0;

  function weapon() { return WEAPONS[current]; }

  function muzzleFlash(position, direction) {
    if (!flash) {
      flash = new THREE.PointLight(0xffc861, 0, 14, 1.5);
      scene.add(flash);
    }
    flash.position.copy(position).addScaledVector(direction, 1.2);
    flash.intensity = 60;
    flashTimer = 0.06;
  }

  function jitter(direction, spread) {
    // A small random cone around the aim direction, for shotgun pellets
    // and the SMG's spray; the rifle barely moves at all.
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(right, direction).normalize();
    return direction.clone()
      .addScaledVector(right, (Math.random() * 2 - 1) * spread)
      .addScaledVector(up, (Math.random() * 2 - 1) * spread)
      .normalize();
  }

  // Returns 'ped' | 'cop' | 'car' | 'none' and the point hit.
  function shoot(origin, direction, traffic, police, vehicles) {
    const w = weapon();
    if (reloadTimer > 0 || cooldown > 0 || ammo[w.id] <= 0) return { hit: 'none', point: null };
    ammo[w.id] -= 1;
    cooldown = w.fireRate;
    muzzleFlash(origin, direction);
    let best = null;
    let bestDist = w.range;
    // Each pellet is its own ray; the closest thing any pellet touches wins.
    for (let pellet = 0; pellet < w.pellets; pellet += 1) {
      const dir = jitter(direction, w.spread);
      // Pedestrians first: they are small, so test a generous sphere each.
      for (const ped of traffic.peds) {
        if (ped.dead) continue;
        const toPed = new THREE.Vector3().subVectors(ped.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), origin);
        const along = toPed.dot(dir);
        if (along < 0 || along > bestDist) continue;
        const closest = origin.clone().addScaledVector(dir, along);
        const d = closest.distanceTo(ped.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)));
        if (d < 1.2) { best = { kind: 'ped', target: ped, point: closest }; bestDist = along; }
      }
      // Then cars (parked, traffic and police): a box test through raycasting.
      const meshes = [];
      for (const car of vehicles.parked) meshes.push(car.mesh);
      for (const car of traffic.cars) meshes.push(car.mesh);
      const ray = new THREE.Raycaster(origin, dir, 0.1, w.range);
      const hits = ray.intersectObjects(meshes, true);
      if (hits.length > 0 && hits[0].distance < bestDist) {
        let object = hits[0].object;
        while (object.parent && object.parent !== scene) object = object.parent;
        const isPolice = object.children.some((c) => c.name === 'lightbar');
        best = { kind: isPolice ? 'cop' : 'car', point: hits[0].point };
        bestDist = hits[0].distance;
      }
    }
    if (best) return { hit: best.kind, point: best.point };
    return { hit: 'none', point: origin.clone().addScaledVector(direction, w.range) };
  }

  // A punch lands on the nearest living ped inside the arc in front.
  function punch(origin, heading, traffic) {
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    let best = null;
    let bestDist = 2.2;
    for (const ped of traffic.peds) {
      if (ped.dead) continue;
      const toPed = new THREE.Vector3().subVectors(ped.mesh.position, origin);
      const dist = toPed.length();
      if (dist > bestDist) continue;
      toPed.y = 0;
      toPed.normalize();
      if (toPed.dot(forward) < Math.cos(1.1)) continue;
      best = ped;
      bestDist = dist;
    }
    if (!best) return null;
    // Shove the victim away from the player.
    const away = new THREE.Vector3().subVectors(best.mesh.position, origin).setY(0).normalize();
    best.mesh.position.addScaledVector(away, 1.5);
    return best;
  }

  return {
    shoot,
    punch,
    // The weapon wheel: switch by index (keys 1-4). Only owned weapons.
    switchWeapon(index) {
      if (index < 0 || index >= WEAPONS.length) return false;
      if (!owned[WEAPONS[index].id]) return false;
      if (index === current) return true;
      current = index;
      reloadTimer = 0;
      return true;
    },
    currentWeapon() { return weapon(); },
    weaponList() {
      return WEAPONS.map((w, i) => ({
        id: w.id, name: w.name, owned: owned[w.id] === true,
        ammo: ammo[w.id], magSize: w.magSize, active: i === current,
      }));
    },
    buyWeapon(id) {
      if (!WEAPONS.some((w) => w.id === id)) return false;
      owned[id] = true;
      ammo[id] = WEAPONS.find((w) => w.id === id).magSize;
      return true;
    },
    ownsWeapon(id) { return owned[id] === true; },
    refillAmmo() {
      for (const w of WEAPONS) ammo[w.id] = w.magSize;
    },
    getAmmo() { return ammo[weapon().id]; },
    getAmmoFor(id) { return ammo[id] ?? 0; },
    reload() {
      const w = weapon();
      if (reloadTimer > 0 || ammo[w.id] === w.magSize) return false;
      reloadTimer = 1.1;
      return true;
    },
    update(dt) {
      if (cooldown > 0) cooldown -= dt;
      if (reloadTimer > 0) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) ammo[weapon().id] = weapon().magSize;
      }
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0 && flash) flash.intensity = 0;
      }
    },
    wantedFor(hit) {
      if (hit === 'ped') return WANTED.shootPed;
      if (hit === 'cop') return WANTED.shootCop;
      return 0;
    },
    getState() {
      return { current, owned: { ...owned }, ammo: { ...ammo } };
    },
    setState(data) {
      // No data (a fresh game) resets to the starting loadout: pistol only.
      if (!data) {
        current = 0;
        for (const w of WEAPONS) {
          owned[w.id] = w.id === 'pistol';
          ammo[w.id] = w.magSize;
        }
        return;
      }
      if (typeof data.current === 'number') current = Math.max(0, Math.min(WEAPONS.length - 1, data.current));
      if (data.owned) for (const w of WEAPONS) owned[w.id] = data.owned[w.id] === true || w.id === 'pistol';
      if (data.ammo) for (const w of WEAPONS) ammo[w.id] = typeof data.ammo[w.id] === 'number' ? data.ammo[w.id] : w.magSize;
    },
  };
}
