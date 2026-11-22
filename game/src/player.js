// Jules Maro on foot: a capsule figure that walks, runs, punches and
// shoots, colliding with the city as a circle. The camera looks at the
// head; the heading is where the body faces. Mara's crew look: blue
// jacket, a backpack for the job, and a gold chain — the details that
// make Jules read as a person in the cover shot instead of a mannequin.
//
// A bulletproof vest from Ammu-Nation soaks damage before health does.
// It does not regenerate; when it is gone, Jules is on his own again.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { torsoGeometry, taperedLimb } from './human.js';

// Palette for the crew look.
const SKIN = 0xd9a066;
const JACKET = 0x2e86c1;
const DENIM = 0x2c313a;
const GOLD = 0xf7c948;
const PACK = 0x5a4632;
const GUNMETAL = 0x1a1a1a;
const HAIR = 0x1a1a1a;

// Walk-cycle and punch numbers.
const LEG_SWING = 0.6;
const BOB = 0.05;
const STRIDE_WALK = 12;
const STRIDE_RUN = 19.2;
const PUNCH_SPAN = 0.22;
const HURT_COOLDOWN = 0.6;

// The body, built as a real human shape — not a cylinder. The torso is
// the extruded silhouette from human.js (shoulders, chest, waist, hips);
// the head is an ellipsoid with eyes; the limbs are tapered two-segment
// pieces that bend at the knee and elbow, with hands and feet. Jules
// finally has arms: the gun and the knife ride in his right hand.
function buildBody() {
  const mats = {
    jacket: new THREE.MeshLambertMaterial({ color: JACKET }),
    skin: new THREE.MeshLambertMaterial({ color: SKIN }),
    denim: new THREE.MeshLambertMaterial({ color: DENIM }),
    gold: new THREE.MeshLambertMaterial({ color: GOLD }),
    pack: new THREE.MeshLambertMaterial({ color: PACK }),
    metal: new THREE.MeshLambertMaterial({ color: GUNMETAL }),
    steel: new THREE.MeshLambertMaterial({ color: 0xb8bec8 }),
    hair: new THREE.MeshLambertMaterial({ color: HAIR }),
    shoe: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    eye: new THREE.MeshBasicMaterial({ color: 0x141414 }),
  };
  const group = new THREE.Group();
  group.name = 'jules-maro';
  const bits = {};
  // The upper body bobs as one piece when Jules walks; the legs stay
  // planted on the ground, pivoting at the hip.
  const body = new THREE.Group();
  group.add(body);
  bits.body = body;
  // Torso: the human silhouette in the blue jacket.
  const torso = new THREE.Mesh(torsoGeometry(0.78, 0), mats.jacket);
  torso.castShadow = true;
  body.add(torso);
  bits.torso = torso;
  // Neck, then the head: an ellipsoid (taller than wide) with eyes and
  // a nose, and dark hair capping the top. The head parts ride on one
  // pivot at the top of the neck, so the head can bow (the arrest scene)
  // without the face coming apart — the pivot rotates, the parts move
  // together.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.09), mats.skin);
  neck.position.set(0, 1.51, 0);
  body.add(neck);
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.51, 0);
  body.add(headPivot);
  bits.headPivot = headPivot;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 10), mats.skin);
  head.scale.set(0.95, 1.2, 1.0);
  head.position.set(0, 0.17, 0);
  head.castShadow = true;
  headPivot.add(head);
  bits.head = head;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), mats.eye);
    eye.position.set(sx * 0.035, 0.18, 0.096);
    headPivot.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), mats.skin);
  nose.position.set(0, 0.14, 0.095);
  headPivot.add(nose);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mats.hair,
  );
  hair.position.set(0, 0.19, -0.01);
  headPivot.add(hair);
  bits.hair = hair;
  // Legs: thigh + shin, pivoting at the hip and the knee, with feet.
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0.88, 0);
    group.add(hip);
    bits[side < 0 ? 'legL' : 'legR'] = hip;
    hip.add(new THREE.Mesh(taperedLimb(0.17, 0.13, 0.42, 0.17, 0.13), mats.denim));
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);
    bits[side < 0 ? 'kneeL' : 'kneeR'] = knee;
    knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), mats.denim));
    knee.add(new THREE.Mesh(taperedLimb(0.13, 0.10, 0.39, 0.13, 0.10), mats.denim));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.26), mats.shoe);
    foot.position.set(0, -0.40, 0.07);
    knee.add(foot);
  }
  // Arms: upper arm + forearm, pivoting at the shoulder and the elbow,
  // with hands. The right hand is the fist that punches, and it holds
  // the gun or the knife.
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235, 1.42, 0);
    body.add(shoulder);
    bits[side < 0 ? 'armL' : 'armR'] = shoulder;
    shoulder.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mats.jacket));
    shoulder.add(new THREE.Mesh(taperedLimb(0.12, 0.095, 0.30, 0.12, 0.095), mats.jacket));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.30, 0);
    shoulder.add(elbow);
    bits[side < 0 ? 'elbowL' : 'elbowR'] = elbow;
    elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mats.jacket));
    elbow.add(new THREE.Mesh(taperedLimb(0.095, 0.075, 0.28, 0.095, 0.075), mats.jacket));
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.045), mats.skin);
    hand.position.set(0, -0.32, 0);
    elbow.add(hand);
    if (side > 0) bits.fist = hand;
  }
  // The weapon in Jules' right hand: the gun for guns, the knife for
  // the knife. Both ride on the forearm, in the hand, so they follow the
  // arm, and hide while punching or driving.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.42), mats.metal);
  gun.position.set(0, -0.33, 0.10);
  bits.elbowR.add(gun);
  bits.gun = gun;
  const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.34), mats.steel);
  knifeBlade.position.set(0, -0.33, 0.16);
  knifeBlade.visible = false;
  bits.elbowR.add(knifeBlade);
  bits.knifeBlade = knifeBlade;
  const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.14), mats.metal);
  knifeHandle.position.set(0, -0.33, 0.0);
  knifeHandle.visible = false;
  bits.elbowR.add(knifeHandle);
  bits.knifeHandle = knifeHandle;
  // The crew look: a backpack for the job and a gold chain at the collar.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.22), mats.pack);
  pack.position.set(0, 1.12, -0.22);
  pack.castShadow = true;
  body.add(pack);
  bits.pack = pack;
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), mats.gold);
  chain.position.set(0, 1.46, 0.16);
  chain.rotation.set(Math.PI / 2 - 0.35, 0, 0);
  body.add(chain);
  bits.chain = chain;
  // The handcuffs, shown only during the arrest scene. Each ring rides
  // on the wrist itself — a child of the elbow group, at the hand — so
  // it follows the wrist wherever the cuff pose puts it, and reads as
  // a cuff ON the hand, not a decoration on the back. The chain is a
  // separate piece: cuff() stretches it between the two wrists, so it
  // always joins them exactly. The rings are big, bright steel (the
  // old ones were small and sat at the small of the back, where the
  // camera behind Jules could barely see them). The backpack hides
  // with them, so nothing buries the cuffs. The steel is a realistic
  // mid-grey, not glowing white: at night there is almost no light for
  // a Phong specular to catch, so without a little emissive the rings
  // read as dark blobs — the emissive keeps them silver in the dark,
  // dim enough to read as steel, not as white glasses. The rings are
  // sized to the wrist (forearm radius ~0.075 at the wrist, so the
  // ring's inner radius 0.082 clears it without clipping) — 0.12, not
  // the oversized 0.14 that read as white glasses, and not the 0.11
  // that vanished at ~15 px. Readability comes from the tilt (the
  // holes face the rear camera), the spread arms (both wrists peek
  // past the torso) and the close 2.7 m arrest camera, not from size.
  const cuffSteel = new THREE.MeshPhongMaterial({ color: 0xd6dbe0, shininess: 120, specular: 0xcfd8e2, emissive: 0x6a737e });
  const cuffRingGeo = new THREE.TorusGeometry(0.12, 0.038, 8, 20);
  for (const [elbow, key] of [[bits.elbowL, 'cuffL'], [bits.elbowR, 'cuffR']]) {
    const ring = new THREE.Mesh(cuffRingGeo, cuffSteel);
    // Tilted so the ring's face points at the rear camera, not along
    // the forearm: with the hole along the forearm (rotation.x = PI/2)
    // the arrest camera behind Jules saw the rings edge-on, and the two
    // rings merged into one solid white bowtie with no visible holes.
    // At -0.6 the holes face the camera, so each ring reads as a steel
    // circle with a dark hole — a handcuff, not a blob. The ring still
    // sits at the wrist; it only wears at an angle, like a loose cuff.
    ring.rotation.x = -0.6;
    ring.position.set(0, -0.32, 0);
    ring.visible = false;
    elbow.add(ring);
    bits[key] = ring;
  }
  const cuffChain = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 6), cuffSteel);
  const cuffs = new THREE.Group();
  cuffs.add(cuffChain);
  cuffs.visible = false;
  body.add(cuffs);
  bits.cuffs = cuffs;
  bits.cuffChain = cuffChain;
  return { group, bits };
}

export function createPlayer(scene, spawn) {
  const { group, bits } = buildBody();
  group.position.set(spawn.x, 0, spawn.z);
  scene.add(group);

  const state = {
    group,
    heading: spawn.heading,
    health: PLAYER.health,
    vest: 0,
    speed: 0,
    punchTimer: 0,
    invulnerable: 0,
    dead: false,
    armed: true,
    weaponId: 'pistol',
  };

  // The weapon in Jules' hand: the gun for guns, the knife for the
  // knife. Only the selected one shows, and both hide while punching
  // or driving — the same rules as the gun alone had.
  function updateWeaponVisibility() {
    const show = state.armed && state.punchTimer <= 0;
    const isKnife = state.weaponId === 'knife';
    bits.gun.visible = show && !isKnife;
    bits.knifeBlade.visible = show && isKnife;
    bits.knifeHandle.visible = show && isKnife;
  }

  // Stride phase, advanced by distance walked instead of the wall clock,
  // so the walk cycle stays in step with the feet at any frame rate.
  let stride = 0;

  function poseWalk(phase) {
    const swing = Math.sin(phase) * LEG_SWING;
    const fwdL = Math.max(0, -Math.sin(phase));
    const fwdR = Math.max(0, Math.sin(phase));
    bits.legL.rotation.x = swing;
    bits.legR.rotation.x = -swing;
    bits.kneeL.rotation.x = fwdL * 0.8;
    bits.kneeR.rotation.x = fwdR * 0.8;
    bits.armL.rotation.x = -swing * 0.7;
    bits.armR.rotation.x = swing * 0.7;
    bits.elbowL.rotation.x = -(0.25 + fwdR * 0.2);
    bits.elbowR.rotation.x = -(0.25 + fwdL * 0.2);
    bits.body.position.y = Math.abs(Math.sin(phase)) * BOB;
  }

  function poseRest() {
    bits.legL.rotation.x = 0;
    bits.legR.rotation.x = 0;
    bits.kneeL.rotation.x = 0;
    bits.kneeR.rotation.x = 0;
    bits.armL.rotation.x = 0;
    bits.armR.rotation.x = 0;
    bits.elbowL.rotation.x = -0.25;
    bits.elbowR.rotation.x = -0.25;
    bits.body.position.y = 0;
  }

  function update(dt, input, world, cameraYaw) {
    if (state.dead) return;
    const ahead = input.moveForward();
    const side = input.moveStrafe();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const pace = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Movement is relative to the camera: W walks away from the camera.
    // Forward on the ground is (sin yaw, cos yaw); right is (-cos, sin).
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    let wx = sin * ahead - cos * side;
    let wz = cos * ahead + sin * side;
    const mag = Math.hypot(wx, wz);
    if (mag > 0.001) {
      wx /= mag;
      wz /= mag;
      state.speed = pace;
      group.position.x += wx * pace * dt;
      group.position.z += wz * pace * dt;
      state.heading = Math.atan2(wx, wz);
      stride += dt * (running ? STRIDE_RUN : STRIDE_WALK);
      poseWalk(stride);
    } else {
      state.speed = 0;
      poseRest();
    }
    group.rotation.y = state.heading;
    world.resolveCircle(group.position, PLAYER.radius);
    if (state.punchTimer > 0) {
      state.punchTimer -= dt;
      // The punch is the right arm thrusting forward with the elbow
      // straight — the fist is the right hand, always there, not a
      // floating ball. This runs after the walk pose, so it overrides
      // the right arm for the punch frames; the next update restores it.
      bits.armR.rotation.x = -1.25;
      bits.elbowR.rotation.x = -0.05;
    }
    // The weapon hides while the fist is out.
    updateWeaponVisibility();
    if (state.invulnerable > 0) state.invulnerable -= dt;
  }

  return {
    state,
    group,
    position: group.position,
    update,
    punch() {
      if (state.dead || state.punchTimer > 0) return false;
      state.punchTimer = PUNCH_SPAN;
      return true;
    },
    // Show or hide the weapon in Jules' hand (hidden while driving, since
    // the player mesh is hidden then anyway, and while punching).
    setArmed(visible) {
      state.armed = visible;
      updateWeaponVisibility();
    },
    // Switch the visible weapon in Jules' hand (gun or knife).
    setWeapon(id) {
      state.weaponId = id;
      updateWeaponVisibility();
    },
    // The vest soaks damage first; what gets through hits health.
    hurt(amount) {
      if (state.invulnerable > 0 || state.dead) return false;
      let left = amount;
      if (state.vest > 0) {
        const soaked = Math.min(state.vest, left);
        state.vest -= soaked;
        left -= soaked;
      }
      state.health -= left;
      state.invulnerable = HURT_COOLDOWN;
      if (state.health <= 0) {
        state.health = 0;
        state.dead = true;
      }
      return true;
    },
    heal(amount) {
      state.health = Math.min(PLAYER.health, state.health + amount);
      if (state.health > 0) state.dead = false;
    },
    // Cuff Jules: hands together behind his back, head bowed, and the
    // steel cuffs on his wrists, for the arrest scene. The rings ride
    // on the wrists (children of the elbows), so they follow the hands;
    // the chain is stretched between the two wrist positions, measured
    // live, so it always joins them exactly. The weapon hides and the
    // backpack comes off, so the cuffs are never buried. Cleared on
    // respawn and new game; the normal update re-poses the arms once
    // play resumes.
    cuff(on) {
      bits.cuffs.visible = on;
      bits.cuffL.visible = on;
      bits.cuffR.visible = on;
      bits.pack.visible = !on;
      if (on) {
        bits.gun.visible = false;
        bits.knifeBlade.visible = false;
        bits.knifeHandle.visible = false;
        // Arms swung back and in, so the hands meet behind the back —
        // the way cuffed hands actually sit, close together, not a
        // forearm apart. Head bowed, like someone just caught. The
        // elbows sit out (±0.6, not ±0.35) so BOTH wrists peek past the
        // torso's edges: directly behind the back they are occluded by
        // his own body from the rear camera and the cuffs vanish — at
        // the edges they read as steel rings on his wrists. At ±0.45
        // only the near wrist peeked out and the second ring hid behind
        // the torso; ±0.6 shows both.
        bits.armL.rotation.set(0.9, 0, 0.6);
        bits.armR.rotation.set(0.9, 0, -0.6);
        bits.elbowL.rotation.x = -0.3;
        bits.elbowR.rotation.x = -0.3;
        bits.headPivot.rotation.x = 0.3;
        // Stretch the chain between the wrists, wherever they ended up.
        group.updateWorldMatrix(true, true);
        const lw = bits.elbowL.localToWorld(new THREE.Vector3(0, -0.32, 0));
        const rw = bits.elbowR.localToWorld(new THREE.Vector3(0, -0.32, 0));
        const lv = bits.body.worldToLocal(lw);
        const rv = bits.body.worldToLocal(rw);
        const dir = rv.clone().sub(lv);
        const len = dir.length();
        bits.cuffChain.position.copy(lv).add(rv).multiplyScalar(0.5);
        bits.cuffChain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        bits.cuffChain.scale.set(1, Math.max(0.5, len / 0.16), 1);
      } else {
        bits.armL.rotation.x = 0;
        bits.armR.rotation.x = 0;
        bits.armL.rotation.z = 0;
        bits.armR.rotation.z = 0;
        bits.elbowL.rotation.x = -0.25;
        bits.elbowR.rotation.x = -0.25;
        bits.headPivot.rotation.x = 0;
        updateWeaponVisibility();
      }
    },
    buyVest() {
      state.vest = PLAYER.vestArmor;
    },
    vestLeft() { return state.vest; },
    teleport(x, z, heading) {
      group.position.set(x, 0, z);
      if (heading !== undefined) state.heading = heading;
    },
  };
}
