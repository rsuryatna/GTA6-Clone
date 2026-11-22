// Solmarina, assembled in passes over a shared build context.
//
// Instead of one long procedure that lays the city down line by line, this
// module works in phases: a small context object carries the seeded random
// stream, the scene group, the collider list and the animated pieces, and
// each phase function takes that context and adds one layer — terrain,
// sidewalks, landmarks, towers, palms, lights, the wheel, the pier —
// before the context is wrapped in the plain object the rest of the game
// talks to. The street grid is derived from the block centres (an outer
// street sits half a pitch outside the first and last centre, the rest sit
// halfway between neighbouring centres), buildings grow out of the four
// quadrants of each block, and the ferris wheel cabins hang from the rim
// itself and are kept level by counter-rotating them each frame.
//
// What the game depends on lives on the returned object: the spawn and
// landmark spots, the street axes, the parking bays, the live collider
// list, and the circle resolver that keeps feet and wheels out of walls.

import * as THREE from 'three';
import { CITY, PALETTE, coastalRoadZ } from './config.js';
import { mulberry32, pick, range, rangeInt, shuffle } from './random.js';

// The signal cycle every traffic light walks through: six seconds of
// green, a second and a half of amber, then six of red.
const SIGNAL_PERIOD = 13.5;
const GREEN_SPAN = 6;
const AMBER_SPAN = 1.5;

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

// A canvas texture painted by a callback, so the facade and the shop signs
// share the same setup and only differ in what they draw.
function canvasTexture(width, height, painter) {
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = height;
  painter(sheet.getContext('2d'));
  const tex = new THREE.CanvasTexture(sheet);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A paired day/night facade texture: the day canvas is the facade as
// seen in sunlight (white walls, lit and dark windows); the night canvas
// is black except for the lit windows, so it works as an emissive map —
// only the lit windows glow after dark. The painter draws both pens in
// one pass with the same rng draws, so the lit windows are the same in
// both and the seeded city layout never shifts.
function pairedTexture(width, height, painter) {
  const day = document.createElement('canvas');
  day.width = width;
  day.height = height;
  const night = document.createElement('canvas');
  night.width = width;
  night.height = height;
  painter(day.getContext('2d'), night.getContext('2d'));
  const map = new THREE.CanvasTexture(day);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const emissive = new THREE.CanvasTexture(night);
  emissive.wrapS = THREE.RepeatWrapping;
  emissive.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

// The repeating window grid every tower wears. Drawn from the seeded
// stream, so the lit and dark windows are the same on every run.
function windowsTexture(rng) {
  return pairedTexture(64, 64, (day, night) => {
    day.fillStyle = '#ffffff';
    day.fillRect(0, 0, 64, 64);
    night.fillStyle = '#000000';
    night.fillRect(0, 0, 64, 64);
    const lit = ['#ffd97a', '#9fd8ff', '#fff3c8', '#ffb36b'];
    for (let top = 4; top + 8 <= 64; top += 12) {
      for (let left = 4; left + 7 <= 64; left += 12) {
        const glowing = rng() < 0.55;
        const col = glowing ? lit[Math.floor(rng() * lit.length)] : '#2c3440';
        day.fillStyle = col;
        day.fillRect(left, top, 7, 8);
        night.fillStyle = glowing ? col : '#000000';
        night.fillRect(left, top, 7, 8);
      }
    }
  });
}

// Horizontal window bands: long lit strips instead of a grid, for a
// different facade rhythm on some towers.
function windowsBandsTexture(rng) {
  return pairedTexture(64, 64, (day, night) => {
    day.fillStyle = '#ffffff';
    day.fillRect(0, 0, 64, 64);
    night.fillStyle = '#000000';
    night.fillRect(0, 0, 64, 64);
    const lit = ['#ffd97a', '#9fd8ff', '#fff3c8'];
    for (let top = 6; top + 6 <= 64; top += 16) {
      for (let left = 4; left + 6 <= 60; left += 10) {
        const glowing = rng() < 0.6;
        const col = glowing ? lit[Math.floor(rng() * lit.length)] : '#2c3440';
        day.fillStyle = col;
        day.fillRect(left, top, 6, 6);
        night.fillStyle = glowing ? col : '#000000';
        night.fillRect(left, top, 6, 6);
      }
    }
  });
}

// Sparse windows: fewer, larger openings with more dark wall between
// them, so some towers read as solid and heavy.
function windowsSparseTexture(rng) {
  return pairedTexture(64, 64, (day, night) => {
    day.fillStyle = '#ffffff';
    day.fillRect(0, 0, 64, 64);
    night.fillStyle = '#000000';
    night.fillRect(0, 0, 64, 64);
    const lit = ['#ffd97a', '#9fd8ff'];
    for (let top = 8; top + 10 <= 64; top += 20) {
      for (let left = 8; left + 10 <= 64; left += 20) {
        const glowing = rng() < 0.5;
        const col = glowing ? lit[Math.floor(rng() * lit.length)] : '#2c3440';
        day.fillStyle = col;
        day.fillRect(left, top, 10, 10);
        night.fillStyle = glowing ? col : '#000000';
        night.fillRect(left, top, 10, 10);
      }
    }
  });
}

// A bold shop sign: light text on a dark board with a coloured frame.
// The font auto-fits: it starts big and shrinks only until the label
// fills ~85% of the board width, so a short label (SHOP, HOTEL) reads
// as large as a long one (AMMU-NATION).
function signTexture(label, ink) {
  return canvasTexture(512, 128, (pen) => {
    pen.fillStyle = '#14181f';
    pen.fillRect(0, 0, 512, 128);
    pen.strokeStyle = ink;
    pen.lineWidth = 6;
    pen.strokeRect(6, 6, 500, 116);
    pen.fillStyle = ink;
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    let size = 110;
    pen.font = `900 ${size}px system-ui, sans-serif`;
    while (size > 28 && pen.measureText(label).width > 440) {
      size -= 4;
      pen.font = `900 ${size}px system-ui, sans-serif`;
    }
    pen.fillText(label, 256, 68);
  });
}

// One call that builds a mesh, places it and parents it. The options bag
// covers the few variations the city needs: shadows, a flat rotation and
// a scene-graph name.
function placeMesh(parent, geometry, material, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (opts.rotX !== undefined) mesh.rotation.x = opts.rotX;
  if (opts.rotY !== undefined) mesh.rotation.y = opts.rotY;
  if (opts.rotZ !== undefined) mesh.rotation.z = opts.rotZ;
  if (opts.cast) mesh.castShadow = true;
  if (opts.receive) mesh.receiveShadow = true;
  if (opts.name) mesh.name = opts.name;
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Grid geometry
// ---------------------------------------------------------------------------

// Block centres first, street axes second: the outer streets sit half a
// pitch beyond the edge centres, the inner ones halfway between two
// neighbouring centres. With five 56 m blocks and 16 m roads that lands
// the axes on -180, -108, -36, 36, 108 and 180.
function gridGeometry() {
  const pitch = CITY.block + CITY.road;
  const span = CITY.blocksPerSide * CITY.block + (CITY.blocksPerSide - 1) * CITY.road;
  const centres = [];
  let cursor = -span / 2 + CITY.block / 2;
  for (let i = 0; i < CITY.blocksPerSide; i += 1) {
    centres.push(cursor);
    cursor += pitch;
  }
  const halfPitch = pitch / 2;
  const axes = [centres[0] - halfPitch];
  for (let i = 1; i < centres.length; i += 1) {
    axes.push((centres[i - 1] + centres[i]) / 2);
  }
  axes.push(centres[centres.length - 1] + halfPitch);
  return { axes, centres };
}

// The context every phase reads and extends.
function freshContext(scene) {
  const grid = gridGeometry();
  const root = new THREE.Group();
  root.name = 'solmarina-city';
  scene.add(root);
  return {
    rng: mulberry32(CITY.seed),
    root,
    solids: [],
    axes: grid.axes,
    centres: grid.centres,
    plots: [],
    clock: 0,
    signals: [],
    wheel: null,
    boat: null,
    windowMats: [],
    lanternGlow: null,
    lanternPool: null,
  };
}

// Register a solid footprint by centre and half extents; the resolver and
// the police roadblocks both read this same list.
function registerSolid(ctx, cx, cz, halfW, halfD) {
  const box = {
    minX: cx - halfW,
    maxX: cx + halfW,
    minZ: cz - halfD,
    maxZ: cz + halfD,
  };
  ctx.solids.push(box);
  return box;
}

// True when a point sits on a road: within half a road width of any axis,
// in either direction.
function roadTest(axes, x, z) {
  const half = CITY.road / 2;
  return axes.some((axis) => Math.abs(x - axis) < half || Math.abs(z - axis) < half);
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function layTerrain(ctx) {
  const edge = CITY.halfSize;
  placeMesh(
    ctx.root,
    new THREE.PlaneGeometry(edge * 2 + 80, edge * 2 + 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }),
    0, 0, 30,
    { rotX: -Math.PI / 2, receive: true },
  );
  placeMesh(
    ctx.root,
    new THREE.PlaneGeometry(edge * 2 + 80, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    0, 0.05, CITY.beachStartZ + 18,
    { rotX: -Math.PI / 2, receive: true },
  );
  placeMesh(
    ctx.root,
    new THREE.PlaneGeometry(edge * 2 + 400, 300),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
    0, 0.02, CITY.oceanStartZ + 150,
    { rotX: -Math.PI / 2 },
  );
}

// One raised slab per block, kerb-coloured, sitting a touch above the
// asphalt so the blocks read as pavement.
function laySidewalks(ctx) {
  const slabMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const size = CITY.block + 4;
  for (const cx of ctx.centres) {
    for (const cz of ctx.centres) {
      placeMesh(ctx.root, new THREE.BoxGeometry(size, 0.3, size), slabMat, cx, 0.15, cz, { receive: true });
    }
  }
}

// Thin pale centre lines down every street, both directions.
function paintRoadLines(ctx) {
  const edge = CITY.halfSize;
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  for (const axis of ctx.axes) {
    placeMesh(ctx.root, new THREE.BoxGeometry(edge * 2, 0.06, 0.4), lineMat, 0, 0.06, axis);
    placeMesh(ctx.root, new THREE.BoxGeometry(0.4, 0.06, edge * 2), lineMat, axis, 0.06, 0);
  }
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

// The Solmarina Trust bank: a marble block with a columned front and a
// TRUST board facing the street, standing on the downtown block.
function raiseBank(ctx) {
  const marble = new THREE.MeshLambertMaterial({ color: 0xe8e2d4 });
  placeMesh(ctx.root, new THREE.BoxGeometry(20, 13, 16), marble, 52, 6.8, 52, { cast: true, receive: true });
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e0 });
  for (const off of [-7, -2.4, 2.4, 7]) {
    placeMesh(ctx.root, new THREE.CylinderGeometry(0.7, 0.8, 9, 10), pillarMat, 52 + off, 4.8, 43.4, { cast: true });
  }
  placeMesh(
    ctx.root,
    new THREE.PlaneGeometry(15, 3.75),
    new THREE.MeshBasicMaterial({ map: signTexture('TRUST', '#1a2a4a') }),
    52, 12.2, 43.9,
    { rotY: Math.PI },
  );
  registerSolid(ctx, 52, 52, 10, 8);
}

// The safehouse garage at Palm Heights: a forecourt pad in front of a low
// block with a roller door and a GARAGE board over it.
function raiseGarage(ctx) {
  placeMesh(
    ctx.root,
    new THREE.BoxGeometry(14, 0.25, 11),
    new THREE.MeshLambertMaterial({ color: 0x4a4f58 }),
    -150, 0.12, -108,
    { receive: true },
  );
  placeMesh(
    ctx.root,
    new THREE.BoxGeometry(16, 6, 10),
    new THREE.MeshLambertMaterial({ color: 0x7a6a8a }),
    -164, 3.3, -112,
    { cast: true, receive: true },
  );
  placeMesh(
    ctx.root,
    new THREE.BoxGeometry(10, 4.4, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2c313a }),
    -156.2, 2.4, -112,
  );
  placeMesh(
    ctx.root,
    new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({ map: signTexture('GARAGE', '#ffc861') }),
    -155.9, 5.4, -112,
    { rotY: Math.PI / 2 },
  );
  registerSolid(ctx, -164, -112, 8, 5);
}

// Ammu-Nation downtown: a red block with its yellow board on the front.
function raiseShop(ctx) {
  placeMesh(
    ctx.root,
    new THREE.BoxGeometry(14, 7, 12),
    new THREE.MeshLambertMaterial({ color: 0x8c2f2f }),
    116, 3.8, -44,
    { cast: true, receive: true },
  );
  placeMesh(
    ctx.root,
    new THREE.PlaneGeometry(13, 3.25),
    new THREE.MeshBasicMaterial({ map: signTexture('AMMU-NATION', '#ffd97a') }),
    116, 6.4, -37.9,
  );
  registerSolid(ctx, 116, -44, 7, 6);
}

// The marina radio tower with its blinking red beacon on top. The beacon
// keeps the name 'tower-light' because main.js looks it up every frame.
function raiseTower(ctx) {
  const steel = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  placeMesh(ctx.root, new THREE.CylinderGeometry(0.5, 0.9, 42, 8), steel, -52, 21, 178, { cast: true });
  placeMesh(
    ctx.root,
    new THREE.SphereGeometry(0.7, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    -52, 42.6, 178,
    { name: 'tower-light' },
  );
  registerSolid(ctx, -52, 178, 0.9, 0.9);
}

// A striped awning over the marina boardwalk: a red sheet, white bands,
// four posts holding it up.
function stretchCanopy(ctx) {
  const zc = CITY.beachStartZ - 6;
  placeMesh(ctx.root, new THREE.BoxGeometry(30, 0.4, 8), new THREE.MeshLambertMaterial({ color: 0xe74c3c }), -40, 5, zc, { cast: true });
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e6 });
  for (const off of [-12, -4, 4, 12]) {
    placeMesh(ctx.root, new THREE.BoxGeometry(3, 0.42, 8.1), stripeMat, -40 + off, 5, zc);
  }
  const postMat = new THREE.MeshLambertMaterial({ color: 0x4a3a28 });
  for (const [px, pz] of [[-54, -10], [-26, -10], [-54, -2], [-26, -2]]) {
    placeMesh(ctx.root, new THREE.CylinderGeometry(0.22, 0.22, 5, 6), postMat, px, 2.5, CITY.beachStartZ + pz, { cast: true });
  }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

// New landmark plots the random towers must keep clear of: the hotel
// tower, the stadium and the park (all raised before the towers).
const LANDMARK_CLEAR = [
  { x: 0, z: 72, r: 16 },    // hotel tower
  { x: 72, z: 144, r: 26 },  // stadium
  { x: -72, z: 72, r: 20 },  // park
];

// A point is off limits for random towers when it crowds the bank plot or
// the ferris wheel plot.
function nearLandmark(x, z) {
  if (Math.hypot(x - 52, z - 52) < 20) return true;
  if (Math.hypot(x - CITY.wheelX, z - CITY.wheelZ) < 22) return true;
  for (const spot of LANDMARK_CLEAR) {
    if (Math.hypot(x - spot.x, z - spot.z) < spot.r) return true;
  }
  return false;
}

// New landmarks, raised before the random towers so nearLandmark keeps
// the towers clear of them. All on fixed plots; nothing here moves the
// street grid, the beach or any mission landmark.
function raiseLandmarks(ctx) {
  // --- Hotel tower ------------------------------------------------------
  // A tall slab hotel on the (0, 72) block, east of the -36 avenue, with
  // a HOTEL sign on both faces so it reads in the hero, chase and city
  // shots. Taller than any random tower.
  const hotelSkin = windowsTexture(ctx.rng);
  const hotelMat = new THREE.MeshLambertMaterial({ color: 0xd8cfc0, map: hotelSkin.map });
  hotelMat.emissiveMap = hotelSkin.emissive;
  hotelMat.emissiveMap.repeat.set(3, 9);
  hotelMat.emissive = new THREE.Color(0xffffff);
  hotelMat.emissiveIntensity = 0;
  ctx.windowMats.push(hotelMat);
  hotelMat.map.repeat.set(3, 9);
  placeMesh(ctx.root, new THREE.BoxGeometry(18, 55, 18), hotelMat, 0, 27.8, 72, { cast: true, receive: true });
  placeMesh(ctx.root, new THREE.BoxGeometry(19, 0.8, 19), new THREE.MeshLambertMaterial({ color: 0x6b6258 }), 0, 55.8, 72);
  const hotelSignMat = new THREE.MeshBasicMaterial({ map: signTexture('HOTEL', '#ffd97a') });
  placeMesh(ctx.root, new THREE.PlaneGeometry(16, 4), hotelSignMat, 0, 50, 81.1);
  placeMesh(ctx.root, new THREE.PlaneGeometry(16, 4), hotelSignMat, 0, 50, 62.9, { rotY: Math.PI });
  placeMesh(ctx.root, new THREE.CylinderGeometry(0.15, 0.15, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2c313a }), 0, 59, 72);
  registerSolid(ctx, 0, 72, 9, 9);

  // --- Stadium ----------------------------------------------------------
  // A low wide arena bowl on the (72, 144) block, south-east, with a
  // green pitch, a red rim and four floodlight poles. Reads in the city
  // and chase shots.
  const bowlMat = new THREE.MeshLambertMaterial({ color: 0xcfd8dc });
  placeMesh(ctx.root, new THREE.CylinderGeometry(20, 22, 8, 24), bowlMat, 72, 4, 144, { cast: true, receive: true });
  placeMesh(ctx.root, new THREE.CylinderGeometry(16, 16, 1, 24), new THREE.MeshLambertMaterial({ color: 0x4a7a3f }), 72, 8.2, 144);
  placeMesh(ctx.root, new THREE.TorusGeometry(20, 0.6, 8, 32), new THREE.MeshLambertMaterial({ color: 0xe74c3c }), 72, 8, 144, { rotX: Math.PI / 2 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const floodMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const [fx, fz] of [[52, 124], [92, 124], [52, 164], [92, 164]]) {
    placeMesh(ctx.root, new THREE.CylinderGeometry(0.25, 0.25, 14, 6), poleMat, fx, 7, fz);
    placeMesh(ctx.root, new THREE.BoxGeometry(2.5, 1, 0.5), floodMat, fx, 14.2, fz);
  }
  registerSolid(ctx, 72, 144, 22, 22);

  // --- Park -------------------------------------------------------------
  // A green square with benches on the (-72, 72) block, west of the
  // -36 avenue. The shade trees are planted in plantShadeTrees. The
  // square itself is walkable (no solid), like the sidewalks.
  placeMesh(
    ctx.root,
    new THREE.BoxGeometry(36, 0.3, 36),
    new THREE.MeshLambertMaterial({ color: 0x4a7a3f }),
    -72, 0.15, 72,
    { receive: true },
  );
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  for (const [bx, bz, rot] of [[-84, 72, 0], [-60, 72, 0], [-72, 60, Math.PI / 2], [-72, 84, Math.PI / 2]]) {
    placeMesh(ctx.root, new THREE.BoxGeometry(2.4, 0.15, 0.6), benchMat, bx, 0.7, bz, { rotY: rot, cast: true });
  }

  // --- Lighthouse -------------------------------------------------------
  // A striped lighthouse on the beach west of the pier, with a glowing
  // lamp on top. Reads in the mission and city shots.
  const stripeRed = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
  const stripeWhite = new THREE.MeshLambertMaterial({ color: 0xf5f0e0 });
  const lx = -70, lz = 184;
  for (let i = 0; i < 5; i += 1) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2 - i * 0.25, 2.45 - i * 0.25, 4, 12),
      i % 2 === 0 ? stripeWhite : stripeRed,
    );
    seg.position.set(lx, 2 + i * 4, lz);
    seg.castShadow = true;
    ctx.root.add(seg);
  }
  placeMesh(ctx.root, new THREE.CylinderGeometry(1.6, 1.6, 1.5, 10), new THREE.MeshLambertMaterial({ color: 0x2c313a }), lx, 22.5, lz);
  placeMesh(ctx.root, new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }), lx, 23.8, lz);
  registerSolid(ctx, lx, lz, 2.5, 2.5);

  // --- Billboards -------------------------------------------------------
  // Two tall billboards on the -36 avenue sidewalks, facing the road.
  const billboards = [
    { x: -46, z: -10, label: 'SOLMARINA', ink: '#ffd97a', rotY: Math.PI / 2 },
    { x: -26, z: 120, label: 'CASINO', ink: '#ff6b6b', rotY: -Math.PI / 2 },
  ];
  for (const board of billboards) {
    placeMesh(ctx.root, new THREE.CylinderGeometry(0.3, 0.3, 9, 6), poleMat, board.x, 4.5, board.z, { cast: true });
    placeMesh(
      ctx.root,
      new THREE.PlaneGeometry(13, 3.25),
      new THREE.MeshBasicMaterial({ map: signTexture(board.label, board.ink), side: THREE.DoubleSide }),
      board.x, 9.5, board.z,
      { rotY: board.rotY },
    );
    registerSolid(ctx, board.x, board.z, 0.5, 0.5);
  }

  // --- Lifeguard tower --------------------------------------------------
  // A tall lifeguard chair on the beach, east of the pier.
  const lgX = 20, lgZ = 192;
  const legMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e0 });
  for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    placeMesh(ctx.root, new THREE.BoxGeometry(0.25, 5, 0.25), legMat, lgX + ox, 2.5, lgZ + oz);
  }
  placeMesh(ctx.root, new THREE.BoxGeometry(2.4, 0.3, 2.4), legMat, lgX, 5.1, lgZ, { cast: true });
  placeMesh(ctx.root, new THREE.BoxGeometry(2.4, 1.2, 0.25), new THREE.MeshLambertMaterial({ color: 0xe74c3c }), lgX, 5.8, lgZ - 1.1);
  placeMesh(ctx.root, new THREE.ConeGeometry(2.0, 1.2, 4), new THREE.MeshLambertMaterial({ color: 0xf39c12 }), lgX, 7.0, lgZ, { rotY: Math.PI / 4, cast: true });
  registerSolid(ctx, lgX, lgZ, 1.2, 1.2);
}

// Mission spots the plot filler must keep clear of (the bank and the
// wheel are already in nearLandmark).
const MISSION_CLEAR = [
  { x: -150, z: -108, r: 16 }, // garage / safehouse / hideout
  { x: 108, z: -36, r: 14 },   // Ammu-Nation shop
  { x: -52, z: 178, r: 12 },   // radio tower
  { x: -40, z: 168, r: 12 },   // pier
  { x: 0, z: -40, r: 10 },     // player spawn
];

// Fill the empty quarters of every block — the ones raiseTowers left
// bare — so no roadside plot reads as empty land. A quarter gets a low
// shop/house, a small pocket park, or a parking lot with static cars,
// picked from the seeded stream. Every solid registers a collider, so
// the player and cars cannot pass through the new buildings.
function fillPlots(ctx) {
  const quarters = [[-14, -14], [14, -14], [-14, 14], [14, 14]];
  const paints = [0xc9a06a, 0x9fb4c8, 0xb8a88a, 0x8fa98f, 0xc08a7a, 0x7a8ba0];
  const shopSigns = ['SHOP', 'CAFE', 'MART', 'BAR', 'PIZZA', 'TACOS'];
  for (const cx of ctx.centres) {
    for (const cz of ctx.centres) {
      for (const [qx, qz] of quarters) {
        const bx = cx + qx;
        const bz = cz + qz;
        if (nearLandmark(bx, bz)) continue;
        let blocked = false;
        for (const spot of MISSION_CLEAR) {
          if (Math.hypot(bx - spot.x, bz - spot.z) < spot.r) { blocked = true; break; }
        }
        if (blocked) continue;
        if (roadTest(ctx.axes, bx, bz)) continue;
        // Occupied by a tower already? A tower's footprint can spill
        // past its quarter, so check the real plots with a margin.
        for (const plot of ctx.plots) {
          if (Math.abs(bx - plot.x) < plot.w / 2 + 8 && Math.abs(bz - plot.z) < plot.d / 2 + 8) {
            blocked = true; break;
          }
        }
        if (blocked) continue;
        const kind = ctx.rng();
        if (kind < 0.6) {
          // A low shop/house: a box with a flat roof and a varied paint,
          // and a sign on both street-facing sides for shops.
          const w = range(ctx.rng, 10, 15);
          const d = range(ctx.rng, 10, 15);
          const h = range(ctx.rng, 4, 8);
          const coat = new THREE.MeshLambertMaterial({ color: pick(ctx.rng, paints) });
          placeMesh(ctx.root, new THREE.BoxGeometry(w, h, d), coat, bx, h / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.BoxGeometry(w + 0.5, 0.4, d + 0.5), new THREE.MeshLambertMaterial({ color: 0x6b6258 }), bx, h + 0.5, bz);
          if (ctx.rng() < 0.5) {
            const signMat = new THREE.MeshBasicMaterial({ map: signTexture(pick(ctx.rng, shopSigns), '#ffd97a') });
            placeMesh(ctx.root, new THREE.PlaneGeometry(7, 1.75), signMat, bx, h - 0.8, bz + d / 2 + 0.1);
            placeMesh(ctx.root, new THREE.PlaneGeometry(7, 1.75), signMat, bx, h - 0.8, bz - d / 2 - 0.1, { rotY: Math.PI });
          }
          registerSolid(ctx, bx, bz, w / 2, d / 2);
          ctx.plots.push({ x: bx, z: bz, w, d });
        } else if (kind < 0.8) {
          // A small pocket park: grass, a shade tree and a bench.
          placeMesh(ctx.root, new THREE.BoxGeometry(16, 0.3, 16), new THREE.MeshLambertMaterial({ color: 0x4a7a3f }), bx, 0.15, bz, { receive: true });
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 7), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
          trunk.position.set(bx, 1.5, bz);
          trunk.castShadow = true;
          ctx.root.add(trunk);
          const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), new THREE.MeshLambertMaterial({ color: 0x3d8b40 }));
          canopy.position.set(bx, 4, bz);
          canopy.castShadow = true;
          ctx.root.add(canopy);
          registerSolid(ctx, bx, bz, 0.4, 0.4);
          placeMesh(ctx.root, new THREE.BoxGeometry(2.4, 0.15, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a6b48 }), bx + 4, 0.7, bz, { cast: true });
        } else {
          // A parking lot: dark asphalt with two static cars.
          placeMesh(ctx.root, new THREE.BoxGeometry(18, 0.2, 14), new THREE.MeshLambertMaterial({ color: 0x3a3f46 }), bx, 0.1, bz, { receive: true });
          for (const [ox, oz, rot] of [[-4, -3, 0], [4, 3, Math.PI]]) {
            const carBody = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 4.2), new THREE.MeshLambertMaterial({ color: pick(ctx.rng, PALETTE.car) }));
            carBody.position.set(bx + ox, 0.5, bz + oz);
            carBody.rotation.y = rot;
            carBody.castShadow = true;
            ctx.root.add(carBody);
            const carTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2), new THREE.MeshLambertMaterial({ color: 0x1a2733 }));
            carTop.position.set(bx + ox, 1.0, bz + oz);
            carTop.rotation.y = rot;
            ctx.root.add(carTop);
            registerSolid(ctx, bx + ox, bz + oz, 1.1, 2.2);
          }
        }
      }
    }
  }
}

// Towers grow out of block quadrants: each block is split into four
// quarters, one to three of them are picked at random, and a tower
// rises from each chosen quarter. The towers are no longer identical
// boxes — each one picks a form (stepped, cylindrical, setback, pointed
// roof, rounded turret, or plain box) from the seeded rng, wears one of
// three facade textures in a wider colour palette, and gets rooftop
// detail (water tank, antenna, AC unit, helipad, or a rooftop garden)
// plus, on some, a ground-floor shopfront. Heights vary more: a few
// clearly tall towers rise above many low and mid ones.
function raiseTowers(ctx) {
  const skins = [windowsTexture(ctx.rng), windowsBandsTexture(ctx.rng), windowsSparseTexture(ctx.rng)];
  const tones = [...PALETTE.building, 0xb5651d, 0xd8cdb8, 0x2f3e4d, 0xc96f4a, 0x7a9a8a];
  const paints = tones.map((tone) => new THREE.MeshLambertMaterial({ color: tone }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6258 });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa5ad });
  const gardenMat = new THREE.MeshLambertMaterial({ color: 0x3e8e41 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const awningMat = new THREE.MeshLambertMaterial({ color: 0x2e6b62 });
  // Shop signs, drawn once per label and reused (like the fillPlots signs).
  const shopSigns = new Map();
  const shopSign = (label) => {
    if (!shopSigns.has(label)) shopSigns.set(label, signTexture(label, '#ffd76a'));
    return shopSigns.get(label);
  };
  const shopLabels = ['SHOP', 'CAFE', 'MART', 'PIZZA', 'BAR', 'BAKERY'];
  const quarters = [[-14, -14], [14, -14], [-14, 14], [14, 14]];
  let helipadPlaced = false;
  for (const cx of ctx.centres) {
    for (const cz of ctx.centres) {
      const count = rangeInt(ctx.rng, 1, 3);
      const chosen = shuffle(ctx.rng, quarters).slice(0, count);
      for (const [qx, qz] of chosen) {
        const w = range(ctx.rng, 14, 24);
        const d = range(ctx.rng, 14, 24);
        let h = range(ctx.rng, 10, 42);
        if (ctx.rng() < 0.15) h *= 1.8;
        if (ctx.rng() < 0.05) h *= 1.5; // a couple of extra-tall towers
        h = Math.min(h, 85);
        const bx = cx + qx + range(ctx.rng, -6, 6);
        const bz = cz + qz + range(ctx.rng, -6, 6);
        if (nearLandmark(bx, bz)) continue;
        const skin = pick(ctx.rng, skins);
        const coat = pick(ctx.rng, paints).clone();
        coat.map = skin.map.clone();
        coat.map.needsUpdate = true;
        coat.map.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6)));
        coat.emissiveMap = skin.emissive.clone();
        coat.emissiveMap.needsUpdate = true;
        coat.emissiveMap.repeat.copy(coat.map.repeat);
        coat.emissive = new THREE.Color(0xffffff);
        coat.emissiveIntensity = 0;
        ctx.windowMats.push(coat);
        const shape = pick(ctx.rng, ['box', 'stepped', 'cylinder', 'setback', 'pointed', 'rounded']);
        // The footprint the collider and the plot record use. The turret
        // of a rounded tower sticks out 2 m on one face, so it widens it.
        let plotW = w;
        let plotD = d;
        if (shape === 'box') {
          placeMesh(ctx.root, new THREE.BoxGeometry(w, h, d), coat, bx, h / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), roofMat, bx, h + 0.6, bz);
        } else if (shape === 'stepped') {
          // Three stacked boxes, each narrower than the one below.
          const h1 = h * 0.5;
          const h2 = h * 0.3;
          const h3 = h * 0.2;
          placeMesh(ctx.root, new THREE.BoxGeometry(w, h1, d), coat, bx, h1 / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.BoxGeometry(w * 0.75, h2, d * 0.75), coat, bx, h1 + h2 / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.BoxGeometry(w * 0.5, h3, d * 0.5), coat, bx, h1 + h2 + h3 / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.BoxGeometry(w * 0.5 + 0.6, 0.6, d * 0.5 + 0.6), roofMat, bx, h + 0.6, bz);
        } else if (shape === 'cylinder') {
          const r = Math.min(w, d) / 2;
          placeMesh(ctx.root, new THREE.CylinderGeometry(r, r, h, 20), coat, bx, h / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.CylinderGeometry(r + 0.3, r + 0.3, 0.6, 20), roofMat, bx, h + 0.6, bz);
        } else if (shape === 'setback') {
          // A wider base with a narrower top section set back from it.
          const h1 = h * 0.55;
          const h2 = h * 0.45;
          placeMesh(ctx.root, new THREE.BoxGeometry(w, h1, d), coat, bx, h1 / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.BoxGeometry(w * 0.65, h2, d * 0.65), coat, bx, h1 + h2 / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.BoxGeometry(w * 0.65 + 0.6, 0.6, d * 0.65 + 0.6), roofMat, bx, h + 0.6, bz);
        } else if (shape === 'pointed') {
          // A box with a pyramidal cap instead of a flat roof slab.
          placeMesh(ctx.root, new THREE.BoxGeometry(w, h, d), coat, bx, h / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.25, 4), roofMat, bx, h + h * 0.125 + 0.3, bz, { cast: true, rotY: Math.PI / 4 });
        } else {
          // Rounded: a box with a cylindrical turret on one face.
          placeMesh(ctx.root, new THREE.BoxGeometry(w, h, d), coat, bx, h / 2 + 0.3, bz, { cast: true, receive: true });
          placeMesh(ctx.root, new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), roofMat, bx, h + 0.6, bz);
          const face = pick(ctx.rng, ['x+', 'x-', 'z+', 'z-']);
          const turret = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, h * 0.9, 12), coat);
          if (face === 'x+') { turret.position.set(bx + w / 2, h * 0.45 + 0.3, bz); plotW = w + 4; }
          else if (face === 'x-') { turret.position.set(bx - w / 2, h * 0.45 + 0.3, bz); plotW = w + 4; }
          else if (face === 'z+') { turret.position.set(bx, h * 0.45 + 0.3, bz + d / 2); plotD = d + 4; }
          else { turret.position.set(bx, h * 0.45 + 0.3, bz - d / 2); plotD = d + 4; }
          turret.castShadow = true;
          ctx.root.add(turret);
        }
        // Rooftop detail so the skyline is not flat. The pointed tower
        // wears its pyramid cap, so it gets a small finial instead.
        if (shape === 'pointed') {
          placeMesh(ctx.root, new THREE.SphereGeometry(0.4, 8, 6), darkMat, bx, h + h * 0.25 + 0.4, bz);
        } else if (h > 30) {
          if (!helipadPlaced && h > 40 && ctx.rng() < 0.5) {
            // One tall tower gets a helipad: a dark disc with a white H.
            helipadPlaced = true;
            placeMesh(ctx.root, new THREE.CylinderGeometry(4, 4, 0.25, 20), darkMat, bx, h + 0.75, bz);
            placeMesh(ctx.root, new THREE.BoxGeometry(0.5, 0.15, 4.5), whiteMat, bx - 1.4, h + 0.95, bz);
            placeMesh(ctx.root, new THREE.BoxGeometry(0.5, 0.15, 4.5), whiteMat, bx + 1.4, h + 0.95, bz);
            placeMesh(ctx.root, new THREE.BoxGeometry(3.3, 0.15, 0.5), whiteMat, bx, h + 0.95, bz);
          } else {
            placeMesh(ctx.root, new THREE.CylinderGeometry(0.15, 0.15, 7, 6), darkMat, bx, h + 4, bz);
            placeMesh(ctx.root, new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }), bx, h + 7.6, bz);
          }
        } else {
          const roll = ctx.rng();
          if (roll < 0.25) {
            placeMesh(ctx.root, new THREE.CylinderGeometry(1.4, 1.4, 2.2, 10), tankMat, bx, h + 1.7, bz, { cast: true });
            placeMesh(ctx.root, new THREE.ConeGeometry(1.6, 1, 10), roofMat, bx, h + 3.3, bz);
          } else if (roll < 0.4) {
            // An AC unit: a small grey box on the roof.
            placeMesh(ctx.root, new THREE.BoxGeometry(2, 1, 2), acMat, bx + 2, h + 1.1, bz, { cast: true });
          } else if (roll < 0.5) {
            // A rooftop garden: a green slab with two small trees.
            placeMesh(ctx.root, new THREE.BoxGeometry(6, 0.3, 6), gardenMat, bx, h + 0.75, bz);
            for (const [tx, tz] of [[-1.5, -1], [1.5, 1]]) {
              placeMesh(ctx.root, new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6), trunkMat, bx + tx, h + 1.5, bz + tz);
              placeMesh(ctx.root, new THREE.SphereGeometry(0.9, 8, 6), leafMat, bx + tx, h + 2.6, bz + tz);
            }
          }
        }
        // A ground-floor shopfront on some towers, facing one of the two
        // roads the block corner fronts: an awning plus a shop sign.
        if (shape !== 'cylinder' && ctx.rng() < 0.25) {
          const alongX = ctx.rng() < 0.5;
          const label = pick(ctx.rng, shopLabels);
          if (alongX) {
            const dir = Math.sign(qx);
            placeMesh(ctx.root, new THREE.BoxGeometry(2.4, 0.2, w * 0.5), awningMat, bx + dir * (w / 2 + 1.2), 3.2, bz, { cast: true });
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.4, w * 0.1), new THREE.MeshBasicMaterial({ map: shopSign(label), transparent: true }));
            sign.position.set(bx + dir * (w / 2 + 0.15), 4.6, bz);
            sign.rotation.y = dir * Math.PI / 2;
            ctx.root.add(sign);
          } else {
            const dir = Math.sign(qz);
            placeMesh(ctx.root, new THREE.BoxGeometry(w * 0.5, 0.2, 2.4), awningMat, bx, 3.2, bz + dir * (d / 2 + 1.2), { cast: true });
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.4, w * 0.1), new THREE.MeshBasicMaterial({ map: shopSign(label), transparent: true }));
            sign.position.set(bx, 4.6, bz + dir * (d / 2 + 0.15));
            sign.rotation.y = dir > 0 ? Math.PI : 0;
            ctx.root.add(sign);
          }
        }
        registerSolid(ctx, bx, bz, plotW / 2, plotD / 2);
        ctx.plots.push({ x: bx, z: bz, w: plotW, d: plotD });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Greenery and street furniture
// ---------------------------------------------------------------------------

// Palms that read as palms: a trunk (varied height, sometimes leaning)
// topped by six to eight drooping fronds in two greens, with a cluster
// of coconuts under the crown. The old single cone crown read as a cone
// on a stick.
function plantPalms(ctx) {
  const bark = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const frondLight = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
  const frondDark = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const nutMat = new THREE.MeshLambertMaterial({ color: 0x6d4c2f });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 1, 6);
  const frondGeo = new THREE.BoxGeometry(0.5, 0.06, 2.8);
  const nutGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const edge = CITY.halfSize;
  const grow = (x, z) => {
    const h = range(ctx.rng, 5, 7.5);
    const palm = new THREE.Group();
    palm.position.set(x, 0, z);
    // A few palms lean, so they do not all stand identically straight.
    if (ctx.rng() < 0.3) {
      palm.rotation.z = range(ctx.rng, -0.06, 0.06);
      palm.rotation.x = range(ctx.rng, -0.04, 0.04);
    }
    ctx.root.add(palm);
    const trunk = new THREE.Mesh(trunkGeo, bark);
    trunk.scale.y = h;
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    palm.add(trunk);
    const frondCount = 6 + Math.floor(ctx.rng() * 3);
    for (let i = 0; i < frondCount; i += 1) {
      const fan = new THREE.Group();
      fan.position.y = h;
      fan.rotation.y = (i / frondCount) * Math.PI * 2 + ctx.rng() * 0.3;
      palm.add(fan);
      const frond = new THREE.Mesh(frondGeo, i % 2 === 0 ? frondLight : frondDark);
      frond.position.set(0, -0.35, 1.3);
      frond.rotation.x = range(ctx.rng, 0.45, 0.7);
      frond.castShadow = true;
      fan.add(frond);
    }
    for (const [nx, ny, nz] of [[0.3, -0.3, 0.2], [-0.25, -0.35, -0.15], [0.05, -0.3, -0.3]]) {
      const nut = new THREE.Mesh(nutGeo, nutMat);
      nut.position.set(nx, h + ny, nz);
      palm.add(nut);
    }
    registerSolid(ctx, x, z, 0.4, 0.4);
  };
  const beachSpan = edge * 2 - 20;
  for (let i = 0; i < 24; i += 1) {
    let x = -edge + 10 + (i / 23) * beachSpan + range(ctx.rng, -5, 5);
    let z = range(ctx.rng, CITY.beachStartZ + 4, CITY.beachStartZ + 26);
    // Keep the beach palms clear of the lighthouse, the lifeguard tower
    // and the pier deck.
    if (Math.hypot(x + 70, z - 184) < 6 || Math.hypot(x - 20, z - 192) < 5) {
      z = Math.min(z + 12, CITY.beachStartZ + 26);
    }
    if (Math.abs(x + 40) < 4) x += 8;
    // Keep off the curved coastal road: move north of it.
    if (Math.abs(z - coastalRoadZ(x)) < 4) z = coastalRoadZ(x) - 8;
    grow(x, z);
  }
  let planted = 0;
  let attempts = 0;
  while (planted < 66 && attempts < 400) {
    attempts += 1;
    const axis = pick(ctx.rng, ctx.axes);
    const along = range(ctx.rng, -edge + 10, edge - 10);
    const side = ctx.rng() < 0.5 ? -9 : 9;
    const vertical = ctx.rng() < 0.5;
    const x = vertical ? axis + side : along;
    const z = vertical ? along : axis + side;
    if (roadTest(ctx.axes, x, z)) continue;
    grow(x, z);
    planted += 1;
  }
}

// Leafy shade trees for the park and a few sidewalks: a trunk with a
// rounded canopy, a different silhouette from the palms. Two slim
// cypresses flank the bank's front.
function plantShadeTrees(ctx) {
  const bark = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leaf = new THREE.MeshLambertMaterial({ color: 0x3d8b40 });
  const leaf2 = new THREE.MeshLambertMaterial({ color: 0x2f7a33 });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3.2, 7);
  const canopyGeo = new THREE.SphereGeometry(2.4, 12, 10);
  const spots = [
    // The park on the (-72, 72) block: a ring of shade trees.
    [-80, 64], [-64, 64], [-80, 80], [-64, 80], [-72, 64], [-72, 80],
    // A few along the -36 avenue sidewalks.
    [-46, -20], [-26, 20], [-46, 100], [-26, 140],
  ];
  for (const [x, z] of spots) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    ctx.root.add(tree);
    const trunk = new THREE.Mesh(trunkGeo, bark);
    trunk.position.y = 1.6;
    trunk.castShadow = true;
    tree.add(trunk);
    const canopy = new THREE.Mesh(canopyGeo, ctx.rng() < 0.5 ? leaf : leaf2);
    canopy.scale.set(1, 0.8, 1);
    canopy.position.y = 4.2;
    canopy.castShadow = true;
    tree.add(canopy);
    registerSolid(ctx, x, z, 0.4, 0.4);
  }
  const cypressMat = new THREE.MeshLambertMaterial({ color: 0x1e5c2e });
  const cypressGeo = new THREE.ConeGeometry(1.1, 7, 8);
  for (const [x, z] of [[40, 40], [64, 40]]) {
    const tree = new THREE.Mesh(cypressGeo, cypressMat);
    tree.position.set(x, 3.5, z);
    tree.castShadow = true;
    ctx.root.add(tree);
    registerSolid(ctx, x, z, 0.4, 0.4);
  }
}

// Low shrubs along the avenue sidewalks and in the park. No collider:
// they are ground-level greenery the player steps past.
function plantBushes(ctx) {
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const bushMat2 = new THREE.MeshLambertMaterial({ color: 0x388e3c });
  const bushGeo = new THREE.SphereGeometry(0.7, 10, 8);
  const spots = [
    [-46, -60], [-26, -40], [-46, 0], [-26, 60], [-46, 120], [-26, 160],
    [-78, 72], [-66, 72], [-72, 66], [-72, 78],
  ];
  for (const [x, z] of spots) {
    const bush = new THREE.Mesh(bushGeo, ctx.rng() < 0.5 ? bushMat : bushMat2);
    bush.scale.set(1, 0.6, 1);
    bush.position.set(x, 0.35, z);
    ctx.root.add(bush);
  }
}

// Fourteen bright parasols scattered over the sand.
function shadeBeach(ctx) {
  const shades = [0xe74c3c, 0xf39c12, 0x2ecc71, 0x9b59b6, 0x1abc9c];
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  for (let i = 0; i < 14; i += 1) {
    let x = range(ctx.rng, -CITY.halfSize + 20, CITY.halfSize - 20);
    let z = range(ctx.rng, CITY.beachStartZ + 8, CITY.beachStartZ + 30);
    // Keep off the coastal road and clear of the lighthouse and the
    // lifeguard tower.
    if (Math.abs(z - coastalRoadZ(x)) < 4) z = coastalRoadZ(x) - 8;
    if (Math.hypot(x + 70, z - 184) < 5 || Math.hypot(x - 20, z - 192) < 4) z -= 10;
    if (Math.abs(x + 40) < 3) x += 8;
    placeMesh(ctx.root, new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), poleMat, x, 1.2, z);
    placeMesh(
      ctx.root,
      new THREE.ConeGeometry(2.4, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: pick(ctx.rng, shades) }),
      x, 2.8, z,
      { cast: true },
    );
  }
}

// Traffic signs: stop, speed-limit, street-name, pedestrian-crossing
// and no-parking signs on the sidewalks, so the streets read as real
// regulated roads. Each sign type draws its canvas texture once and
// reuses it. Signs stand on the kerb (never on a road, never in a
// parking bay), and each post registers a small collider.
function raiseSigns(ctx) {
  // --- sign textures, drawn once ---------------------------------------
  const stopTex = canvasTexture(256, 256, (pen) => {
    pen.clearRect(0, 0, 256, 256);
    // A red octagon.
    pen.fillStyle = '#c0392b';
    pen.beginPath();
    const cx = 128, cy = 128, r = 120;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) pen.moveTo(px, py);
      else pen.lineTo(px, py);
    }
    pen.closePath();
    pen.fill();
    pen.strokeStyle = '#ffffff';
    pen.lineWidth = 6;
    pen.stroke();
    pen.fillStyle = '#ffffff';
    pen.font = '900 88px system-ui, sans-serif';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.fillText('STOP', 128, 132);
  });
  const speedTex = (num) => canvasTexture(128, 160, (pen) => {
    pen.fillStyle = '#ffffff';
    pen.fillRect(0, 0, 128, 160);
    pen.strokeStyle = '#141414';
    pen.lineWidth = 8;
    pen.strokeRect(4, 4, 120, 152);
    pen.fillStyle = '#141414';
    pen.font = '900 60px system-ui, sans-serif';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.fillText('SPEED', 64, 40);
    pen.fillText('LIMIT', 64, 74);
    pen.font = '900 76px system-ui, sans-serif';
    pen.fillText(num, 64, 124);
  });
  const streetTex = (name) => canvasTexture(512, 128, (pen) => {
    pen.fillStyle = '#0a6e3f';
    pen.fillRect(0, 0, 512, 128);
    pen.strokeStyle = '#ffffff';
    pen.lineWidth = 4;
    pen.strokeRect(4, 4, 504, 120);
    pen.fillStyle = '#ffffff';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    // Auto-fit so the street name fills the green board.
    let size = 96;
    pen.font = `700 ${size}px system-ui, sans-serif`;
    while (size > 36 && pen.measureText(name).width > 460) {
      size -= 4;
      pen.font = `700 ${size}px system-ui, sans-serif`;
    }
    pen.fillText(name, 256, 68);
  });
  const pedTex = canvasTexture(256, 256, (pen) => {
    pen.clearRect(0, 0, 256, 256);
    // A yellow diamond with a walking figure.
    pen.fillStyle = '#f1c40f';
    pen.beginPath();
    pen.moveTo(128, 8);
    pen.lineTo(248, 128);
    pen.lineTo(128, 248);
    pen.lineTo(8, 128);
    pen.closePath();
    pen.fill();
    pen.strokeStyle = '#141414';
    pen.lineWidth = 6;
    pen.stroke();
    // A stick figure mid-stride.
    pen.strokeStyle = '#141414';
    pen.lineWidth = 10;
    pen.lineCap = 'round';
    pen.beginPath();
    pen.arc(128, 78, 16, 0, Math.PI * 2);
    pen.stroke();
    pen.beginPath();
    pen.moveTo(128, 96);
    pen.lineTo(128, 150);
    pen.moveTo(128, 112);
    pen.lineTo(104, 132);
    pen.moveTo(128, 112);
    pen.lineTo(152, 132);
    pen.moveTo(128, 150);
    pen.lineTo(108, 196);
    pen.moveTo(128, 150);
    pen.lineTo(150, 188);
    pen.stroke();
  });
  const noParkingTex = canvasTexture(256, 256, (pen) => {
    pen.fillStyle = '#ffffff';
    pen.fillRect(0, 0, 256, 256);
    pen.strokeStyle = '#c0392b';
    pen.lineWidth = 14;
    pen.beginPath();
    pen.arc(128, 108, 82, 0, Math.PI * 2);
    pen.stroke();
    pen.beginPath();
    pen.moveTo(70, 166);
    pen.lineTo(186, 50);
    pen.stroke();
    pen.fillStyle = '#141414';
    pen.font = '900 54px system-ui, sans-serif';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.fillText('NO', 128, 214);
    pen.fillText('PARKING', 128, 240);
  });
  const speed30 = speedTex('30');
  const speed50 = speedTex('50');
  const palmAve = streetTex('PALM AVE');
  const oceanDr = streetTex('OCEAN DR');
  const marinaBlvd = streetTex('MARINA BLVD');

  // --- placement --------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 3.2, 6);
  const sign = (x, z, w, h, tex, rotY, poleH = 3.2) => {
    placeMesh(ctx.root, poleGeo, poleMat, x, poleH / 2, z, { cast: true });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    placeMesh(ctx.root, new THREE.PlaneGeometry(w, h), mat, x, poleH + h / 2 + 0.1, z, { rotY });
    registerSolid(ctx, x, z, 0.3, 0.3);
  };
  // Stop signs at inner intersections along the photographed avenue,
  // on the kerb, facing the road.
  sign(-45, -99, 1.5, 1.5, stopTex, Math.PI / 2);
  sign(-27, 27, 1.5, 1.5, stopTex, -Math.PI / 2);
  sign(-45, 117, 1.5, 1.5, stopTex, Math.PI / 2);
  sign(45, -27, 1.5, 1.5, stopTex, -Math.PI / 2);
  sign(27, 45, 1.5, 1.5, stopTex, Math.PI / 2);
  // Speed limits along the -36 avenue.
  sign(-45, -60, 1.0, 1.25, speed30, Math.PI / 2);
  sign(-27, 60, 1.0, 1.25, speed50, -Math.PI / 2);
  // Street-name signs at intersections.
  sign(-45, -27, 2.4, 0.6, palmAve, Math.PI / 2, 3.4);
  sign(45, 117, 2.4, 0.6, oceanDr, -Math.PI / 2, 3.4);
  sign(-27, 117, 2.4, 0.6, marinaBlvd, -Math.PI / 2, 3.4);
  // A pedestrian crossing on the -36 avenue at z = 0: a sign plus zebra
  // stripes painted across the road.
  sign(-45, 2, 1.5, 1.5, pedTex, Math.PI / 2);
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f0 });
  for (const dz of [-4, -2, 0, 2, 4]) {
    placeMesh(ctx.root, new THREE.BoxGeometry(14, 0.06, 0.8), zebraMat, -36, 0.07, dz);
  }
  // No-parking signs on two streets.
  sign(-45, 30, 1.3, 1.3, noParkingTex, Math.PI / 2);
  sign(-27, -80, 1.3, 1.3, noParkingTex, -Math.PI / 2);
}

// Beautiful European street lamps: an ornate tapered cast-iron post
// (dark green, flared base, a brass collar near the top), a glass
// lantern with a brass pointed cap, and — on the avenues — a curved
// swan-neck arm that sweeps the lantern out over the road. Never a bare
// bulb on a straight pole. Each lamp also leaves a faint pool of light
// on the ground beneath it.
function lightStreets(ctx) {
  const iron = new THREE.MeshLambertMaterial({ color: 0x1e3a2f });
  const brass = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xfff6c8, transparent: true, opacity: 0.18,
    side: THREE.DoubleSide, depthWrite: false,
  });
  ctx.lanternGlow = glow;
  ctx.lanternPool = poolMat;
  const baseGeo = new THREE.CylinderGeometry(0.18, 0.32, 0.6, 8);
  const postGeo = new THREE.CylinderGeometry(0.09, 0.15, 6.0, 8);
  const collarGeo = new THREE.TorusGeometry(0.15, 0.03, 6, 12);
  const glassGeo = new THREE.CylinderGeometry(0.22, 0.32, 0.7, 4);
  const capGeo = new THREE.ConeGeometry(0.38, 0.3, 4);
  const finialGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const poolGeo = new THREE.CircleGeometry(2.6, 16);
  const armSegGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6);

  // A glass lantern: a tapered 4-sided glass body, a brass pointed cap
  // and a finial. The glass glows warm.
  const lantern = (x, y, z) => {
    const glass = new THREE.Mesh(glassGeo, glow);
    glass.position.set(x, y, z);
    glass.rotation.y = Math.PI / 4;
    ctx.root.add(glass);
    const cap = new THREE.Mesh(capGeo, brass);
    cap.position.set(x, y + 0.45, z);
    cap.rotation.y = Math.PI / 4;
    ctx.root.add(cap);
    const finial = new THREE.Mesh(finialGeo, brass);
    finial.position.set(x, y + 0.65, z);
    ctx.root.add(finial);
  };
  // The ornate post: a flared foot, a tapered shaft and a brass collar.
  const post = (x, z, height = 6.0) => {
    placeMesh(ctx.root, baseGeo, iron, x, 0.3, z);
    const shaft = new THREE.Mesh(postGeo, iron);
    shaft.scale.y = height / 6.0;
    shaft.position.set(x, 0.6 + height / 2, z);
    shaft.castShadow = true;
    ctx.root.add(shaft);
    placeMesh(ctx.root, collarGeo, brass, x, 0.6 + height - 0.7, z, { rotX: Math.PI / 2 });
  };
  const pool = (x, z, y) => {
    placeMesh(ctx.root, poolGeo, poolMat, x, y, z, { rotX: -Math.PI / 2 });
  };
  // A straight ornate post with the lantern on top.
  const lampStraight = (x, z) => {
    post(x, z);
    lantern(x, 6.9, z);
    pool(x, z, 0.32);
  };
  // A swan-neck arm over the road: the post, then a curved arm (a short
  // rise, a diagonal sweep, a level reach) and the lantern hanging at its
  // end, out over the road. dirX = +1 sweeps east, -1 west.
  const lampCurved = (x, z, dirX) => {
    post(x, z);
    const rise = new THREE.Mesh(armSegGeo, iron);
    rise.position.set(x, 6.4, z);
    rise.scale.y = 0.6;
    ctx.root.add(rise);
    const sweep = new THREE.Mesh(armSegGeo, iron);
    sweep.position.set(x + dirX * 0.7, 6.9, z);
    sweep.rotation.z = dirX * Math.PI / 4;
    sweep.scale.y = 1.4;
    ctx.root.add(sweep);
    const reach = new THREE.Mesh(armSegGeo, iron);
    reach.position.set(x + dirX * 1.6, 7.3, z);
    reach.rotation.z = Math.PI / 2;
    reach.scale.y = 0.9;
    ctx.root.add(reach);
    const rod = new THREE.Mesh(armSegGeo, iron);
    rod.position.set(x + dirX * 2.0, 7.0, z);
    rod.scale.y = 0.5;
    ctx.root.add(rod);
    lantern(x + dirX * 2.0, 6.6, z);
    pool(x + dirX * 2.0, z, 0.08);
  };
  // A double lantern: a taller post with a curved arm and a lantern on
  // each side, for the main square.
  const lampDouble = (x, z) => {
    post(x, z, 7.0);
    for (const dirX of [-1, 1]) {
      const sweep = new THREE.Mesh(armSegGeo, iron);
      sweep.position.set(x + dirX * 0.7, 7.4, z);
      sweep.rotation.z = dirX * Math.PI / 4;
      sweep.scale.y = 1.4;
      ctx.root.add(sweep);
      const reach = new THREE.Mesh(armSegGeo, iron);
      reach.position.set(x + dirX * 1.6, 7.8, z);
      reach.rotation.z = Math.PI / 2;
      reach.scale.y = 0.9;
      ctx.root.add(reach);
      const rod = new THREE.Mesh(armSegGeo, iron);
      rod.position.set(x + dirX * 2.0, 7.5, z);
      rod.scale.y = 0.5;
      ctx.root.add(rod);
      lantern(x + dirX * 2.0, 7.1, z);
    }
    pool(x, z, 0.32);
  };

  const corners = [[8.4, 8.4], [-8.4, 8.4], [8.4, -8.4], [-8.4, -8.4]];
  // A lamp at every intersection, one corner each (straight ornate post).
  for (const sx of ctx.axes) {
    for (const sz of ctx.axes) {
      const [cx, cz] = pick(ctx.rng, corners);
      lampStraight(sx + cx, sz + cz);
    }
  }
  // Curved-arm lamps along the two main avenues (-36 and 36), both sides,
  // every ~24 m, the lantern sweeping out over the road — dense enough
  // that the avenues read as lit at night, not as dark gaps between
  // isolated lamps. (Fixed positions, no rng draws, so the city layout
  // is unchanged.)
  for (const avenue of [-36, 36]) {
    for (let along = -162; along <= 162; along += 24) {
      lampCurved(avenue - 9, along, 1);   // west kerb, arm sweeps east
      lampCurved(avenue + 9, along, -1);  // east kerb, arm sweeps west
    }
  }
  // Double lanterns flanking the park square.
  lampDouble(-80, 64);
  lampDouble(-64, 80);
}

// Traffic lights at the inner crossings: a pole, a head box and three lamps
// that cycle on their own offset so the city never blinks in unison.
function wireSignals(ctx) {
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const edge = CITY.halfSize;
  const inner = ctx.axes.filter((axis) => axis > -edge + 40 && axis < edge - 40);
  for (const sx of inner) {
    for (const sz of inner) {
      const px = sx + 8.2;
      const pz = sz + 8.2;
      placeMesh(ctx.root, new THREE.CylinderGeometry(0.14, 0.14, 6.5, 6), postMat, px, 3.25, pz);
      placeMesh(ctx.root, new THREE.BoxGeometry(0.6, 1.8, 0.6), postMat, px, 6.6, pz);
      const red = placeMesh(ctx.root, new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x551111 }), px, 7.1, pz + 0.35);
      const amber = placeMesh(ctx.root, new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x554411 }), px, 6.6, pz + 0.35);
      const green = placeMesh(ctx.root, new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x115511 }), px, 6.1, pz + 0.35);
      ctx.signals.push({ red, amber, green, offset: ctx.rng() * SIGNAL_PERIOD });
    }
  }
}

// Which colour a signal shows at a given clock reading.
function signalPhase(clock, offset) {
  const t = (clock + offset) % SIGNAL_PERIOD;
  if (t < GREEN_SPAN) return 'go';
  if (t < GREEN_SPAN + AMBER_SPAN) return 'slow';
  return 'stop';
}

// ---------------------------------------------------------------------------
// Ferris wheel, pier and boat
// ---------------------------------------------------------------------------

// The wheel over the boardwalk: two leaning legs, a rim with eight spokes
// and a hub, and eight cabins that ride on the rim. The cabins are children
// of the spinning rim, so the per-frame update only has to turn the rim and
// counter-rotate each cabin to keep it hanging level.
function raiseWheel(ctx) {
  const frame = new THREE.Group();
  frame.position.set(CITY.wheelX, 0, CITY.wheelZ);
  ctx.root.add(frame);
  const steel = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  for (const side of [-7, 7]) {
    placeMesh(frame, new THREE.CylinderGeometry(0.5, 0.7, 20, 8), steel, side, 10, 0, { rotZ: side > 0 ? 0.35 : -0.35, cast: true });
  }
  const rim = new THREE.Group();
  rim.position.set(0, 20, 0);
  frame.add(rim);
  placeMesh(rim, new THREE.TorusGeometry(11, 0.5, 8, 40), new THREE.MeshLambertMaterial({ color: 0xe74c3c }), 0, 0, 0);
  const spokeMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
  for (let s = 0; s < 8; s += 1) {
    placeMesh(rim, new THREE.BoxGeometry(0.35, 22, 0.35), spokeMat, 0, 0, 0, { rotZ: (s * Math.PI) / 8 });
  }
  placeMesh(rim, new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffc861 }), 0, 0, 0);
  const cabinPaints = [0xe74c3c, 0xf39c12, 0x2ecc71, 0x3498db, 0x9b59b6];
  const cabins = [];
  for (let c = 0; c < 8; c += 1) {
    const angle = (c / 8) * Math.PI * 2;
    const cabin = placeMesh(
      rim,
      new THREE.BoxGeometry(2.2, 1.8, 1.8),
      new THREE.MeshLambertMaterial({ color: cabinPaints[c % cabinPaints.length] }),
      Math.cos(angle) * 11, Math.sin(angle) * 11, 0,
      { cast: true },
    );
    cabins.push(cabin);
  }
  registerSolid(ctx, CITY.wheelX, CITY.wheelZ, 8, 2);
  ctx.wheel = { rim, cabins };
}

// The marina pier: a timber deck running from the boardwalk out over the
// sea on pilings, with the story's boat moored alongside it.
function buildPier(ctx) {
  const timber = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  placeMesh(ctx.root, new THREE.BoxGeometry(6, 0.3, 42), timber, CITY.pierX, 0.12, CITY.beachStartZ + 20, { receive: true });
  for (const dz of [4, 20, 36]) {
    for (const dx of [-2.6, 2.6]) {
      placeMesh(ctx.root, new THREE.CylinderGeometry(0.25, 0.25, 2.2, 6), timber, CITY.pierX + dx, 0.4, CITY.beachStartZ + dz);
    }
  }
  const boat = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 9), hullMat);
  hull.position.y = 0.7;
  hull.castShadow = true;
  boat.add(hull);
  const prow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 4), hullMat);
  prow.rotation.x = Math.PI / 2;
  prow.rotation.y = Math.PI / 4;
  prow.position.set(0, 0.7, 5.4);
  boat.add(prow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3), new THREE.MeshLambertMaterial({ color: 0x2e86c1 }));
  cabin.position.set(0, 1.9, -1);
  cabin.castShadow = true;
  boat.add(cabin);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
  );
  mast.position.set(0, 4, -1);
  boat.add(mast);
  boat.position.set(CITY.pierX + 6, 0.1, CITY.beachStartZ + 34);
  boat.rotation.y = 0.3;
  ctx.root.add(boat);
  ctx.boat = boat;
}

// The curved coastal road: a dark band that follows the sine along the
// shore, with pale centre dashes, so the beachfront reads as a scenic
// coastal drive instead of another grid street. It is a visual on open
// sand — the player can already drive there, so it needs no collider and
// changes no traffic, mission or minimap grid. The segments skip the
// pier, which crosses the beach at x = -40.
function paveCoastalRoad(ctx) {
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  for (let x = -180; x <= 180; x += 10) {
    if (x > -50 && x < -30) continue; // the pier crosses here
    const z = coastalRoadZ(x);
    const slope = (6 / 40) * Math.cos(x / 40);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 7), roadMat);
    seg.position.set(x, 0.08, z);
    seg.rotation.y = -Math.atan(slope);
    seg.receiveShadow = true;
    ctx.root.add(seg);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.35), dashMat);
    dash.position.set(x, 0.13, z);
    dash.rotation.y = -Math.atan(slope);
    ctx.root.add(dash);
  }
}

// ---------------------------------------------------------------------------
// Parking
// ---------------------------------------------------------------------------

// Kerb bays along the streets, clear of the crossings: two bays per stop,
// one facing along each axis.
function markParking(ctx) {
  const edge = CITY.halfSize;
  const stops = [];
  for (let along = -edge + 30; along < edge - 20; along += 36) stops.push(along);
  const spots = [];
  for (const axis of ctx.axes) {
    for (const along of stops) {
      if (ctx.rng() < 0.35) continue;
      spots.push({ x: axis + 6, z: along, heading: Math.PI / 2 });
      spots.push({ x: along, z: axis + 6, heading: 0 });
    }
  }
  return spots;
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

// Push a circle out of every solid it overlaps. The closest point on the
// box gives the push direction; when the centre is dead inside the box,
// the four edge distances are weighed and the shallowest escape wins.
function pushCircleOut(solids, pos, radius) {
  for (const box of solids) {
    const nearX = Math.max(box.minX, Math.min(pos.x, box.maxX));
    const nearZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      pos.x = nearX + (dx / dist) * radius;
      pos.z = nearZ + (dz / dist) * radius;
      continue;
    }
    const escapes = [
      { axis: 'x', to: box.minX - radius, depth: pos.x - box.minX },
      { axis: 'x', to: box.maxX + radius, depth: box.maxX - pos.x },
      { axis: 'z', to: box.minZ - radius, depth: pos.z - box.minZ },
      { axis: 'z', to: box.maxZ + radius, depth: box.maxZ - pos.z },
    ];
    let best = escapes[0];
    for (const candidate of escapes) {
      if (candidate.depth < best.depth) best = candidate;
    }
    if (best.axis === 'x') pos.x = best.to;
    else pos.z = best.to;
  }
}

// Keep a position inside the playable area. The sea stops the player —
// except on the pier, where the deck runs forty metres out over the water.
function clampToShore(pos) {
  const edge = CITY.halfSize;
  const onPier = Math.abs(pos.x - CITY.pierX) < 3.5;
  const southLimit = CITY.beachStartZ + (onPier ? 40 : 34);
  pos.x = Math.max(-edge, Math.min(edge, pos.x));
  pos.z = Math.max(-edge, Math.min(southLimit, pos.z));
}

// ---------------------------------------------------------------------------
// Per-frame life
// ---------------------------------------------------------------------------

// The wheel turns, the cabins stay level, the boat rides the swell and
// the signals walk their cycle.
function tickCity(ctx, dt) {
  ctx.clock += dt;
  const { rim, cabins } = ctx.wheel;
  rim.rotation.z += dt * 0.12;
  for (const cabin of cabins) cabin.rotation.z = -rim.rotation.z;
  ctx.boat.position.y = 0.1 + Math.sin(ctx.clock * 0.9) * 0.14;
  ctx.boat.rotation.z = Math.sin(ctx.clock * 0.6) * 0.02;
  for (const signal of ctx.signals) {
    const phase = signalPhase(ctx.clock, signal.offset);
    signal.red.material.color.setHex(phase === 'stop' ? 0xff2222 : 0x551111);
    signal.amber.material.color.setHex(phase === 'slow' ? 0xf1c40f : 0x554411);
    signal.green.material.color.setHex(phase === 'go' ? 0x2ecc71 : 0x115511);
  }
}

// Fill the empty foreground of the 4-city shot ----------------------------
// The city shot drives south down the -36 avenue toward the marina, and
// its left foreground — the strip east of the avenue between the 36 and
// 108 streets, in front of the hotel — reads as bare grey ground: the
// hotel's clear zone kept the procedural fillers out of it. So this pass
// plants a row of palms along the east sidewalk, two shade trees in the
// hotel forecourt and one low cafe with a sign facing the avenue.
// Everything is fixed (positions, heights, colours, signs) and draws no
// rng, so the seeded city around it is byte-identical — no tower, plot
// or palm moves.
function fillCityShotForeground(ctx) {
  // --- palms, same build as plantPalms but fixed -------------------------
  const bark = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const frondLight = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
  const frondDark = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const nutMat = new THREE.MeshLambertMaterial({ color: 0x6d4c2f });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 1, 6);
  const frondGeo = new THREE.BoxGeometry(0.5, 0.06, 2.8);
  const nutGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const palmSpots = [
    // x, z, height, frond count, lean
    [-24, 58, 6.5, 7, 0.03],
    [-23, 76, 7, 8, -0.04],
    [-25, 94, 5.5, 6, 0.02],
  ];
  for (const [x, z, h, count, lean] of palmSpots) {
    const palm = new THREE.Group();
    palm.position.set(x, 0, z);
    palm.rotation.z = lean;
    ctx.root.add(palm);
    const trunk = new THREE.Mesh(trunkGeo, bark);
    trunk.scale.y = h;
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    palm.add(trunk);
    for (let i = 0; i < count; i += 1) {
      const fan = new THREE.Group();
      fan.position.y = h;
      fan.rotation.y = (i / count) * Math.PI * 2 + 0.15;
      palm.add(fan);
      const frond = new THREE.Mesh(frondGeo, i % 2 === 0 ? frondLight : frondDark);
      frond.position.set(0, -0.35, 1.3);
      frond.rotation.x = 0.55;
      frond.castShadow = true;
      fan.add(frond);
    }
    for (const [nx, ny, nz] of [[0.3, -0.3, 0.2], [-0.25, -0.35, -0.15], [0.05, -0.3, -0.3]]) {
      const nut = new THREE.Mesh(nutGeo, nutMat);
      nut.position.set(nx, h + ny, nz);
      palm.add(nut);
    }
    registerSolid(ctx, x, z, 0.4, 0.4);
  }
  // --- shade trees in the hotel forecourt ---------------------------------
  const treeBark = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leaf = new THREE.MeshLambertMaterial({ color: 0x3d8b40 });
  const leaf2 = new THREE.MeshLambertMaterial({ color: 0x2f7a33 });
  const treeTrunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3.2, 7);
  const canopyGeo = new THREE.SphereGeometry(2.4, 12, 10);
  for (const [x, z, mat] of [[-20, 64, leaf], [-14, 82, leaf2]]) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    ctx.root.add(tree);
    const trunk = new THREE.Mesh(treeTrunkGeo, treeBark);
    trunk.position.y = 1.6;
    trunk.castShadow = true;
    tree.add(trunk);
    const canopy = new THREE.Mesh(canopyGeo, mat);
    canopy.scale.set(1, 0.8, 1);
    canopy.position.y = 4.2;
    canopy.castShadow = true;
    tree.add(canopy);
    registerSolid(ctx, x, z, 0.4, 0.4);
  }
  // --- one low cafe, sign facing the avenue --------------------------------
  // Set back from the sidewalk, clear of the hotel (its west face is at
  // x = -9; the cafe's east wall is at x = -10) and clear of the 108
  // street (its north wall is at z = 98; the street starts at z = 100).
  const cafeCoat = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
  placeMesh(ctx.root, new THREE.BoxGeometry(12, 6, 12), cafeCoat, -16, 3.3, 92, { cast: true, receive: true });
  placeMesh(ctx.root, new THREE.BoxGeometry(12.5, 0.4, 12.5), new THREE.MeshLambertMaterial({ color: 0x6b6258 }), -16, 6.5, 92);
  const cafeSign = new THREE.MeshBasicMaterial({ map: signTexture('CAFE', '#ffd97a') });
  placeMesh(ctx.root, new THREE.PlaneGeometry(7, 1.75), cafeSign, -22.1, 5.2, 92, { rotY: -Math.PI / 2 });
  registerSolid(ctx, -16, 92, 6, 6);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function buildWorld(scene) {
  const ctx = freshContext(scene);
  layTerrain(ctx);
  laySidewalks(ctx);
  raiseBank(ctx);
  raiseLandmarks(ctx);
  raiseTowers(ctx);
  fillPlots(ctx);
  plantPalms(ctx);
  plantShadeTrees(ctx);
  plantBushes(ctx);
  shadeBeach(ctx);
  lightStreets(ctx);
  raiseSigns(ctx);
  wireSignals(ctx);
  raiseWheel(ctx);
  raiseGarage(ctx);
  raiseShop(ctx);
  raiseTower(ctx);
  stretchCanopy(ctx);
  buildPier(ctx);
  paveCoastalRoad(ctx);
  paintRoadLines(ctx);
  fillCityShotForeground(ctx);
  const parking = markParking(ctx);
  return {
    group: ctx.root,
    colliders: ctx.solids,
    streets: ctx.axes,
    windowMats: ctx.windowMats,
    lanternGlow: ctx.lanternGlow,
    lanternPool: ctx.lanternPool,
    parkingSpots: parking,
    playerSpawn: { x: 0, z: -40, heading: 0 },
    garageSpot: { x: -150, z: -108 },
    shopSpot: { x: 108, z: -36 },
    towerSpot: { x: -52, z: 178 },
    bankSpot: { x: CITY.bankX, z: CITY.bankZ },
    pierSpot: { x: CITY.pierX, z: CITY.pierZ },
    wheelSpot: { x: CITY.wheelX, z: CITY.wheelZ },
    update(dt) { tickCity(ctx, dt); },
    // Roadblocks register and drop their own footprints here, so the
    // collider list stays the one array the resolver reads.
    addCollider(box) { ctx.solids.push(box); },
    removeCollider(box) {
      const at = ctx.solids.indexOf(box);
      if (at !== -1) ctx.solids.splice(at, 1);
    },
    resolveCircle(pos, radius) {
      pushCircleOut(ctx.solids, pos, radius);
      clampToShore(pos);
    },
    isOnRoad(x, z) { return roadTest(ctx.axes, x, z); },
  };
}
