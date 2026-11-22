// Settings for SOLMARINA: sound volumes, graphics quality, shadows and
// mouse sensitivity, kept in their own localStorage key so they survive
// reloads and never touch the game save (solmarina.save.v1).
//
// The key name never changes and the payload is versioned, so an old or
// hand-edited settings blob still loads: every field is rebuilt from a
// defaults table, and anything missing or mistyped falls back to its
// default instead of breaking the load.

export const SETTINGS_KEY = 'solmarina.settings.v1';
export const SETTINGS_VERSION = 1;

export const QUALITIES = ['low', 'medium', 'high'];

// Field name -> fallback value, in the order the normalised settings carry them.
const NUMBER_FIELDS = [
  ['masterVolume', 50],
  ['musicVolume', 100],
  ['sfxVolume', 100],
  ['sensitivity', 1.0],
];

function asNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, low, high, fallback) {
  const n = asNumber(value, fallback);
  return Math.max(low, Math.min(high, n));
}

function asBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function asObject(value) {
  return value !== null && typeof value === 'object' ? value : null;
}

export function normalizeSettings(data) {
  const src = asObject(data) || {};
  const out = {};
  out.masterVolume = clampNumber(src.masterVolume, 0, 100, 50);
  out.musicVolume = clampNumber(src.musicVolume, 0, 100, 100);
  out.sfxVolume = clampNumber(src.sfxVolume, 0, 100, 100);
  out.sensitivity = clampNumber(src.sensitivity, 0.5, 2, 1.0);
  out.muted = asBool(src.muted, false);
  out.shadows = asBool(src.shadows, true);
  // Quality is a word, not a number: anything unknown falls back to high.
  out.quality = QUALITIES.includes(src.quality) ? src.quality : 'high';
  out.version = SETTINGS_VERSION;
  return out;
}

export function defaultSettings() {
  return normalizeSettings(null);
}

export function loadSettings() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_KEY);
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

export function writeSettings(data) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  } catch {
    return false;
  }
  return true;
}
