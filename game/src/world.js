// The city of Solmarina, generated once from a fixed seed: a 5x5 grid of
// blocks split by streets, pastel towers, palm-lined sidewalks, a beach and
// the sea to the south. Also owns collision: every building is an axis-aligned
// box, and circles (feet, wheels) resolve against them.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { mulberry32, pick, range, rangeInt } from './random.js';

// Street centrelines, computed from the grid: six streets, one between every
// pair of blocks and one along each outer edge. Blocks are 56 m wide with
// 16 m of road between them, so streets sit 36 m from the block centres.
function streetCenters() {
  const pitch = CITY.block + CITY.road;
  const first = -((CITY.blocksPerSide * CITY.block + (CITY.blocksPerSide - 1) * CITY.road) / 2) - CITY.road / 2;
  const centers = [];
  for (let i = 0; i <= CITY.blocksPerSide; i += 1) centers.push(first + i * pitch);
  return centers;
}

export function buildWorld(scene) {
  const rng = mulberry32(CITY.seed);
  const colliders = [];
  const streets = streetCenters();
  const half = CITY.halfSize;
  const group = new THREE.Group();
  group.name = 'solmarina-city';
  scene.add(group);

  // --- ground: asphalt base, then sidewalk slabs, then the beach and sea ---
  // The ground plane is bigger than the city and shifted south, so the beach
  // and sea have room past the last block.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, half * 2 + 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 30);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, CITY.beachStartZ + 18);
  sand.receiveShadow = true;
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 400, 300),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, CITY.oceanStartZ + 150);
  group.add(sea);

  // Sidewalk slabs: one per block, slightly raised, with a kerb colour.
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const pitch = CITY.block + CITY.road;
  // Left edge of the first block: five blocks and four inner roads, centred.
  const blockMin = -((CITY.blocksPerSide * CITY.block + (CITY.blocksPerSide - 1) * CITY.road) / 2);
  for (let bx = 0; bx < CITY.blocksPerSide; bx += 1) {
    for (let bz = 0; bz < CITY.blocksPerSide; bz += 1) {
      const cx = blockMin + bx * pitch + CITY.block / 2;
      const cz = blockMin + bz * pitch + CITY.block / 2;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(CITY.block + 4, 0.3, CITY.block + 4), sidewalkMat);
      slab.position.set(cx, 0.15, cz);
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // --- buildings: window-textured boxes, 1-3 per block, heights vary ---
  const windowTexture = makeWindowTexture();
  const buildingMats = PALETTE.building.map((color) => new THREE.MeshLambertMaterial({
    color, map: windowTexture,
  }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6258 });
  const buildingSpots = [];
  for (let bx = 0; bx < CITY.blocksPerSide; bx += 1) {
    for (let bz = 0; bz < CITY.blocksPerSide; bz += 1) {
      const cx = blockMin + bx * pitch + CITY.block / 2;
      const cz = blockMin + bz * pitch + CITY.block / 2;
      const count = rangeInt(rng, 1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = range(rng, 14, 24);
        const d = range(rng, 14, 24);
        const h = range(rng, 10, 42) * (rng() < 0.15 ? 1.8 : 1);
        const ox = range(rng, -12, 12);
        const oz = range(rng, -12, 12);
        const x = cx + ox;
        const z = cz + oz;
        const mat = pick(rng, buildingMats).clone();
        mat.map = windowTexture.clone();
        mat.map.needsUpdate = true;
        mat.map.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6)));
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, h / 2 + 0.3, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), roofMat);
        roof.position.set(x, h + 0.6, z);
        group.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildingSpots.push({ x, z, w, d });
      }
    }
  }

  // --- palms along the sidewalks and the beach front ---
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const leafGeo = new THREE.ConeGeometry(2.2, 2.6, 7);
  for (let i = 0; i < 90; i += 1) {
    const onBeach = i < 24;
    let x;
    let z;
    if (onBeach) {
      x = range(rng, -half, half);
      z = range(rng, CITY.beachStartZ + 4, CITY.beachStartZ + 26);
    } else {
      const street = pick(rng, streets);
      const along = range(rng, -half + 10, half - 10);
      if (rng() < 0.5) { x = street + (rng() < 0.5 ? -9 : 9); z = along; }
      else { x = along; z = street + (rng() < 0.5 ? -9 : 9); }
    }
    // Keep palms out of the road itself.
    if (!onBeach && Math.abs(z) < CITY.beachStartZ && isOnRoad(x, z, streets)) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 3.3, z);
    trunk.castShadow = true;
    group.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.set(x, 7.2, z);
    leaves.castShadow = true;
    group.add(leaves);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }

  // --- street props: lamps at intersections, a few billboards downtown ---
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const sx of streets) {
    for (const sz of streets) {
      if (rng() < 0.4) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), lampMat);
      pole.position.set(sx + 8.4, 3.5, sz + 8.4);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampHeadMat);
      head.position.set(sx + 8.4, 7.1, sz + 8.4);
      group.add(head);
    }
  }

  // --- the safehouse garage at the Palm Heights hideout ---
  // The building sits off to the side so the hideout marker itself stays
  // clear; the flat pad in front of it is where cars are stored.
  const garagePad = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.25, 11),
    new THREE.MeshLambertMaterial({ color: 0x4a4f58 }),
  );
  garagePad.position.set(-150, 0.12, -108);
  garagePad.receiveShadow = true;
  group.add(garagePad);
  const garageBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(16, 6, 10),
    new THREE.MeshLambertMaterial({ color: 0x7a6a8a }),
  );
  garageBuilding.position.set(-164, 3.3, -112);
  garageBuilding.castShadow = true;
  garageBuilding.receiveShadow = true;
  group.add(garageBuilding);
  const garageDoor = new THREE.Mesh(
    new THREE.BoxGeometry(10, 4.4, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2c313a }),
  );
  garageDoor.position.set(-156.2, 2.4, -112);
  group.add(garageDoor);
  const garageSign = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.2),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('GARAGE', '#ffc861') }),
  );
  garageSign.position.set(-155.9, 5.4, -112);
  garageSign.rotation.y = Math.PI / 2;
  group.add(garageSign);
  colliders.push({ minX: -172, maxX: -156, minZ: -117, maxZ: -107 });

  // --- Ammu-Nation, the gun shop downtown ---
  const shopBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(14, 7, 12),
    new THREE.MeshLambertMaterial({ color: 0x8c2f2f }),
  );
  shopBuilding.position.set(116, 3.8, -44);
  shopBuilding.castShadow = true;
  shopBuilding.receiveShadow = true;
  group.add(shopBuilding);
  const shopSign = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 2.2),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('AMMU-NATION', '#ffd97a') }),
  );
  shopSign.position.set(116, 6.4, -37.9);
  group.add(shopSign);
  colliders.push({ minX: 109, maxX: 123, minZ: -50, maxZ: -38 });

  // --- the marina radio tower, blinking red over the boardwalk ---
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.9, 42, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
  );
  tower.position.set(-52, 21, 178);
  tower.castShadow = true;
  group.add(tower);
  const towerLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  towerLight.position.set(-52, 42.6, 178);
  towerLight.name = 'tower-light';
  group.add(towerLight);
  colliders.push({ minX: -52.9, maxX: -51.1, minZ: 177.1, maxZ: 178.9 });

  // A striped awning over the marina boardwalk, for a splash of colour.
  const awningMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 8), awningMat);
  awning.position.set(-40, 5, CITY.beachStartZ - 6);
  awning.castShadow = true;
  group.add(awning);

  // --- centre lines on the roads, as thin pale strips ---
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  for (const s of streets) {
    const dashH = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.06, 0.4), lineMat);
    dashH.position.set(0, 0.06, s);
    group.add(dashH);
    const dashV = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, half * 2), lineMat);
    dashV.position.set(s, 0.06, 0);
    group.add(dashV);
  }

  function isOnRoad(x, z, list) {
    for (const s of list) {
      if (Math.abs(x - s) < CITY.road / 2 || Math.abs(z - s) < CITY.road / 2) return true;
    }
    return false;
  }

  // Where cars park: kerb spots along the streets, clear of intersections.
  const parkingSpots = [];
  for (const s of streets) {
    for (let t = -half + 30; t < half - 20; t += 36) {
      if (rng() < 0.35) continue;
      parkingSpots.push({ x: s + 6, z: t, heading: Math.PI / 2 });
      parkingSpots.push({ x: t, z: s + 6, heading: 0 });
    }
  }

  return {
    group,
    colliders,
    streets,
    parkingSpots,
    playerSpawn: { x: 0, z: -40, heading: 0 },
    garageSpot: { x: -150, z: -108 },
    shopSpot: { x: 108, z: -36 },
    towerSpot: { x: -52, z: 178 },
    // Roadblocks register and remove their own footprints here, so the
    // collision list stays one array that resolveCircle reads.
    addCollider(box) { colliders.push(box); },
    removeCollider(box) {
      const index = colliders.indexOf(box);
      if (index !== -1) colliders.splice(index, 1);
    },
    // Push a circle (feet or wheels) out of every building it overlaps.
    resolveCircle(pos, radius) {
      for (const box of colliders) {
        const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq >= radius * radius) continue;
        if (distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          pos.x = closestX + (dx / dist) * radius;
          pos.z = closestZ + (dz / dist) * radius;
        } else {
          // Dead centre of a box: shove out along the smallest penetration.
          const pushLeft = pos.x - box.minX;
          const pushRight = box.maxX - pos.x;
          const pushBack = pos.z - box.minZ;
          const pushFront = box.maxZ - pos.z;
          const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
          if (min === pushLeft) pos.x = box.minX - radius;
          else if (min === pushRight) pos.x = box.maxX + radius;
          else if (min === pushBack) pos.z = box.minZ - radius;
          else pos.z = box.maxZ + radius;
        }
      }
      // Stay inside the playable area (the sea stops the player, too).
      pos.x = Math.max(-half, Math.min(half, pos.x));
      pos.z = Math.max(-half, Math.min(CITY.beachStartZ + 34, pos.z));
    },
    isOnRoad(x, z) { return isOnRoad(x, z, streets); },
  };
}

// A repeating facade of lit windows, drawn once on a canvas.
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  const lit = ['#ffd97a', '#9fd8ff', '#fff3c8'];
  const dark = '#2c3440';
  for (let y = 4; y < 60; y += 12) {
    for (let x = 4; x < 60; x += 12) {
      ctx.fillStyle = Math.random() < 0.55 ? lit[Math.floor(Math.random() * lit.length)] : dark;
      ctx.fillRect(x, y, 7, 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// A shop sign: bold text on a dark board, drawn once on a canvas.
function makeSignTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14181f';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = color;
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  return new THREE.CanvasTexture(canvas);
}
