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
