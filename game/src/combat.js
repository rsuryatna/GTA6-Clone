// Fists and the pistol: punching arcs in front of the player, hitscan shots
// from the camera, ammo, reload, and the muzzle flash. Combat reports what it
// hit so the game can raise the wanted level and play the right sound.
import * as THREE from 'three';
import { PLAYER, WANTED } from './config.js';

export function createCombat(scene, camera) {
  let ammo = PLAYER.pistolAmmo;
  let reloadTimer = 0;
  let flash = null;
  let flashTimer = 0;

  function muzzleFlash(position, direction) {
    if (!flash) {
      flash = new THREE.PointLight(0xffc861, 0, 14, 1.5);
      scene.add(flash);
    }
    flash.position.copy(position).addScaledVector(direction, 1.2);
    flash.intensity = 60;
    flashTimer = 0.06;
  }

  // Returns 'ped' | 'cop' | 'car' | 'none' and the point hit.
  function shoot(origin, direction, traffic, police, vehicles) {
    if (reloadTimer > 0 || ammo <= 0) return { hit: 'none', point: null };
    ammo -= 1;
    muzzleFlash(origin, direction);
    const ray = new THREE.Raycaster(origin, direction, 0.1, PLAYER.pistolRange);
    // Pedestrians first: they are small, so test a generous sphere each.
    let best = null;
    let bestDist = PLAYER.pistolRange;
    for (const ped of traffic.peds) {
      if (ped.dead) continue;
      const toPed = new THREE.Vector3().subVectors(ped.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), origin);
      const along = toPed.dot(direction);
      if (along < 0 || along > bestDist) continue;
      const closest = origin.clone().addScaledVector(direction, along);
      const d = closest.distanceTo(ped.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)));
      if (d < 1.2) { best = { kind: 'ped', target: ped, point: closest }; bestDist = along; }
    }
    // Then cars (parked, traffic and police): a box test through raycasting.
    const meshes = [];
    for (const car of vehicles.parked) meshes.push(car.mesh);
    for (const car of traffic.cars) meshes.push(car.mesh);
    const hits = ray.intersectObjects(meshes, true);
    if (hits.length > 0 && hits[0].distance < bestDist) {
      let object = hits[0].object;
      while (object.parent && object.parent !== scene) object = object.parent;
      const isPolice = object.children.some((c) => c.name === 'lightbar');
      return { hit: isPolice ? 'cop' : 'car', point: hits[0].point };
    }
    if (best) return { hit: best.kind, point: best.point };
    return { hit: 'none', point: origin.clone().addScaledVector(direction, PLAYER.pistolRange) };
  }

  // A punch lands on the nearest living ped inside the arc in front.
  function punch(origin, heading, traffic) {
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    let best = null;
    let bestDist = PLAYER.punchRange;
    for (const ped of traffic.peds) {
      if (ped.dead) continue;
      const toPed = new THREE.Vector3().subVectors(ped.mesh.position, origin);
      const dist = toPed.length();
      if (dist > bestDist) continue;
      toPed.y = 0;
      toPed.normalize();
      if (toPed.dot(forward) < Math.cos(PLAYER.punchArc)) continue;
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
    getAmmo() { return ammo; },
    reload() {
      if (reloadTimer > 0 || ammo === PLAYER.pistolAmmo) return false;
      reloadTimer = 1.1;
      return true;
    },
    update(dt) {
      if (reloadTimer > 0) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) ammo = PLAYER.pistolAmmo;
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
  };
}
