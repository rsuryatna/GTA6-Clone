// SOLMARINA — human.js
// One job: readable people. Every pedestrian is built from separate,
// proportioned parts — legs that walk, arms that swing, a clothed torso,
// a head with hair — so a crowd reads as people at screenshot distance,
// never as capsules or blobs.

// three.js loads as a classic script in index.html before any module runs.
const THREE = window.THREE;
import { WARDROBE } from './config.js';

function limb(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  m.castShadow = true;
  return m;
}

export function makePedestrian(rng, opts = {}) {
  const look = opts.look || rng.pick(WARDROBE);
  const height = rng.range(1.62, 1.92);
  const s = height / 1.78;
  const g = new THREE.Group();
  g.name = 'Pedestrian';

  const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: look.shirt, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.95 });
  const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 1 });

  // Legs: two separate limbs, pivoted at the hip so they swing.
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.11 * s, 0.86 * s, 0);
  legR.position.set(0.11 * s, 0.86 * s, 0);
  const legLMesh = limb(0.16 * s, 0.84 * s, 0.18 * s, look.pants);
  legLMesh.position.y = -0.42 * s;
  const legRMesh = limb(0.16 * s, 0.84 * s, 0.18 * s, look.pants);
  legRMesh.position.y = -0.42 * s;
  legL.add(legLMesh);
  legR.add(legRMesh);
  // Shoes, so the feet read at street level.
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 });
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17 * s, 0.09 * s, 0.3 * s), shoeMat);
    shoe.position.set(0, -0.84 * s, 0.05 * s);
    leg.add(shoe);
  }
  g.add(legL, legR);

  // Torso: shirt, with a jacket stripe for some walkers.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.58 * s, 0.24 * s), shirt);
  torso.position.y = 1.15 * s;
  torso.castShadow = true;
  g.add(torso);
  if (rng.chance(0.4)) {
    const jacket = new THREE.Mesh(
      new THREE.BoxGeometry(0.48 * s, 0.2 * s, 0.26 * s),
      new THREE.MeshStandardMaterial({ color: rng.pick([0x222831, 0x6b4423, 0x274156]), roughness: 0.9 }),
    );
    jacket.position.y = 1.32 * s;
    g.add(jacket);
  }

  // Arms: pivoted at the shoulder, swinging opposite the legs.
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.29 * s, 1.38 * s, 0);
  armR.position.set(0.29 * s, 1.38 * s, 0);
  const armLMesh = limb(0.12 * s, 0.56 * s, 0.13 * s, look.shirt);
  armLMesh.position.y = -0.28 * s;
  const armRMesh = limb(0.12 * s, 0.56 * s, 0.13 * s, look.shirt);
  armRMesh.position.y = -0.28 * s;
  armL.add(armLMesh);
  armR.add(armRMesh);
  // Hands in skin tone.
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.12 * s, 0.12 * s), skin);
    hand.position.y = -0.58 * s;
    arm.add(hand);
  }
  g.add(armL, armR);

  // Head: skin sphere, hair cap on top, so hair reads from every angle.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15 * s, 12, 10), skin);
  head.position.y = 1.62 * s;
  head.castShadow = true;
  g.add(head);
  const hairStyle = rng.pick(['cap', 'bun', 'short', 'long']);
  if (hairStyle === 'cap') {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.155 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairMat,
    );
    hair.position.y = 1.65 * s;
    g.add(hair);
  } else if (hairStyle === 'bun') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15 * s, 10, 8), hairMat);
    hair.position.y = 1.66 * s;
    hair.scale.set(1, 0.7, 1);
    g.add(hair);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), hairMat);
    bun.position.set(0, 1.78 * s, -0.1 * s);
    g.add(bun);
  } else if (hairStyle === 'long') {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.34 * s, 0.1 * s), hairMat);
    hair.position.set(0, 1.58 * s, -0.12 * s);
    g.add(hair);
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.155 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      hairMat,
    );
    top.position.y = 1.65 * s;
    g.add(top);
  } else {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.152 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      hairMat,
    );
    hair.position.y = 1.64 * s;
    g.add(hair);
  }

  // A few carry a bag, a phone or a coffee cup — street life, not mannequins.
  if (rng.chance(0.3)) {
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * s, 0.26 * s, 0.08 * s),
      new THREE.MeshStandardMaterial({ color: rng.pick([0x8a5a2b, 0x222222, 0xef476f]), roughness: 0.8 }),
    );
    bag.position.set(0.26 * s, 1.05 * s, 0);
    g.add(bag);
  }

  return {
    group: g,
    legL,
    legR,
    armL,
    armR,
    head,
    height,
    phase: rng.float() * Math.PI * 2,
    walkSpeed: rng.range(1.1, 1.9),
    // Advance the walk cycle; speed 0 idles with a slight breathing sway.
    animate(dt, moving) {
      this.phase += dt * (moving ? 9 : 1.6) * (moving ? this.walkSpeed / 1.5 : 1);
      const swing = moving ? Math.sin(this.phase) * 0.55 : Math.sin(this.phase) * 0.03;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
      this.group.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.04 : 0;
    },
  };
}

export function createCrowd(scene, world, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const ped = makePedestrian(rng);
    const spot = world.randomRoadPoint(rng);
    // Walkers keep to the sidewalk edge, just off the asphalt.
    const onSidewalk = rng.chance(0.7);
    const off = onSidewalk ? rng.pick([-1, 1]) * (8.5 + rng.range(0, 2.5)) : rng.range(-4, 4);
    ped.group.position.set(spot.x + off, 0, spot.z);
    ped.group.rotation.y = rng.float() * Math.PI * 2;
    ped.target = null;
    ped.wait = rng.range(0, 3);
    scene.add(ped.group);
    peds.push(ped);
  }
  return {
    peds,
    update(dt, world) {
      for (const ped of peds) {
        if (ped.wait > 0) {
          ped.wait -= dt;
          ped.animate(dt, false);
          continue;
        }
        if (!ped.target) {
          const spot = world.randomRoadPoint(rng);
          ped.target = { x: spot.x, z: spot.z };
        }
        const dx = ped.target.x - ped.group.position.x;
        const dz = ped.target.z - ped.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.5) {
          ped.target = null;
          ped.wait = rng.range(1, 6);
          continue;
        }
        const heading = Math.atan2(dx, dz);
        ped.group.rotation.y += (heading - ped.group.rotation.y) * Math.min(1, dt * 4);
        ped.group.position.x += Math.sin(ped.group.rotation.y) * ped.walkSpeed * dt;
        ped.group.position.z += Math.cos(ped.group.rotation.y) * ped.walkSpeed * dt;
        // Stay inside the city.
        ped.group.position.x = Math.max(world.bounds.minX, Math.min(world.bounds.maxX, ped.group.position.x));
        ped.group.position.z = Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ, ped.group.position.z));
        ped.animate(dt, true);
      }
    },
    // Teleport a slice of the crowd near a point — used to stage screenshots.
    gatherNear(x, z, radius, n) {
      let placed = 0;
      for (const ped of peds) {
        if (placed >= n) break;
        const a = rng.float() * Math.PI * 2;
        const d = Math.sqrt(rng.float()) * radius;
        ped.group.position.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
        ped.group.rotation.y = rng.float() * Math.PI * 2;
        ped.target = null;
        ped.wait = rng.range(0.5, 2);
        placed++;
      }
      return placed;
    },
  };
}
