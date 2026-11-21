// Save and load for SOLMARINA: one localStorage key holds cash, mission
// progress, health and where the player stood, so Continue resumes the story.
//
// The save is versioned in the payload (SAVE_VERSION) and the key name
// never changes, so an old save still loads: every field is rebuilt from a
// defaults table, and anything missing or mistyped falls back to its
// default instead of breaking the load. Version 3 adds the lifetime stats
// block (jobs done, cars stolen, times busted) and the vest; version 2
// added respect, the weapon wheel, the garage and the radio station.

export const SAVE_KEY = 'solmarina.save.v1';
export const SAVE_VERSION = 3;

// Field name -> fallback value, in the order the normalised save carries them.
const NUMBER_FIELDS = [
  ['cash', 150],
  ['missionIndex', 0],
  ['health', 100],
  ['vest', 0],
  ['x', 0],
  ['z', -40],
  ['wanted', 0],
  ['respect', 0],
];

const STAT_FIELDS = [
  ['jobsDone', 0],
  ['carsStolen', 0],
  ['timesBusted', 0],
  ['timesWasted', 0],
];

function asNumber(value, fallback) {
  return typeof value === 'number' ? value : fallback;
}

function asObject(value) {
  return value !== null && typeof value === 'object' ? value : null;
}

function buildFromTable(source, table) {
  const out = {};
  for (const [key, fallback] of table) out[key] = asNumber(source[key], fallback);
  return out;
}

export function normalizeSave(data) {
  const src = asObject(data) || {};
  const out = buildFromTable(src, NUMBER_FIELDS);
  out.weapons = asObject(src.weapons);
  out.garage = asObject(src.garage);
  out.radioStation = asNumber(src.radioStation, 0);
  out.stats = buildFromTable(asObject(src.stats) || {}, STAT_FIELDS);
  out.version = SAVE_VERSION;
  return out;
}

export function loadSave() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return asObject(parsed);
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    return false;
  }
  return true;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: a fresh start then just begins a new game.
  }
}
