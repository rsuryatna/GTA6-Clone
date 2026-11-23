// SOLMARINA — main.js
// One job: bootstrap the game and run the loop. Builds the world, wires
// every system into one context object, runs the menu, the pause screen,
// the mission flow, the wanted heat and the screenshot presets (?shot=).

const THREE = window.THREE;
import { CFG } from './config.js';
import { Rng } from './random.js';
import { buildWorld } from './world.js';
import { createCrowd } from './human.js';
import { createTraffic } from './traffic.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createFootPolice } from './footpolice.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createDayNight } from './daynight.js';
import { createAudio } from './audio.js';
import { createRadio } from './radio.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { loadSettings, saveSettings } from './settings.js';
import { saveGame, loadGame, applySave, hasSave, saveSummary } from './save.js';
import { createShops } from './shops.js';
import { createGarage } from './garage.js';
import { applyShot } from './shots.js';

const settings = loadSettings();
const rng = new Rng(CFG.seed);
const input = createInput();

const canvas = document.getElementById('game-canvas');
const scene = new THREE.Scene();
const renderer = createRenderer(canvas, settings);

const world = buildWorld(scene, rng);
const daynight = createDayNight(scene, world);
const crowd = createCrowd(scene, world, rng, Math.round(CFG.pedCount));
const traffic = createTraffic(scene, world, rng, CFG.trafficCount);
const player = createPlayer(scene, world, rng);
const police = createPolice(scene, world, rng, player);
const footpolice = createFootPolice(scene, world, rng, player, police);
const missions = createMissions(scene, world, rng, player, police);
const combat = createCombat(scene, world, rng, player, police);
const audio = createAudio(settings);
const radio = createRadio(audio, settings);
const shops = createShops(scene, world, rng, player, combat, null);
const garage = createGarage(scene, world, rng, player);

const ctx = {
  scene, renderer, world, daynight, crowd, traffic, player, police,
  footpolice, missions, combat, audio, radio, shops, garage, settings,
  hud: null, input,
};
const hud = createHud(ctx);
ctx.hud = hud;
shops.setHud(hud);

// Camera follows the mouse when the pointer is locked; otherwise WASD
// steering keeps the chase camera behind Jules.
document.addEventListener('pointerlockchange', () => {
  input.setLocked(document.pointerLockElement === canvas);
});
canvas.addEventListener('click', () => {
  if (running) input.requestLock(canvas);
});

// ---- menus ---------------------------------------------------------------
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const bustedEl = document.getElementById('busted');
const titleSave = document.getElementById('menu-save');
let running = false;
let paused = false;
let busted = false;

if (hasSave()) {
  titleSave.textContent = `Continue — ${saveSummary()}`;
  titleSave.style.display = 'block';
}
document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => setPaused(false));
document.getElementById('btn-restart').addEventListener('click', () => {
  location.reload();
});
document.getElementById('btn-busted-retry').addEventListener('click', () => {
  busted = false;
  bustedEl.style.display = 'none';
  player.heal(100);
  player.group.position.set(world.startPoint.x, 0, world.startPoint.z);
  police.setWanted(0);
  setPaused(false);
  running = true;
});
document.getElementById('btn-quit').addEventListener('click', () => {
  saveGame(ctx);
  setPaused(false);
  running = false;
  menuEl.style.display = 'flex';
});

function startGame(continueSave) {
  audio.unlock();
  menuEl.style.display = 'none';
  if (continueSave) {
    const data = loadGame();
    if (data) applySave(ctx, data);
  }
  missions.start(missions.index);
  radio.start();
  hud.toast('Welcome to Solmarina, Jules. Mission 1: drive Rosa’s coupe to the marina.', 6);
  running = true;
}

function setPaused(v) {
  paused = v;
  pauseEl.style.display = v ? 'flex' : 'none';
  if (v) saveGame(ctx);
}

function showBusted() {
  busted = true;
  running = false;
  audio.busted();
  bustedEl.style.display = 'flex';
  document.getElementById('busted-text').textContent =
    'BUSTED — the Solmarina PD caught up with Jules. Bail is $150. The city keeps your save.';
  player.cash = Math.max(0, player.cash - 150);
  police.setWanted(0);
}

// ---- per-frame keys --------------------------------------------------------
function handleKeys(dt) {
  if (input.wasPressed('Escape')) {
    if (running) setPaused(!paused);
  }
  if (!running || paused) return;
  if (input.wasPressed('KeyM')) {
    hud.cycleZoom();
    hud.toast(`Minimap zoom ${hud.zoom.toFixed(1)}x`);
  }
  if (input.wasPressed('KeyN')) {
    const next = missions.skipTo(Math.min(missions.index + 1, missions.list.length - 1));
    if (next) hud.toast(`Mission ${next.id}/12 — ${next.title}`);
  }
  if (input.wasPressed('KeyR')) {
    radio.next();
    hud.toast(radio.blurb());
  }
  if (input.wasPressed('KeyQ')) {
    const saved = saveGame(ctx);
    if (saved.ok) hud.toast('Game saved.');
  }
  if (input.wasPressed('KeyF')) {
    if (combat.hasGun) {
      if (combat.shoot()) { combat.muzzleFlash(); audio.gunshot(); }
      else if (combat.ammo <= 0) hud.toast('Out of ammo — visit Harbour Arms.');
      else audio.gunshot();
    } else if (combat.punch()) {
      audio.punch();
    }
  }
  if (input.wasPressed('KeyE')) {
    const shop = shops.nearest();
    if (shop && player.onFoot) {
      const stock = shops.stockFor(shop.kind);
      const bought = shops.buy(shop, stock[0]);
      hud.toast(bought.ok ? `Bought ${bought.item.name} at ${shop.sign}` : bought.reason);
      audio.cash();
    } else if (player.onFoot && player.nearestCar) {
      if (player.enterCar(player.nearestCar)) {
        police.addWanted(1, 'Car stolen in broad daylight');
        hud.toast('Car stolen — the PD noticed.');
        audio.horn();
      }
    } else if (!player.onFoot) {
      player.exitCar();
      if (garage.isNear(player.position)) {
        const stored = garage.store(player.ownCar);
        if (stored.ok) hud.toast(`Car stored in the garage (slot ${stored.slot}).`);
      }
    }
  }
  // Mouse look while locked.
  const mouse = input.consumeMouse();
  if (mouse.dx !== 0 || mouse.dy !== 0) {
    player.cameraYaw -= mouse.dx * 0.0032;
    player.cameraPitch = Math.max(0.05, Math.min(0.9, player.cameraPitch + mouse.dy * 0.002 * (settings.invertY ? -1 : 1)));
  }
}

// ---- the loop ---------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;
let shotMode = null;
let shotFrames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  handleKeys(dt);
  if (shotMode) {
    // Screenshot staging: keep the world alive but hold the staged frame.
    // The chase camera never runs here, so frameShot's angle survives.
    daynight.apply();
    crowd.update(dt, world);
    traffic.update(dt);
    police.update(dt, elapsed, player.position);
    hud.update(dt);
    shotFrames += 1;
  } else if (running && !paused && !busted) {
    daynight.update(dt);
    crowd.update(dt, world);
    traffic.update(dt);
    player.update(dt, input, world, traffic, audio);
    police.update(dt, elapsed, player.position);
    const bustedResult = footpolice.update(dt);
    if (bustedResult && bustedResult.busted) showBusted();
    const missionResult = missions.update(dt, elapsed);
    if (missionResult && missionResult.completed) {
      audio.missionDone();
      hud.toast(`Mission complete: ${missionResult.completed.title} — $${missionResult.completed.pay}. ${missions.progressText()}`);
      const next = missions.current();
      if (next) {
        missions.start(missions.index);
        hud.toast(`Next: Mission ${next.id}/12 — ${next.title}`);
      }
    } else if (missionResult === 'failed') {
      audio.missionFail();
      hud.toast('Mission failed — press N for the next job.');
    }
    combat.update(dt);
    audio.setSiren(police.wanted > 0, police.wanted);
    if (player.health <= 0) showBusted();
    // Context hints under the crosshair.
    const shop = shops.nearest();
    if (shop && player.onFoot) hud.setHint(`E — shop at ${shop.sign} ($${shops.stockFor(shop.kind)[0]?.price || ''} first item)`);
    else if (player.onFoot && player.nearestCar) hud.setHint('E — steal car');
    else if (!player.onFoot) hud.setHint('E — exit car · Space — handbrake · H — horn');
    else if (garage.isNear(player.position)) hud.setHint('Garage — park your car inside to keep it');
    else hud.setHint('WASD move · E enter car · F fight · N next mission · Q save');
    hud.update(dt);
    renderer.follow(player, dt);
  }
  renderer.render(scene);
  input.endFrame();
  window.__solmarina = window.__solmarina || {};
  window.__solmarina.frames = (window.__solmarina.frames || 0) + 1;
  window.__solmarina.running = running;
  window.__solmarina.shot = shotMode;
}

// ---- screenshot presets (?shot=hero|mission|chase|city) --------------------
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  menuEl.style.display = 'none';
  running = true;
  shotMode = applyShot(ctx, shot);
  radio.start();
  // Let the world settle for a few frames, then hold the staged camera.
  setTimeout(() => { shotMode = shotMode; }, 0);
  document.title = `SOLMARINA — ${shotMode}`;
} else {
  document.getElementById('menu-title').textContent = CFG.title;
}

animate();
saveSettings(settings);
