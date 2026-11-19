// Save and load for SOLMARINA: one localStorage key holds cash, mission
// progress, health and where the player stood, so Continue resumes the story.

// The key name never changes; the version lives in the payload
// (SAVE_VERSION), so old saves stay loadable.
export const SAVE_KEY = 'solmarina.save.v1';

// Version 2 of the save adds respect, the weapon wheel, the garage and the
// radio station. Old saves (version 1) load fine: missing fields fall back
// to their defaults, so a player coming back keeps cash, missions and health.
export const SAVE_VERSION = 2;

export function normalizeSave(data) {
  const save = typeof data === 'object' && data !== null ? data : {};
  return {
    cash: typeof save.cash === 'number' ? save.cash : 150,
    missionIndex: typeof save.missionIndex === 'number' ? save.missionIndex : 0,
    health: typeof save.health === 'number' ? save.health : 100,
    x: typeof save.x === 'number' ? save.x : 0,
    z: typeof save.z === 'number' ? save.z : -40,
    wanted: typeof save.wanted === 'number' ? save.wanted : 0,
    respect: typeof save.respect === 'number' ? save.respect : 0,
    weapons: typeof save.weapons === 'object' && save.weapons !== null ? save.weapons : null,
    garage: typeof save.garage === 'object' && save.garage !== null ? save.garage : null,
    radioStation: typeof save.radioStation === 'number' ? save.radioStation : 0,
    version: SAVE_VERSION,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: a fresh start then just begins a new game.
  }
}
