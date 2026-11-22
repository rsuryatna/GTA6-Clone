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
import { createVehicleManager, makeCarMesh } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createFootPolice } from './footpolice.js';
import { createDayNight } from './daynight.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createRadio } from './radio.js';
import { createGarage } from './garage.js';
import { createShop } from './shops.js';
import { createShots } from './shots.js';
import { loadSave, normalizeSave, writeSave, clearSave, SAVE_VERSION } from './save.js';
import { loadSettings, normalizeSettings, writeSettings, QUALITIES } from './settings.js';

const query = new URLSearchParams(window.location.search);
const shotName = query.get('shot');

const gameCanvas = document.getElementById('game');
const ui = createHud(document);
const pad = createInput(gameCanvas);
const audio = createAudio();
const seeded = mulberry32(CITY.seed);

// NPC talk: what a pedestrian says when Jules chats with them. Written
// fresh for Solmarina — greetings, city gossip, hints about the town,
// and a couple of jokes. A rare few hand over a small cash tip.
const TALK_LINES = [
  'Hey, nice day, huh? The sea looks unreal today.',
  'Morning! You look like you are in a hurry. Slow down, enjoy the view.',
  'Beautiful day in Solmarina. Shame about the traffic, though.',
  'Did you hear about the bank job? The whole city is talking about it.',
  'They say something big is hidden at the marina. Nobody knows what.',
  'The radio tower has been blinking all week. Weird, right?',
  'My cousin swears he saw a helicopter chasing a guy in a blue jacket. Probably nothing.',
  'Need wheels? The garage by the safehouse is the place to go.',
  'Ammu-Nation on the east side — best prices in Solmarina, trust me.',
  'The pier at the marina? Best sunset in the city. Go see it sometime.',
  'If you are looking for work, ask around the harbor. Someone always needs a driver.',
  'I once tried to drive a boat. Once. Never again.',
  'I walk everywhere. The traffic here? No thanks.',
  'You remind me of my nephew. He also never stops running.',
];
const TALK_TIP_LINES = [
  'Here, take this — you look like you need it more than me.',
  'Found this on the boardwalk. It is yours now, friend.',
];

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
  sensitivity: 1.0,
};

// --- settings ---------------------------------------------------------------
// Sound volumes, graphics quality, shadows and mouse sensitivity, kept in
// their own localStorage key (solmarina.settings.v1) so they survive
// reloads and never touch the game save. Loaded once at startup and
// applied before the title screen shows; every change saves at once.
const settings = normalizeSettings(loadSettings());

function applyGraphics() {
  // Quality picks the pixel ratio and the shadow-map type; the Shadows
  // toggle picks whether the shadow map runs at all. A quality preset
  // also sets the shadows default (Low = off, Medium/High = on), but the
  // toggle can override it afterwards.
  const q = settings.quality;
  renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, q === 'medium' ? 1.5 : 2));
  renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.enabled = settings.shadows;
  // Materials must recompile when the shadow map changes, or the toggle
  // silently does nothing until the next scene rebuild.
  scene.traverse((object) => {
    if (object.material) object.material.needsUpdate = true;
  });
}

function applySettings() {
  audio.setMasterVolume(settings.masterVolume / 100);
  audio.setMusicVolume(settings.musicVolume / 100);
  audio.setSfxVolume(settings.sfxVolume / 100);
  audio.setMuted(settings.muted);
  view.sensitivity = settings.sensitivity;
  applyGraphics();
}

function saveSettings() {
  writeSettings(settings);
}

// Mute is one state with two doors: the M key and the settings toggle
// both go through here, so the stored setting never disagrees with what
// the player hears.
function toggleMute() {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  saveSettings();
}

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

// Kept so the title screen can swap in a sunset and swap back.
let sunLight = null;
let hemiLight = null;

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
  sunLight = sun;
  hemiLight = hemi;
}
addLights(scene);

// --- arrest-scene fill light -------------------------------------------------
// The cuff shot is at night, and the officer stands with his back and
// side to the arrest camera, so the moon (from the north-west) leaves
// the side facing the camera in shadow and his navy uniform reads as a
// black silhouette. A soft warm spotlight, alive only while the arrest
// screen is up, lifts his uniform — navy, cap, gold details, belt —
// without touching the night anywhere else: the loop hides it the
// moment the scene ends, and in daylight the sun drowns it out
// entirely. It sits above and toward the camera from the officer and
// aims at his chest, so it lights the side the camera sees.
const arrestLight = new THREE.SpotLight(0xffd9a8, 0, 14, 0.55, 0.7, 1.2);
const arrestLightTarget = new THREE.Object3D();
arrestLight.target = arrestLightTarget;
arrestLight.visible = false;
scene.add(arrestLight, arrestLightTarget);

// The daytime lighting, snapshotted once so the title screen can swap in
// a sunset and the game can swap back without losing a number.
const dayLight = {
  bg: scene.background.clone(),
  fogColor: scene.fog.color.clone(),
  fogNear: scene.fog.near,
  fogFar: scene.fog.far,
  sunPos: null,
  sunColor: null,
  sunIntensity: 0,
  hemiSky: null,
  hemiGround: null,
  hemiIntensity: 0,
};
dayLight.sunPos = sunLight.position.clone();
dayLight.sunColor = sunLight.color.clone();
dayLight.sunIntensity = sunLight.intensity;
dayLight.hemiSky = hemiLight.color.clone();
dayLight.hemiGround = hemiLight.groundColor.clone();
dayLight.hemiIntensity = hemiLight.intensity;

// --- title-screen sky: a sunset dome, a low sun and drifting clouds --------
// All of it lives in one group that is only visible on the title screen;
// gameplay never sees it and never pays for it.
function skyGradientTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#1a1440');
  grad.addColorStop(0.25, '#2a2350');
  grad.addColorStop(0.45, '#7a4a8a');
  grad.addColorStop(0.58, '#e85a7a');
  grad.addColorStop(0.68, '#ff7a5c');
  grad.addColorStop(0.78, '#ff9a4a');
  grad.addColorStop(1.0, '#ffc46b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  grad.addColorStop(0.25, 'rgba(255, 190, 110, 0.55)');
  grad.addColorStop(0.6, 'rgba(255, 140, 90, 0.18)');
  grad.addColorStop(1, 'rgba(255, 140, 90, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture(rgb = '255, 220, 205', rgb2 = '255, 190, 175') {
  // A lumpy cloud: several soft overlapping puffs on one canvas, so a
  // single sprite reads as a cloud instead of a round blob. The default
  // tint is the title screen's pink; gameplay passes white.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const puffs = [[70, 78, 52], [120, 62, 62], [175, 78, 54], [100, 88, 46], [155, 90, 44]];
  for (const [x, y, r] of puffs) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb}, 0.85)`);
    grad.addColorStop(0.6, `rgba(${rgb2}, 0.4)`);
    grad.addColorStop(1, `rgba(${rgb2}, 0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const titleSky = new THREE.Group();
titleSky.visible = false;
const titleClouds = [];
{
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(850, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyGradientTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  titleSky.add(dome);
  // The sun itself, low over the city to the north-west, with a glow.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }),
  );
  sunDisc.position.set(-350, 70, -250);
  sunDisc.lookAt(0, 0, 0);
  titleSky.add(sunDisc);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  glow.position.set(-350, 70, -250);
  glow.scale.set(280, 280, 1);
  titleSky.add(glow);
  // Clouds high over the city, drifting slowly in the title loop.
  const cloudTex = cloudTexture();
  const cloudSpots = [
    [-320, 170, -180, 190, 0.65], [-120, 200, -280, 240, 0.55], [60, 160, -220, 170, 0.6],
    [-240, 220, -80, 210, 0.5], [140, 190, -120, 150, 0.55], [-60, 150, -320, 200, 0.6],
  ];
  for (const [x, y, z, scale, opacity] of cloudSpots) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity, depthWrite: false, fog: false, color: 0xffd9c4,
    }));
    cloud.position.set(x, y, z);
    cloud.scale.set(scale, scale * 0.5, 1);
    titleSky.add(cloud);
    titleClouds.push(cloud);
  }
}
scene.add(titleSky);

// --- gameplay clouds ---------------------------------------------------------
// The title screen has its own pink clouds; gameplay used to have a flat
// coloured sky and nothing in it. These are the same lumpy sprites, but
// white, ringing the map far out and LOW (y 105-130 at 380-450 m) so they
// sit near the horizon in the gameplay camera's frame. The first pass put
// them at y 150-230 only 120-260 m away — 45-65 deg above the horizon,
// above the camera's ~31 deg half-FOV, so they never showed in any
// screenshot. At ~400 m a 300-wide sprite spans ~40 deg of sky: big
// enough to read as a cloud, small enough to stay sky. One shared
// material: daynight.js tints it per phase (white at midday, warm at
// dawn, orange-pink at dusk, dim dark blue at night) and drifts them
// slowly. Pure sky decoration — never a collider, never in the way.
// Hidden on the title screen, which keeps its own sunset dome and pink
// clouds.
const gameCloudMat = new THREE.SpriteMaterial({
  map: cloudTexture('255, 255, 255', '255, 255, 255'),
  transparent: true, opacity: 0.9, depthWrite: false, fog: false, color: 0xffffff,
});
const gameClouds = [];
{
  const cloudSpots = [
    [0, 120, -420, 320], [269, 110, -269, 260], [450, 130, 0, 300],
    [283, 105, 283, 240], [0, 115, 420, 320], [-269, 125, 269, 260],
    [-450, 110, 0, 300], [-283, 120, -283, 280],
  ];
  for (const [x, y, z, scale] of cloudSpots) {
    const cloud = new THREE.Sprite(gameCloudMat);
    cloud.position.set(x, y, z);
    cloud.scale.set(scale, scale * 0.45, 1);
    cloud.visible = false; // the game boots to the title screen, which has its own sky
    scene.add(cloud);
    gameClouds.push(cloud);
  }
}

// Sunset for the title screen only: a low warm sun from the north-west,
// warm haze for fog, a dusk-purple background behind the dome. Gameplay
// restores the daytime values from dayLight.
function setTitleLighting(on) {
  if (on) {
    scene.background = new THREE.Color(0x2a1a3a);
    scene.fog.color.setHex(0xd98a6a);
    scene.fog.near = 180;
    scene.fog.far = 750;
    sunLight.position.set(-350, 70, -250);
    sunLight.color.setHex(0xffb36b);
    sunLight.intensity = 2.2;
    hemiLight.color.setHex(0xff9a6b);
    hemiLight.groundColor.setHex(0x4a3226);
    hemiLight.intensity = 0.75;
    titleSky.visible = true;
    for (const cloud of gameClouds) cloud.visible = false;
  } else {
    scene.background.copy(dayLight.bg);
    scene.fog.color.copy(dayLight.fogColor);
    scene.fog.near = dayLight.fogNear;
    scene.fog.far = dayLight.fogFar;
    sunLight.position.copy(dayLight.sunPos);
    sunLight.color.copy(dayLight.sunColor);
    sunLight.intensity = dayLight.sunIntensity;
    hemiLight.color.copy(dayLight.hemiSky);
    hemiLight.groundColor.copy(dayLight.hemiGround);
    hemiLight.intensity = dayLight.hemiIntensity;
    titleSky.visible = false;
    for (const cloud of gameClouds) cloud.visible = true;
  }
}

// --- title-screen staging: Jules + a car in the foreground -----------------
// The title car is a red sports car that only exists on the title screen:
// built once, hidden during gameplay and the ?shot= staging presets.
const titleCar = makeCarMesh(0xc0392b, false, false, 'sport');
titleCar.visible = false;
scene.add(titleCar);

// Where Jules and the car stand for the title screen (on the sand just
// south of the coastal road, facing the camera), and where the camera
// sits to frame them with the marina skyline behind. Tuned by screenshot.
const TITLE_STAGE = {
  jules: { x: -24, z: 200.5, heading: 0.4 },
  car: { x: -22, z: 201, heading: 0.55 },
  cam: { x: -17, y: 4.4, z: 210 },
  look: { x: -34, y: 2.8, z: 198 },
};

function stageTitle() {
  jules.teleport(TITLE_STAGE.jules.x, TITLE_STAGE.jules.z, TITLE_STAGE.jules.heading);
  // The player update (which applies the heading to the mesh) does not
  // run on the title screen, so set the facing directly as well.
  jules.group.rotation.y = TITLE_STAGE.jules.heading;
  titleCar.position.set(TITLE_STAGE.car.x, 0, TITLE_STAGE.car.z);
  titleCar.rotation.y = TITLE_STAGE.car.heading;
  titleCar.visible = true;
  setTitleLighting(true);
  dayNight.setTitleActive(true);
}

function unstageTitle() {
  titleCar.visible = false;
  setTitleLighting(false);
  dayNight.setTitleActive(false);
  dayNight.apply();
}

// --- the world and every system -------------------------------------------
const city = buildWorld(scene);

// The day/night cycle: four phases over a 12-minute day, Siang being
// the existing daytime exactly (dayLight). New game starts Pagi.
const dayNight = createDayNight(scene, {
  sun: sunLight,
  hemi: hemiLight,
  dayLight,
  windowMats: city.windowMats,
  lanternGlow: city.lanternGlow,
  lanternPool: city.lanternPool,
  cloudMat: gameCloudMat,
});
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

// Foot police: uniformed officers who chase Jules on foot at wanted 2+
// and arrest him (see footpolice.js). A cruiser arrest spawns one beside
// the cruiser through spawnOfficerAt.
const footCops = createFootPolice(scene, city, seeded);

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
    timeOfDay: dayNight.getTime(),
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
  dayNight.setTime(save.timeOfDay);
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
    // Mouse sensitivity from Settings (0.5x–2x, default 1x) scales the
    // drag before the rig consumes it.
    rig.yaw -= mouse.dx * 0.005 * view.sensitivity;
    rig.pitch = clamp(rig.pitch + mouse.dy * 0.003 * view.sensitivity, 0.12, 1.1);
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
  // A staged shot sits low, near street level, like a GTA third-person
  // camera; normal play keeps the higher chase camera. The staged
  // pitch/dist alone cannot get the camera down (they only add height on
  // top of eyeHeight), so the eye height itself drops for shots.
  const eyeHeight = staged
    ? (fleet.isDriving() ? 2.4 : 2.2)
    : (fleet.isDriving() ? 5.2 : 3.6);
  camera.position.set(
    focus.x - Math.sin(rig.yaw) * Math.cos(pitch) * dist,
    eyeHeight + Math.sin(pitch) * dist * 0.6,
    focus.z - Math.cos(rig.yaw) * Math.cos(pitch) * dist,
  );
  // A staged shot may raise the look point (its y) so the camera looks
  // up — the chase shot looks up at the helicopter. Without a y, the
  // look point stays at the old height, so every other shot frames
  // exactly as before.
  const lookY = staged && staged.y !== undefined ? staged.y : focus.y + 1.6;
  camera.lookAt(lookX, lookY, lookZ);
}

// --- title-screen camera ----------------------------------------------------
// A low, close frame on Jules and the red sports car, with the marina
// skyline and the sunset behind them — a game cover, not a vista. The
// camera barely moves (a slow sway and bob), so the framing holds; it
// sets the camera directly and never touches the gameplay rig
// (view.rig) or a staged shot (view.staged), so starting the game or
// staging a screenshot is unaffected.
let titleTime = 0;
function updateTitleCamera(dt) {
  titleTime += dt;
  const sway = 0.03 * Math.sin(titleTime * 0.07);
  const bob = 0.12 * Math.sin(titleTime * 0.11);
  const c = TITLE_STAGE.cam;
  const l = TITLE_STAGE.look;
  camera.position.set(c.x + sway * 10, c.y + bob, c.z);
  camera.lookAt(l.x + sway * 6, l.y, l.z);
  // Clouds drift slowly across the sunset sky.
  for (const cloud of titleClouds) {
    cloud.position.x += dt * 1.2;
    if (cloud.position.x > 250) cloud.position.x = -450;
  }
}

// --- busted and wasted -----------------------------------------------------
// Busted and wasted share the same shape: stop the chase, take the penalty,
// and offer one way back. The penalty differs — bail for an arrest, a
// hospital bill for a death — and so does the respawn point.
function endRun(kind) {
  if (run.screen !== 'playing' && run.screen !== 'arrest') return false;
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

// A cruiser pinned Jules — instead of cutting straight to BUSTED, an
// officer steps out of the cruiser, walks over and cuffs him first.
// The arrest scene ends the run with the usual BUSTED screen.
function handleCruiserArrest(unit) {
  startArrest(unit, 'cruiser');
}

// --- the arrest scene -------------------------------------------------------
// When a foot officer or a cruiser catches Jules, the game cuts to a short
// scene before BUSTED: an officer walks up, Jules' hands go behind his
// back, and steel cuffs appear on his wrists. The scene runs on its own
// screen ('arrest'), so the world freezes while the officer walks.
let arrest = null;

// Staging only: the car kept burning in the chase shot. Re-triggered in
// advance(), so the fire is still there when the screenshot is taken.
let burningCar = null;
let burnTimer = 0;

function startArrest(subject, source) {
  let officer = subject;
  if (source === 'cruiser') {
    // The officer steps out of the cruiser: spawn him beside it.
    const p = subject.mesh.position;
    officer = footCops.spawnOfficerAt(p.x + 1.5, p.z + 1.5);
  }
  // A cruiser arrest while driving: Jules steps out of the car first,
  // so the officer can cuff him on foot.
  if (fleet.isDriving()) {
    const spot = fleet.exitCar();
    jules.group.visible = true;
    jules.teleport(spot.x, spot.z, jules.state.heading);
  }
  // A cutscene, not gameplay: the crosshair goes away until play resumes.
  ui.setCrosshair(false);
  arrest = { officer, source, phase: 'approach', timer: 0 };
  run.screen = 'arrest';
}

function advanceArrest(dt) {
  if (!arrest) { run.screen = 'playing'; return; }
  const officer = arrest.officer;
  if (arrest.phase === 'approach') {
    // Walk the officer to a spot beside Jules, then cuff him. Close —
    // 0.8 m — so the officer's outstretched arm can reach Jules, the
    // way a real cuffing looks: the officer right beside him, not
    // standing a metre off.
    const tx = jules.position.x + Math.sin(jules.state.heading + Math.PI / 2) * 0.8;
    const tz = jules.position.z + Math.cos(jules.state.heading + Math.PI / 2) * 0.8;
    const dist = footCops.stepToward(officer, dt, tx, tz, 4.5);
    arrest.timer += dt;
    // Stuck fallback: a building between the cruiser and Jules can
    // leave the officer sliding along a wall for a long time. After
    // 4 s he rounds the corner (teleports beside Jules) so the scene
    // never stalls — in the normal case (cruiser on a road next to
    // Jules) he arrives in about a second and this never fires.
    if (dist < 0.3 || arrest.timer > 4) {
      officer.mesh.position.set(tx, 0, tz);
      arrest.phase = 'cuff';
      arrest.timer = 0;
      footCops.face(officer, jules.position.x, jules.position.z);
      jules.cuff(true);
      // The officer's right arm reaches forward to Jules — holding his
      // arm while the cuffs go on, not standing at ease beside him.
      officer.limbs.armR.rotation.x = -1.1;
      officer.limbs.elbowR.rotation.x = -0.4;
      officer.limbs.armL.rotation.x = -0.3;
    }
  } else {
    arrest.timer += dt;
    if (arrest.timer > 1.5) {
      const done = endRun('busted');
      if (done) arrest = null;
    }
  }
  // Ease the camera in to frame Jules and the officer — close and low,
  // so the cuffs read, and fast, so it settles before the BUSTED screen.
  // 2.7 m back at 1.7 m up, looking at his hands: Jules fills the frame
  // and the cuffed hands sit near the centre, big enough to read as
  // steel rings in a full 1280x720 frame without cropping — the 3.5 m
  // framing left the cuffs at ~15 px, too small to tell what they were.
  // The camera sits 0.7 m to the side of dead-behind: straight behind,
  // his torso hides the cuffed hands entirely — the three-quarter angle
  // puts the steel rings at the torso's edge, where they can be seen.
  const yaw = view.rig.yaw;
  const cx = jules.position.x - Math.sin(yaw) * 2.7 + Math.cos(yaw) * 0.7;
  const cz = jules.position.z - Math.cos(yaw) * 2.7 - Math.sin(yaw) * 0.7;
  const ease = Math.min(1, dt * 5);
  camera.position.x += (cx - camera.position.x) * ease;
  camera.position.y += (1.7 - camera.position.y) * ease;
  camera.position.z += (cz - camera.position.z) * ease;
  camera.lookAt(jules.position.x, 1.0, jules.position.z);
  // Aim the arrest fill light at the officer from the camera side, so
  // his navy uniform reads at night instead of a black silhouette.
  // The light sits above and toward the camera from him and aims at
  // his chest; the loop hides it again the moment the scene ends.
  const op = officer.mesh.position;
  const odx = camera.position.x - op.x;
  const odz = camera.position.z - op.z;
  const odl = Math.hypot(odx, odz) || 1;
  arrestLight.position.set(op.x + (odx / odl) * 1.6, 2.4, op.z + (odz / odl) * 1.6);
  arrestLightTarget.position.set(op.x, 1.2, op.z);
  arrestLight.intensity = 3.5;
  arrestLight.visible = true;
}

function handleWasted() {
  endRun('wasted');
}

// One respawn for both endings: heal up, stand at the given spot, play on.
function respawn(x, z) {
  jules.heal(PLAYER.health);
  jules.cuff(false);
  arrest = null;
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
  jules.cuff(false);
  arrest = null;
  jules.teleport(city.playerSpawn.x, city.playerSpawn.z, 0);
  missions.setProgress(0);
  cops.clearWanted();
  arms.setState(null);
  garage.setState(null);
  radio.setStation(0);
  fleet.setUpgrades({ nos: false, armor: false });
  dayNight.setTime(7);
}

function beginGame(isNew) {
  if (isNew) resetSession();
  else loadCheckpoint();
  unstageTitle();
  jules.cuff(false);
  arrest = null;
  run.screen = 'playing';
  ui.setTitleMode(false);
  ui.hideMenu();
  audio.unlock();
  ui.setObjective(missions.current().title, missions.step().text);
  ui.showToast('Welcome to Solmarina. Mara Voss is waiting — check the gold marker.', 5);
}

// --- menus -----------------------------------------------------------------
const CONTROLS_TEXT = 'WASD move &nbsp;·&nbsp; Shift run / NOS &nbsp;·&nbsp; E enter / exit car &nbsp;·&nbsp; H horn &nbsp;·&nbsp; 1-5 weapons (5 knife) &nbsp;·&nbsp; Q radio &nbsp;·&nbsp; F punch / slash &nbsp;·&nbsp; Click shoot / slash &nbsp;·&nbsp; R reload &nbsp;·&nbsp; Mouse drag camera &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute';

function openTitle() {
  run.screen = 'menu';
  const hasSave = loadSave() !== null;
  const buttons = [{ label: hasSave ? 'Continue' : 'New game', onClick: () => beginGame(!hasSave) }];
  if (hasSave) buttons.push({ label: 'New game', onClick: () => beginGame(true) });
  buttons.push({ label: 'Settings', onClick: () => openSettings('title') });
  ui.setTitleMode(true);
  stageTitle();
  ui.showMenu('SOLMARINA', `<span class="t-sub">A COASTAL OPEN-WORLD STORY</span><span class="t-tag">A sun-soaked city, a stolen car, and twelve jobs that will make you rich — or get you busted.</span>`, buttons);
}

function openPause() {
  run.screen = 'paused';
  audio.engineOff();
  ui.showMenu('Paused', CONTROLS_TEXT, [
    { label: 'Resume', onClick: () => { run.screen = 'playing'; ui.hideMenu(); } },
    { label: 'Settings', onClick: () => openSettings('pause') },
    { label: 'Save and quit to title', onClick: () => { writeCheckpoint(); openTitle(); } },
  ]);
}

// --- settings menu ----------------------------------------------------------
// The settings menu lives in the same #menu overlay. It does not change
// run.screen, so the title backdrop keeps orbiting behind it (from the
// title) and the game stays paused behind it (from pause); Back returns
// to wherever it was opened from. Every control writes through at once
// and saves, so there is no Apply button and nothing is decorative.
let settingsFrom = 'title';

function setRow(labelText) {
  const row = document.createElement('div');
  row.className = 'set-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  row.appendChild(label);
  return row;
}

function volumeRow(labelText, key) {
  const row = setRow(labelText);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(settings[key]);
  slider.setAttribute('aria-label', labelText);
  const val = document.createElement('span');
  val.className = 'set-val';
  val.textContent = `${settings[key]}%`;
  slider.addEventListener('input', () => {
    settings[key] = Number(slider.value);
    val.textContent = `${settings[key]}%`;
    applySettings();
    saveSettings();
  });
  row.appendChild(slider);
  row.appendChild(val);
  return row;
}

function toggleRow(labelText, get, set) {
  const row = setRow(labelText);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'set-toggle';
  const refresh = () => { btn.textContent = get() ? 'On' : 'Off'; };
  btn.addEventListener('click', () => {
    set(!get());
    refresh();
    applySettings();
    saveSettings();
  });
  refresh();
  row.appendChild(btn);
  return row;
}

function renderSettingsRows() {
  const root = ui.settingsRoot();
  root.innerHTML = '';
  root.appendChild(volumeRow('Master volume', 'masterVolume'));
  root.appendChild(volumeRow('Music volume', 'musicVolume'));
  root.appendChild(volumeRow('SFX volume', 'sfxVolume'));
  root.appendChild(toggleRow('Mute', () => settings.muted, (v) => { settings.muted = v; }));
  // Quality cycles Low -> Medium -> High. A preset also sets the shadows
  // default (Low = off, Medium/High = on); the Shadows toggle below can
  // override it afterwards.
  const qualityRow = setRow('Quality');
  const qualityBtn = document.createElement('button');
  qualityBtn.type = 'button';
  qualityBtn.className = 'set-toggle';
  const qualityLabel = () => settings.quality[0].toUpperCase() + settings.quality.slice(1);
  const refreshQuality = () => { qualityBtn.textContent = qualityLabel(); };
  qualityBtn.addEventListener('click', () => {
    const next = QUALITIES[(QUALITIES.indexOf(settings.quality) + 1) % QUALITIES.length];
    settings.quality = next;
    settings.shadows = next !== 'low';
    refreshQuality();
    renderSettingsRows();
    applySettings();
    saveSettings();
  });
  refreshQuality();
  qualityRow.appendChild(qualityBtn);
  root.appendChild(qualityRow);
  root.appendChild(toggleRow('Shadows', () => settings.shadows, (v) => { settings.shadows = v; }));
  // Mouse sensitivity: 0.5x–2x in 0.1 steps, shown as e.g. 1.0x.
  const sensRow = setRow('Mouse sensitivity');
  const sensSlider = document.createElement('input');
  sensSlider.type = 'range';
  sensSlider.min = '0.5';
  sensSlider.max = '2';
  sensSlider.step = '0.1';
  sensSlider.value = String(settings.sensitivity);
  sensSlider.setAttribute('aria-label', 'Mouse sensitivity');
  const sensVal = document.createElement('span');
  sensVal.className = 'set-val';
  sensVal.textContent = `${settings.sensitivity.toFixed(1)}×`;
  sensSlider.addEventListener('input', () => {
    settings.sensitivity = Number(sensSlider.value);
    sensVal.textContent = `${settings.sensitivity.toFixed(1)}×`;
    applySettings();
    saveSettings();
  });
  sensRow.appendChild(sensSlider);
  sensRow.appendChild(sensVal);
  root.appendChild(sensRow);
}

function openSettings(from) {
  settingsFrom = from;
  ui.showMenu('SETTINGS', 'Sound, graphics and controls. Changes apply at once and are remembered.', [
    {
      label: 'Back',
      onClick: () => {
        if (settingsFrom === 'pause') openPause();
        else openTitle();
      },
    },
  ]);
  renderSettingsRows();
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
  // No car to take: chat with a nearby pedestrian instead. Talking is
  // the last E-key fallback — a car, a mission, the garage or the shop
  // always wins over a chat.
  const ped = traffic.nearestTalkablePed(jules.position, 2.5);
  if (ped) talkToPed(ped);
}

// NPC talk: a short chat with a pedestrian. They stop and face Jules,
// say one random line, and (rarely) hand over a small cash tip.
function talkToPed(ped) {
  if (!traffic.startTalk(ped, jules.position)) return;
  const tip = Math.random() < 1 / 8;
  if (tip) {
    const amount = 10 + Math.floor(Math.random() * 16); // $10-25
    const line = TALK_TIP_LINES[Math.floor(Math.random() * TALK_TIP_LINES.length)];
    run.cash += amount;
    ui.showToast(`"${line}" (+$${amount})`, 3.5);
    audio.cash();
  } else {
    const line = TALK_LINES[Math.floor(Math.random() * TALK_LINES.length)];
    ui.showToast(`"${line}"`, 3);
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

// A knife slash: the swing animation, then the blade's hit. A ped in
// reach is cut down; a car in reach takes the blade's damage.
function slashWeapon() {
  if (!jules.punch()) return;
  audio.punch();
  const result = arms.slash(jules.position, view.rig.yaw, traffic, fleet);
  if (!result || result.hit === 'none') return;
  if (result.hit === 'ped') {
    traffic.killPed(result.target);
    flagCrime(WANTED.punchPed, jules.position, 'That was a civilian! Wanted level up.');
  } else if (result.hit === 'car' && result.car) {
    const power = arms.currentWeapon().damage;
    let verdict = 'damaged';
    if (result.list === 'traffic') verdict = traffic.damageCar(result.car, power);
    else if (result.list === 'parked') verdict = fleet.damageCar(result.car, power);
    const at = result.car.mesh.position;
    if (verdict === 'destroyed') {
      fx.explode(at.x, 1, at.z);
      audio.explosion();
      if (result.list === 'parked') fleet.removeCar(result.car);
      cops.addWanted(WANTED.shootCop);
      traffic.reportCrime(at);
    } else {
      // Slashing a car is vandalism: the heat goes up.
      cops.addWanted(WANTED.punchPed);
      traffic.reportCrime(at);
    }
  }
}

function handleInput() {
  if (pad.wasPressed('KeyE')) {
    if (fleet.isDriving()) interactWhileDriving();
    else interactOnFoot();
  }
  // The weapon wheel: keys 1-5 switch between the owned weapons.
  const digit = pad.takeDigit();
  if (digit > 0) {
    if (arms.switchWeapon(digit - 1)) {
      jules.setArmed(true);
      jules.setWeapon(arms.currentWeapon().id);
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
    // With the knife out, F slashes instead of punching.
    if (arms.currentWeapon().melee) {
      slashWeapon();
    } else if (jules.punch()) {
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
    // With the knife out, a click slashes instead of shooting.
    if (arms.currentWeapon().melee) slashWeapon();
    else fireWeapon();
  }
  if (pad.wasPressed('KeyR')) arms.reload();
  if (pad.wasPressed('KeyM')) toggleMute();
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
  if (traffic.nearestTalkablePed(jules.position, 2.5)) return 'Press E — talk';
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
  cops.update(dt, focus, pace, driving, handleCruiserArrest);
  footCops.update(dt, focus, pace, driving, cops.getWanted(), (officer) => startArrest(officer, 'foot'));
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
  // A staged screenshot hides the prompt: it sits on top of the car
  // in the driving shots ("Press E — exit car" across the boot), and
  // these frames are staged, not played. Normal play is untouched.
  ui.setPrompt(view.staged ? '' : promptFor(driving));
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
  // The day/night cycle advances with game time.
  dayNight.advance(dt);
  // The gameplay clouds drift slowly across the sky, like the title
  // screen's — a little slower, so they don't outrun the frame.
  for (const cloud of gameClouds) {
    cloud.position.x += dt * 1.0;
    if (cloud.position.x > 450) cloud.position.x = -450;
  }
  // Staging only: keep the chosen car burning in the chase shot, so the
  // fire is still there when the screenshot is taken. Two bursts every
  // 0.3 s — one burst alone fades and spreads into a thin wisp between
  // triggers; the double burst stays a dense fireball on the car.
  if (burningCar && burningCar.mesh) {
    burnTimer -= dt;
    if (burnTimer <= 0) {
      const p = burningCar.mesh.position;
      fx.explode(p.x, 1, p.z);
      fx.explode(p.x + 0.6, 1.2, p.z - 0.4);
      burnTimer = 0.3;
    }
  }

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
    vest: jules.state.vest,
    wanted: cops.getWanted(),
    ammo: arms.getAmmo(),
    weaponName: arms.currentWeapon().name,
    magSize: arms.currentWeapon().magSize,
    weapons: arms.weaponList(),
    radio: fleet.isDriving() && radio.isOn() ? `♪ ${radio.current().name} — ${radio.current().desc}` : '',
    respect: `Respect: ${rankLabel()} (${run.respect})`,
    clock: dayNight.clockText(),
    playerX: jules.position.x,
    playerZ: jules.position.z,
    heading: jules.state.heading,
    streets: city.streets,
    trafficCars: traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    policeCars: run.policeDots,
    mission: missions.mapTargetPosition(),
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
  footCops,
  missions,
  hud: ui,
  state: run,
  combat: arms,
  radio,
  traffic,
  update: advance,
  setShotCam: (value) => { view.staged = value; },
  setTimeOfDay: (hours) => dayNight.setTime(hours),
  igniteCar: (car) => { burningCar = car; burnTimer = 0; },
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
  } else if (run.screen === 'arrest') {
    // The arrest scene: the officer walks up and cuffs Jules, then BUSTED.
    advanceArrest(dt);
  } else if (run.screen === 'menu') {
    // The title screen: the living city behind the menu, under a slow
    // cinematic orbit over the marina — not the street-level chase cam.
    traffic.update(dt, jules.position, null, [], 0);
    updateTitleCamera(dt);
  }
  // The arrest fill light lives only while the arrest screen is up.
  arrestLight.visible = run.screen === 'arrest';
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
  // Day/night: set and read the time of day, and the clock text.
  setTimeOfDay: (h) => dayNight.setTime(h),
  timeOfDay: () => dayNight.getTime(),
  clockText: () => dayNight.clockText(),
  // Foot police: how many are out, and force an arrest scene (foot
  // officer, or an officer stepping out of the nearest cruiser) so the
  // handcuff moment can be photographed.
  footCops: () => footCops.officerCount(),
  spawnOfficerAhead: (dist) => footCops.spawnOfficerAt(jules.position.x, jules.position.z - (dist || 15)),
  // Staging only (shootout proof shot): fire a held muzzle flash +
  // tracer from Jules' gun, for the screenshot. Aims at the nearest
  // cruiser AHEAD of Jules (not the foreground cruiser parked level
  // with him): the tracer then runs diagonally toward a police
  // cruiser, clearly separated from the road's white centre line
  // instead of overlapping it. The flash light alone does not read
  // in a bright Sore still (a light has no visible source), so the
  // staged shot also shows a bright flash sprite at the muzzle
  // (combat.stageMuzzle). Uses combat.stageMuzzle, which holds the
  // flash/tracer for the shot; a real 0.06 s flash is too brief to
  // catch in a still. Jules does the shooting; the police never
  // shoot back.
  fireStageShot: () => {
    const muzzle = new THREE.Vector3(jules.position.x, 1.25, jules.position.z);
    const u = cops.nearestUnitAhead(jules.position.x, jules.position.z, 8);
    let aim;
    let range = 60;
    if (u) {
      const tx = u.mesh.position.x;
      const tz = u.mesh.position.z;
      aim = new THREE.Vector3(tx - muzzle.x, 0, tz - muzzle.z);
      range = aim.length();
      aim.normalize();
    } else {
      aim = new THREE.Vector3();
      camera.getWorldDirection(aim);
      aim.y = 0;
      if (aim.lengthSq() < 0.001) aim.set(0, 0, -1);
      aim.normalize();
    }
    muzzle.addScaledVector(aim, 0.8);
    arms.stageMuzzle(muzzle, aim, range);
    return { muzzle: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, aim: { x: aim.x, y: aim.y, z: aim.z }, range };
  },
  // Staging hook: clear traffic cars near a point, so a staged shot
  // (the handcuff scene) has no car beam washing the foreground — a
  // taxi stopped next to the arrest camera put a bright white beam
  // triangle across the whole foreground. Replacements only spawn at
  // circuit corners after 20 s of game time (traffic.topUp), so the
  // cleared area stays clear for the shot. Staging only; gameplay
  // never calls this.
  clearTrafficNear: (x, z, r) => {
    let n = 0;
    for (const car of [...traffic.cars]) {
      const dx = car.mesh.position.x - x;
      const dz = car.mesh.position.z - z;
      if (dx * dx + dz * dz < r * r) { traffic.removeCar(car); n += 1; }
    }
    return n;
  },
  arrestFoot: () => {
    const o = footCops.spawnOfficerAt(jules.position.x + 1.5, jules.position.z + 1.5);
    startArrest(o, 'foot');
  },
  arrestCruiser: () => {
    const u = cops.nearestUnit(jules.position.x, jules.position.z);
    if (u) startArrest(u, 'cruiser');
  },
  // Cruiser arrest with the cruiser pulled next to Jules first, so the
  // officer's walk from the car is short and never crosses a building.
  arrestCruiserNear: () => {
    cops.placeNearest(jules.position.x + 2, jules.position.z + 2, 0);
    const u = cops.nearestUnit(jules.position.x, jules.position.z);
    if (u) startArrest(u, 'cruiser');
  },
  openShop,
  openGarage,
  settings: () => ({ ...settings }),
  audioLevels: () => ({
    muted: audio.isMuted(),
    master: audio.masterVolume(),
    music: audio.musicVolume(),
    sfx: audio.sfxVolume(),
  }),
  rendererInfo: () => ({
    pixelRatio: renderer.getPixelRatio(),
    shadows: renderer.shadowMap.enabled,
    shadowType: renderer.shadowMap.type === THREE.PCFSoftShadowMap ? 'PCFSoft' : 'PCF',
  }),
  debug: () => {
    const ride = fleet.currentCar();
    const rivalCar = traffic.rivalCar();
    return {
      screen: run.screen,
      arrest: arrest ? arrest.phase : null,
      officers: footCops.officers.map((o) => ({ x: o.mesh.position.x, z: o.mesh.position.z })),
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
  applySettings();
  shots.stageShot(shotName);
  requestAnimationFrame(loop);
} else {
  applySettings();
  openTitle();
  requestAnimationFrame(loop);
}
