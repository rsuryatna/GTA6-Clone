// SOLMARINA — random.js
// One job: deterministic seeded randomness, so the city, the crowds and the
// screenshot staging look the same on every load with the same seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float() {
    return this.next();
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
  // A smooth value-noise helper for gentle height / colour variation.
  noise1(x) {
    const i = Math.floor(x);
    const f = x - i;
    const a = mulberry32(i * 7919 + 13)();
    const b = mulberry32((i + 1) * 7919 + 13)();
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  }
}

// A tiny shuffle that never mutates its input.
export function shuffled(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.float() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

// Pick a point inside a disc, for spawning crowds and traffic naturally.
export function pointInDisc(rng, cx, cz, r) {
  const a = rng.float() * Math.PI * 2;
  const d = Math.sqrt(rng.float()) * r;
  return { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d };
}
