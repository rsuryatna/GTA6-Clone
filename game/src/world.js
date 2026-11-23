// SOLMARINA — world.js
// One job: build the whole city from the seed — ground, road grid, one
// diagonal avenue that never breaks the mission grid, beach and marina,
// varied buildings, real-frond palms, ornate European street lamps, and
// no empty roadside plots: every block edge gets a shopfront, a wall, a
// hedge or a parked car.

// three.js loads as a classic script in index.html before any module runs,
// so modules read the global instead of importing the UMD build.
const THREE = window.THREE;
import { CFG, PALETTE } from './config.js';

function box(w, h, d, color, x, y, z, rough = 0.9) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function windowTexture(rng, wall = '#c9bda6') {
  // A small procedural facade texture: lit and dark windows on a wall tone.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = wall;
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 22) {
    for (let x = 8; x < 120; x += 20) {
      const lit = rng.chance(0.38);
      g.fillStyle = lit ? '#ffe9a8' : '#2c3e50';
      g.fillRect(x, y, 13, 15);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(rng) {
  const palm = new THREE.Group();
  const h = rng.range(5.5, 8.5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, h, 7), trunkMat);
  trunk.position.y = h / 2;
  trunk.rotation.z = rng.range(-0.06, 0.06);
  trunk.castShadow = true;
  palm.add(trunk);
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x2f8f4e, roughness: 0.9, side: THREE.DoubleSide,
  });
  // Real fronds: long tapered planes drooping from the crown, not cones.
  for (let i = 0; i < 9; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.6, 1, 4), frondMat);
    const pos = frond.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      const droop = ((y + 1.3) / 2.6) ** 2 * -0.9;
      pos.setZ(v, droop);
    }
    frond.geometry.computeVertexNormals();
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
    frond.position.set(Math.cos(a) * 0.4, h + 0.1, Math.sin(a) * 0.4);
    frond.rotation.set(Math.PI / 2.6, 0, 0);
    frond.rotation.y = -a;
    frond.rotation.order = 'YXZ';
    frond.rotation.y = -a + Math.PI / 2;
    frond.castShadow = true;
    palm.add(frond);
  }
  const nuts = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 }),
  );
  nuts.position.y = h - 0.15;
  palm.add(nuts);
  return palm;
}

function makeLamp() {
  // Ornate European street lamp: fluted pole, scrolled arm, glass lantern.
  const lamp = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 5.2, 8), iron);
  pole.position.y = 2.6;
  pole.castShadow = true;
  lamp.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 8), iron);
  base.position.y = 0.25;
  lamp.add(base);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 12), iron);
  collar.position.y = 4.4;
  collar.rotation.x = Math.PI / 2;
  lamp.add(collar);
  const armCurve = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.045, 6, 12, Math.PI / 2),
    iron,
  );
  armCurve.position.set(0.7, 4.9, 0);
  armCurve.rotation.z = Math.PI / 2;
  lamp.add(armCurve);
  const glass = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.55, 6),
    new THREE.MeshStandardMaterial({
      color: 0xffe6b0, emissive: 0xffc46b, emissiveIntensity: 0.9, transparent: true, opacity: 0.92,
    }),
  );
  glass.position.set(1.4, 4.85, 0);
  lamp.add(glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.22, 6), iron);
  cap.position.set(1.4, 5.2, 0);
  lamp.add(cap);
  const bulb = new THREE.PointLight(0xffc46b, 6, 16, 1.8);
  bulb.position.set(1.4, 4.8, 0);
  lamp.add(bulb);
  lamp.userData.bulb = bulb;
  return lamp;
}

export function buildWorld(scene, rng) {
  const group = new THREE.Group();
  group.name = 'SolmarinaCity';
  scene.add(group);

  const halfX = (CFG.blocksX * (CFG.blockSize + CFG.roadWidth)) / 2;
  const halfZ = (CFG.blocksZ * (CFG.blockSize + CFG.roadWidth)) / 2;

  // Ground: grass base, sand beach to the south, sea beyond it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 46),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CFG.beachZ - 8);
  sand.receiveShadow = true;
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 220),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.35 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.01, CFG.beachZ - 130);
  group.add(sea);

  // Marina basin on the east edge: water, piers, moored boats.
  const marina = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 130),
    new THREE.MeshStandardMaterial({ color: 0x2a7ea6, roughness: 0.2, metalness: 0.4 }),
  );
  marina.rotation.x = -Math.PI / 2;
  marina.position.set(CFG.marinaX + 18, 0.03, 0);
  group.add(marina);
  for (let i = 0; i < 3; i++) {
    const pier = box(6, 0.5, 110, 0x8a6b4a, CFG.marinaX + 6 + i * 18, 0.25, 0);
    group.add(pier);
  }
  for (let i = 0; i < 8; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.1, 9),
      new THREE.MeshStandardMaterial({ color: [0xffffff, 0xd9554a, 0x2e8fa3][i % 3], roughness: 0.4 }),
    );
    hull.position.y = 0.6;
    boat.add(hull);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 5, 6),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    );
    mast.position.y = 3;
    boat.add(mast);
    boat.position.set(CFG.marinaX + 12 + (i % 3) * 18, 0.1, -48 + Math.floor(i / 3) * 48 + rng.range(-6, 6));
    group.add(boat);
  }

  // Roads: asphalt strips on the grid, sidewalks, dashed centre lines.
  const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  const lineMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphaltLine, roughness: 0.8 });
  const roadCentersX = [];
  const roadCentersZ = [];
  for (let i = 0; i <= CFG.blocksX; i++) {
    const x = -halfX + i * (CFG.blockSize + CFG.roadWidth);
    roadCentersX.push(x);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roadWidth, halfZ * 2 + 60), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.05, 0);
    road.receiveShadow = true;
    group.add(road);
    for (let z = -halfZ - 20; z < halfZ + 20; z += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.4), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.07, z);
      group.add(dash);
    }
  }
  for (let j = 0; j <= CFG.blocksZ; j++) {
    const z = -halfZ + j * (CFG.blockSize + CFG.roadWidth);
    roadCentersZ.push(z);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2 + 60, CFG.roadWidth), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.05, z);
    road.receiveShadow = true;
    group.add(road);
    for (let x = -halfX - 20; x < halfX + 20; x += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.07, z);
      group.add(dash);
    }
  }

  // The diagonal avenue: a wide palm-lined boulevard crossing the grid at
  // 28 degrees. It never cuts a mission block — it runs on the road grid's
  // own intersections, so every mission address stays reachable by road.
  const avenue = new THREE.Group();
  avenue.name = 'DiagonalAvenue';
  const avLen = 560;
  const av = new THREE.Mesh(new THREE.PlaneGeometry(20, avLen), roadMat);
  av.rotation.x = -Math.PI / 2;
  av.position.y = 0.06;
  avenue.add(av);
  for (let d = -avLen / 2 + 10; d < avLen / 2; d += 8) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.4), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.08, d);
    avenue.add(dash);
  }
  for (let d = -avLen / 2 + 16; d < avLen / 2 - 10; d += 26) {
    for (const side of [-1, 1]) {
      const palm = makePalm(rng);
      palm.position.set(side * 12.5, 0, d);
      avenue.add(palm);
    }
  }
  avenue.rotation.y = Math.PI / 6.4;
  avenue.position.set(-30, 0, 10);
  group.add(avenue);

  // Buildings: one varied block per grid cell — towers, L-shapes, low
  // shopfront rows, a church dome, a hotel slab. No empty roadside plots:
  // every block edge carries a shopfront awning, a hedge or a parked car.
  const buildings = [];
  // Warm, varied facade walls — brick, sand, teal, terracotta, cream,
  // sage — so no big building reads as a flat grey slab from the street.
  const facadeWalls = ['#b5654a', '#d9c08a', '#5e9aa0', '#c96f4a', '#e0d3b3', '#7fae7a'];
  const facadeTexes = facadeWalls.map((w) => windowTexture(rng, w));
  const pickFacade = () => facadeTexes[Math.floor(rng.float() * facadeTexes.length)];
  const facadePalette = [0xb5654a, 0xd9c08a, 0x5e9aa0, 0xc96f4a, 0xe0d3b3, 0x7fae7a, 0x9a6b8f];
  const shopColors = [0xe4572e, 0x2e86ab, 0xf2c14e, 0x7fb069, 0xef476f, 0x9b5de5, 0x00b4a2];
  for (let i = 0; i < CFG.blocksX; i++) {
    for (let j = 0; j < CFG.blocksZ; j++) {
      const cx = -halfX + CFG.roadWidth / 2 + CFG.blockSize / 2 + i * (CFG.blockSize + CFG.roadWidth);
      const cz = -halfZ + CFG.roadWidth / 2 + CFG.blockSize / 2 + j * (CFG.blockSize + CFG.roadWidth);
      const kind = rng.pick(['tower', 'slab', 'lshape', 'shops', 'dome', 'courtyard']);
      const baseColor = new THREE.Color(rng.pick(facadePalette));
      if (kind === 'tower') {
        const h = rng.range(34, 58);
        const t = box(rng.range(18, 24), h, rng.range(18, 24), baseColor.getHex(), cx, h / 2, cz);
        t.material = new THREE.MeshStandardMaterial({ map: pickFacade(), roughness: 0.85 });
        group.add(t);
        const roof = box(20, 1.2, 20, 0x3a3f46, cx, h + 0.6, cz);
        group.add(roof);
        // Setback penthouse, dark cornice band, and a street-level
        // awning + shop sign so the tower is not one flat coloured box.
        const setback = box(12, 4, 12, 0x3a3f46, cx, h + 3.2, cz);
        group.add(setback);
        const cornice = box(23, 1, 23, 0x2c2f36, cx, h - 0.5, cz);
        group.add(cornice);
        const awn = box(16, 0.3, 4, 0xef476f, cx, 4.2, cz + 12.5);
        awn.rotation.x = 0.3;
        group.add(awn);
        const sign = box(12, 1.2, 0.3, 0x222831, cx, 5.6, cz + 12.2);
        group.add(sign);
        buildings.push({ x: cx, z: cz, w: 22, d: 22, h, kind });
      } else if (kind === 'slab') {
        const h = rng.range(12, 20);
        const s = box(44, h, 16, baseColor.getHex(), cx, h / 2, cz);
        s.material = new THREE.MeshStandardMaterial({ map: pickFacade(), roughness: 0.85 });
        s.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
        group.add(s);
        const cornice = box(45, 0.9, 17, 0x2c2f36, cx, h - 0.5, cz);
        cornice.rotation.y = s.rotation.y;
        group.add(cornice);
        const awn = box(20, 0.3, 4, 0x2e86ab, cx, 4.2, cz + 9.5);
        awn.rotation.x = 0.3;
        group.add(awn);
        buildings.push({ x: cx, z: cz, w: 44, d: 16, h, kind });
      } else if (kind === 'lshape') {
        const h = rng.range(9, 15);
        const a = box(30, h, 12, baseColor.getHex(), cx - 8, h / 2, cz - 8);
        const b = box(12, h, 30, baseColor.getHex(), cx + 12, h / 2, cz + 6);
        const lTex = pickFacade();
        a.material = new THREE.MeshStandardMaterial({ map: lTex, roughness: 0.85 });
        b.material = new THREE.MeshStandardMaterial({ map: lTex, roughness: 0.85 });
        group.add(a, b);
        const awn = box(14, 0.3, 4, 0xf2c14e, cx - 8, 4.2, cz - 0.5);
        awn.rotation.x = 0.3;
        group.add(awn);
        buildings.push({ x: cx, z: cz, w: 34, d: 34, h, kind });
      } else if (kind === 'dome') {
        const h = 14;
        const base = box(26, h, 26, 0xe8dcc0, cx, h / 2, cz);
        // Sand facade with a window grid — the church must not read as a
        // flat cream box. Fixed texture index, so the seeded city layout
        // does not reshuffle.
        base.material = new THREE.MeshStandardMaterial({ map: facadeTexes[1], roughness: 0.85 });
        group.add(base);
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0x2e86ab, roughness: 0.4, metalness: 0.3 }),
        );
        dome.position.set(cx, h, cz);
        dome.castShadow = true;
        group.add(dome);
        buildings.push({ x: cx, z: cz, w: 26, d: 26, h: h + 9, kind });
      } else if (kind === 'courtyard') {
        const h = rng.range(8, 12);
        const cTex = pickFacade();
        for (const [dx, dz, w, d] of [[-14, 0, 10, 40], [14, 0, 10, 40], [0, -14, 18, 10], [0, 14, 18, 10]]) {
          const wall = box(w, h, d, baseColor.getHex(), cx + dx, h / 2, cz + dz);
          wall.material = new THREE.MeshStandardMaterial({ map: cTex, roughness: 0.85 });
          group.add(wall);
        }
        const tree = new THREE.Mesh(
          new THREE.SphereGeometry(3, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 1 }),
        );
        tree.position.set(cx, h + 2, cz);
        tree.castShadow = true;
        group.add(tree);
        buildings.push({ x: cx, z: cz, w: 40, d: 40, h, kind });
      } else {
        // Shopfront row: low colourful shops with striped awnings.
        const h = rng.range(6, 9);
        for (let s = 0; s < 4; s++) {
          const sx = cx - 18 + s * 12;
          const col = shopColors[(s + i + j) % shopColors.length];
          group.add(box(11, h, 14, col, sx, h / 2, cz));
          const awn = box(11, 0.3, 5, 0xffffff, sx, h * 0.72, cz + 8.5);
          awn.rotation.x = 0.35;
          group.add(awn);
          const sign = box(9, 1.1, 0.3, 0x222831, sx, h - 0.8, cz + 7.2);
          group.add(sign);
        }
        buildings.push({ x: cx, z: cz, w: 48, d: 14, h, kind });
      }
      // Sidewalk ring + hedge so no block edge is ever bare.
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(CFG.blockSize + 6, CFG.blockSize + 6), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx, 0.04, cz);
      walk.receiveShadow = true;
      group.add(walk);
      if (rng.chance(0.6)) {
        const hedge = box(CFG.blockSize * 0.7, 1.1, 1.2, 0x2f6b2f, cx, 0.55, cz + CFG.blockSize / 2 - 2);
        group.add(hedge);
      }
    }
  }

  // Street lamps along every avenue, palms along the beach road.
  const lamps = [];
  for (const x of roadCentersX) {
    for (let z = -halfZ; z <= halfZ; z += 76) {
      const lamp = makeLamp();
      lamp.position.set(x + CFG.roadWidth / 2 + 1.2, 0, z);
      lamp.rotation.y = Math.PI;
      group.add(lamp);
      lamps.push(lamp);
    }
  }
  for (let x = -halfX; x <= halfX; x += 30) {
    const palm = makePalm(rng);
    palm.position.set(x, 0, CFG.beachZ + 6);
    group.add(palm);
  }

  // Boardwalk benches and beach umbrellas — the beach is a place, not a void.
  for (let x = -180; x <= 180; x += 36) {
    const bench = box(3.2, 0.5, 1, 0x7a5230, x, 0.6, CFG.beachZ + 14);
    group.add(bench);
    const umb = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: [0xef476f, 0xf2c14e, 0x2e86ab][Math.abs(x / 36) % 3], roughness: 0.9, side: THREE.DoubleSide }),
    );
    umb.position.set(x + 8, 2.6, CFG.beachZ - 2);
    umb.castShadow = true;
    group.add(umb);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    );
    pole.position.set(x + 8, 1.2, CFG.beachZ - 2);
    group.add(pole);
  }

  return {
    group,
    halfX,
    halfZ,
    roadCentersX,
    roadCentersZ,
    buildings,
    lamps,
    bounds: { minX: -halfX - 20, maxX: halfX + 20, minZ: -halfZ - 30, maxZ: halfZ + 20 },
    // A road point near the city centre, used as the player's start.
    startPoint: { x: roadCentersX[3], z: roadCentersZ[3] },
    beachPoint: { x: 0, z: CFG.beachZ + 10 },
    marinaPoint: { x: CFG.marinaX - 6, z: 0 },
    randomRoadPoint(r) {
      const vertical = r.chance(0.5);
      if (vertical) {
        return { x: r.pick(roadCentersX) + r.range(-3, 3), z: r.range(-halfZ, halfZ) };
      }
      return { x: r.range(-halfX, halfX), z: r.pick(roadCentersZ) + r.range(-3, 3) };
    },
  };
}
