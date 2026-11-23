// SOLMARINA — config.js
// One job: every tunable number, name and palette of the city, in one place.
// Nothing here touches the scene; every other module reads from CFG.

export const CFG = {
  title: 'SOLMARINA',
  hero: 'Jules Maro',
  cityName: 'Solmarina',
  seed: 20261123,
  // City layout: a grid of square blocks, plus one diagonal avenue.
  blockSize: 62,
  roadWidth: 14,
  blocksX: 7,
  blocksZ: 6,
  // The city spans roughly -230 .. +230 on X and -190 .. +190 on Z.
  beachZ: -205,
  marinaX: 235,
  gravity: 22,
  walkSpeed: 7.2,
  runSpeed: 11.5,
  carTopSpeed: 46,
  carAccel: 26,
  carBrake: 40,
  carTurn: 1.9,
  pedCount: 64,
  trafficCount: 26,
  policeCruiserCount: 5,
  footPoliceCount: 8,
  dayLengthSec: 480,
  startHour: 10.5,
  maxWanted: 5,
  saveKey: 'solmarina-save-v1',
};

export const PALETTE = {
  skyDay: 0x87bfe8,
  skyDusk: 0xff9a5c,
  skyNight: 0x0b1026,
  sea: 0x1f7fa8,
  sand: 0xe8d5a4,
  asphalt: 0x4a4d54,
  asphaltLine: 0xf2e394,
  sidewalk: 0xb9b3a4,
  grass: 0x4d8a4a,
  buildingGlass: 0x9fd4e8,
  lampGlow: 0xffd9a0,
  policeWhite: 0xf4f4f0,
  policeBlack: 0x14161a,
  taxiYellow: 0xf7c948,
};

// Paint jobs for traffic and player cars. Each entry is a readable silhouette.
export const CAR_PAINTS = [
  { name: 'Coral', body: 0xd9554a, trim: 0x2b2b2b },
  { name: 'Lagoon', body: 0x2e8fa3, trim: 0x1c1c1c },
  { name: 'Sunset', body: 0xe08a2e, trim: 0x222222 },
  { name: 'Mint', body: 0x6fbf7f, trim: 0x223322 },
  { name: 'Pearl', body: 0xe8e6df, trim: 0x333333 },
  { name: 'Midnight', body: 0x2c3550, trim: 0x111111 },
  { name: 'Grape', body: 0x7a4a9e, trim: 0x1a1a1a },
  { name: 'Cherry', body: 0xa31f34, trim: 0x141414 },
];

// Pedestrian wardrobe: shirt, trousers, hair, skin — readable at a glance.
export const WARDROBE = [
  { shirt: 0xe4572e, pants: 0x2b3a55, hair: 0x1a1210, skin: 0xd9a066 },
  { shirt: 0x2e86ab, pants: 0x3a3a3a, hair: 0x0d0d0d, skin: 0x8c5a3b },
  { shirt: 0xf2c14e, pants: 0x274156, hair: 0x6b4423, skin: 0xe8b98a },
  { shirt: 0x7fb069, pants: 0x54423a, hair: 0x2b2b2b, skin: 0xc98d5f },
  { shirt: 0xef476f, pants: 0x1f2a44, hair: 0xd8d8d8, skin: 0xa06a42 },
  { shirt: 0xffffff, pants: 0x222222, hair: 0x3a2317, skin: 0xe0ac69 },
  { shirt: 0x9b5de5, pants: 0xeeeeee, hair: 0x101010, skin: 0x7a4a2b },
  { shirt: 0x00b4a2, pants: 0x333a4a, hair: 0x8a5a2b, skin: 0xdba27a },
];

export const DISTRICTS = [
  { name: 'Marina Bay', cx: 170, cz: -40, r: 90 },
  { name: 'Old Town', cx: -60, cz: -60, r: 110 },
  { name: 'Palm Row', cx: 0, cz: 60, r: 100 },
  { name: 'Harbour Heights', cx: -150, cz: 110, r: 80 },
  { name: 'The Strip', cx: 60, cz: -140, r: 90 },
  { name: 'Crescent Beach', cx: 0, cz: -195, r: 120 },
];

export const CONTROLS = [
  ['W A S D', 'Move / drive'],
  ['Shift', 'Sprint'],
  ['E', 'Enter / exit car'],
  ['F', 'Punch / fire'],
  ['R', 'Reload / repair'],
  ['Space', 'Jump / handbrake'],
  ['M', 'Map zoom'],
  ['C', 'Camera'],
  ['H', 'Horn'],
  ['Esc', 'Pause'],
];

// Wanted-level flavour: what the city says about Jules at each star.
export const WANTED_LABELS = [
  'Clean — Solmarina minds its own business',
  'Persons of interest — patrols are watching',
  'Pursuit — cruisers rolling your way',
  'Manhunt — roadblocks on the avenues',
  'Lockdown — the whole harbour force is out',
  'Citywide alert — helicopters overhead',
];

export function districtAt(x, z) {
  let best = DISTRICTS[0];
  let bestD = Infinity;
  for (const d of DISTRICTS) {
    const dd = (x - d.cx) * (x - d.cx) + (z - d.cz) * (z - d.cz);
    if (dd < bestD) { bestD = dd; best = d; }
  }
  return best.name;
}
