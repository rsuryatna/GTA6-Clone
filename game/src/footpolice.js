// SOLMARINA — footpolice.js
// One job: police on foot. Officers patrol the avenues, walk up to Jules
// when his wanted level rises, and try to arrest him — a slow approach, a
// grab, and a busted screen if they hold him. They never teleport.

const THREE = window.THREE;
import { makePedestrian } from './human.js';

export function createFootPolice(scene, world, rng, player, police) {
  const officers = [];
  for (let i = 0; i < 8; i++) {
    const look = { shirt: 0x1c2a44, pants: 0x1c2a44, hair: 0x1a1210, skin: rng.pick([0xd9a066, 0x8c5a3b, 0xe8b98a]) };
    const ped = makePedestrian(rng, { look });
    // A police cap: a dark disc on the head.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.18, 0.07, 12),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 }),
    );
    cap.position.y = 1.76;
    ped.group.add(cap);
    const badge = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 8),
      new THREE.MeshStandardMaterial({ color: 0xf7c948, metalness: 0.9, roughness: 0.3 }),
    );
    badge.position.set(-0.12, 1.32, 0.14);
    ped.group.add(badge);
    const spot = world.randomRoadPoint(rng);
    ped.group.position.set(spot.x, 0, spot.z);
    scene.add(ped.group);
    officers.push({ ped, state: 'patrol', target: null, holdT: 0 });
  }

  return {
    officers,
    update(dt) {
      for (const o of officers) {
        const pos = o.ped.group.position;
        const d = Math.hypot(player.position.x - pos.x, player.position.z - pos.z);
        if (police.wanted > 0 && d < 45) o.state = 'pursue';
        else if (police.wanted === 0 && d > 60) o.state = 'patrol';
        if (o.state === 'pursue') {
          const heading = Math.atan2(player.position.x - pos.x, player.position.z - pos.z);
          o.ped.group.rotation.y = heading;
          const speed = 4.6;
          pos.x += Math.sin(heading) * speed * dt;
          pos.z += Math.cos(heading) * speed * dt;
          o.ped.animate(dt, true);
          if (d < 1.6 && player.onFoot) {
            o.holdT += dt;
            if (o.holdT > 2.2) {
              o.holdT = 0;
              return { busted: true };
            }
          } else {
            o.holdT = 0;
          }
        } else {
          // Patrol: pick a road point, walk to it, pick another.
          if (!o.target) {
            const spot = world.randomRoadPoint(rng);
            o.target = { x: spot.x, z: spot.z };
          }
          const dx = o.target.x - pos.x;
          const dz = o.target.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 2) {
            o.target = null;
            o.ped.animate(dt, false);
            continue;
          }
          const heading = Math.atan2(dx, dz);
          o.ped.group.rotation.y = heading;
          pos.x += Math.sin(heading) * 1.6 * dt;
          pos.z += Math.cos(heading) * 1.6 * dt;
          o.ped.animate(dt, true);
        }
      }
      return null;
    },
    // Officers near the player, for the HUD's "heat" readout.
    nearbyCount(radius) {
      let n = 0;
      for (const o of officers) {
        const d = Math.hypot(o.ped.group.position.x - player.position.x, o.ped.group.position.z - player.position.z);
        if (d < radius) n++;
      }
      return n;
    },
    // Stage officers around the player for a screenshot.
    gatherNear(x, z, n) {
      let placed = 0;
      for (const o of officers) {
        if (placed >= n) break;
        const a = (placed / n) * Math.PI * 2;
        o.ped.group.position.set(x + Math.cos(a) * 6, 0, z + Math.sin(a) * 6);
        o.ped.group.rotation.y = Math.atan2(x - o.ped.group.position.x, z - o.ped.group.position.z);
        o.state = 'pursue';
        placed++;
      }
      return placed;
    },
    // How many officers are in pursuit right now.
    pursuingCount() {
      return officers.filter((o) => o.state === 'pursue').length;
    },
  };
}
