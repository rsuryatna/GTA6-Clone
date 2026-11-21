// Solmarina PD, rewritten — heat, pursuit, air support and traps.
//
// How this build works, in one paragraph: the department tracks a heat
// level of zero to five stars. Crimes push it up; lying low lets it bleed
// away one star at a time, unless the helicopter is overhead keeping eyes
// on the player. Each star puts one more cruiser on the road, up to five.
// A cruiser runs a little pursuit state machine — it closes the distance,
// presses the player once it is close, and swings for a PIT spin when the
// player is alongside it at speed. Ramming slows the player's car and
// hurts a player on foot. Pin a slow player for long enough and the PD
// makes the arrest. At four stars the helicopter comes up and circles;
// at three stars the PD starts throwing barricades across the road ahead;
// at five stars it adds spike strips that shred tyres.
//
// The module never touches the rest of the game directly: it reads the
// shared world for streets and collision, and talks to main.js only
// through the callbacks it was handed and the object it returns.
import * as THREE from 'three';
import { CITY, HELI, POLICE, ROADBLOCK, SPIKES, PALETTE } from './config.js';
import { makeCarMesh } from './vehicles.js';

const TAU = Math.PI * 2;

// Fold any angle back into [-PI, PI] without a loop.
function foldAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function limit(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export function createPolice(scene, world, rng, callbacks) {
  // ---------------------------------------------------------------- heat
  // stars: current wanted level. quietFor: seconds since the last crime
  // (heat only fades once this passes the decay window). pinnedFor: how
  // long a cruiser has held a slow player — the arrest clock.
  let stars = 0;
  let quietFor = 0;
  let pinnedFor = 0;

  // ------------------------------------------------------- player motion
  // The pursuit predicts where the player will be, so the PD estimates
  // the player's velocity from frame-to-frame position changes.
  const motion = { x: 0, z: 0, vx: 0, vz: 0, known: false };

  function trackMotion(pos, dt) {
    if (dt <= 0) return;
    if (!motion.known) {
      motion.x = pos.x;
      motion.z = pos.z;
      motion.known = true;
      return;
    }
    const nx = (pos.x - motion.x) / dt;
    const nz = (pos.z - motion.z) / dt;
    // A light low-pass keeps one jittery frame from throwing the aim off.
    motion.vx += (nx - motion.vx) * 0.5;
    motion.vz += (nz - motion.vz) * 0.5;
    motion.x = pos.x;
    motion.z = pos.z;
  }

  // ------------------------------------------------------------- cruisers
  // One cruiser per star. A unit's mode is its pursuit state:
  //   hunt  — closing in from a distance, steering at a predicted point
  //   press — right on the player, looking for a ram
  //   swing — committed to a PIT move, aiming at the rear quarter
  // modeClock counts down the swing; ramWait / pitWait are cooldowns.
  const fleet = [];
  let strobe = 0;

  function nearestStreetLine(x, z) {
    // Which street line is closest, and does that street run along z
    // (a vertical street, x = line) or along x (a horizontal street)?
    let bestV = null;
    let bestH = null;
    for (const s of world.streets) {
      const dv = Math.abs(x - s);
      if (bestV === null || dv < bestV.d) bestV = { line: s, d: dv };
      const dh = Math.abs(z - s);
      if (bestH === null || dh < bestH.d) bestH = { line: s, d: dh };
    }
    if (bestV.d <= bestH.d) return { line: bestV.line, alongZ: true };
    return { line: bestH.line, alongZ: false };
  }

  function spawnCruiser(target) {
    const mesh = makeCarMesh(PALETTE.police, true, false);
    // Join the chase on a ring around the player, snapped onto the
    // nearest street so the cruiser arrives on a road, not through a
    // building. A random bearing keeps the arrivals unpredictable.
    const bearing = rng() * TAU;
    const ring = 85;
    let px = target.x + Math.cos(bearing) * ring;
    let pz = target.z + Math.sin(bearing) * ring;
    const edge = CITY.halfSize - 12;
    px = limit(px, -edge, edge);
    pz = limit(pz, -edge, edge);
    const street = nearestStreetLine(px, pz);
    if (street.alongZ) px = street.line;
    else pz = street.line;
    mesh.position.set(px, 0, pz);
    scene.add(mesh);
    const unit = {
      mesh,
      heading: Math.atan2(target.x - px, target.z - pz),
      speed: 0,
      mode: 'hunt',
      modeClock: 0,
      ramWait: 0,
      pitWait: 0,
      strobeOffset: rng(),
    };
    fleet.push(unit);
    return unit;
  }

  function syncFleet(target) {
    const want = Math.min(POLICE.maxCars, target);
    while (fleet.length < want) spawnCruiser({ x: motion.x, z: motion.z });
    while (fleet.length > want) {
      const gone = fleet.pop();
      scene.remove(gone.mesh);
    }
  }

  // Steer a unit toward a point, capped at the given turn rate.
  function turnToward(unit, tx, tz, dt, rate) {
    const want = Math.atan2(tx - unit.mesh.position.x, tz - unit.mesh.position.z);
    const diff = foldAngle(want - unit.heading);
    unit.heading += limit(diff, -rate * dt, rate * dt);
  }

  function driveUnit(unit, dt, target, targetSpeed, inCar) {
    const pos = unit.mesh.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (unit.ramWait > 0) unit.ramWait -= dt;
    if (unit.pitWait > 0) unit.pitWait -= dt;
    if (unit.modeClock > 0) unit.modeClock -= dt;

    if (unit.mode === 'swing') {
      // PIT: the cruiser is committed to the player's rear quarter.
      // Aim just behind the player, on the cruiser's side, so the nose
      // clips the rear and spins the car.
      const fwdX = motion.vx;
      const fwdZ = motion.vz;
      const fLen = Math.hypot(fwdX, fwdZ) || 1;
      const rearX = target.x - (fwdX / fLen) * 4;
      const rearZ = target.z - (fwdZ / fLen) * 4;
      const side = (pos.x - target.x) * (fwdZ / fLen) - (pos.z - target.z) * (fwdX / fLen) >= 0 ? 1 : -1;
      const aimX = rearX - (fwdZ / fLen) * 1.5 * side;
      const aimZ = rearZ + (fwdX / fLen) * 1.5 * side;
      turnToward(unit, aimX, aimZ, dt, 3.2);
      unit.speed = Math.min(POLICE.chaseSpeed, unit.speed + 16 * dt);
      if (unit.modeClock <= 0) unit.mode = dist < 9 ? 'press' : 'hunt';
    } else if (unit.mode === 'press') {
      // On the player's bumper: match the chase, look for a ram, and
      // watch for the moment to swing into a PIT.
      turnToward(unit, target.x, target.z, dt, 2.8);
      unit.speed = Math.min(POLICE.chaseSpeed, unit.speed + 14 * dt);
      if (dist < 3.4 && unit.ramWait <= 0) {
        unit.ramWait = 1.2;
        unit.speed *= 0.3;
        callbacks.onRam(dist, inCar);
      }
      if (
        inCar && targetSpeed > 16 && dist > 2.2 && dist < 4.5
        && unit.pitWait <= 0
      ) {
        unit.pitWait = 3;
        unit.mode = 'swing';
        unit.modeClock = 0.9;
        if (callbacks.onPit) callbacks.onPit(dist, inCar);
      }
      if (dist > 14) unit.mode = 'hunt';
    } else {
      // Hunt: close the gap, steering at where the player is about to
      // be rather than where they are right now.
      const lead = limit(dist / POLICE.chaseSpeed, 0, 1.2);
      const aimX = target.x + motion.vx * lead;
      const aimZ = target.z + motion.vz * lead;
      turnToward(unit, aimX, aimZ, dt, 2.4);
      unit.speed = Math.min(POLICE.chaseSpeed, unit.speed + 14 * dt);
      if (dist < 9) unit.mode = 'press';
    }

    pos.x += Math.sin(unit.heading) * unit.speed * dt;
    pos.z += Math.cos(unit.heading) * unit.speed * dt;
    unit.mesh.rotation.y = unit.heading;
    world.resolveCircle(pos, 1.6);
    return dist;
  }

  function flashLightbars(dt) {
    // The light bars strobe red/blue; each cruiser is slightly out of
    // phase with the others so the chase does not blink in unison.
    strobe += dt;
    for (const unit of fleet) {
      const bar = unit.mesh.getObjectByName('lightbar');
      if (!bar) continue;
      const red = Math.floor((strobe + unit.strobeOffset) * 6) % 2 === 0;
      bar.material.color.setHex(red ? 0xff2222 : 0x2266ff);
    }
  }

  // ------------------------------------------------------------ helicopter
  // The air unit only exists as a rig once built; flying flips it on.
  // phase is its position around the orbit circle.
  const air = { rig: null, blades: null, lamp: null, flying: false, phase: 0 };

  function buildAirUnit() {
    const rig = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: PALETTE.police });
    const dark = new THREE.MeshLambertMaterial({ color: 0x141414 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 1.8), navy);
    body.castShadow = true;
    rig.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.7), glass);
    nose.position.set(0, 0.2, 0.9);
    rig.add(nose);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), navy);
    boom.position.set(0, 0.3, -2.8);
    rig.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.8), navy);
    fin.position.set(0, 0.7, -4.6);
    rig.add(fin);
    const blades = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), dark);
    blades.position.y = 1.1;
    rig.add(blades);
    const tailBlades = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), dark);
    tailBlades.position.set(0.35, 0.7, -4.6);
    rig.add(tailBlades);
    for (const side of [-1.2, 1.2]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.6), dark);
      skid.position.set(side, -0.95, 0);
      rig.add(skid);
    }

    // Searchlight: a real spotlight plus a faint translucent cone so
    // the beam itself reads from street level.
    const lamp = new THREE.SpotLight(0xfff2b0, 900, 220, 0.32, 0.5, 1.2);
    rig.add(lamp);
    rig.add(lamp.target);
    const beamGeo = new THREE.ConeGeometry(9, HELI.altitude, 16, 1, true);
    beamGeo.rotateX(Math.PI);
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.07,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beam.position.y = -HELI.altitude / 2;
    rig.add(beam);

    rig.visible = false;
    scene.add(rig);
    return { rig, blades, lamp };
  }

  const airParts = buildAirUnit();
  air.rig = airParts.rig;
  air.blades = airParts.blades;
  air.lamp = airParts.lamp;

  function flyHeli(dt, target) {
    const wantUp = stars >= 4;
    if (wantUp && !air.flying) {
      air.flying = true;
      air.rig.visible = true;
      air.rig.position.set(target.x + 20, HELI.altitude, target.z - 20);
      air.phase = 0;
    } else if (!wantUp && air.flying) {
      air.flying = false;
      air.rig.visible = false;
    }
    if (!air.flying) return;
    // Circle the player, easing toward the next orbit point rather than
    // chasing it at a fixed speed, so the motion stays smooth.
    air.phase += dt * 0.35;
    const orbitR = 26;
    const goalX = target.x + Math.cos(air.phase) * orbitR;
    const goalZ = target.z + Math.sin(air.phase) * orbitR;
    const ease = 1 - Math.exp(-dt * 1.5);
    air.rig.position.x += (goalX - air.rig.position.x) * ease;
    air.rig.position.z += (goalZ - air.rig.position.z) * ease;
    air.rig.position.y = HELI.altitude;
    air.rig.rotation.y = Math.atan2(
      target.x - air.rig.position.x,
      target.z - air.rig.position.z,
    );
    air.blades.rotation.y += HELI.rotorSpeed * dt;
    // Keep the searchlight pinned on the player.
    air.lamp.target.position.set(
      target.x - air.rig.position.x,
      -HELI.altitude,
      target.z - air.rig.position.z,
    );
    air.lamp.target.updateMatrixWorld();
  }

  // -------------------------------------------------------------- roadblocks
  // A barricade group: two angled sawhorses, a pair of cones and a
  // cruiser parked behind them. The group registers an axis-aligned
  // collider box so the player cannot drive through the barriers.
  const barricades = [];
  const trapClock = { block: 0, strip: 0 };

  function buildBarricadeMesh() {
    const group = new THREE.Group();
    const amber = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
    const pale = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
    const horseGeo = new THREE.BoxGeometry(3.4, 0.5, 0.25);
    for (let i = 0; i < 2; i += 1) {
      const horse = new THREE.Mesh(horseGeo, i === 0 ? amber : pale);
      horse.position.set(i === 0 ? -2.2 : 2.2, 0.9, i === 0 ? 0.4 : -0.4);
      horse.rotation.y = i === 0 ? 0.25 : -0.25;
      horse.castShadow = true;
      group.add(horse);
    }
    const coneGeo = new THREE.ConeGeometry(0.35, 0.9, 8);
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
    for (const cx of [-4.4, 4.4]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(cx, 0.45, 0);
      group.add(cone);
    }
    return group;
  }

  function colliderFor(x, z, heading, halfW, halfD) {
    // Rotate the rectangle's corners into the world and take the
    // axis-aligned box that contains them.
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const corners = [
      [-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD],
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [lx, lz] of corners) {
      const wx = x + lx * c + lz * s;
      const wz = z - lx * s + lz * c;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }
    return { minX, maxX, minZ, maxZ };
  }

  function deployBarricade(x, z, heading) {
    const group = new THREE.Group();
    group.add(buildBarricadeMesh());
    const parked = makeCarMesh(PALETTE.police, true, false);
    parked.position.set(0, 0, -4.5);
    group.add(parked);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    scene.add(group);
    const box = colliderFor(x, z, heading, ROADBLOCK.width / 2, 1.5);
    world.addCollider(box);
    barricades.push({ group, box });
  }

  function removeBarricades() {
    for (const rb of barricades) {
      scene.remove(rb.group);
      world.removeCollider(rb.box);
    }
    barricades.length = 0;
  }

  // ------------------------------------------------------------ spike strips
  // A low mat with two staggered rows of steel teeth. It does not block
  // the car — main.js asks onSpikes() every frame while driving, and a
  // hit pops the tyres until the car crawls off the strip.
  const strips = [];

  function buildStripMesh() {
    const group = new THREE.Group();
    const mat = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.12, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    mat.position.y = 0.06;
    group.add(mat);
    const toothGeo = new THREE.ConeGeometry(0.12, 0.5, 4);
    const toothMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    for (let row = 0; row < 2; row += 1) {
      const zOff = row === 0 ? -0.32 : 0.32;
      const xStart = row === 0 ? -3.5 : -3.0;
      for (let x = xStart; x <= 3.5; x += 1) {
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(x, 0.35, zOff);
        group.add(tooth);
      }
    }
    return group;
  }

  function deployStrip(x, z, heading) {
    const group = buildStripMesh();
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    scene.add(group);
    strips.push({ group, x, z, heading });
  }

  function removeStrips() {
    for (const strip of strips) scene.remove(strip.group);
    strips.length = 0;
  }

  function onSpikes(x, z) {
    for (const strip of strips) {
      const dx = x - strip.x;
      const dz = z - strip.z;
      // The strip's local axes in the world: across is its long side,
      // along is the direction a car crosses it.
      const axX = Math.cos(strip.heading);
      const axZ = -Math.sin(strip.heading);
      const alX = Math.sin(strip.heading);
      const alZ = Math.cos(strip.heading);
      const across = dx * axX + dz * axZ;
      const along = dx * alX + dz * alZ;
      if (Math.abs(across) < SPIKES.width / 2 && Math.abs(along) < 1.2) return true;
    }
    return false;
  }

  // ------------------------------------------------------- trap placement
  // Both traps go on the street nearest the player, ahead of the player
  // along their direction of travel, with a gap left on one side so the
  // player can always steer around.
  function trapSite(aheadDistance) {
    const street = nearestStreetLine(motion.x, motion.z);
    const speed = Math.hypot(motion.vx, motion.vz);
    const travelX = speed > 1 ? motion.vx / speed : 0;
    const travelZ = speed > 1 ? motion.vz / speed : 1;
    const lead = aheadDistance * 0.6;
    let x;
    let z;
    let heading;
    let gapX = 0;
    let gapZ = 0;
    const gap = rng() < 0.5 ? -3 : 3;
    if (street.alongZ) {
      // Street runs along z: the trap sits on the line, ahead in z.
      x = street.line;
      z = motion.z + travelZ * lead;
      heading = 0;
      gapX = gap;
    } else {
      z = street.line;
      x = motion.x + travelX * lead;
      heading = Math.PI / 2;
      gapZ = gap;
    }
    return { x: x + gapX, z: z + gapZ, heading };
  }

  function manageTraps(dt) {
    trapClock.block -= dt;
    trapClock.strip -= dt;
    if (stars >= ROADBLOCK.minWanted && trapClock.block <= 0) {
      trapClock.block = 8;
      if (barricades.length < ROADBLOCK.maxGroups) {
        const site = trapSite(ROADBLOCK.aheadDistance);
        deployBarricade(site.x, site.z, site.heading);
      }
    }
    if (stars < ROADBLOCK.minWanted && barricades.length > 0) removeBarricades();
    if (stars >= SPIKES.minWanted && trapClock.strip <= 0) {
      trapClock.strip = 10;
      if (strips.length < SPIKES.maxGroups) {
        const site = trapSite(SPIKES.aheadDistance);
        deployStrip(site.x, site.z, site.heading);
      }
    }
    if (stars < SPIKES.minWanted && strips.length > 0) removeStrips();
  }

  // ------------------------------------------------------------------ heat
  function setStars(next) {
    stars = limit(next, 0, 5);
    quietFor = 0;
    callbacks.onWanted(stars);
  }

  function fadeHeat(dt) {
    // No new crime for the decay window and the heat drops a star —
    // unless the helicopter is up, in which case it never fades.
    if (stars <= 0 || air.flying) return;
    quietFor += dt;
    if (quietFor > POLICE.decaySeconds) {
      stars = Math.max(0, stars - 1);
      quietFor = 0;
      callbacks.onWanted(stars);
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt, playerPos, playerSpeed, playerInCar, onBusted) {
    trackMotion(playerPos, dt);
    fadeHeat(dt);
    syncFleet(stars);

    let nearest = Infinity;
    for (const unit of fleet) {
      const d = driveUnit(unit, dt, playerPos, playerSpeed, playerInCar);
      if (d < nearest) nearest = d;
    }
    flashLightbars(dt);

    // Busted: a cruiser pins a slow or stationary player.
    if (stars > 0 && nearest < POLICE.bustRadius && playerSpeed < 3) {
      pinnedFor += dt;
      if (pinnedFor > POLICE.bustTime) {
        pinnedFor = 0;
        onBusted();
      }
    } else {
      pinnedFor = Math.max(0, pinnedFor - dt * 2);
    }

    flyHeli(dt, playerPos);
    manageTraps(dt);
    return { nearest, bustProgress: pinnedFor / POLICE.bustTime };
  }

  // ----------------------------------------------------------------- public
  return {
    update,
    addWanted(amount) {
      if (amount <= 0) return;
      setStars(stars + amount);
    },
    clearWanted() {
      stars = 0;
      quietFor = 0;
      pinnedFor = 0;
      callbacks.onWanted(0);
    },
    getWanted() { return stars; },
    setWanted(next) { setStars(next); },
    cruiserCount() { return fleet.length; },
    heliActive() { return air.flying; },
    roadblockCount() { return barricades.length; },
    spikeStripCount() { return strips.length; },
    onSpikes,
    // Staging helper for the ?shot=chase screenshot: pull the closest
    // cruiser to a chosen spot so the chase reads in a single frame.
    placeNearest(x, z, heading) {
      if (fleet.length === 0) return;
      let best = fleet[0];
      let bestDist = Infinity;
      for (const unit of fleet) {
        const d = Math.hypot(unit.mesh.position.x - x, unit.mesh.position.z - z);
        if (d < bestDist) { bestDist = d; best = unit; }
      }
      best.mesh.position.set(x, 0, z);
      best.heading = heading;
      best.speed = 20;
    },
    // Staging helper: park the helicopter over a chosen spot for the
    // shot, and aim its orbit at the player (px/pz) so it holds there
    // instead of drifting back to its old orbit phase.
    placeHeli(x, z, px = 0, pz = 0) {
      if (!air.flying) {
        air.flying = true;
        air.rig.visible = true;
      }
      air.rig.position.set(x, HELI.altitude, z);
      air.phase = Math.atan2(z - pz, x - px);
    },
  };
}
