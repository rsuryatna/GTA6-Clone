// SOLMARINA — tuning constants and the city layout.
// One file holds every number the rest of the game reads, so balancing the
// game means editing here and nowhere else.

export const CITY = {
  seed: 7,
  // City grid: blocks of BLOCK metres separated by ROAD-wide streets.
  block: 56,
  road: 16,
  blocksPerSide: 5,
  // South edge of the city is the beach; the ocean starts past it.
  beachStartZ: 178,
  oceanStartZ: 208,
  // How far the playable area extends (used for the minimap and bounds).
  halfSize: 190,
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
};

// The weapon wheel: four switchable weapons (keys 1-4). Damage is per
// pellet; the shotgun fires a spread of six. Prices are shop prices; the
// respect column is the reputation rank a weapon needs before Ammu-Nation
// will sell it. The pistol is Jules' from the start.
export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', damage: 34, magSize: 12, range: 90, fireRate: 0.22, spread: 0.01, pellets: 1, price: 0, respect: 0 },
  { id: 'shotgun', name: 'Shotgun', damage: 22, magSize: 6, range: 42, fireRate: 0.7, spread: 0.09, pellets: 6, price: 400, respect: 0 },
  { id: 'smg', name: 'SMG', damage: 16, magSize: 30, range: 60, fireRate: 0.09, spread: 0.05, pellets: 1, price: 600, respect: 20 },
  { id: 'rifle', name: 'Rifle', damage: 55, magSize: 10, range: 130, fireRate: 0.5, spread: 0.005, pellets: 1, price: 900, respect: 50 },
];

export const AMMO_PRICE = 50;
export const HEALTH_PRICE = 100;

// The police helicopter: out at four stars and up, hovering over the
// player with a searchlight. It never lands and it never stops watching —
// while it is up, the wanted level cannot fade. At 30 m the body sits above
// the chase camera's view, so in normal play only its searchlight reads;
// the staged chase shot frames it with a special camera.
export const HELI = {
  altitude: 30,
  followSpeed: 26,
  cruiseSpeed: 34,
  rotorSpeed: 22,
};

// Roadblocks: at three stars the PD throws barriers across the road ahead
// of the player, with a cruiser parked behind them. They are placed far
// enough ahead that the player can always steer around them.
export const ROADBLOCK = {
  minWanted: 3,
  maxGroups: 2,
  aheadDistance: 62,
  width: 9,
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

// Colours of the sun-soaked city: warm sand, pastel walls, teal sea.
export const PALETTE = {
  sky: 0x8ec8ee,
  fog: 0xa8d0e8,
  sun: 0xfff2d0,
  asphalt: 0x3a3f46,
  sidewalk: 0xb8b0a0,
  sand: 0xe8d49a,
  sea: 0x2e7f9e,
  building: [0xe8b48c, 0xd9a0a8, 0xa8c8d8, 0xf0d8a0, 0xc8b8e0, 0x9fc8a8, 0xe0e0d8],
  car: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a1a],
  police: 0x1a2a4a,
  taxi: 0xf7c948,
};
