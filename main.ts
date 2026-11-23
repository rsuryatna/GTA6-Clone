// SOLMARINA — main.ts
// The entry program for the make.fun gta6-01 bounty (Node 22, stdlib only).
// It copies game/ and screenshots/ from this repository into the output
// directory (MAKEFUN_OUTPUT_DIR, default /output), validates the four
// screenshots, and writes /output/dossier.json with buildDossier from
// vendor/makefun-game.ts. Running it twice writes the same bytes.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const REPO_DIR = new URL('.', import.meta.url).pathname;
const EXPECTED_SHOTS = ['1-hero.jpg', '2-mission.jpg', '3-chase.jpg', '4-city.jpg'];
const SHOT_WIDTH = 1280;
const SHOT_HEIGHT = 720;

// Read a JPEG's pixel size from its SOF0/SOF1/SOF2 marker (stdlib only,
// no image library): scan markers after the SOI, skip segments by length.
function jpegSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('not a JPEG (missing SOI marker)');
  }
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda) break; // SOS: the scan data follows, no more headers.
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = bytes.readUInt16BE(i + 5);
      const width = bytes.readUInt16BE(i + 7);
      return { width, height };
    }
    i += 2 + length;
  }
  throw new Error('no SOF marker found in JPEG');
}

function validateScreenshots(shotsDir: string): void {
  const names = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
  const missing = EXPECTED_SHOTS.filter((n) => !names.includes(n));
  if (missing.length > 0) {
    throw new Error(`screenshots/: missing ${missing.join(', ')}`);
  }
  const extra = names.filter((n) => !EXPECTED_SHOTS.includes(n));
  if (extra.length > 0) {
    throw new Error(`screenshots/: unexpected files ${extra.join(', ')} (exactly 4 screenshots)`);
  }
  for (const name of EXPECTED_SHOTS) {
    const path = join(shotsDir, name);
    const bytes = readFileSync(path);
    if (bytes.length > 262144) {
      throw new Error(`screenshots/${name}: ${bytes.length} bytes, over the 256 KiB cap`);
    }
    const size = jpegSize(bytes);
    if (size.width !== SHOT_WIDTH || size.height !== SHOT_HEIGHT) {
      throw new Error(
        `screenshots/${name}: ${size.width}x${size.height}, expected ${SHOT_WIDTH}x${SHOT_HEIGHT}`,
      );
    }
  }
}

function main(): void {
  const gameDir = join(REPO_DIR, 'game');
  const shotsDir = join(REPO_DIR, 'screenshots');
  if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) {
    throw new Error('game/: no such directory');
  }
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('game/index.html: no such file');
  }
  validateScreenshots(shotsDir);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  // A clean output every run, so a second run writes the same bytes.
  for (const entry of readdirSync(OUTPUT_DIR)) {
    rmSync(join(OUTPUT_DIR, entry), { recursive: true, force: true });
  }
  cpSync(gameDir, join(OUTPUT_DIR, 'game'), { recursive: true });
  cpSync(shotsDir, join(OUTPUT_DIR, 'screenshots'), { recursive: true });

  const dossier = buildDossier(OUTPUT_DIR, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
  console.log(`SOLMARINA: wrote ${OUTPUT_DIR}/dossier.json (${dossier.length} bytes)`);
  console.log(`SOLMARINA: 4 screenshots validated at ${SHOT_WIDTH}x${SHOT_HEIGHT}`);
  console.log('SOLMARINA: deterministic — a second run writes the same bytes');
}

main();
