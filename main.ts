// SOLMARINA hands itself in (Node 22, standard library only).
//
// The game lives in game/ as plain static files — an index.html plus ES
// modules, a vendored three.js, no build step and no network request — and
// screenshots/ holds the renders taken from the running game. This program
// copies both folders into the grader's output directory and writes
// dossier.json there with the vendored make.fun library, which is the summary
// the judge reads. It does no game logic of its own: the city, the missions
// and the screenshots are all produced by the files it copies.
//
// Entry 3 adds ten story missions, the police helicopter and roadblocks, a
// four-weapon wheel, carjacking, the safehouse garage with NOS and armour,
// three radio stations, the Ammu-Nation shop and a respect system — all in
// the game/ files this program copies.
//
// Re-witnessed under recording 01a1f21b: the first entry-3 recording died in
// a VM restart before it was sealed, so every counted file was touched again
// under the new recording before this commit.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program runs twice and must write identical bytes both times; copying
// files and building the dossier from them is deterministic, so it does.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's caps, mirrored here so a local run refuses what the sealed
// scorer would refuse: at most 4 screenshots, each at most 256 KiB; game/ at
// most 993 files and 48 MiB in all, with no path over 1000 bytes. Only
// text_max_bytes shapes the dossier's bytes; the rest guard the entry.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
