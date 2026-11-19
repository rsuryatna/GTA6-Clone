// Jules Maro on foot: a capsule figure that walks, runs, punches and shoots,
// colliding with the city as a circle. The camera looks at the head; the
// heading is where the body faces.
import * as THREE from 'three';
import { PLAYER } from './config.js';

export function createPlayer(scene, spawn) {
  const group = new THREE.Group();
  group.name = 'jules-maro';

  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c313a });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.0, 10), jacket);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.65;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.8, 8), pants);
  legL.position.set(-0.16, 0.4, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  // A fist, raised while punching.
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), skin);
  fist.position.set(0, 1.2, 0.5);
  fist.visible = false;
  group.add(fist);
  // The weapon in Jules' hand: a small dark pistol, shown whenever he is
  // armed on foot so the weapon wheel reads in the world, not just the HUD.
  // The gun is visual only; damage comes from combat.js.
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.42), gunMat);
  gun.position.set(0.32, 1.15, 0.42);
  gun.visible = true;
  group.add(gun);

  group.position.set(spawn.x, 0, spawn.z);
  scene.add(group);

  const state = {
    group,
    heading: spawn.heading,
    health: PLAYER.health,
    speed: 0,
    punchTimer: 0,
    invulnerable: 0,
    dead: false,
    armed: true,
  };

  function update(dt, input, world, cameraYaw) {
    if (state.dead) return;
    const forward = input.moveForward();
    const strafe = input.moveStrafe();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Movement is relative to the camera: W walks away from the camera.
    // The camera looks along (sin yaw, cos yaw), so that is the forward axis.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    let mx = (sin * forward - cos * strafe);
    let mz = (cos * forward + sin * strafe);
    const len = Math.hypot(mx, mz);
    if (len > 0.001) {
      mx /= len;
      mz /= len;
      state.speed = speed;
      group.position.x += mx * speed * dt;
      group.position.z += mz * speed * dt;
      state.heading = Math.atan2(mx, mz);
      // Walk cycle: legs swing, body bobs.
      const phase = performance.now() * 0.012 * (running ? 1.6 : 1);
      legL.rotation.x = Math.sin(phase) * 0.6;
      legR.rotation.x = -Math.sin(phase) * 0.6;
      body.position.y = 0.95 + Math.abs(Math.sin(phase)) * 0.05;
    } else {
      state.speed = 0;
      legL.rotation.x = 0;
      legR.rotation.x = 0;
      body.position.y = 0.95;
    }
    group.rotation.y = state.heading;
    world.resolveCircle(group.position, PLAYER.radius);
    if (state.punchTimer > 0) {
      state.punchTimer -= dt;
      fist.visible = state.punchTimer > 0.08;
      fist.position.z = 0.5 + (0.2 - state.punchTimer) * 2;
    }
    // The gun hides while the fist is out.
    gun.visible = state.armed && state.punchTimer <= 0;
    if (state.invulnerable > 0) state.invulnerable -= dt;
  }

  return {
    state,
    group,
    position: group.position,
    update,
    punch() {
      if (state.dead || state.punchTimer > 0) return false;
      state.punchTimer = 0.22;
      fist.visible = true;
      return true;
    },
    // Show or hide the weapon in Jules' hand (hidden while driving, since
    // the player mesh is hidden then anyway, and while punching).
    setArmed(visible) {
      state.armed = visible;
      gun.visible = visible && state.punchTimer <= 0;
    },
    hurt(amount) {
      if (state.invulnerable > 0 || state.dead) return false;
      state.health -= amount;
      state.invulnerable = 0.6;
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
    teleport(x, z, heading) {
      group.position.set(x, 0, z);
      if (heading !== undefined) state.heading = heading;
    },
  };
}
