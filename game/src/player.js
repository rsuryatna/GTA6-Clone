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

// Palette for the crew look.
const SKIN = 0xd9a066;
const JACKET = 0x2e86c1;
const DENIM = 0x2c313a;
const GOLD = 0xf7c948;
const PACK = 0x5a4632;
const GUNMETAL = 0x1a1a1a;

// Walk-cycle and punch numbers.
const TORSO_REST_Y = 0.95;
const LEG_SWING = 0.6;
const BOB = 0.05;
const STRIDE_WALK = 12;
const STRIDE_RUN = 19.2;
const PUNCH_SPAN = 0.22;
const PUNCH_SHOW_AT = 0.08;
const FIST_REST_Z = 0.5;
const HURT_COOLDOWN = 0.6;

// The body, built from a parts table: one entry per mesh, so the figure
// is data instead of a long list of near-identical statements.
function buildBody() {
  const mats = {
    jacket: new THREE.MeshLambertMaterial({ color: JACKET }),
    skin: new THREE.MeshLambertMaterial({ color: SKIN }),
    denim: new THREE.MeshLambertMaterial({ color: DENIM }),
    gold: new THREE.MeshLambertMaterial({ color: GOLD }),
    pack: new THREE.MeshLambertMaterial({ color: PACK }),
    metal: new THREE.MeshLambertMaterial({ color: GUNMETAL }),
  };
  const group = new THREE.Group();
  group.name = 'jules-maro';
  const bits = {};
  const parts = [
    { key: 'torso', geo: new THREE.CylinderGeometry(0.32, 0.38, 1.0, 10), mat: 'jacket', at: [0, 0.95, 0], shadow: true },
    { key: 'head', geo: new THREE.SphereGeometry(0.26, 12, 10), mat: 'skin', at: [0, 1.65, 0], shadow: true },
    { key: 'legL', geo: new THREE.CylinderGeometry(0.11, 0.13, 0.8, 8), mat: 'denim', at: [-0.16, 0.4, 0] },
    { key: 'legR', geo: new THREE.CylinderGeometry(0.11, 0.13, 0.8, 8), mat: 'denim', at: [0.16, 0.4, 0] },
    // A fist, raised while punching.
    { key: 'fist', geo: new THREE.SphereGeometry(0.16, 8, 8), mat: 'skin', at: [0, 1.2, 0.5], hidden: true },
    // The weapon in Jules' hand: a small dark pistol, shown whenever he
    // is armed on foot so the weapon wheel reads in the world, not just
    // the HUD. The gun is visual only; damage comes from combat.js.
    { key: 'gun', geo: new THREE.BoxGeometry(0.1, 0.14, 0.42), mat: 'metal', at: [0.32, 1.15, 0.42] },
    // The crew look: a backpack for the job and a gold chain at the collar.
    { key: 'pack', geo: new THREE.BoxGeometry(0.5, 0.6, 0.22), mat: 'pack', at: [0, 1.0, -0.42], shadow: true },
    { key: 'chain', geo: new THREE.TorusGeometry(0.2, 0.035, 6, 16), mat: 'gold', at: [0, 1.42, 0.18], tilt: [Math.PI / 2 - 0.35, 0, 0] },
  ];
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geo, mats[part.mat]);
    mesh.position.set(part.at[0], part.at[1], part.at[2]);
    if (part.tilt) mesh.rotation.set(part.tilt[0], part.tilt[1], part.tilt[2]);
    if (part.shadow) mesh.castShadow = true;
    if (part.hidden) mesh.visible = false;
    group.add(mesh);
    bits[part.key] = mesh;
  }
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
  };

  // Stride phase, advanced by distance walked instead of the wall clock,
  // so the walk cycle stays in step with the feet at any frame rate.
  let stride = 0;

  function poseWalk(phase) {
    const swing = Math.sin(phase) * LEG_SWING;
    bits.legL.rotation.x = swing;
    bits.legR.rotation.x = -swing;
    bits.torso.position.y = TORSO_REST_Y + Math.abs(Math.sin(phase)) * BOB;
  }

  function poseRest() {
    bits.legL.rotation.x = 0;
    bits.legR.rotation.x = 0;
    bits.torso.position.y = TORSO_REST_Y;
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
      bits.fist.visible = state.punchTimer > PUNCH_SHOW_AT;
      bits.fist.position.z = FIST_REST_Z + (0.2 - state.punchTimer) * 2;
    }
    // The gun hides while the fist is out.
    bits.gun.visible = state.armed && state.punchTimer <= 0;
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
      bits.fist.visible = true;
      return true;
    },
    // Show or hide the weapon in Jules' hand (hidden while driving, since
    // the player mesh is hidden then anyway, and while punching).
    setArmed(visible) {
      state.armed = visible;
      bits.gun.visible = visible && state.punchTimer <= 0;
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
