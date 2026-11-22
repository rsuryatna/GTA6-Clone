// footpolice.js — uniformed foot police officers.
//
// The police used to be cruisers and a helicopter only. At wanted 2+
// while Jules is on foot, officers in navy uniform spawn nearby, run
// him down, and arrest him: the caller plays the handcuff scene, then
// BUSTED. They despawn when the heat drops to 0, like the cruisers.
// They never shoot — the chase and the arrest are the job. The officer
// model reuses the human figure system (human.js), so an officer reads
// as the same kind of person as Jules and the pedestrians, only in
// uniform: navy shirt and trousers, a police cap with a brim and a gold
// cap badge, a gold badge on the chest, a duty belt, black shoes.
import * as THREE from 'three';
import { torsoGeometry, taperedLimb } from './human.js';

// A touch slower than Jules' run, faster than his walk: a walking Jules
// gets caught, a sprinting one can pull away.
const OFFICER_SPEED = 9;
// Close enough to grab him, and how long he must be held before the
// arrest lands.
const ARREST_RANGE = 2.0;
const ARREST_HOLD = 1.5;
const MAX_OFFICERS = 2;

function buildOfficerMesh() {
  const group = new THREE.Group();
  // Navy, but light enough to read at night: the old 0x1a2a4a was so dark
  // that the moon left the uniform a black silhouette in the cuff shot.
  // Still clearly navy — never grey — just lifted enough for the
  // moonlight and the arrest fill light to show the uniform.
  const navyMat = new THREE.MeshLambertMaterial({ color: 0x2e4a72 });
  const jacketMat = new THREE.MeshLambertMaterial({ color: 0x38528c });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc98d5a });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const beltMat = new THREE.MeshLambertMaterial({ color: 0x262626 });
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
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
  // Navy shirt, then the navy jacket over it from the waist up, so the
  // uniform reads as a uniform and not a coloured shirt.
  const torso = new THREE.Mesh(torsoGeometry(0.78, 0), navyMat);
  torso.castShadow = true;
  group.add(torso);
  limbs.torso = torso;
  const jacket = new THREE.Mesh(torsoGeometry(1.00, 0.025), jacketMat);
  jacket.scale.z = 1.15;
  jacket.castShadow = true;
  group.add(jacket);
  // Neck, head, eyes and nose, as on every walker.
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
  // The police cap: a navy crown, a black brim jutting forward, and a
  // gold cap badge on the front — plus a gold band around the base of
  // the crown, which is what reads from behind and the side, where the
  // front badge cannot be seen. Real police caps carry the band.
  addPart(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10), navyMat, 0, 1.82, 0, null, false);
  addPart(new THREE.BoxGeometry(0.20, 0.02, 0.12), beltMat, 0, 1.79, 0.10, null, false);
  addPart(new THREE.CylinderGeometry(0.145, 0.145, 0.025, 10), goldMat, 0, 1.79, 0, null, false);
  const capBadge = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 10), goldMat);
  capBadge.rotation.x = Math.PI / 2;
  capBadge.position.set(0, 1.83, 0.135);
  group.add(capBadge);
  // The gold badge on the left chest, and the black duty belt at the
  // waist — the two things that mark the uniform at a glance. The
  // badge is bigger than a real one (0.05) so it still reads at the
  // cuff camera's distance.
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), goldMat);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(-0.09, 1.32, 0.135);
  group.add(badge);
  // The duty belt: slightly proud of the jacket (0.36 x 0.24) so the
  // black band reads at the waist instead of hiding behind the jacket.
  addPart(new THREE.BoxGeometry(0.36, 0.08, 0.24), beltMat, 0, 0.98, 0, null, false);
  // Gold shoulder boards (epaulettes): a real police uniform mark that
  // reads from behind and the side — the angles the cuff camera sees.
  for (const sx of [-1, 1]) {
    addPart(new THREE.BoxGeometry(0.13, 0.02, 0.10), goldMat, sx * 0.235, 1.49, 0, null, false);
  }
  // Legs: thigh + shin, pivoting at the hip and the knee, with feet
  // pointing forward. The knee bends when the leg swings forward.
  for (const side of [-1, 1]) {
    const hip = addPivot(group, side * 0.11, 0.88, 0, side < 0 ? 'legL' : 'legR');
    const thigh = new THREE.Mesh(taperedLimb(0.17, 0.13, 0.42, 0.17, 0.13), navyMat);
    hip.add(thigh);
    const knee = addPivot(hip, 0, -0.42, 0, side < 0 ? 'kneeL' : 'kneeR');
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), navyMat);
    knee.add(kneeCap);
    const shin = new THREE.Mesh(taperedLimb(0.13, 0.10, 0.39, 0.13, 0.10), navyMat);
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.26), shoeMat);
    foot.position.set(0, -0.40, 0.07);
    knee.add(foot);
  }
  // Arms: upper arm + forearm, pivoting at the shoulder and the elbow,
  // with hands. The arms counter-swing against the legs.
  for (const side of [-1, 1]) {
    const shoulder = addPivot(group, side * 0.235, 1.42, 0, side < 0 ? 'armL' : 'armR');
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), jacketMat);
    shoulder.add(cap);
    const upper = new THREE.Mesh(taperedLimb(0.12, 0.095, 0.30, 0.12, 0.095), jacketMat);
    shoulder.add(upper);
    const elbow = addPivot(shoulder, 0, -0.30, 0, side < 0 ? 'elbowL' : 'elbowR');
    const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), jacketMat);
    elbow.add(elbowCap);
    const fore = new THREE.Mesh(taperedLimb(0.095, 0.075, 0.28, 0.095, 0.075), jacketMat);
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.045), skinMat);
    hand.position.set(0, -0.32, 0);
    elbow.add(hand);
  }
  return { group, limbs };
}

// The run-cycle pose, as on Jules: legs swing, knees bend on the
// forward swing, arms counter-swing.
function poseRun(limbs, phase) {
  const swing = Math.sin(phase);
  limbs.legL.rotation.x = -swing * 0.55;
  limbs.legR.rotation.x = swing * 0.55;
  limbs.kneeL.rotation.x = Math.max(0, swing) * 0.9;
  limbs.kneeR.rotation.x = Math.max(0, -swing) * 0.9;
  limbs.armL.rotation.x = swing * 0.4;
  limbs.armR.rotation.x = -swing * 0.4;
  limbs.elbowL.rotation.x = -0.35;
  limbs.elbowR.rotation.x = -0.35;
}

function poseRest(limbs) {
  for (const name of ['legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR']) {
    limbs[name].rotation.x = 0;
  }
}

export function createFootPolice(scene, world, rng) {
  const officers = [];

  function spawnOfficerAt(x, z) {
    const { group, limbs } = buildOfficerMesh();
    group.position.set(x, 0, z);
    scene.add(group);
    const officer = {
      mesh: group,
      limbs,
      heading: 0,
      stride: rng() * Math.PI * 2,
      pinTimer: 0,
      arresting: false,
    };
    officers.push(officer);
    return officer;
  }

  function despawn(officer) {
    scene.remove(officer.mesh);
    const at = officers.indexOf(officer);
    if (at !== -1) officers.splice(at, 1);
  }

  // A spawn point near the player, snapped onto a street so the officer
  // runs in on the road, not through a building.
  function spawnNear(playerPos) {
    const bearing = rng() * Math.PI * 2;
    const dist = 18 + rng() * 7;
    let x = playerPos.x + Math.sin(bearing) * dist;
    let z = playerPos.z + Math.cos(bearing) * dist;
    const axes = world.streets;
    let bestX = axes[0];
    let bestZ = axes[0];
    for (const a of axes) {
      if (Math.abs(a - x) < Math.abs(bestX - x)) bestX = a;
      if (Math.abs(a - z) < Math.abs(bestZ - z)) bestZ = a;
    }
    if (Math.abs(bestX - x) < Math.abs(bestZ - z)) x = bestX + (rng() - 0.5) * 4;
    else z = bestZ + (rng() - 0.5) * 4;
    x = Math.max(-190, Math.min(190, x));
    z = Math.max(-190, Math.min(190, z));
    return spawnOfficerAt(x, z);
  }

  // Walk one officer toward a point with the run cycle. Returns the
  // distance left; used by the arrest scene as well as the chase.
  function stepToward(officer, dt, tx, tz, speed) {
    const pos = officer.mesh.position;
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      poseRest(officer.limbs);
      return dist;
    }
    officer.heading = Math.atan2(dx, dz);
    officer.mesh.rotation.y = officer.heading;
    const step = Math.min(dist, speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    world.resolveCircle(pos, 0.5);
    officer.stride += dt * 19.2;
    poseRun(officer.limbs, officer.stride);
    return Math.hypot(tx - pos.x, tz - pos.z);
  }

  function face(officer, tx, tz) {
    const pos = officer.mesh.position;
    officer.heading = Math.atan2(tx - pos.x, tz - pos.z);
    officer.mesh.rotation.y = officer.heading;
    poseRest(officer.limbs);
  }

  function update(dt, playerPos, playerSpeed, playerInCar, wanted, onArrest) {
    const desired = wanted >= 2 && !playerInCar ? Math.min(MAX_OFFICERS, wanted - 1) : 0;
    while (officers.length < desired) spawnNear(playerPos);
    while (officers.length > desired) {
      // Despawn the farthest first, so the one already on Jules stays.
      let farthest = officers[0];
      for (const o of officers) {
        const d = Math.hypot(o.mesh.position.x - playerPos.x, o.mesh.position.z - playerPos.z);
        const fd = Math.hypot(farthest.mesh.position.x - playerPos.x, farthest.mesh.position.z - playerPos.z);
        if (d > fd) farthest = o;
      }
      despawn(farthest);
    }
    for (const officer of [...officers]) {
      if (officer.arresting) continue;
      const dist = stepToward(officer, dt, playerPos.x, playerPos.z, OFFICER_SPEED);
      // Hold him still and slow for a moment, then the arrest lands.
      if (dist < ARREST_RANGE && playerSpeed < 3) {
        officer.pinTimer += dt;
        if (officer.pinTimer > ARREST_HOLD) {
          officer.arresting = true;
          officer.pinTimer = 0;
          onArrest(officer);
        }
      } else {
        officer.pinTimer = Math.max(0, officer.pinTimer - dt);
      }
    }
  }

  return {
    update,
    spawnOfficerAt,
    stepToward,
    face,
    officerCount: () => officers.length,
    officers,
  };
}
