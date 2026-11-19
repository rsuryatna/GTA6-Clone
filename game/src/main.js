// SOLMARINA — boot, the game loop and everything that ties the systems
// together: the camera, entering cars, crimes, getting busted or wasted,
// saving, and the screenshot presets (?shot=cover|drive|chase|mission).
import * as THREE from 'three';
import { CITY, CAR, GARAGE, PALETTE, PLAYER, POLICE, RESPECT, WANTED, WEAPONS } from './config.js';
import { mulberry32 } from './random.js';
import { buildWorld } from './world.js';
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
import { loadSave, normalizeSave, writeSave, clearSave } from './save.js';

const params = new URLSearchParams(window.location.search);
const shotPreset = params.get('shot');

const canvas = document.getElementById('game');
const hud = createHud(document);
const input = createInput(canvas);
const audio = createAudio();
const rng = mulberry32(CITY.seed);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
sun.shadow.camera.far = 600;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfdfff, 0x8a7a5a, 0.9));

const world = buildWorld(scene);
// The radio tower's blinking light, for the per-frame blink in update().
const towerLight = scene.getObjectByName('tower-light');
const player = createPlayer(scene, world.playerSpawn);
const vehicles = createVehicleManager(scene, world, rng);
const traffic = createTraffic(scene, world, rng);
const combat = createCombat(scene, camera);
const radio = createRadio(audio);
const garage = createGarage();
const shop = createShop();
const missions = createMissions(scene, {
  onMissionStart(mission) {
    hud.setObjective(mission.title, mission.steps[0].text);
    hud.showToast(`${mission.title} — ${mission.giver}: ${mission.briefing}`, 6);
    audio.mission();
  },
  onMissionComplete(mission) {
    state.cash += mission.reward;
    addRespect(RESPECT.perMission);
    // Jobs that end in a hot escape earn extra respect.
    if (mission.steps.some((s) => s.type === 'escape' || s.type === 'survive')) addRespect(RESPECT.perEscape);
    audio.cash();
    hud.showToast(`Job complete: ${mission.title} — $${mission.reward}`, 4);
    saveGame();
  },
  onMissionFailed(reason) {
    hud.showToast(reason, 4);
  },
  onStoryComplete() {
    hud.setObjective('SOLMARINA — Free roam', 'The big score is done. The city is yours: drive, explore, cause trouble.');
    hud.showToast('Story complete! You own Solmarina now.', 6);
    saveGame();
  },
});
const police = createPolice(scene, world, rng, {
  onWanted() { /* stars redraw every frame from state */ },
  onRam(_dist, playerInCar) {
    // Armour plating takes the sting out of a police ram.
    const ramFactor = vehicles.isArmored() ? 0.75 : 0.45;
    if (playerInCar && vehicles.currentCar()) {
      vehicles.driven.speed *= ramFactor;
      audio.punch();
    } else {
      player.hurt(POLICE.ramDamage);
    }
  },
});

// Lennox, the pickup for Job 2: a green-shirted walker who waits at the square.
const lennox = makeLennox();
lennox.mesh.visible = false;
scene.add(lennox.mesh);

function makeLennox() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2ecc71 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5a });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.0, 10), shirt);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.65;
  group.add(head);
  group.position.set(40, 0, -40);
  return { mesh: group, pickedUp: false, delivered: false };
}

const state = {
  screen: 'menu',
  cash: 150,
  wanted: 0,
  respect: 0,
  personPickedUp: false,
  saveTimer: 0,
  healthRegen: 0,
  lastMissionKey: '',
  frames: 0,
  wasBoosting: false,
};

// Respect: reputation ranks from jobs and heat. Rank names come from the
// config table; a rank-up earns a toast, and Respected rank discounts the
// garage upgrades.
function respectRank() {
  let rank = 0;
  for (let i = 0; i < RESPECT.ranks.length; i += 1) {
    if (state.respect >= RESPECT.ranks[i].at) rank = i;
  }
  return rank;
}
function respectRankName() {
  return RESPECT.ranks[respectRank()].name;
}
function addRespect(amount) {
  const before = respectRank();
  state.respect = Math.max(0, state.respect + amount);
  if (respectRank() > before) {
    hud.showToast(`Respect up: you are now ${respectRankName()} in Solmarina.`, 4);
    audio.pickup();
  }
}

function saveGame() {
  writeSave({
    cash: state.cash,
    missionIndex: missions.getIndex(),
    health: player.state.health,
    x: player.position.x,
    z: player.position.z,
    wanted: police.getWanted(),
    respect: state.respect,
    weapons: combat.getState(),
    garage: garage.getState(),
    radioStation: radio.current() ? ['wave', 'sol', 'talk'].indexOf(radio.current().id) : 0,
    version: 2,
  });
}

function loadGame() {
  const save = normalizeSave(loadSave());
  state.cash = save.cash;
  player.teleport(save.x, save.z);
  player.state.health = save.health;
  missions.setProgress(save.missionIndex);
  state.respect = save.respect;
  combat.setState(save.weapons);
  garage.setState(save.garage);
  radio.setStation(save.radioStation);
  vehicles.setUpgrades({ nos: garage.hasNos(), armor: garage.hasArmor() });
  return true;
}

// --- camera: third person, mouse-drag orbit, wheel zoom, eases behind cars ---
const cameraRig = { yaw: 0, pitch: 0.42, dist: 11, lastDrag: -10 };
// A staged shot can frame the scene differently from the chase camera: the
// chase shot looks ahead and up, so the helicopter shares the frame with the
// car instead of flying above it. Null during normal play.
let shotCam = null;
function updateCamera(dt, target, heading) {
  const delta = input.takeMouseDelta();
  if (delta.dx !== 0 || delta.dy !== 0) {
    cameraRig.yaw -= delta.dx * 0.005;
    cameraRig.pitch = Math.max(0.12, Math.min(1.1, cameraRig.pitch + delta.dy * 0.003));
    cameraRig.lastDrag = state.frames;
  }
  cameraRig.dist = Math.max(6, Math.min(22, cameraRig.dist + input.takeWheel() * 0.01));
  const driving = vehicles.isDriving();
  if (driving && state.frames - cameraRig.lastDrag > 90) {
    // Ease the camera behind the car when the player is not steering it:
    // the camera looks along (sin yaw, cos yaw), so yaw matches the heading.
    let diff = heading - cameraRig.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cameraRig.yaw += diff * Math.min(1, dt * 1.4);
  }
  const dist = driving ? cameraRig.dist + 3 : cameraRig.dist;
  // A staged shot overrides the pitch, distance and the point the camera
  // looks at, but the camera itself stays behind the car: the chase shot
  // looks 20 m ahead and 6 m up from the car, so the helicopter at 30 m
  // shares the frame with the car and the roadblock.
  const cam = shotCam
    ? { pitch: shotCam.pitch, dist: shotCam.dist, lookX: target.x + shotCam.dx, lookY: shotCam.y, lookZ: target.z + shotCam.dz }
    : { pitch: cameraRig.pitch, dist, lookX: target.x, lookY: target.y, lookZ: target.z };
  const height = driving ? 5.2 : 3.6;
  const cx = target.x - Math.sin(cameraRig.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cz = target.z - Math.cos(cameraRig.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cy = height + Math.sin(cam.pitch) * cam.dist * 0.6;
  camera.position.set(cx, cy, cz);
  camera.lookAt(cam.lookX, cam.lookY + 1.6, cam.lookZ);
}

// --- crimes and consequences ---
function onBusted() {
  if (state.screen !== 'playing') return;
  state.screen = 'busted';
  police.clearWanted();
  radio.stop();
  audio.busted();
  audio.engineOff();
  const fine = Math.min(state.cash, 200);
  state.cash -= fine;
  addRespect(RESPECT.perBusted);
  hud.showMenu('BUSTED', `The Solmarina PD caught you. Bail cost $${fine}.<br><br>Your wanted level is cleared — try to stay clean this time.`, [
    { label: 'Walk free', onClick: () => { respawnAtStation(); } },
  ]);
  saveGame();
}

function onWasted() {
  if (state.screen !== 'playing') return;
  state.screen = 'wasted';
  police.clearWanted();
  radio.stop();
  audio.wasted();
  audio.engineOff();
  const lost = Math.floor(state.cash * 0.1);
  state.cash -= lost;
  addRespect(RESPECT.perBusted);
  hud.showMenu('WASTED', `You woke up at Solmarina General, $${lost} lighter.<br><br>The city keeps moving without you.`, [
    { label: 'Get back out there', onClick: () => { respawnAtHospital(); } },
  ]);
  saveGame();
}

function respawnAtStation() {
  player.heal(PLAYER.health);
  player.teleport(-144, 20, 0);
  cameraRig.yaw = 0;
  state.screen = 'playing';
  hud.hideMenu();
}

function respawnAtHospital() {
  player.heal(PLAYER.health);
  player.teleport(0, -120, 0);
  cameraRig.yaw = 0;
  state.screen = 'playing';
  hud.hideMenu();
}

function startGame(fresh) {
  if (fresh) {
    clearSave();
    state.cash = 150;
    state.respect = 0;
    player.heal(PLAYER.health);
    player.teleport(world.playerSpawn.x, world.playerSpawn.z, 0);
    missions.setProgress(0);
    police.clearWanted();
    combat.setState(null);
    garage.setState(null);
    radio.setStation(0);
    vehicles.setUpgrades({ nos: false, armor: false });
  } else {
    loadGame();
  }
  state.screen = 'playing';
  hud.hideMenu();
  audio.unlock();
  hud.setObjective(missions.current().title, missions.step().text);
  hud.showToast('Welcome to Solmarina. Mara Voss is waiting — check the gold marker.', 5);
}

// --- menus ---
const CONTROLS_HTML = 'WASD move &nbsp;·&nbsp; Shift run / NOS &nbsp;·&nbsp; E enter / exit car &nbsp;·&nbsp; 1-4 weapons &nbsp;·&nbsp; Q radio &nbsp;·&nbsp; F punch &nbsp;·&nbsp; Click shoot &nbsp;·&nbsp; R reload &nbsp;·&nbsp; Mouse drag camera &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute';
function showTitle() {
  state.screen = 'menu';
  const hasSave = loadSave() !== null;
  hud.showMenu('SOLMARINA', `A sun-soaked city, a stolen car, and ten jobs that will make you rich — or get you busted.<br><br>${CONTROLS_HTML}`, [
    { label: hasSave ? 'Continue' : 'New game', onClick: () => startGame(!hasSave) },
    ...(hasSave ? [{ label: 'New game', onClick: () => startGame(true) }] : []),
  ]);
}

function showPause() {
  state.screen = 'paused';
  audio.engineOff();
  hud.showMenu('Paused', CONTROLS_HTML, [
    { label: 'Resume', onClick: () => { state.screen = 'playing'; hud.hideMenu(); } },
    { label: 'Save and quit to title', onClick: () => { saveGame(); showTitle(); } },
  ]);
}

// --- Ammu-Nation and the safehouse garage: modal menus that pause the game ---
function openShop() {
  const buttons = shop.items().map((item) => {
    const owned = item.kind === 'weapon' && combat.ownsWeapon(item.id);
    const locked = state.respect < item.respect;
    const label = owned
      ? `${item.name} — owned`
      : locked
        ? `${item.name} — $${item.price} (needs ${item.respect} respect)`
        : `${item.name} — $${item.price}`;
    return {
      label,
      onClick: () => {
        if (owned) { hud.showToast('You already own that.', 2); return; }
        if (locked) { hud.showToast(`Ammu-Nation will not sell that to a ${respectRankName()}. Earn more respect.`, 3); return; }
        if (state.cash < item.price) { hud.showToast('Not enough cash.', 2); return; }
        state.cash -= item.price;
        if (item.kind === 'weapon') {
          combat.buyWeapon(item.id);
          hud.showToast(`Bought the ${item.name}. Press ${WEAPONS.findIndex((w) => w.id === item.id) + 1} to equip it.`, 3);
        } else if (item.kind === 'ammo') {
          combat.refillAmmo();
          hud.showToast('Ammo refilled on every weapon.', 2);
        } else {
          player.heal(PLAYER.health);
          hud.showToast('Patched up — full health.', 2);
        }
        audio.cash();
        saveGame();
        openShop();
      },
    };
  });
  buttons.push({ label: 'Leave the shop', onClick: () => { hud.hideMenu(); state.screen = 'playing'; } });
  state.screen = 'shop';
  hud.showMenu('AMMU-NATION', `Cash: $${state.cash} · Respect: ${respectRankName()} (${state.respect})<br><br>Everything a freelancer needs. No questions asked.`, buttons);
}

function openGarage() {
  const nosPrice = garage.price(GARAGE.nosPrice, state.respect);
  const armorPrice = garage.price(GARAGE.armorPrice, state.respect);
  const buttons = [];
  if (garage.hasStored()) {
    buttons.push({ label: 'Take the car out', onClick: () => { takeStoredCar(); } });
  }
  buttons.push({
    label: garage.hasNos() ? 'NOS boost — installed' : `Buy NOS boost — $${nosPrice}`,
    onClick: () => {
      if (garage.hasNos()) { hud.showToast('NOS is already installed.', 2); return; }
      buyUpgrade('nos', nosPrice);
    },
  });
  buttons.push({
    label: garage.hasArmor() ? 'Armour plating — installed' : `Buy armour plating — $${armorPrice}`,
    onClick: () => {
      if (garage.hasArmor()) { hud.showToast('Armour is already installed.', 2); return; }
      buyUpgrade('armor', armorPrice);
    },
  });
  buttons.push({ label: 'Leave the garage', onClick: () => { hud.hideMenu(); state.screen = 'playing'; } });
  state.screen = 'garage';
  hud.showMenu('SAFEHOUSE GARAGE', `Cash: $${state.cash} · Respect: ${respectRankName()} (${state.respect})<br><br>One slot for a car, and upgrades for whatever you drive. Respected rank gets 25% off.`, buttons);
}

function buyUpgrade(kind, price) {
  if (state.cash < price) { hud.showToast('Not enough cash.', 2); return; }
  state.cash -= price;
  if (kind === 'nos') garage.buyNos();
  else garage.buyArmor();
  vehicles.setUpgrades({ nos: garage.hasNos(), armor: garage.hasArmor() });
  audio.cash();
  hud.showToast(kind === 'nos' ? 'NOS installed — hold Shift while driving to boost.' : 'Armour installed — police rams hurt less now.', 3);
  saveGame();
  openGarage();
}

function takeStoredCar() {
  const color = garage.takeOut();
  if (color === null) return;
  const spot = world.garageSpot;
  vehicles.spawnStoredCar(color, spot.x + 6, spot.z, Math.PI / 2);
  player.group.visible = false;
  vehicles.setUpgrades({ nos: garage.hasNos(), armor: garage.hasArmor() });
  hud.hideMenu();
  state.screen = 'playing';
  hud.showToast('Your car is back out. Drive safe.', 3);
  saveGame();
}

// --- per-frame interaction ---
function handleInteractions() {
  if (input.wasPressed('KeyE')) {
    if (vehicles.isDriving()) {
      const car = vehicles.currentCar();
      const pos = car.mesh.position;
      // Parked in the garage zone: store the car instead of stepping out.
      if (garage.inZone(pos.x, pos.z)) {
        garage.store(car.color);
        vehicles.removeCar(car);
        player.group.visible = true;
        player.teleport(world.garageSpot.x + 6, world.garageSpot.z, 0);
        audio.pickup();
        hud.showToast('Car stored in the garage. It will be here when you come back.', 4);
        saveGame();
        return;
      }
      const spot = vehicles.exitCar();
      player.group.visible = true;
      player.teleport(spot.x, spot.z, vehicles.currentCar() ? 0 : player.state.heading);
      audio.engineOff();
      return;
    }
    // Lennox first: the pickup step of Job 2.
    if (lennox.mesh.visible && !lennox.pickedUp) {
      const d = Math.hypot(lennox.mesh.position.x - player.position.x, lennox.mesh.position.z - player.position.z);
      if (d < 3.5 && missions.getIndex() === 1 && missions.getStepIndex() === 1) {
        lennox.pickedUp = true;
        lennox.mesh.visible = false;
        state.personPickedUp = true;
        audio.pickup();
        hud.showToast('Lennox is in. Drive him to the Harbor warehouse.', 4);
        return;
      }
    }
    // The safehouse garage, on foot: the menu, with the car and upgrades.
    if (garage.inZone(player.position.x, player.position.z)) {
      openGarage();
      return;
    }
    // Ammu-Nation, on foot: buy weapons, ammo and health.
    if (shop.inZone(player.position.x, player.position.z)) {
      openShop();
      return;
    }
    const car = vehicles.nearestParked(player.position, 3.6);
    if (car) {
      vehicles.enterCar(car);
      player.group.visible = false;
      police.addWanted(WANTED.stealCar);
      audio.pickup();
      hud.showToast('Car stolen! The PD has been notified.', 3);
      return;
    }
    // No parked car nearby: carjack a moving traffic car instead.
    const moving = traffic.nearestCar(player.position, 4.5);
    if (moving) {
      const jacked = traffic.jackCar(moving);
      if (jacked) {
        vehicles.adoptCar(jacked.mesh, jacked.color, jacked.heading);
        player.group.visible = false;
        police.addWanted(WANTED.carjack);
        addRespect(RESPECT.perCarjack);
        audio.pickup();
        hud.showToast('Carjacked! The driver ran — and so did the witnesses.', 3);
      }
    }
  }
  // The weapon wheel: keys 1-4 switch between the owned weapons.
  const digit = input.takeDigit();
  if (digit > 0) {
    if (combat.switchWeapon(digit - 1)) {
      player.setArmed(true);
      hud.showToast(`${combat.currentWeapon().name} equipped.`, 1.5);
    } else {
      hud.showToast('You do not own that weapon yet — Ammu-Nation sells it.', 2);
    }
  }
  // The car radio: Q cycles the station while driving.
  if (input.wasPressed('KeyQ') && vehicles.isDriving()) {
    const station = radio.cycle();
    hud.showToast(`Radio: ${station.name} — ${station.desc}`, 2);
  }
  if (input.wasPressed('KeyF') && !vehicles.isDriving()) {
    if (player.punch()) {
      audio.punch();
      // The punch goes where the camera looks, not where the body faces.
      const victim = combat.punch(player.position, cameraRig.yaw, traffic);
      if (victim) {
        traffic.killPed(victim);
        police.addWanted(WANTED.punchPed);
        hud.showToast('That was a civilian! Wanted level up.', 3);
      }
    }
  }
  if (input.takeClick() && !vehicles.isDriving() && state.screen === 'playing') {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const origin = camera.position.clone();
    const result = combat.shoot(origin, direction, traffic, police, vehicles);
    if (result.hit !== 'none') {
      audio.shot();
      traffic.update(0, player.position, result.point);
      if (result.hit === 'ped') {
        const ped = traffic.nearestPed(result.point, 2);
        if (ped) traffic.killPed(ped);
        police.addWanted(WANTED.shootPed);
      } else if (result.hit === 'cop') {
        police.addWanted(WANTED.shootCop);
      }
    }
  }
  if (input.wasPressed('KeyR')) combat.reload();
  if (input.wasPressed('KeyM')) audio.setMuted(!audio.isMuted());
}

function update(dt) {
  const driving = vehicles.isDriving();
  const target = driving ? vehicles.currentCar().mesh.position : player.position;
  const heading = driving ? vehicles.currentCar().heading : player.state.heading;

  if (driving) {
    const speed = vehicles.updateDriving(dt, input, world, () => audio.punch());
    audio.engine(input.moveForward() > 0 ? 1 : 0.3, Math.abs(speed) / CAR.maxSpeed);
    // NOS kicking in gets a whoosh, once per boost.
    if (vehicles.isBoosting() && !state.wasBoosting) audio.nos();
    state.wasBoosting = vehicles.isBoosting();
    // Running over pedestrians is a crime the city notices.
    for (const ped of traffic.peds) {
      if (ped.dead) continue;
      const car = vehicles.currentCar().mesh.position;
      if (Math.hypot(ped.mesh.position.x - car.x, ped.mesh.position.z - car.z) < 2.0 && Math.abs(speed) > 8) {
        traffic.killPed(ped);
        police.addWanted(WANTED.hitPedWithCar);
        hud.showToast('You ran someone over! Wanted level up.', 3);
      }
    }
  } else {
    audio.engineOff();
    state.wasBoosting = false;
    player.update(dt, input, world, cameraRig.yaw);
  }
  combat.update(dt);
  traffic.update(dt, player.position, null);
  radio.update(driving);
  player.setArmed(!driving);
  // The radio tower's red light blinks over the marina.
  if (towerLight) {
    towerLight.material.color.setHex(Math.floor(state.frames / 30) % 2 === 0 ? 0xff2222 : 0x441111);
  }

  // Lennox waits at the square only during Job 2's first two steps.
  const showLennox = missions.getIndex() === 1 && missions.getStepIndex() <= 1 && !lennox.pickedUp && !lennox.delivered;
  lennox.mesh.visible = showLennox;
  if (missions.getIndex() === 1 && missions.getStepIndex() === 2 && lennox.pickedUp && !lennox.delivered) {
    lennox.delivered = true;
    lennox.mesh.position.set(144, 0, 108);
    lennox.mesh.visible = true;
    window.setTimeout(() => { lennox.mesh.visible = false; }, 6000);
  }

  // Mission steps that raise the heat fire once, when the step starts.
  const missionKey = `${missions.getIndex()}:${missions.getStepIndex()}`;
  if (missionKey !== state.lastMissionKey) {
    state.lastMissionKey = missionKey;
    const s = missions.step();
    if (s && s.type === 'survive') police.setWanted(s.wanted);
    if (s && s.type === 'escape') police.setWanted(s.wanted);
  }
  missions.update(dt, {
    x: target.x,
    z: target.z,
    inCar: driving,
    personPickedUp: state.personPickedUp,
  });
  if (missions.step()) {
    hud.setObjective(missions.current().title, missions.step().text);
  }

  const playerSpeed = driving ? Math.abs(vehicles.driven.speed) : player.state.speed;
  const policeState = police.update(dt, target, playerSpeed, driving, onBusted);
  audio.siren(police.getWanted() > 0, dt);
  state.wanted = police.getWanted();

  // Slow health regen while out of trouble.
  if (!player.state.dead && player.state.health < PLAYER.health && police.getWanted() === 0) {
    state.healthRegen += dt;
    if (state.healthRegen > 1) {
      state.healthRegen = 0;
      player.heal(2);
    }
  }
  if (player.state.dead) onWasted();

  // Prompts: what E does right now.
  let prompt = '';
  if (!driving) {
    if (lennox.mesh.visible && missions.getIndex() === 1 && missions.getStepIndex() === 1) {
      const d = Math.hypot(lennox.mesh.position.x - player.position.x, lennox.mesh.position.z - player.position.z);
      if (d < 3.5) prompt = 'Press E — let Lennox in';
    }
    if (!prompt && garage.inZone(player.position.x, player.position.z)) {
      prompt = garage.hasStored() ? 'Press E — safehouse garage (car stored)' : 'Press E — safehouse garage';
    }
    if (!prompt && shop.inZone(player.position.x, player.position.z)) {
      prompt = 'Press E — Ammu-Nation';
    }
    if (!prompt) {
      const car = vehicles.nearestParked(player.position, 3.6);
      if (car) prompt = 'Press E — steal car';
    }
    if (!prompt) {
      const moving = traffic.nearestCar(player.position, 4.5);
      if (moving) prompt = 'Press E — carjack';
    }
  } else if (garage.inZone(vehicles.currentCar().mesh.position.x, vehicles.currentCar().mesh.position.z)) {
    prompt = 'Press E — store car in garage';
  } else {
    prompt = 'Press E — exit car';
  }
  hud.setPrompt(prompt);
  hud.setSpeed(driving ? Math.abs(vehicles.driven.speed) * 3.6 : null);
  hud.setCrosshair(!driving && state.screen === 'playing');

  // Autosave every ten seconds of play.
  state.saveTimer += dt;
  if (state.saveTimer > 10) {
    state.saveTimer = 0;
    saveGame();
  }

  updateCamera(dt, { x: target.x, y: 0, z: target.z }, heading);

  const trafficDots = traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z }));
  const policeDots = [];
  // Police cruiser positions are internal; approximate from the police module
  // through the wanted level is not enough, so read them via the scene graph.
  scene.traverse((object) => {
    if (object.name === 'lightbar') {
      policeDots.push({ x: object.getWorldPosition(new THREE.Vector3()).x, z: object.getWorldPosition(new THREE.Vector3()).z });
    }
  });
  hud.update({
    cash: state.cash,
    health: player.state.health,
    wanted: police.getWanted(),
    ammo: combat.getAmmo(),
    weaponName: combat.currentWeapon().name,
    magSize: combat.currentWeapon().magSize,
    weapons: combat.weaponList(),
    radio: driving && radio.isOn() ? `♪ ${radio.current().name} — ${radio.current().desc}` : '',
    respect: `Respect: ${respectRankName()} (${state.respect})`,
    playerX: player.position.x,
    playerZ: player.position.z,
    heading: player.state.heading,
    streets: world.streets,
    trafficCars: trafficDots,
    policeCars: policeDots,
    mission: missions.targetPosition(),
    lennox: lennox.mesh.visible ? { x: lennox.mesh.position.x, z: lennox.mesh.position.z } : null,
  });
}

// --- screenshot presets: stage a real scene, then flag readiness ---
function stageShot(name) {
  startGame(true);
  if (name === 'drive') {
    const car = vehicles.parked[3] || vehicles.parked[0];
    if (car) {
      vehicles.enterCar(car);
      player.group.visible = false;
      // On the -36 street, heading south down the avenue.
      car.mesh.position.set(-36, 0, -60);
      car.heading = 0;
      vehicles.driven.speed = 18;
    }
    // Behind the car: the camera looks along the heading, so yaw = heading.
    cameraRig.yaw = 0;
    cameraRig.pitch = 0.32;
  } else if (name === 'chase') {
    const car = vehicles.parked[3] || vehicles.parked[0];
    if (car) {
      vehicles.enterCar(car);
      player.group.visible = false;
      car.mesh.position.set(-36, 0, -60);
      car.heading = 0;
      vehicles.driven.speed = 24;
    }
    // Five stars: the helicopter is out, cruisers behind, roadblocks ahead.
    police.setWanted(5);
    // Frame the shot ahead and up: the car at the bottom, the roadblock in
    // the middle, the helicopter in the sky above it. In normal play the
    // helicopter body stays out of frame — only this staged camera looks up.
    shotCam = { dx: 0, dz: 20, y: 5.0, pitch: 0.12, dist: 14 };
    cameraRig.yaw = 0;
    cameraRig.pitch = 0.12;
  } else if (name === 'mission') {
    // Job 8, The Golden Hour: Jules at the marina dock, the golden beacon
    // on the pier ahead of him, the boat waiting.
    missions.setProgress(7);
    player.teleport(-40, 140, 0);
    cameraRig.yaw = 0;
    cameraRig.pitch = 0.35;
  } else {
    // cover: on foot on the -36 avenue, the street receding north into the
    // city behind the player.
    player.teleport(-36, 100, Math.PI);
    // Camera south of the player, looking north up the avenue.
    cameraRig.yaw = Math.PI;
    cameraRig.pitch = 0.32;
    cameraRig.dist = 13;
  }
  // Let the world settle (traffic moves, police spawn) before the shot.
  for (let i = 0; i < 90; i += 1) update(1 / 60);
  if (name === 'chase' && vehicles.currentCar()) {
    // Pull the nearest cruiser in ahead of the player's car, head-on, so
    // the chase reads in the frame, lights flashing.
    const car = vehicles.currentCar().mesh.position;
    police.placeNearest(car.x, car.z + 24, Math.PI);
    // Park the helicopter ahead and to the right of the car, clear of the
    // objective box, searchlight on the car.
    police.placeHeli(car.x + 30, car.z + 45, car.x, car.z);
  }
  // A staged shot needs no welcome toast across the middle of the frame.
  document.getElementById('toast').style.opacity = '0';
  hud.update({
    cash: state.cash, health: player.state.health, wanted: police.getWanted(),
    ammo: combat.getAmmo(), weaponName: combat.currentWeapon().name,
    magSize: combat.currentWeapon().magSize, weapons: combat.weaponList(),
    radio: vehicles.isDriving() && radio.isOn() ? `♪ ${radio.current().name} — ${radio.current().desc}` : '',
    respect: `Respect: ${respectRankName()} (${state.respect})`,
    playerX: player.position.x, playerZ: player.position.z,
    heading: player.state.heading, streets: world.streets,
    trafficCars: traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    policeCars: [], mission: missions.targetPosition(),
    lennox: null,
  });
  window.__shotReady = true;
}

// --- the loop ---
function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  state.frames += 1;
  // Pause and resume work from any screen, so they live outside the
  // per-screen handlers (handleInteractions only runs while playing).
  if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
    if (state.screen === 'playing') showPause();
    else if (state.screen === 'paused') { state.screen = 'playing'; hud.hideMenu(); }
    else if (state.screen === 'shop' || state.screen === 'garage') { state.screen = 'playing'; hud.hideMenu(); }
  }
  if (state.screen === 'playing') {
    handleInteractions();
    update(dt);
  } else if (state.screen === 'menu') {
    // The title screen shows the living city behind the menu.
    traffic.update(dt, player.position, null);
    updateCamera(dt, { x: 0, y: 0, z: -40 }, 0);
    cameraRig.yaw += dt * 0.02;
  }
  renderer.render(scene, camera);
  input.endFrame();
}

// Debug hooks for screenshot runs and playtests (not cheats for players: the
// game itself never calls these outside ?shot= staging).
window.__solmarina = {
  state,
  start: (fresh) => startGame(fresh),
  teleport: (x, z) => player.teleport(x, z),
  setWanted: (stars) => police.setWanted(stars),
  mission: (index) => missions.setProgress(index),
  cash: () => state.cash,
  // Test hooks for the new systems: buy a weapon, set respect, open the
  // shop or the garage, and read the new state back.
  giveWeapon: (id) => combat.buyWeapon(id),
  setRespect: (n) => { state.respect = n; },
  openShop,
  openGarage,
  debug: () => ({
    player: { x: player.position.x, z: player.position.z, heading: player.state.heading },
    car: vehicles.currentCar() ? {
      x: vehicles.currentCar().mesh.position.x,
      z: vehicles.currentCar().mesh.position.z,
      heading: vehicles.currentCar().heading,
      speed: vehicles.driven.speed,
    } : null,
    camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: cameraRig.yaw },
    inCar: vehicles.isDriving(),
    missionIndex: missions.getIndex(),
    stepIndex: missions.getStepIndex(),
    parked: vehicles.parked.filter((c) => c.parked).slice(0, 8).map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    peds: traffic.peds.filter((p) => !p.dead).slice(0, 8).map((p) => ({ x: p.mesh.position.x, z: p.mesh.position.z })),
    trafficCar: traffic.cars.length > 0 ? { x: traffic.cars[0].mesh.position.x, z: traffic.cars[0].mesh.position.z } : null,
    trafficCount: traffic.cars.length,
    heli: police.heliActive(),
    roadblocks: police.roadblockCount(),
    wanted: police.getWanted(),
    weapon: combat.currentWeapon().id,
    weapons: combat.weaponList().map((w) => `${w.id}:${w.owned ? 'owned' : 'locked'}:${w.ammo}`),
    radio: radio.isOn() ? radio.current().id : 'off',
    respect: state.respect,
    respectRank: respectRankName(),
    garage: garage.getState(),
    nosMeter: Math.round(vehicles.nosMeter() * 100) / 100,
    boosting: vehicles.isBoosting(),
    screen: state.screen,
    cash: state.cash,
  }),
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'playing') saveGame();
});

if (shotPreset) {
  stageShot(shotPreset);
  requestAnimationFrame(frame);
} else {
  showTitle();
  requestAnimationFrame(frame);
}
