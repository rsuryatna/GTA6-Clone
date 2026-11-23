// SOLMARINA — player.js
// One job: Jules Maro on foot and behind the wheel. On foot he walks, runs
// and jumps with a readable third-person body; in a car he drives it with
// arcade physics, a handbrake, and a horn. E steals the nearest car.

const THREE = window.THREE;
import { CFG } from './config.js';
import { makeCarModel } from './vehicles.js';

function makeJulesBody() {
  const g = new THREE.Group();
  g.name = 'JulesMaro';
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d5f, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2e86ab, roughness: 0.85 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 });

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.12, 0.88, 0);
  legR.position.set(0.12, 0.88, 0);
  for (const leg of [legL, legR]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.86, 0.19), pants);
    m.position.y = -0.43;
    m.castShadow = true;
    leg.add(m);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.32), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    shoe.position.set(0, -0.86, 0.05);
    leg.add(shoe);
  }
  g.add(legL, legR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.26), shirt);
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);
  const jacketMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.28), jacket);
  jacketMesh.position.y = 1.3;
  g.add(jacketMesh);

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.31, 1.42, 0);
  armR.position.set(0.31, 1.42, 0);
  for (const arm of [armL, armR]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.14), jacket);
    m.position.y = -0.29;
    m.castShadow = true;
    arm.add(m);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.13), skin);
    hand.position.y = -0.6;
    arm.add(hand);
  }
  g.add(armL, armR);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  g.add(head);
  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    hair,
  );
  hairMesh.position.y = 1.68;
  g.add(hairMesh);
  // Jules wears a gold chain — the one readable detail at distance.
  const chain = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.02, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0xf7c948, metalness: 0.9, roughness: 0.3 }),
  );
  chain.position.y = 1.44;
  chain.rotation.x = 0.4;
  g.add(chain);

  return { group: g, legL, legR, armL, armR, head };
}

export function createPlayer(scene, world, rng) {
  const body = makeJulesBody();
  const start = world.startPoint;
  body.group.position.set(start.x, 0, start.z);
  scene.add(body.group);

  // Jules's own car: a coral sports coupe parked near the start.
  const ownCar = makeCarModel('sports', { name: 'Coral', body: 0xd9554a, trim: 0x2b2b2b }, rng);
  ownCar.group.position.set(start.x + 6, 0, start.z + 4);
  ownCar.group.rotation.y = Math.PI / 2;
  scene.add(ownCar.group);

  const player = {
    body,
    group: body.group,
    position: body.group.position,
    heading: 0,
    speed: 0,
    onFoot: true,
    car: null,
    ownCar,
    health: 100,
    cash: 250,
    vy: 0,
    grounded: true,
    phase: 0,
    cameraYaw: 0,
    cameraPitch: 0.32,
    cameraDistance: 9,
    cameraMode: 0, // 0 chase, 1 near, 2 far
    nearestCar: null,
    update(dt, input, world, traffic, audio) {
      if (this.onFoot) this.updateOnFoot(dt, input, world, traffic);
      else this.updateDriving(dt, input, world, audio);
      if (input.wasPressed('KeyC')) {
        this.cameraMode = (this.cameraMode + 1) % 3;
        this.cameraDistance = [9, 5.5, 14][this.cameraMode];
      }
    },
    updateOnFoot(dt, input, world, traffic) {
      const axis = input.axis();
      const sprint = input.is('ShiftLeft') || input.is('ShiftRight');
      const targetSpeed = axis.y !== 0 || axis.x !== 0
        ? (sprint ? CFG.runSpeed : CFG.walkSpeed) : 0;
      const camYaw = this.cameraYaw;
      // Movement is camera-relative, so WASD always feels right.
      const mx = Math.sin(camYaw) * axis.y + Math.cos(camYaw) * axis.x;
      const mz = Math.cos(camYaw) * axis.y - Math.sin(camYaw) * axis.x;
      const moving = targetSpeed > 0;
      if (moving) {
        const want = Math.atan2(mx, mz);
        let diff = want - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += diff * Math.min(1, dt * 10);
        this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 8);
      } else {
        this.speed += (0 - this.speed) * Math.min(1, dt * 8);
      }
      this.group.position.x += Math.sin(this.heading) * this.speed * dt;
      this.group.position.z += Math.cos(this.heading) * this.speed * dt;
      this.group.rotation.y = this.heading;
      // Jump.
      if (input.wasPressed('Space') && this.grounded) {
        this.vy = 8;
        this.grounded = false;
      }
      if (!this.grounded) {
        this.vy -= CFG.gravity * dt;
        this.group.position.y += this.vy * dt;
        if (this.group.position.y <= 0) {
          this.group.position.y = 0;
          this.vy = 0;
          this.grounded = true;
        }
      }
      // Walk cycle.
      this.phase += dt * (this.speed * 1.6 + 1);
      const swing = this.speed > 0.5 ? Math.sin(this.phase) * 0.6 : 0;
      body.legL.rotation.x = swing;
      body.legR.rotation.x = -swing;
      body.armL.rotation.x = -swing * 0.8;
      body.armR.rotation.x = swing * 0.8;
      // Stay in the city.
      this.group.position.x = Math.max(world.bounds.minX, Math.min(world.bounds.maxX, this.group.position.x));
      this.group.position.z = Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ, this.group.position.z));
      // Nearest stealable car, for the E prompt.
      this.nearestCar = null;
      let best = 6;
      const candidates = traffic ? [...traffic.cars.map((c) => c.model), ...traffic.parked, this.ownCar] : [this.ownCar];
      for (const car of candidates) {
        const d = car.group.position.distanceTo(this.group.position);
        if (d < best) { best = d; this.nearestCar = car; }
      }
    },
    updateDriving(dt, input, world, audio) {
      const axis = input.axis();
      const car = this.car;
      if (!car) { this.onFoot = true; return; }
      const handbrake = input.is('Space');
      if (axis.y > 0) this.speed += CFG.carAccel * dt;
      else if (axis.y < 0) this.speed -= CFG.carBrake * dt * 0.8;
      else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
      if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 30 * dt);
      this.speed = Math.max(-14, Math.min(CFG.carTopSpeed, this.speed));
      const steer = axis.x * CFG.carTurn * (this.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(this.speed) / 8);
      this.heading -= steer * dt * (handbrake ? 1.6 : 1);
      car.group.position.x += Math.sin(this.heading) * this.speed * dt;
      car.group.position.z += Math.cos(this.heading) * this.speed * dt;
      car.group.rotation.y = this.heading;
      car.steer(axis.x * 0.42, this.speed);
      // Gentle body roll so the car feels alive.
      car.group.rotation.z = -axis.x * 0.02 * Math.min(1, Math.abs(this.speed) / 20);
      car.group.position.x = Math.max(world.bounds.minX, Math.min(world.bounds.maxX, car.group.position.x));
      car.group.position.z = Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ, car.group.position.z));
      if (audio) audio.setEngine(Math.abs(this.speed) / CFG.carTopSpeed, this.speed);
      if (input.wasPressed('KeyH') && audio) audio.horn();
    },
    enterCar(car) {
      if (!car) return false;
      this.car = car;
      this.onFoot = false;
      this.speed = 0;
      this.heading = car.group.rotation.y;
      this.group.visible = false;
      return true;
    },
    exitCar() {
      if (!this.car) return;
      const car = this.car;
      this.car = null;
      this.onFoot = true;
      this.speed = 0;
      this.group.visible = true;
      this.group.position.set(car.group.position.x + 2.4, 0, car.group.position.z + 1.5);
      this.heading = car.group.rotation.y;
      this.group.rotation.y = this.heading;
    },
    damage(amount) {
      this.health = Math.max(0, this.health - amount);
      return this.health <= 0;
    },
    heal(amount) {
      this.health = Math.min(100, this.health + amount);
    },
    addCash(amount) {
      this.cash += amount;
    },
    // Where the chase camera should look: the player, or the car's nose
    // when driving fast, so the road ahead stays in frame.
    cameraFocus() {
      if (this.onFoot) return this.group.position;
      const c = this.car.group.position;
      return {
        x: c.x + Math.sin(this.heading) * 4,
        y: 1.2,
        z: c.z + Math.cos(this.heading) * 4,
      };
    },
  };
  return player;
}
