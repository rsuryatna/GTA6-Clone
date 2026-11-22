// SOLMARINA hands itself in — the grader entrypoint (Node 22, stdlib only).
//
// The playable game is plain static files under game/: an index.html, ES
// modules, and a vendored three.js, with no build step and no network. The
// four judged pictures live under screenshots/. This program copies both
// folders into the grader's output directory and writes dossier.json there
// with the vendored make.fun library, which is the summary the judge reads.
// It plays no part of the game itself: the city, the twelve jobs and the
// pictures are all produced by the files it copies.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program runs twice and must write identical bytes both times. Copying
// files and building the dossier from them is deterministic, so it does.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

// The repository root (this file's folder) and the grader's output folder.
const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const destDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// The four pictures the judge looks at, in the order shots.json lists them.
const EXPECTED_SHOTS = ["1-hero.jpg", "2-title.jpg", "3-chase.jpg", "4-city.jpg"];

function fail(message: string): never {
  throw new Error(`main.ts: ${message}`);
}

// Copy the whole game folder, then the screenshots folder, into the output
// directory. Refuse early, with a readable error, when the game is absent.
mkdirSync(destDir, { recursive: true });
const gameSrc = join(repoRoot, "game");
if (!existsSync(gameSrc)) fail(`game/ not found next to main.ts (${repoRoot}) — nothing to hand in.`);
cpSync(gameSrc, join(destDir, "game"), { recursive: true });

const shotsSrc = join(repoRoot, "screenshots");
mkdirSync(join(destDir, "screenshots"), { recursive: true });
if (existsSync(shotsSrc)) {
  cpSync(shotsSrc, join(destDir, "screenshots"), { recursive: true });
}

// Read a JPEG's pixel size from its frame header (SOF0/SOF2), without a
// decoder: the two bytes after the length and precision fields are the
// height, then the width. Returns null when the file is not a JPEG.
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
    }
    at += 2 + length;
  }
  return null;
}

// Every expected picture must be there, and the folder must hold no extra
// picture the judge did not ask for — a stray file would be judged too.
const shotNames = readdirSync(join(destDir, "screenshots")).sort();
for (const name of EXPECTED_SHOTS) {
  if (!shotNames.includes(name)) fail(`screenshots/${name} is missing — the judge needs all four pictures.`);
}
const extra = shotNames.filter((name) => !EXPECTED_SHOTS.includes(name));
if (extra.length > 0) fail(`screenshots/ holds unexpected files (${extra.join(", ")}) — remove them.`);

// Each picture must be a 1280x720 capture of the running game. A wrong size
// means the shot was taken at the wrong viewport and would be judged down.
for (const name of EXPECTED_SHOTS) {
  const size = jpegSize(readFileSync(join(destDir, "screenshots", name)));
  if (size === null) fail(`screenshots/${name} is not a JPEG — retake it from the running game.`);
  if (size.width !== 1280 || size.height !== 720) {
    fail(`screenshots/${name} is ${size.width}x${size.height}, not 1280x720 — retake it.`);
  }
}

// The scorer's caps, mirrored here so a local run refuses what the sealed
// scorer would refuse: at most 4 screenshots, each at most 256 KiB; game/ at
// most 993 files and 48 MiB in all, with no path over 1000 bytes. Only
// text_max_bytes shapes the dossier's bytes; the rest guard the entry.
const dossier = buildDossier(destDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(destDir, "dossier.json"), dossier);

console.log(
  `SOLMARINA handed in: game/ + ${EXPECTED_SHOTS.length} screenshots + dossier.json -> ${destDir}`,
);
