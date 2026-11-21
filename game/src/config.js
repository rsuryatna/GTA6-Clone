// SOLMARINA — every number the game runs on, in one place.
// Balance lives here: change a value in this file and the whole game
// follows. Nothing else in the codebase hard-codes a tuning number.
//
// The file is split into systems — city, player, weapons, police, traffic,
// garage, shop, respect, effects — so each mechanic can be tuned alone.

export const CITY = {
  seed: 7,
  // A block is BLOCK metres of buildings; ROAD metres of street sit
  // between two blocks. Five blocks a side makes a city you can cross
  // in about a minute at full speed.
  block: 56,
  road: 16,
  blocksPerSide: 5,
  // The beach is the city's southern edge; the sea begins past it.
  beachStartZ: 178,
  oceanStartZ: 208,
  // Playable bounds, used by the minimap, the camera and collision.
  halfSize: 190,
  // Landmarks the story walks past: the bank downtown, the marina pier
  // and the boardwalk ferris wheel.
  bankX: 36,
  bankZ: 36,
  pierX: -40,
  pierZ: 168,
  wheelX: -72,
  wheelZ: 150,
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.6,
  height: 1.8,
  health: 100,
  punchDamage: 25,
  punchRange: 2.2,
  punchArc: 1.1,
  pistolDamage: 34,
  pistolAmmo: 12,
  pistolRange: 90,
  // A bulletproof vest soaks damage before health does. Ammu-Nation
  // sells it; it does not regenerate.
  vestArmor: 50,
};

// The weapon wheel: four guns on keys 1-4. Damage is per pellet and the
// shotgun fires a spread of six, so it shreds up close and tickles at
// range. Price is what Ammu-Nation charges; respect is the rank a gun
// needs before the shop will sell it. Jules starts with the pistol.
export const WEAPONS = [
  {
    id: 'pistol', name: 'Pistol', damage: 34, magSize: 12, range: 90,
    fireRate: 0.22, spread: 0.01, pellets: 1, price: 0, respect: 0,
  },
  {
    id: 'shotgun', name: 'Shotgun', damage: 22, magSize: 6, range: 42,
    fireRate: 0.7, spread: 0.09, pellets: 6, price: 400, respect: 0,
  },
  {
    id: 'smg', name: 'SMG', damage: 16, magSize: 30, range: 60,
    fireRate: 0.09, spread: 0.05, pellets: 1, price: 600, respect: 20,
  },
  {
    id: 'rifle', name: 'Rifle', damage: 55, magSize: 10, range: 130,
    fireRate: 0.5, spread: 0.005, pellets: 1, price: 900, respect: 50,
  },
];

export const AMMO_PRICE = 50;
export const HEALTH_PRICE = 100;
export const VEST_PRICE = 300;

// The police helicopter: up at four stars, circling the player with a
// searchlight. It never lands and never stops watching — while it is up,
// the wanted level cannot fade. At 30 m its body sits above the chase
// camera's view, so in normal play only the searchlight reads; the staged
// chase shot frames it with a special camera.
export const HELI = {
  altitude: 30,
  followSpeed: 26,
  cruiseSpeed: 34,
  rotorSpeed: 22,
};

// Roadblocks: at three stars the PD throws barriers across the road ahead
// of the player, with a cruiser parked behind them. They sit far enough
// ahead that the player can always steer around them — one side is left open.
export const ROADBLOCK = {
  minWanted: 3,
  maxGroups: 2,
  aheadDistance: 62,
  width: 9,
};

// Spike strips: at five stars the PD drops a strip across the road ahead.
// Hit one and the tyres pop — the car crawls until the player escapes the
// strip or ditches the car. Like roadblocks, they leave a gap on one side.
export const SPIKES = {
  minWanted: 5,
  maxGroups: 2,
  aheadDistance: 48,
  width: 8,
  slowFactor: 0.35,
  slowSeconds: 4,
};

// Witnesses: a pedestrian who sees a crime pulls out a phone. If the
// player is still nearby a few seconds later, the call goes through and
// the heat rises one star. Run, and the witness gives up.
export const WITNESS = {
  seeRadius: 18,
  callSeconds: 3,
  stars: 1,
};

// Cars have health now: bullets and hard rams wear them down, and a car
// at zero health explodes. The rival's armoured car in Job 11 takes
// twice as much punishment as a street car.
export const CAR_HEALTH = {
  street: 100,
  armoured: 220,
  bulletDamage: 34,
  ramDamage: 18,
  explosionRadius: 7,
  explosionDamage: 60,
};

// The safehouse garage at the Palm Heights hideout, and its upgrades.
export const GARAGE = {
  x: -150,
  z: -108,
  radius: 9,
  nosPrice: 500,
  armorPrice: 800,
  nosBoost: 1.45,
  nosDrain: 0.34,
  nosRefill: 0.12,
  paintPrice: 150,
  repairPrice: 100,
};

// Ammu-Nation, the gun shop downtown.
export const SHOP = {
  x: 108,
  z: -36,
  radius: 7,
};

// Respect: reputation ranks earned from jobs and heat, lost to arrests.
// Ranks gate the shop's better weapons and discount garage upgrades.
export const RESPECT = {
  ranks: [
    { at: 0, name: 'Nobody' },
    { at: 20, name: 'Known' },
    { at: 50, name: 'Respected' },
    { at: 100, name: 'Legend' },
  ],
  perMission: 10,
  perCarjack: 1,
  perEscape: 5,
  perBusted: -10,
  discountAt: 50,
  discount: 0.25,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,
  maxReverse: 12,
  steer: 1.9,
  grip: 6,
  radius: 1.5,
};

export const TRAFFIC = {
  carCount: 14,
  pedCount: 26,
  carSpeed: 9,
  pedSpeed: 1.6,
  // Traffic pulls over when a siren is close: cruisers within this
  // distance make nearby traffic slow to a crawl and edge to the kerb.
  yieldRadius: 18,
  yieldSpeed: 2.5,
};

export const POLICE = {
  maxCars: 5,
  chaseSpeed: 30,
  ramDamage: 8,
  bustRadius: 3.2,
  bustTime: 2.5,
  decaySeconds: 25,
};

export const WANTED = {
  stealCar: 1,
  carjack: 1,
  punchPed: 1,
  shootPed: 2,
  punchCop: 2,
  shootCop: 3,
  hitPedWithCar: 2,
};

// Visual effects: a single pooled particle system (see render.js) handles
// tyre smoke, muzzle sparks, dust and explosions. The caps keep the frame
// rate honest on a slow machine.
export const FX = {
  maxParticles: 320,
  smokeLife: 1.4,
  sparkLife: 0.35,
  explosionLife: 0.9,
  dustLife: 1.1,
};

// Colours of the sun-soaked city: warm sand, pastel walls, teal sea.
export const PALETTE = {
  sky: 0x8ec8ee,
  fog: 0xa8d0e8,
  sun: 0xfff2d0,
  asphalt: 0x3a3f46,
  sidewalk: 0xb8b0a0,
  sand: 0xe8d49a,
  sea: 0x2e7f9e,
  building: [
    0xe8b48c, 0xd9a0a8, 0xa8c8d8, 0xf0d8a0,
    0xc8b8e0, 0x9fc8a8, 0xe0e0d8,
  ],
  car: [
    0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60,
    0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a1a,
  ],
  police: 0x1a2a4a,
  taxi: 0xf7c948,
  // The rival crew's armoured car: matte black with a gold stripe.
  rival: 0x111111,
  rivalStripe: 0xf7c948,
};
