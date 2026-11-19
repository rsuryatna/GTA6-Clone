// The Solmarina PD: wanted stars, pursuing cruisers, the police helicopter
// and roadblocks — and getting busted. Stars rise with crimes and fade when
// the player lies low; cruisers spawn at the city edge, chase the player,
// ram to slow them down, and bust the player when they pin them. At four
// stars a helicopter joins the hunt and circles overhead, its searchlight
// on the player, and while it is up the heat never fades. At three stars
// the PD throws roadblocks across the road ahead. The system only ever
// reads the shared game state.
import * as THREE from 'three';
import { CITY, HELI, POLICE, ROADBLOCK } from './config.js';
import { makeCarMesh } from './vehicles.js';

// The PD's dark-navy paint, shared by cruisers and the helicopter.
const POLICE_COLOR = 0x1a2a4a;

export function createPolice(scene, world, rng, callbacks) {
  const cruisers = [];
  let wanted = 0;
  let quietTimer = 0;
  let bustTimer = 0;
  let flashTimer = 0;

  // --- the helicopter ---
  const heli = { mesh: null, rotor: null, light: null, active: false, angle: 0 };
  function buildHeli() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 1.8), bodyMat);
    body.castShadow = true;
    group.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.7), new THREE.MeshLambertMaterial({ color: 0x1a2733 }));
    glass.position.set(0, 0.2, 0.9);
    group.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), bodyMat);
    tail.position.set(0, 0.3, -2.8);
    group.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.8), bodyMat);
    fin.position.set(0, 0.7, -4.6);
    group.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), darkMat);
    rotor.position.y = 1.1;
    rotor.name = 'rotor';
    group.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), darkMat);
    tailRotor.position.set(0.35, 0.7, -4.6);
    group.add(tailRotor);
    for (const x of [-1.2, 1.2]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.6), darkMat);
      skid.position.set(x, -0.95, 0);
      group.add(skid);
    }
    // The searchlight: a real spotlight aimed at the player, plus a pale
    // cone so the beam reads from the ground.
    const spot = new THREE.SpotLight(0xfff2b0, 900, 220, 0.32, 0.5, 1.2);
    spot.position.set(0, 0, 0);
    group.add(spot);
    group.add(spot.target);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(9, HELI.altitude, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.y = -HELI.altitude / 2;
    cone.rotation.x = Math.PI;
    group.add(cone);
    group.visible = false;
    scene.add(group);
    return { mesh: group, rotor, light: spot };
  }
  const heliParts = buildHeli();
  heli.mesh = heliParts.mesh;
  heli.rotor = heliParts.rotor;
  heli.light = heliParts.light;

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

  // --- roadblocks: barriers plus a parked cruiser, across the road ahead ---
  const roadblocks = [];
  let roadblockTimer = 0;
  function buildBarrier() {
    const group = new THREE.Group();
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
    for (let i = 0; i < 3; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.25), i % 2 === 0 ? stripeMat : whiteMat);
      bar.position.set(-3 + i * 3, 0.9, 0);
      bar.castShadow = true;
      group.add(bar);
    }
    for (const x of [-4.2, 4.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), whiteMat);
      leg.position.set(x, 0.45, 0);
      group.add(leg);
    }
    return group;
  }
  function spawnRoadblock(x, z, heading) {
    const group = new THREE.Group();
    const barrier = buildBarrier();
    group.add(barrier);
    const cruiserMesh = makeCarMesh(POLICE_COLOR, true);
    cruiserMesh.position.set(0, 0, -4);
    cruiserMesh.rotation.y = 0;
    group.add(cruiserMesh);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    scene.add(group);
    // The barriers block the road: register their footprint as a collider.
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const hw = ROADBLOCK.width / 2;
    const box = {
      minX: x - Math.abs(cos) * hw - Math.abs(sin) * 1.5,
      maxX: x + Math.abs(cos) * hw + Math.abs(sin) * 1.5,
      minZ: z - Math.abs(sin) * hw - Math.abs(cos) * 1.5,
      maxZ: z + Math.abs(sin) * hw + Math.abs(cos) * 1.5,
    };
    world.addCollider(box);
    roadblocks.push({ group, box });
  }
  function clearRoadblocks() {
    for (const rb of roadblocks) {
      scene.remove(rb.group);
      world.removeCollider(rb.box);
    }
    roadblocks.length = 0;
  }

  function update(dt, playerPos, playerSpeed, playerInCar, onBusted) {
    // Wanted fades after lying low: no new crime for POLICE.decaySeconds.
    // The helicopter keeps eyes on the player, so the heat never fades
    // while it is overhead.
    if (wanted > 0 && !heli.active) {
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

    // --- the helicopter: out at four stars, circling the player ---
    const wantHeli = wanted >= 4;
    if (wantHeli && !heli.active) {
      heli.active = true;
      heli.mesh.visible = true;
      heli.mesh.position.set(playerPos.x + 20, HELI.altitude, playerPos.z - 20);
      heli.angle = 0;
    } else if (!wantHeli && heli.active) {
      heli.active = false;
      heli.mesh.visible = false;
    }
    if (heli.active) {
      heli.angle += dt * 0.35;
      const radius = 26;
      const tx = playerPos.x + Math.cos(heli.angle) * radius;
      const tz = playerPos.z + Math.sin(heli.angle) * radius;
      const dx = tx - heli.mesh.position.x;
      const dz = tz - heli.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const speed = Math.min(HELI.cruiseSpeed, Math.max(HELI.followSpeed, dist * 0.8));
      if (dist > 0.5) {
        heli.mesh.position.x += (dx / dist) * speed * dt;
        heli.mesh.position.z += (dz / dist) * speed * dt;
      }
      heli.mesh.position.y = HELI.altitude;
      heli.mesh.rotation.y = Math.atan2(playerPos.x - heli.mesh.position.x, playerPos.z - heli.mesh.position.z);
      heli.rotor.rotation.y += HELI.rotorSpeed * dt;
      heli.light.target.position.set(playerPos.x - heli.mesh.position.x, -HELI.altitude, playerPos.z - heli.mesh.position.z);
      heli.light.target.updateMatrixWorld();
    }

    // --- roadblocks: at three stars, across the road ahead ---
    roadblockTimer -= dt;
    if (wanted >= ROADBLOCK.minWanted && roadblockTimer <= 0) {
      roadblockTimer = 8;
      if (roadblocks.length < ROADBLOCK.maxGroups) {
        // Ahead of the player, on the nearest street line, leaving a gap
        // on one side so the player can always steer around.
        const streets = world.streets;
        let nearestStreet = streets[0];
        let bestStreetDist = Infinity;
        for (const s of streets) {
          const d = Math.min(Math.abs(playerPos.x - s), Math.abs(playerPos.z - s));
          if (d < bestStreetDist) { bestStreetDist = d; nearestStreet = s; }
        }
        // The nearest street is vertical (x = s, road runs along z) when the
        // player is closer to it in x than in z.
        const verticalStreet = Math.abs(playerPos.x - nearestStreet) < Math.abs(playerPos.z - nearestStreet);
        const ahead = ROADBLOCK.aheadDistance;
        const px = verticalStreet ? nearestStreet : playerPos.x + ahead * 0.6;
        const pz = verticalStreet ? playerPos.z + ahead * 0.6 : nearestStreet;
        // A vertical street's road runs along z, so the barrier spans x
        // (heading 0); a horizontal street's road runs along x (heading 90°).
        const heading = verticalStreet ? 0 : Math.PI / 2;
        const gapSide = rng() < 0.5 ? -1 : 1;
        spawnRoadblock(px + (verticalStreet ? gapSide * 3 : 0), pz + (verticalStreet ? 0 : gapSide * 3), heading);
      }
    }
    if (wanted < ROADBLOCK.minWanted && roadblocks.length > 0) clearRoadblocks();

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
    heliActive() { return heli.active; },
    roadblockCount() { return roadblocks.length; },
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
    // Staging helper: park the helicopter over a chosen spot for the shot,
    // and point its orbit there (px/pz is the player's position) so it
    // stays put instead of drifting back to wherever its orbit angle was.
    placeHeli(x, z, px = 0, pz = 0) {
      if (!heli.active) {
        heli.active = true;
        heli.mesh.visible = true;
      }
      heli.mesh.position.set(x, HELI.altitude, z);
      heli.angle = Math.atan2(z - pz, x - px);
    },
  };
}
