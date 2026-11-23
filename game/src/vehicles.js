// SOLMARINA — vehicles.js
// One job: car models with readable, varied silhouettes — sedan, hatchback,
// van, pickup, taxi, sports — plus the shared drive feel (wheels that spin
// and steer). Traffic, police and the player all drive these.

// three.js loads as a classic script in index.html before any module runs.
const THREE = window.THREE;
import { CAR_PAINTS } from './config.js';

export const CAR_KINDS = ['sedan', 'hatch', 'van', 'pickup', 'taxi', 'sports', 'convertible'];

function paintMat(color, rough = 0.35, metal = 0.5) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

export function makeCarModel(kind, paint, rng) {
  const g = new THREE.Group();
  g.name = `Car_${kind}`;
  const body = paintMat(paint.body);
  const dark = paintMat(0x14181f, 0.2, 0.1);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.1, metalness: 0.6 });

  const dims = {
    sedan: { l: 4.4, w: 1.9, h: 0.62, cabinL: 2.2, cabinH: 0.55 },
    hatch: { l: 3.7, w: 1.8, h: 0.66, cabinL: 2.0, cabinH: 0.6 },
    van: { l: 4.9, w: 2.0, h: 1.15, cabinL: 3.4, cabinH: 0.85 },
    pickup: { l: 4.8, w: 1.95, h: 0.7, cabinL: 1.9, cabinH: 0.6 },
    taxi: { l: 4.4, w: 1.9, h: 0.62, cabinL: 2.2, cabinH: 0.55 },
    sports: { l: 4.3, w: 2.0, h: 0.48, cabinL: 1.9, cabinH: 0.42 },
    convertible: { l: 4.2, w: 1.9, h: 0.55, cabinL: 1.6, cabinH: 0.3 },
  }[kind] || { l: 4.4, w: 1.9, h: 0.62, cabinL: 2.2, cabinH: 0.55 };

  const lower = new THREE.Mesh(new THREE.BoxGeometry(dims.l, dims.h, dims.w), body);
  lower.position.y = 0.55;
  lower.castShadow = true;
  g.add(lower);

  if (kind !== 'convertible') {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(dims.cabinL, dims.cabinH, dims.w - 0.24), glass);
    cabin.position.set(kind === 'van' ? -0.3 : -0.15, 0.55 + dims.h / 2 + dims.cabinH / 2 - 0.05, 0);
    cabin.castShadow = true;
    g.add(cabin);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(dims.cabinL * 0.9, 0.08, dims.w - 0.2),
      body,
    );
    roof.position.set(kind === 'van' ? -0.3 : -0.15, 0.55 + dims.h / 2 + dims.cabinH - 0.02, 0);
    g.add(roof);
  }

  if (kind === 'pickup') {
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.35, dims.w - 0.3),
      paintMat(0x222222, 0.9, 0),
    );
    bed.position.set(1.35, 0.95, 0);
    g.add(bed);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), paintMat(0xf7c948, 0.5, 0.2));
    sign.position.set(-0.15, 1.42, 0);
    g.add(sign);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(dims.l + 0.02, 0.14, dims.w + 0.02),
      paintMat(0x111111, 0.6, 0),
    );
    stripe.position.y = 0.72;
    g.add(stripe);
  }
  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 1.7), dark);
    spoiler.position.set(-dims.l / 2 + 0.25, 1.02, 0);
    g.add(spoiler);
  }

  // Headlights and taillights, so cars read at dusk and night.
  const lightGeo = new THREE.BoxGeometry(0.08, 0.16, 0.34);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xdd1111, emissiveIntensity: 0.8 });
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(lightGeo, headMat);
    hl.position.set(dims.l / 2, 0.62, side * (dims.w / 2 - 0.25));
    g.add(hl);
    const tl = new THREE.Mesh(lightGeo, tailMat);
    tl.position.set(-dims.l / 2, 0.62, side * (dims.w / 2 - 0.25));
    g.add(tl);
  }

  // Wheels: dark tyres, light hubs, front pair steers.
  const wheels = [];
  const tyreMat = paintMat(0x111111, 0.95, 0);
  const hubMat = paintMat(0xbbbbbb, 0.35, 0.8);
  for (const [wx, wz, front] of [
    [dims.l / 2 - 0.85, dims.w / 2 - 0.05, true],
    [dims.l / 2 - 0.85, -dims.w / 2 + 0.05, true],
    [-dims.l / 2 + 0.85, dims.w / 2 - 0.05, false],
    [-dims.l / 2 + 0.85, -dims.w / 2 + 0.05, false],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), tyreMat);
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    pivot.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 10), hubMat);
    hub.rotation.x = Math.PI / 2;
    pivot.add(hub);
    g.add(pivot);
    wheels.push({ pivot, tyre, front });
  }

  return {
    group: g,
    wheels,
    kind,
    length: dims.l,
    width: dims.w,
    setHeadlights(on) {
      headMat.emissiveIntensity = on ? 2.2 : 1.2;
    },
    steer(angle, speed) {
      for (const w of wheels) {
        if (w.front) w.pivot.rotation.y = angle;
        w.tyre.rotation.z -= (speed * 0.016) / 0.36;
      }
    },
  };
}

export function randomCarModel(rng) {
  const kind = rng.pick(CAR_KINDS);
  const paint = kind === 'taxi'
    ? { name: 'Taxi', body: 0xf7c948, trim: 0x111111 }
    : rng.pick(CAR_PAINTS);
  return makeCarModel(kind, paint, rng);
}

// A parked car that never moves — fills kerbs so no roadside plot is empty.
export function makeParkedCar(rng, kind, paint) {
  const car = makeCarModel(kind || rng.pick(CAR_KINDS), paint || rng.pick(CAR_PAINTS), rng);
  return car;
}
