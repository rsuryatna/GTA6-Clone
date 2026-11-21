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
import { CITY, PALETTE } from './config.js';
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

// The repeating window grid every tower wears. Drawn from the seeded
// stream, so the lit and dark windows are the same on every run.
function windowsTexture(rng) {
  return canvasTexture(64, 64, (pen) => {
    pen.fillStyle = '#ffffff';
    pen.fillRect(0, 0, 64, 64);
    const lit = ['#ffd97a', '#9fd8ff', '#fff3c8', '#ffb36b'];
    for (let top = 4; top + 8 <= 64; top += 12) {
      for (let left = 4; left + 7 <= 64; left += 12) {
        const glowing = rng() < 0.55;
        pen.fillStyle = glowing ? lit[Math.floor(rng() * lit.length)] : '#2c3440';
        pen.fillRect(left, top, 7, 8);
      }
    }
  });
}

// A bold shop sign: light text on a dark board with a coloured frame.
function signTexture(label, ink) {
  return canvasTexture(512, 128, (pen) => {
    pen.fillStyle = '#14181f';
    pen.fillRect(0, 0, 512, 128);
    pen.strokeStyle = ink;
    pen.lineWidth = 6;
    pen.strokeRect(6, 6, 500, 116);
    pen.fillStyle = ink;
    pen.font = '900 64px system-ui, sans-serif';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
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
    new THREE.PlaneGeometry(15, 2.4),
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
    new THREE.PlaneGeometry(9, 2.2),
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
    new THREE.PlaneGeometry(13, 2.2),
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

// A point is off limits for random towers when it crowds the bank plot or
// the ferris wheel plot.
function nearLandmark(x, z) {
  if (Math.hypot(x - 52, z - 52) < 20) return true;
  return Math.hypot(x - CITY.wheelX, z - CITY.wheelZ) < 22;
}

// Towers grow out of block quadrants: each block is split into four
// quarters, one to three of them are picked at random, and a tower with a
// jittered footprint rises from each chosen quarter. Heights are mostly
// modest, with the odd tall one.
function raiseTowers(ctx) {
  const skin = windowsTexture(ctx.rng);
  const paints = PALETTE.building.map((tone) => new THREE.MeshLambertMaterial({ color: tone, map: skin }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6258 });
  const quarters = [[-14, -14], [14, -14], [-14, 14], [14, 14]];
  for (const cx of ctx.centres) {
    for (const cz of ctx.centres) {
      const count = rangeInt(ctx.rng, 1, 3);
      const chosen = shuffle(ctx.rng, quarters).slice(0, count);
      for (const [qx, qz] of chosen) {
        const w = range(ctx.rng, 14, 24);
        const d = range(ctx.rng, 14, 24);
        let h = range(ctx.rng, 10, 42);
        if (ctx.rng() < 0.15) h *= 1.8;
        const bx = cx + qx + range(ctx.rng, -6, 6);
        const bz = cz + qz + range(ctx.rng, -6, 6);
        if (nearLandmark(bx, bz)) continue;
        const coat = pick(ctx.rng, paints).clone();
        coat.map = skin.clone();
        coat.map.needsUpdate = true;
        coat.map.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6)));
        placeMesh(ctx.root, new THREE.BoxGeometry(w, h, d), coat, bx, h / 2 + 0.3, bz, { cast: true, receive: true });
        placeMesh(ctx.root, new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), roofMat, bx, h + 0.6, bz);
        registerSolid(ctx, bx, bz, w / 2, d / 2);
        ctx.plots.push({ x: bx, z: bz, w, d });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Greenery and street furniture
// ---------------------------------------------------------------------------

// Palms in two groups: a loose row spread along the sand, and a larger
// group hugging the kerbs — nine metres off a street axis, on either side,
// never standing in the road itself.
function plantPalms(ctx) {
  const bark = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const fronds = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const crownGeo = new THREE.ConeGeometry(2.2, 2.6, 7);
  const edge = CITY.halfSize;
  const grow = (x, z) => {
    placeMesh(ctx.root, trunkGeo, bark, x, 3.3, z, { cast: true });
    placeMesh(ctx.root, crownGeo, fronds, x, 7.2, z, { cast: true });
    registerSolid(ctx, x, z, 0.4, 0.4);
  };
  const beachSpan = edge * 2 - 20;
  for (let i = 0; i < 24; i += 1) {
    const x = -edge + 10 + (i / 23) * beachSpan + range(ctx.rng, -5, 5);
    const z = range(ctx.rng, CITY.beachStartZ + 4, CITY.beachStartZ + 26);
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

// Ten bright parasols scattered over the sand.
function shadeBeach(ctx) {
  const shades = [0xe74c3c, 0xf39c12, 0x2ecc71, 0x9b59b6, 0x1abc9c];
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  for (let i = 0; i < 10; i += 1) {
    const x = range(ctx.rng, -CITY.halfSize + 20, CITY.halfSize - 20);
    const z = range(ctx.rng, CITY.beachStartZ + 8, CITY.beachStartZ + 30);
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

// Lamp posts at the intersections, one corner each, a little more than half
// the crossings lit.
function lightStreets(ctx) {
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const corners = [[8.4, 8.4], [-8.4, 8.4], [8.4, -8.4], [-8.4, -8.4]];
  for (const sx of ctx.axes) {
    for (const sz of ctx.axes) {
      if (ctx.rng() < 0.4) continue;
      const [cx, cz] = pick(ctx.rng, corners);
      placeMesh(ctx.root, new THREE.CylinderGeometry(0.12, 0.12, 7, 6), postMat, sx + cx, 3.5, sz + cz);
      placeMesh(ctx.root, new THREE.SphereGeometry(0.35, 8, 6), glowMat, sx + cx, 7.1, sz + cz);
    }
  }
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

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function buildWorld(scene) {
  const ctx = freshContext(scene);
  layTerrain(ctx);
  laySidewalks(ctx);
  raiseBank(ctx);
  raiseTowers(ctx);
  plantPalms(ctx);
  shadeBeach(ctx);
  lightStreets(ctx);
  wireSignals(ctx);
  raiseWheel(ctx);
  raiseGarage(ctx);
  raiseShop(ctx);
  raiseTower(ctx);
  stretchCanopy(ctx);
  buildPier(ctx);
  paintRoadLines(ctx);
  const parking = markParking(ctx);
  return {
    group: ctx.root,
    colliders: ctx.solids,
    streets: ctx.axes,
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
