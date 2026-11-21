// SOLMARINA — boot, frame loop and the glue between every system.
//
// This file owns the shell around the game: the renderer, the scene and
// lights, the camera rig, entering and leaving cars, crimes and their
// consequences, saving, the menus, and the ?shot= staging presets. The
// heavy lifting lives in the modules (world, traffic, police, missions,
// combat, ...); this file only wires them together and steps them once
// per frame. Twelve jobs: Mara Voss's story ends with the Doublecross
// tail-and-destroy and the Last Ferry escape.
import * as THREE from 'three';
import { CITY, CAR, CAR_HEALTH, GARAGE, PALETTE, PLAYER, POLICE, RESPECT, WANTED, WEAPONS, WITNESS } from './config.js';
import { mulberry32 } from './random.js';
import { buildWorld } from './world.js';
import { createFx } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createPlayer } from './player.js';
import { createVehicleManager } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createRadio } from './radio.js';
import { createGarage } from './garage.js';
import { createShop } from './shops.js';
import { createShots } from './shots.js';
import { loadSave, normalizeSave, writeSave, clearSave, SAVE_VERSION } from './save.js';

const query = new URLSearchParams(window.location.search);
const shotName = query.get('shot');

const gameCanvas = document.getElementById('game');
const ui = createHud(document);
const pad = createInput(gameCanvas);
const audio = createAudio();
const seeded = mulberry32(CITY.seed);

// --- session state, split three ways -------------------------------------
// run: the session itself — screen, money, heat, reputation, timers.
// story: where the plot stands — the passenger, the rival car, Lennox.
// view: the camera rig and any staged-shot override of it.
const run = {
  screen: 'menu',
  cash: 150,
  wanted: 0,
  respect: 0,
  stats: { jobsDone: 0, carsStolen: 0, timesBusted: 0, timesWasted: 0 },
  saveTimer: 0,
  regenTimer: 0,
  lastStepKey: '',
  frames: 0,
  wasBoosting: false,
  screechTimer: 0,
  wrecked: false,
  wreckPos: null,
  policeDots: [],
};
const story = {
  passenger: false,
  rivalDown: false,
  lennoxIn: false,
  lennoxDone: false,
  lennoxMesh: null,
};
const view = {
  rig: { yaw: 0, pitch: 0.42, dist: 11, lastDrag: -10 },
  staged: null,
};

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

// --- renderer, scene, camera, lights --------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true });
} catch (error) {
  document.getElementById('menu-text').textContent = 'This game needs WebGL, which this browser did not provide.';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 220, 640);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

function addLights(target) {
  const hemi = new THREE.HemisphereLight(0xbfdfff, 0x8a7a5a, 0.9);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const bounds = sun.shadow.camera;
  bounds.left = -260;
  bounds.right = 260;
  bounds.top = 260;
  bounds.bottom = -260;
  bounds.far = 600;
  target.add(hemi, sun);
}
addLights(scene);

// --- the world and every system -------------------------------------------
const city = buildWorld(scene);
const fx = createFx(scene);
const beacon = scene.getObjectByName('tower-light');
const jules = createPlayer(scene, city.playerSpawn);
const fleet = createVehicleManager(scene, city, seeded);
const traffic = createTraffic(scene, city, seeded, {
  onWitness() {
    // A witness who watches a crime for three seconds calls the PD.
    cops.addWanted(WITNESS.stars);
    ui.showToast('A witness called the police!', 3);
  },
});
const arms = createCombat(scene, camera);
const radio = createRadio(audio);
const garage = createGarage();
const shop = createShop();
const missions = createMissions(scene, {
  onMissionStart(job) {
    ui.setObjective(job.title, job.steps[0].text);
    ui.showToast(`${job.title} — ${job.giver}: ${job.briefing}`, 6);
    audio.mission();
  },
  onMissionComplete(job) {
    run.cash += job.reward;
    run.stats.jobsDone += 1;
    addRespect(RESPECT.perMission);
    // Jobs that end in a hot escape earn extra respect.
    if (job.steps.some((s) => s.type === 'escape' || s.type === 'survive')) addRespect(RESPECT.perEscape);
    audio.cash();
    ui.showToast(`Job complete: ${job.title} — $${job.reward}`, 4);
    writeCheckpoint();
  },
  onMissionFailed(reason) {
    ui.showToast(reason, 4);
  },
  onStoryComplete() {
    ui.setObjective('SOLMARINA — Free roam', 'The big score is done. The city is yours: drive, explore, cause trouble.');
    ui.showToast('Story complete! You own Solmarina now.', 6);
    writeCheckpoint();
  },
});
const cops = createPolice(scene, city, seeded, {
  onWanted() { /* stars redraw every frame from run */ },
  onRam(_dist, inCar) {
    // Armour plating takes the sting out of a police ram.
    const factor = fleet.isArmored() ? 0.75 : 0.45;
    if (inCar && fleet.currentCar()) {
      fleet.driven.speed *= factor;
      audio.punch();
    } else {
      jules.hurt(POLICE.ramDamage);
    }
  },
  onPit(_dist, inCar) {
    // A PIT maneuver: the cruiser clips the rear quarter and spins the car.
    if (inCar && fleet.isDriving() && fleet.currentCar()) {
      fleet.currentCar().heading += 0.3;
      fleet.driven.speed *= 0.8;
      audio.punch();
      ui.showToast('PIT maneuver! The cruiser spun your car.', 2);
    }
  },
});

// Lennox, the pickup for Job 2: a green-shirted walker who waits at the
// square. Built once here; advance() decides when he is visible.
function buildLennox() {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x2ecc71 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc98d5a });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.0, 10), shirtMat);
  torso.position.y = 0.95;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.65;
  group.add(torso, head);
  group.position.set(40, 0, -40);
  return group;
}
story.lennoxMesh = buildLennox();
story.lennoxMesh.visible = false;
scene.add(story.lennoxMesh);

// --- respect ---------------------------------------------------------------
// Reputation ranks from jobs and heat. Rank names come from the config
// table; a rank-up earns a toast, and Respected rank discounts the
// garage upgrades.
function rankIndex() {
  let tier = 0;
  for (let i = 0; i < RESPECT.ranks.length; i += 1) {
    if (run.respect >= RESPECT.ranks[i].at) tier = i;
  }
  return tier;
}
function rankLabel() {
  return RESPECT.ranks[rankIndex()].name;
}
function addRespect(amount) {
  const before = rankIndex();
  run.respect = Math.max(0, run.respect + amount);
  if (rankIndex() > before) {
    ui.showToast(`Respect up: you are now ${rankLabel()} in Solmarina.`, 4);
    audio.pickup();
  }
}

// --- saving ----------------------------------------------------------------
function writeCheckpoint() {
  // Everything a Continue needs: cash, the job, health and vest, where
  // Jules stood, the heat, the respect, the owned weapons, the garage,
  // the radio station and the lifetime stats. The version travels with it.
  writeSave({
    cash: run.cash,
    missionIndex: missions.getIndex(),
    health: jules.state.health,
    vest: jules.state.vest,
    x: jules.position.x,
    z: jules.position.z,
    wanted: cops.getWanted(),
    respect: run.respect,
    weapons: arms.getState(),
    garage: garage.getState(),
    radioStation: radio.current() ? ['wave', 'sol', 'talk', 'calypso'].indexOf(radio.current().id) : 0,
    stats: run.stats,
    version: SAVE_VERSION,
  });
}

function loadCheckpoint() {
  // normalizeSave fills every missing field with its default, so a
  // version-2 save loads cleanly into version 3 (vest 0, empty stats).
  const save = normalizeSave(loadSave());
  run.cash = save.cash;
  run.respect = save.respect;
  run.stats = save.stats;
  story.rivalDown = false;
  jules.teleport(save.x, save.z);
  jules.state.health = save.health;
  jules.state.vest = save.vest;
  missions.setProgress(save.missionIndex);
  arms.setState(save.weapons);
  garage.setState(save.garage);
  radio.setStation(save.radioStation);
  fleet.setUpgrades({ nos: garage.hasNos(), armor: garage.hasArmor() });
  return true;
}

// --- camera ----------------------------------------------------------------
// Third person, mouse-drag orbit, wheel zoom, eases behind cars. A staged
// shot can frame the scene differently from the chase camera: the chase
// shot looks ahead and up, so the helicopter shares the frame with the car
// instead of flying above it. Null during normal play.
function updateCamera(dt, focus, face) {
  const rig = view.rig;
  const mouse = pad.takeMouseDelta();
  if (mouse.dx !== 0 || mouse.dy !== 0) {
    rig.yaw -= mouse.dx * 0.005;
    rig.pitch = clamp(rig.pitch + mouse.dy * 0.003, 0.12, 1.1);
    rig.lastDrag = run.frames;
  }
  rig.dist = clamp(rig.dist + pad.takeWheel() * 0.01, 6, 22);
  // While driving, the camera eases behind the car once the player stops
  // steering it: the camera looks along (sin yaw, cos yaw), so yaw matches
  // the heading. The shortest way around the circle wins.
  if (fleet.isDriving() && run.frames - rig.lastDrag > 90) {
    let diff = face - rig.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    rig.yaw += diff * Math.min(1, dt * 1.4);
  }
  // A staged shot overrides the pitch, distance and the point the camera
  // looks at, but the camera itself stays behind the car: the chase shot
  // looks 20 m ahead and 6 m up from the car, so the helicopter at 30 m
  // shares the frame with the car and the roadblock.
  const staged = view.staged;
  const pitch = staged ? staged.pitch : rig.pitch;
  const dist = staged ? staged.dist : (fleet.isDriving() ? rig.dist + 3 : rig.dist);
  const lookX = staged ? focus.x + staged.dx : focus.x;
  const lookZ = staged ? focus.z + staged.dz : focus.z;
  const eyeHeight = fleet.isDriving() ? 5.2 : 3.6;
  camera.position.set(
    focus.x - Math.sin(rig.yaw) * Math.cos(pitch) * dist,
    eyeHeight + Math.sin(pitch) * dist * 0.6,
    focus.z - Math.cos(rig.yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(lookX, focus.y + 1.6, lookZ);
}

// --- busted and wasted -----------------------------------------------------
// Busted and wasted share the same shape: stop the chase, take the penalty,
// and offer one way back. The penalty differs — bail for an arrest, a
// hospital bill for a death — and so does the respawn point.
function endRun(kind) {
  if (run.screen !== 'playing') return false;
  const penalty = kind === 'busted' ? Math.min(run.cash, 200) : Math.floor(run.cash * 0.1);
  run.cash -= penalty;
  if (kind === 'busted') run.stats.timesBusted += 1;
  else run.stats.timesWasted += 1;
  addRespect(RESPECT.perBusted);
  if (kind === 'busted') audio.busted();
  else audio.wasted();
  run.screen = kind;
  cops.clearWanted();
  radio.stop();
  audio.engineOff();
  const body = kind === 'busted'
    ? `The Solmarina PD caught you. Bail cost $${penalty}.<br><br>Your wanted level is cleared — try to stay clean this time.`
    : `You woke up at Solmarina General, $${penalty} lighter.<br><br>The city keeps moving without you.`;
  ui.showMenu(kind === 'busted' ? 'BUSTED' : 'WASTED', body, [
    {
      label: kind === 'busted' ? 'Walk free' : 'Get back out there',
      onClick: () => respawn(kind === 'busted' ? -144 : 0, kind === 'busted' ? 20 : -120),
    },
  ]);
  writeCheckpoint();
  return true;
}

function handleBusted() {
  return endRun('busted');
}

function handleWasted() {
  endRun('wasted');
}

// One respawn for both endings: heal up, stand at the given spot, play on.
function respawn(x, z) {
  jules.heal(PLAYER.health);
  jules.teleport(x, z, 0);
  view.rig.yaw = 0;
  run.screen = 'playing';
  ui.hideMenu();
}

function resetSession() {
  // A fresh game wipes the save and every system back to the start: $150,
  // no respect, no vest, no upgrades, job one, and Lennox waiting.
  clearSave();
  run.cash = 150;
  run.respect = 0;
  run.stats = { jobsDone: 0, carsStolen: 0, timesBusted: 0, timesWasted: 0 };
  story.rivalDown = false;
  story.passenger = false;
  story.lennoxIn = false;
  story.lennoxDone = false;
  jules.heal(PLAYER.health);
  jules.state.vest = 0;
  jules.teleport(city.playerSpawn.x, city.playerSpawn.z, 0);
  missions.setProgress(0);
  cops.clearWanted();
  arms.setState(null);
  garage.setState(null);
  radio.setStation(0);
  fleet.setUpgrades({ nos: false, armor: false });
}

function beginGame(isNew) {
  if (isNew) resetSession();
  else loadCheckpoint();
  run.screen = 'playing';
  ui.hideMenu();
  audio.unlock();
  ui.setObjective(missions.current().title, missions.step().text);
  ui.showToast('Welcome to Solmarina. Mara Voss is waiting — check the gold marker.', 5);
}

// --- menus -----------------------------------------------------------------
const CONTROLS_TEXT = 'WASD move &nbsp;·&nbsp; Shift run / NOS &nbsp;·&nbsp; E enter / exit car &nbsp;·&nbsp; H horn &nbsp;·&nbsp; 1-4 weapons &nbsp;·&nbsp; Q radio &nbsp;·&nbsp; F punch &nbsp;·&nbsp; Click shoot &nbsp;·&nbsp; R reload &nbsp;·&nbsp; Mouse drag camera &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute';

function openTitle() {
  run.screen = 'menu';
  const hasSave = loadSave() !== null;
  const buttons = [{ label: hasSave ? 'Continue' : 'New game', onClick: () => beginGame(!hasSave) }];
  if (hasSave) buttons.push({ label: 'New game', onClick: () => beginGame(true) });
  ui.showMenu('SOLMARINA', `A sun-soaked city, a stolen car, and twelve jobs that will make you rich — or get you busted.<br><br>${CONTROLS_TEXT}`, buttons);
}

function openPause() {
  run.screen = 'paused';
  audio.engineOff();
  ui.showMenu('Paused', CONTROLS_TEXT, [
    { label: 'Resume', onClick: () => { run.screen = 'playing'; ui.hideMenu(); } },
    { label: 'Save and quit to title', onClick: () => { writeCheckpoint(); openTitle(); } },
  ]);
}

// --- Ammu-Nation and the safehouse garage: modal menus that pause the game -
function openShop() {
  const buttons = [];
  for (const goods of shop.items()) {
    const owned = (goods.kind === 'weapon' && arms.ownsWeapon(goods.id))
      || (goods.kind === 'vest' && jules.vestLeft() > 0);
    const locked = run.respect < goods.respect;
    const caption = owned
      ? `${goods.name} — owned`
      : locked
        ? `${goods.name} — $${goods.price} (needs ${goods.respect} respect)`
        : `${goods.name} — $${goods.price}`;
    buttons.push({
      label: caption,
      onClick: () => {
        if (owned) { ui.showToast('You already own that.', 2); return; }
        if (locked) { ui.showToast(`Ammu-Nation will not sell that to a ${rankLabel()}. Earn more respect.`, 3); return; }
        if (run.cash < goods.price) { ui.showToast('Not enough cash.', 2); return; }
        run.cash -= goods.price;
        if (goods.kind === 'weapon') {
          arms.buyWeapon(goods.id);
          ui.showToast(`Bought the ${goods.name}. Press ${WEAPONS.findIndex((w) => w.id === goods.id) + 1} to equip it.`, 3);
        } else if (goods.kind === 'ammo') {
          arms.refillAmmo();
          ui.showToast('Ammo refilled on every weapon.', 2);
        } else if (goods.kind === 'vest') {
          jules.buyVest();
          ui.showToast('Vest on — it soaks the next hits before your health does.', 3);
        } else {
          jules.heal(PLAYER.health);
          ui.showToast('Patched up — full health.', 2);
        }
        audio.cash();
        writeCheckpoint();
        openShop();
      },
    });
  }
  buttons.push({ label: 'Leave the shop', onClick: () => { ui.hideMenu(); run.screen = 'playing'; } });
  run.screen = 'shop';
  ui.showMenu('AMMU-NATION', `Cash: $${run.cash} · Respect: ${rankLabel()} (${run.respect})<br><br>Everything a freelancer needs. No questions asked.`, buttons);
}

// The garage paint palette: repainting the stored car cycles to the next
// colour in this list.
const PAINTS = [
  { name: 'Crimson', color: 0xc0392b },
  { name: 'Gold', color: 0xf7c948 },
  { name: 'Midnight', color: 0x1a1a2e },
  { name: 'Teal', color: 0x1abc9c },
  { name: 'Pearl', color: 0xecf0f1 },
];

function openGarage() {
  const nosCost = garage.price(GARAGE.nosPrice, run.respect);
  const armorCost = garage.price(GARAGE.armorPrice, run.respect);
  const buttons = [];
  if (garage.hasStored()) {
    buttons.push({ label: 'Take the car out', onClick: () => { takeStoredCarOut(); } });
    // A fresh paint job: the next colour in the palette, at the paint price.
    const curIdx = PAINTS.findIndex((p) => p.color === garage.storedColor());
    const nextPaint = PAINTS[(curIdx + 1) % PAINTS.length];
    const paintCost = garage.price(GARAGE.paintPrice, run.respect);
    buttons.push({
      label: `Repaint stored car — ${nextPaint.name} — $${paintCost}`,
      onClick: () => {
        if (run.cash < paintCost) { ui.showToast('Not enough cash.', 2); return; }
        run.cash -= paintCost;
        garage.repaint(nextPaint.color);
        audio.cash();
        ui.showToast(`Fresh ${nextPaint.name} paint on your stored car.`, 3);
        writeCheckpoint();
        openGarage();
      },
    });
    // The repair bench: the stored car back to full health.
    const fullHealth = garage.hasArmor() ? CAR_HEALTH.armoured : CAR_HEALTH.street;
    const keptHealth = garage.storedHealth();
    const fixCost = garage.price(GARAGE.repairPrice, run.respect);
    const spotless = keptHealth !== null && keptHealth >= fullHealth;
    buttons.push({
      label: spotless ? 'Repair stored car — already pristine' : `Repair stored car — $${fixCost}`,
      onClick: () => {
        if (spotless) { ui.showToast('The stored car is already pristine.', 2); return; }
        if (run.cash < fixCost) { ui.showToast('Not enough cash.', 2); return; }
        run.cash -= fixCost;
        garage.repairStored(fullHealth);
        audio.cash();
        ui.showToast('Stored car repaired to full health.', 3);
        writeCheckpoint();
        openGarage();
      },
    });
  }
  buttons.push({
    label: garage.hasNos() ? 'NOS boost — installed' : `Buy NOS boost — $${nosCost}`,
    onClick: () => {
      if (garage.hasNos()) { ui.showToast('NOS is already installed.', 2); return; }
      buyUpgrade('nos', nosCost);
    },
  });
  buttons.push({
    label: garage.hasArmor() ? 'Armour plating — installed' : `Buy armour plating — $${armorCost}`,
    onClick: () => {
      if (garage.hasArmor()) { ui.showToast('Armour is already installed.', 2); return; }
      buyUpgrade('armor', armorCost);
    },
  });
  buttons.push({ label: 'Leave the garage', onClick: () => { ui.hideMenu(); run.screen = 'playing'; } });
  run.screen = 'garage';
  ui.showMenu('SAFEHOUSE GARAGE', `Cash: $${run.cash} · Respect: ${rankLabel()} (${run.respect})<br><br>One slot for a car, and upgrades for whatever you drive. Respected rank gets 25% off.`, buttons);
}

function buyUpgrade(kind, price) {
  if (run.cash < price) { ui.showToast('Not enough cash.', 2); return; }
  run.cash -= price;
  if (kind === 'nos') garage.buyNos();
  else garage.buyArmor();
  fleet.setUpgrades({ nos: garage.hasNos(), armor: garage.hasArmor() });
  audio.cash();
  ui.showToast(kind === 'nos' ? 'NOS installed — hold Shift while driving to boost.' : 'Armour installed — police rams hurt less now.', 3);
  writeCheckpoint();
  openGarage();
}

function takeStoredCarOut() {
  const color = garage.storedColor();
  if (color === null) return;
  const health = garage.storedHealth();
  garage.takeOut();
  const spot = city.garageSpot;
  fleet.spawnStoredCar(color, spot.x + 6, spot.z, Math.PI / 2, health);
  jules.group.visible = false;
  fleet.setUpgrades({ nos: garage.hasNos(), armor: garage.hasArmor() });
  ui.hideMenu();
  run.screen = 'playing';
  ui.showToast('Your car is back out. Drive safe.', 3);
  writeCheckpoint();
}

// --- per-frame interaction -------------------------------------------------
// One helper for the crimes the city notices: raise the heat, tell the
// traffic system where it happened, and say so on screen.
function flagCrime(stars, pos, message) {
  cops.addWanted(stars);
  traffic.reportCrime(pos);
  if (message) ui.showToast(message, 3);
}

function interactWhileDriving() {
  const ride = fleet.currentCar();
  const pos = ride.mesh.position;
  // Parked in the garage zone: store the car instead of stepping out.
  // The garage remembers its colour and its health.
  if (garage.inZone(pos.x, pos.z)) {
    garage.store(ride.color, ride.health);
    fleet.removeCar(ride);
    jules.group.visible = true;
    jules.teleport(city.garageSpot.x + 6, city.garageSpot.z, 0);
    audio.pickup();
    ui.showToast('Car stored in the garage. It will be here when you come back.', 4);
    writeCheckpoint();
    return;
  }
  const spot = fleet.exitCar();
  jules.group.visible = true;
  jules.teleport(spot.x, spot.z, fleet.currentCar() ? 0 : jules.state.heading);
  audio.engineOff();
}

function interactOnFoot() {
  // Lennox first: the pickup step of Job 2.
  if (story.lennoxMesh.visible && !story.lennoxIn) {
    const gap = Math.hypot(story.lennoxMesh.position.x - jules.position.x, story.lennoxMesh.position.z - jules.position.z);
    if (gap < 3.5 && missions.getIndex() === 1 && missions.getStepIndex() === 1) {
      story.lennoxIn = true;
      story.lennoxMesh.visible = false;
      story.passenger = true;
      audio.pickup();
      ui.showToast('Lennox is in. Drive him to the Harbor warehouse.', 4);
      return;
    }
  }
  // The safehouse garage, on foot: the menu, with the car and upgrades.
  if (garage.inZone(jules.position.x, jules.position.z)) {
    openGarage();
    return;
  }
  // Ammu-Nation, on foot: buy weapons, ammo, health and vests.
  if (shop.inZone(jules.position.x, jules.position.z)) {
    openShop();
    return;
  }
  const ride = fleet.nearestParked(jules.position, 3.6);
  if (ride) {
    fleet.enterCar(ride);
    jules.group.visible = false;
    run.stats.carsStolen += 1;
    flagCrime(WANTED.stealCar, ride.mesh.position, 'Car stolen! The PD has been notified.');
    audio.pickup();
    return;
  }
  // No parked car nearby: carjack a moving traffic car instead.
  const moving = traffic.nearestCar(jules.position, 4.5);
  if (moving) {
    const stolen = traffic.jackCar(moving);
    if (stolen) {
      fleet.adoptCar(stolen.mesh, stolen.color, stolen.heading);
      jules.group.visible = false;
      run.stats.carsStolen += 1;
      flagCrime(WANTED.carjack, moving.mesh.position, 'Carjacked! The driver ran — and so did the witnesses.');
      addRespect(RESPECT.perCarjack);
      audio.pickup();
    }
  }
}

function fireWeapon() {
  const aim = new THREE.Vector3();
  camera.getWorldDirection(aim);
  const eye = camera.position.clone();
  const shot = arms.shoot(eye, aim, traffic, cops, fleet);
  if (shot.hit === 'none') return;
  audio.shot();
  // Muzzle sparks where the bullet lands.
  if (shot.point) fx.burst('spark', shot.point.x, shot.point.y, shot.point.z, 4);
  // The gunshot scares the peds near the impact point.
  traffic.update(0, jules.position, shot.point);
  if (shot.hit === 'ped') {
    const ped = traffic.nearestPed(shot.point, 2);
    if (ped) traffic.killPed(ped);
    cops.addWanted(WANTED.shootPed);
    traffic.reportCrime(shot.point);
  } else if (shot.hit === 'cop') {
    cops.addWanted(WANTED.shootCop);
    traffic.reportCrime(shot.point);
  } else if (shot.hit === 'car' && shot.car) {
    // Bullets damage cars: the rival's armoured car takes twice the
    // health of a street car, so Job 11's destroy step is a real fight.
    const power = arms.currentWeapon().damage;
    const isRival = shot.car === traffic.rivalCar();
    let verdict = 'damaged';
    if (shot.list === 'traffic') verdict = traffic.damageCar(shot.car, power);
    else if (shot.list === 'parked') verdict = fleet.damageCar(shot.car, power);
    if (verdict === 'destroyed') {
      fx.explode(shot.point.x, shot.point.y, shot.point.z);
      audio.explosion();
      if (shot.list === 'parked') fleet.removeCar(shot.car);
      if (isRival) story.rivalDown = true;
      cops.addWanted(WANTED.shootCop);
      traffic.reportCrime(shot.point);
    }
  }
}

function handleInput() {
  if (pad.wasPressed('KeyE')) {
    if (fleet.isDriving()) interactWhileDriving();
    else interactOnFoot();
  }
  // The weapon wheel: keys 1-4 switch between the owned weapons.
  const digit = pad.takeDigit();
  if (digit > 0) {
    if (arms.switchWeapon(digit - 1)) {
      jules.setArmed(true);
      ui.showToast(`${arms.currentWeapon().name} equipped.`, 1.5);
    } else {
      ui.showToast('You do not own that weapon yet — Ammu-Nation sells it.', 2);
    }
  }
  // The car radio: Q cycles the station while driving.
  if (pad.wasPressed('KeyQ') && fleet.isDriving()) {
    const station = radio.cycle();
    ui.showToast(`Radio: ${station.name} — ${station.desc}`, 2);
  }
  // The car horn: H while driving.
  if (pad.wasPressed('KeyH') && fleet.isDriving()) {
    audio.horn();
  }
  if (pad.wasPressed('KeyF') && !fleet.isDriving()) {
    if (jules.punch()) {
      audio.punch();
      // The punch goes where the camera looks, not where the body faces.
      const target = arms.punch(jules.position, view.rig.yaw, traffic);
      if (target) {
        traffic.killPed(target);
        flagCrime(WANTED.punchPed, jules.position, 'That was a civilian! Wanted level up.');
      }
    }
  }
  if (pad.takeClick() && !fleet.isDriving() && run.screen === 'playing') {
    fireWeapon();
  }
  if (pad.wasPressed('KeyR')) arms.reload();
  if (pad.wasPressed('KeyM')) audio.setMuted(!audio.isMuted());
}

// What E does right now: the nearest usable thing wins, in this order —
// Lennox's pickup, the garage, Ammu-Nation, a parked car, a moving car.
// While driving, E stores the car in the garage zone, or steps out.
function promptFor(driving) {
  if (driving) {
    const ride = fleet.currentCar().mesh.position;
    if (garage.inZone(ride.x, ride.z)) return 'Press E — store car in garage';
    return 'Press E — exit car';
  }
  const hereX = jules.position.x;
  const hereZ = jules.position.z;
  if (story.lennoxMesh.visible && missions.getIndex() === 1 && missions.getStepIndex() === 1) {
    const gap = Math.hypot(story.lennoxMesh.position.x - hereX, story.lennoxMesh.position.z - hereZ);
    if (gap < 3.5) return 'Press E — let Lennox in';
  }
  if (garage.inZone(hereX, hereZ)) {
    return garage.hasStored() ? 'Press E — safehouse garage (car stored)' : 'Press E — safehouse garage';
  }
  if (shop.inZone(hereX, hereZ)) return 'Press E — Ammu-Nation';
  if (fleet.nearestParked(jules.position, 3.6)) return 'Press E — steal car';
  if (traffic.nearestCar(jules.position, 4.5)) return 'Press E — carjack';
  return '';
}

// --- the frame update, in phases -------------------------------------------
function refreshPoliceDots() {
  // Cruiser positions from the scene graph, refreshed every frame so the
  // traffic system can yield to them.
  run.policeDots = [];
  scene.traverse((object) => {
    if (object.name === 'lightbar') {
      const pos = object.getWorldPosition(new THREE.Vector3());
      run.policeDots.push({ x: pos.x, z: pos.z });
    }
  });
}

function advanceDriving(dt) {
  const ride = fleet.currentCar();
  const ridePos = ride.mesh.position;
  // Spike strips at five stars: the car crawls while the slow timer runs.
  const spiked = cops.onSpikes(ridePos.x, ridePos.z);
  const pace = fleet.updateDriving(dt, pad, city, (destroyed) => {
    if (destroyed) {
      run.wrecked = true;
      run.wreckPos = { x: ridePos.x, z: ridePos.z };
    } else {
      audio.punch();
    }
  }, spiked);
  audio.engine(pad.moveForward() > 0 ? 1 : 0.3, Math.abs(pace) / CAR.maxSpeed);
  // NOS kicking in gets a whoosh, once per boost.
  if (fleet.isBoosting() && !run.wasBoosting) audio.nos();
  run.wasBoosting = fleet.isBoosting();
  // A wall hit hard enough to destroy the car: it goes up in flames and
  // Jules steps out of the wreck, hurt.
  if (run.wrecked) {
    run.wrecked = false;
    const pos = run.wreckPos;
    const wreck = fleet.currentCar();
    if (wreck) {
      fx.explode(pos.x, 1, pos.z);
      audio.explosion();
      fleet.removeCar(wreck);
    }
    jules.group.visible = true;
    jules.teleport(pos.x + 3, pos.z, jules.state.heading);
    jules.hurt(20);
    ui.showToast('Your car was destroyed!', 3);
  }
  // Tyre smoke and a screech while boosting or sliding sideways.
  if (fleet.isDriving() && (fleet.isBoosting() || fleet.isSliding())) {
    const driven = fleet.currentCar();
    if (driven) {
      const rearX = driven.mesh.position.x - Math.sin(driven.heading) * 1.2;
      const rearZ = driven.mesh.position.z - Math.cos(driven.heading) * 1.2;
      fx.tyreSmoke(rearX, 0.3, rearZ);
      if (run.screechTimer <= 0) {
        audio.screech();
        run.screechTimer = 0.5;
      }
    }
  }
  // Running over pedestrians is a crime the city notices.
  for (const ped of traffic.peds) {
    if (ped.dead) continue;
    const carPos = fleet.currentCar().mesh.position;
    if (Math.hypot(ped.mesh.position.x - carPos.x, ped.mesh.position.z - carPos.z) < 2.0 && Math.abs(pace) > 8) {
      traffic.killPed(ped);
      flagCrime(WANTED.hitPedWithCar, ped.mesh.position, 'You ran someone over! Wanted level up.');
    }
  }
}

function advanceOnFoot(dt) {
  audio.engineOff();
  run.wasBoosting = false;
  jules.update(dt, pad, city, view.rig.yaw);
}

function advanceWorld(dt, driving, threat) {
  arms.update(dt);
  // The living city: the ferris wheel turns, the boat bobs, the lights cycle.
  city.update(dt);
  fx.update(dt);
  traffic.update(dt, jules.position, threat, run.policeDots, cops.getWanted());
  radio.update(driving);
  jules.setArmed(!driving);
  // The radio tower's red light blinks over the marina.
  if (beacon) {
    beacon.material.color.setHex(Math.floor(run.frames / 30) % 2 === 0 ? 0xff2222 : 0x441111);
  }
}

function advanceMissions(dt, focus, driving) {
  // Lennox waits at the square only during Job 2's first two steps.
  const lennoxOut = missions.getIndex() === 1 && missions.getStepIndex() <= 1 && !story.lennoxIn && !story.lennoxDone;
  story.lennoxMesh.visible = lennoxOut;
  if (missions.getIndex() === 1 && missions.getStepIndex() === 2 && story.lennoxIn && !story.lennoxDone) {
    story.lennoxDone = true;
    story.lennoxMesh.position.set(144, 0, 108);
    story.lennoxMesh.visible = true;
    window.setTimeout(() => { story.lennoxMesh.visible = false; }, 6000);
  }

  // Mission steps that raise the heat fire once, when the step starts.
  const stepKey = `${missions.getIndex()}:${missions.getStepIndex()}`;
  if (stepKey !== run.lastStepKey) {
    run.lastStepKey = stepKey;
    const phase = missions.step();
    if (phase && (phase.type === 'survive' || phase.type === 'escape')) cops.setWanted(phase.wanted);
  }
  // The rival car (Job 11) cruises its downtown loop from the start; the
  // mission only needs its position and whether Jules destroyed it.
  const rivalCar = traffic.rivalCar();
  missions.update(dt, {
    x: focus.x,
    z: focus.z,
    inCar: driving,
    personPickedUp: story.passenger,
    rival: rivalCar ? { x: rivalCar.mesh.position.x, z: rivalCar.mesh.position.z } : null,
    rivalDestroyed: story.rivalDown,
  });
  if (missions.step()) {
    ui.setObjective(missions.current().title, missions.step().text);
  }
  // Timed steps show their countdown; the job counter shows Job X of 12.
  ui.setTimer(missions.timeLeft());
  ui.setJobCounter(missions.getIndex() < missions.getCount() ? `Job ${missions.getIndex() + 1}/${missions.getCount()}` : '');
}

function advancePolice(dt, focus, driving) {
  const pace = driving ? Math.abs(fleet.driven.speed) : jules.state.speed;
  // The PIT callback lives in the police module's callbacks (see
  // createPolice above): a cruiser alongside at speed spins the driven car.
  cops.update(dt, focus, pace, driving, handleBusted);
  audio.siren(cops.getWanted() > 0, dt);
  run.wanted = cops.getWanted();
}

function advanceHealth(dt) {
  // Slow health regen while out of trouble.
  if (!jules.state.dead && jules.state.health < PLAYER.health && cops.getWanted() === 0) {
    run.regenTimer += dt;
    if (run.regenTimer > 1) {
      run.regenTimer = 0;
      jules.heal(2);
    }
  }
  if (jules.state.dead) handleWasted();
}

function advanceHud(dt, driving) {
  // Prompts: what E does right now, from the nearest usable thing.
  ui.setPrompt(promptFor(driving));
  ui.setSpeed(driving ? Math.abs(fleet.driven.speed) * 3.6 : null);
  ui.setCrosshair(!driving && run.screen === 'playing');
  // The NOS meter and the driven car's health, while driving.
  const rideHealth = fleet.currentHealth();
  ui.setNos(fleet.nosMeter(), driving && garage.hasNos());
  ui.setCarHealth(rideHealth ? rideHealth.health : 0, rideHealth ? rideHealth.max : 1, driving);

  // Autosave every ten seconds of play.
  run.saveTimer += dt;
  if (run.saveTimer > 10) {
    run.saveTimer = 0;
    writeCheckpoint();
  }
}

function advance(dt) {
  const driving = fleet.isDriving();
  const focus = driving ? fleet.currentCar().mesh.position : jules.position;
  const face = driving ? fleet.currentCar().heading : jules.state.heading;

  // Cruiser positions first: the traffic system needs them to yield, and
  // the peds need the nearest one as the danger they flee from.
  refreshPoliceDots();
  const threat = run.policeDots.length > 0 ? run.policeDots[0] : null;

  if (driving) advanceDriving(dt);
  else advanceOnFoot(dt);
  if (run.screechTimer > 0) run.screechTimer -= dt;
  advanceWorld(dt, driving, threat);
  advanceMissions(dt, focus, driving);
  advancePolice(dt, focus, driving);
  advanceHealth(dt);
  advanceHud(dt, driving);

  updateCamera(dt, { x: focus.x, y: 0, z: focus.z }, face);
  ui.update(collectHud());
}

// The whole HUD state in one place, so the game loop and the screenshot
// staging build the same object.
function collectHud() {
  const rivalCar = traffic.rivalCar();
  return {
    cash: run.cash,
    health: jules.state.health,
    wanted: cops.getWanted(),
    ammo: arms.getAmmo(),
    weaponName: arms.currentWeapon().name,
    magSize: arms.currentWeapon().magSize,
    weapons: arms.weaponList(),
    radio: fleet.isDriving() && radio.isOn() ? `♪ ${radio.current().name} — ${radio.current().desc}` : '',
    respect: `Respect: ${rankLabel()} (${run.respect})`,
    playerX: jules.position.x,
    playerZ: jules.position.z,
    heading: jules.state.heading,
    streets: city.streets,
    trafficCars: traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    policeCars: run.policeDots,
    mission: missions.targetPosition(),
    lennox: story.lennoxMesh.visible ? { x: story.lennoxMesh.position.x, z: story.lennoxMesh.position.z } : null,
    rival: rivalCar ? { x: rivalCar.mesh.position.x, z: rivalCar.mesh.position.z } : null,
  };
}

// --- screenshot staging (shots.js owns the presets) ------------------------
const shots = createShots({
  startGame: beginGame,
  vehicles: fleet,
  player: jules,
  cameraRig: view.rig,
  police: cops,
  missions,
  hud: ui,
  state: run,
  combat: arms,
  radio,
  traffic,
  update: advance,
  setShotCam: (value) => { view.staged = value; },
  document,
  window,
  hudState: () => collectHud(),
});

// --- the loop ---------------------------------------------------------------
function fitScreen() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fitScreen);
fitScreen();

let prevNow = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  // dt is capped: a slow frame never jumps the simulation forward.
  const dt = Math.min((now - prevNow) / 1000, 0.05);
  prevNow = now;
  run.frames += 1;
  // Pause and resume work from any screen, so they live outside the
  // per-screen handlers (handleInput only runs while playing).
  if (pad.wasPressed('KeyP') || pad.wasPressed('Escape')) {
    if (run.screen === 'playing') openPause();
    else if (run.screen === 'paused' || run.screen === 'shop' || run.screen === 'garage') {
      run.screen = 'playing';
      ui.hideMenu();
    }
  }
  if (run.screen === 'playing') {
    handleInput();
    advance(dt);
  } else if (run.screen === 'menu') {
    // The title screen shows the living city behind the menu, slowly turning.
    traffic.update(dt, jules.position, null, [], 0);
    updateCamera(dt, { x: 0, y: 0, z: -40 }, 0);
    view.rig.yaw += dt * 0.02;
  }
  renderer.render(scene, camera);
  pad.endFrame();
}

// Debug hooks for screenshot runs and playtests (not cheats for players: the
// game itself never calls these outside ?shot= staging).
window.__solmarina = {
  state: run,
  start: (isNew) => beginGame(isNew),
  teleport: (x, z) => jules.teleport(x, z),
  setWanted: (stars) => cops.setWanted(stars),
  mission: (index) => missions.setProgress(index),
  cash: () => run.cash,
  // Test hooks for the new systems: buy a weapon, set respect, open the
  // shop or the garage, and read the new state back.
  giveWeapon: (id) => arms.buyWeapon(id),
  setRespect: (n) => { run.respect = n; },
  openShop,
  openGarage,
  debug: () => {
    const ride = fleet.currentCar();
    const rivalCar = traffic.rivalCar();
    return {
      screen: run.screen,
      cash: run.cash,
      player: { x: jules.position.x, z: jules.position.z, heading: jules.state.heading },
      car: ride ? {
        x: ride.mesh.position.x,
        z: ride.mesh.position.z,
        heading: ride.heading,
        speed: fleet.driven.speed,
      } : null,
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: view.rig.yaw },
      inCar: fleet.isDriving(),
      missionIndex: missions.getIndex(),
      missionCount: missions.getCount(),
      stepIndex: missions.getStepIndex(),
      parked: fleet.parked.filter((c) => c.parked).slice(0, 8).map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
      peds: traffic.peds.filter((p) => !p.dead).slice(0, 8).map((p) => ({ x: p.mesh.position.x, z: p.mesh.position.z })),
      trafficCar: traffic.cars.length > 0 ? { x: traffic.cars[0].mesh.position.x, z: traffic.cars[0].mesh.position.z } : null,
      trafficCount: traffic.cars.length,
      heli: cops.heliActive(),
      roadblocks: cops.roadblockCount(),
      spikeStrips: cops.spikeStripCount(),
      wanted: cops.getWanted(),
      weapon: arms.currentWeapon().id,
      weapons: arms.weaponList().map((w) => `${w.id}:${w.owned ? 'owned' : 'locked'}:${w.ammo}`),
      radio: radio.isOn() ? radio.current().id : 'off',
      respect: run.respect,
      respectRank: rankLabel(),
      garage: garage.getState(),
      nosMeter: Math.round(fleet.nosMeter() * 100) / 100,
      boosting: fleet.isBoosting(),
      carHealth: fleet.currentHealth() ? fleet.currentHealth().health : null,
      vest: jules.state.vest,
      fx: fx.count(),
      rival: rivalCar ? { x: rivalCar.mesh.position.x, z: rivalCar.mesh.position.z } : null,
      stats: run.stats,
    };
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden && run.screen === 'playing') writeCheckpoint();
});

if (shotName) {
  shots.stageShot(shotName);
  requestAnimationFrame(loop);
} else {
  openTitle();
  requestAnimationFrame(loop);
}
