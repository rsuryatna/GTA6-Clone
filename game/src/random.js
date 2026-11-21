// Seeded randomness for SOLMARINA.
//
// The city grows from one fixed seed, so every player (and every
// screenshot run) gets the same streets, the same buildings, the same
// Solmarina. Nothing here touches Math.random: determinism is the point.
//
// The generator below is mulberry32; the helpers are the only way the rest
// of the game draws from it — picks, ranges, shuffles, a bell-curved draw
// for natural-looking variation, and a weighted draw for loot tables.

const UINT32 = 4294967296;
const MIX_STEP = 0x6d2b79f5;

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + MIX_STEP) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

// Turn a string into a seed (FNV-1a), so a named place can have its own stream.
export function seedFromString(text) {
  let hash = 2166136261;
  let i = 0;
  while (i < text.length) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    i += 1;
  }
  return hash >>> 0;
}

export function pick(rng, array) {
  return array[(rng() * array.length) | 0];
}

export function range(rng, min, max) {
  return min + (max - min) * rng();
}

export function rangeInt(rng, min, max) {
  return Math.floor(min + rng() * (max + 1 - min));
}

// A bell-curved draw around `mean`: most values land close to the middle,
// a few stray. Good for building heights and pedestrian speeds, where a
// flat range looks too even.
export function gauss(rng, mean, spread) {
  const u = Math.max(rng(), 1e-9);
  const v = Math.max(rng(), 1e-9);
  const radius = Math.sqrt(-2 * Math.log(u));
  const angle = 2 * Math.PI * v;
  return mean + radius * Math.cos(angle) * spread;
}

// Pick an entry by weight: entries are [value, weight] pairs, and the
// chance of each is its weight over the total.
export function weightedPick(rng, entries) {
  let total = 0;
  for (let i = 0; i < entries.length; i += 1) total += entries[i][1];
  let roll = rng() * total;
  for (let i = 0; i < entries.length; i += 1) {
    roll -= entries[i][1];
    if (roll <= 0) return entries[i][0];
  }
  return entries[entries.length - 1][0];
}

// A shuffled copy of an array (Fisher-Yates), using the seeded rng so the
// same seed always shuffles the same way.
export function shuffle(rng, array) {
  const out = array.slice();
  let i = out.length;
  while (i > 1) {
    i -= 1;
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
