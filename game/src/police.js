// The Solmarina PD: wanted stars, pursuing cruisers and getting busted.
// Stars rise with crimes and fade when the player lies low; cruisers spawn at
// the city edge, chase the player, ram to slow them down, and bust the player
// when they pin them. The system only ever reads the shared game state.
import * as THREE from 'three';
import { CITY, POLICE } from './config.js';
import { makeCarMesh } from './vehicles.js';

export function createPolice(scene, world, rng, callbacks) {
  const cruisers = [];
  let wanted = 0;
  let quietTimer = 0;
  let bustTimer = 0;
  let flashTimer = 0;

  function spawnCruiser() {
    const mesh = makeCarMesh(POLICE_COLOR, true);
    // Appear on a street at the city edge, away from the player's view.
    const angle = rng() * Math.PI * 2;
    const x = Math.cos(angle) * (CITY.halfSize - 20);
    const z = Math.sin(angle) * (CITY.halfSize - 20);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const cruiser = { mesh, heading: 0, speed: 0, ramCooldown: 0 };
    cruisers.push(cruiser);
    return cruiser;
  }

  function addWanted(stars) {
    if (stars <= 0) return;
    wanted = Math.min(5, wanted + stars);
    quietTimer = 0;
    callbacks.onWanted(wanted);
  }

  function update(dt, playerPos, playerSpeed, playerInCar, onBusted) {
    // Wanted fades after lying low: no new crime for POLICE.decaySeconds.
    if (wanted > 0) {
      quietTimer += dt;
      if (quietTimer > POLICE.decaySeconds) {
        wanted = Math.max(0, wanted - 1);
        quietTimer = 0;
        callbacks.onWanted(wanted);
      }
    }
    // Cruiser count follows the stars: one per star, capped.
    const want = Math.min(POLICE.maxCars, wanted);
    while (cruisers.length < want) spawnCruiser();
    while (cruisers.length > want) {
      const removed = cruisers.pop();
      scene.remove(removed.mesh);
    }

    let nearest = Infinity;
    for (const cruiser of cruisers) {
      const dx = playerPos.x - cruiser.mesh.position.x;
      const dz = playerPos.z - cruiser.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      // Pursuit steering: aim at the player, faster than traffic.
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - cruiser.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cruiser.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      cruiser.speed = Math.min(POLICE.chaseSpeed, cruiser.speed + 14 * dt);
      cruiser.mesh.position.x += Math.sin(cruiser.heading) * cruiser.speed * dt;
      cruiser.mesh.position.z += Math.cos(cruiser.heading) * cruiser.speed * dt;
      cruiser.mesh.rotation.y = cruiser.heading;
      world.resolveCircle(cruiser.mesh.position, 1.6);
      // Ram: slow the player's car and hurt a player on foot.
      if (cruiser.ramCooldown > 0) cruiser.ramCooldown -= dt;
      if (dist < 3.4 && cruiser.ramCooldown <= 0) {
        cruiser.ramCooldown = 1.2;
        cruiser.speed *= 0.3;
        callbacks.onRam(dist, playerInCar);
      }
    }

    // Busted: a cruiser pins a slow or stationary player.
    if (wanted > 0 && nearest < POLICE.bustRadius && playerSpeed < 3) {
      bustTimer += dt;
      if (bustTimer > POLICE.bustTime) {
        bustTimer = 0;
        onBusted();
      }
    } else {
      bustTimer = Math.max(0, bustTimer - dt * 2);
    }

    // Flash the light bars red/blue.
    flashTimer += dt;
    const phase = Math.floor(flashTimer * 6) % 2 === 0;
    for (const cruiser of cruisers) {
      const bar = cruiser.mesh.getObjectByName('lightbar');
      if (bar) bar.material.color.setHex(phase ? 0xff2222 : 0x2266ff);
    }
    return { nearest, bustProgress: bustTimer / POLICE.bustTime };
  }

  return {
    update,
    addWanted,
    clearWanted() {
      wanted = 0;
      quietTimer = 0;
      bustTimer = 0;
      callbacks.onWanted(0);
    },
    getWanted() { return wanted; },
    setWanted(stars) {
      wanted = Math.max(0, Math.min(5, stars));
      quietTimer = 0;
      callbacks.onWanted(wanted);
    },
    cruiserCount() { return cruisers.length; },
    // Staging helper for the ?shot=chase screenshot: move the nearest
    // cruiser to a chosen spot so the chase reads in a single frame.
    placeNearest(x, z, heading) {
      if (cruisers.length === 0) return;
      let best = cruisers[0];
      let bestDist = Infinity;
      for (const cruiser of cruisers) {
        const d = Math.hypot(cruiser.mesh.position.x - x, cruiser.mesh.position.z - z);
        if (d < bestDist) { bestDist = d; best = cruiser; }
      }
      best.mesh.position.set(x, 0, z);
      best.heading = heading;
      best.speed = 20;
    },
  };
}

const POLICE_COLOR = 0x1a2a4a;
