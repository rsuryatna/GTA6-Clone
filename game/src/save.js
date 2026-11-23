// SOLMARINA — save.js
// One job: persist Jules's progress — cash, health, mission index, position
// and the clock — to localStorage, and bring it back. A save never carries
// a screenshot or a transcript; it is just numbers.

import { CFG } from './config.js';

export function saveGame(ctx) {
  const { player, missions, daynight, police } = ctx;
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    cash: player.cash,
    health: player.health,
    missionIndex: missions.index,
    missionsCompleted: missions.completed,
    wanted: police.wanted,
    position: { x: player.position.x, z: player.position.z },
    heading: player.heading,
    hour: daynight.hour,
  };
  try {
    localStorage.setItem(CFG.saveKey, JSON.stringify(data));
    return { ok: true, data };
  } catch (err) {
    console.warn('save: could not write save', err);
    return { ok: false, error: String(err) };
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CFG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (err) {
    console.warn('save: could not read save', err);
    return null;
  }
}

export function applySave(ctx, data) {
  if (!data) return false;
  const { player, missions, daynight, police } = ctx;
  player.cash = data.cash ?? player.cash;
  player.health = data.health ?? player.health;
  player.group.position.set(data.position?.x ?? 0, 0, data.position?.z ?? 0);
  player.heading = data.heading ?? 0;
  player.group.rotation.y = player.heading;
  missions.index = data.missionIndex ?? 0;
  missions.completed = data.missionsCompleted ?? 0;
  if (daynight && typeof data.hour === 'number') daynight.setHour(data.hour);
  if (police && typeof data.wanted === 'number') police.setWanted(data.wanted);
  return true;
}

export function hasSave() {
  return loadGame() !== null;
}

// A short human summary of the save for the title menu.
export function saveSummary() {
  const data = loadGame();
  if (!data) return null;
  return `$${data.cash} — mission ${data.missionIndex + 1}/12 — saved ${data.savedAt.slice(0, 10)}`;
}

export function clearSave() {
  try {
    localStorage.removeItem(CFG.saveKey);
    return true;
  } catch (err) {
    console.warn('save: could not clear save', err);
    return false;
  }
}
