[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/rsuryatna/GTA6-Clone/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/rsuryatna/GTA6-Clone/reward.svg)](https://make.fun/bounty/gta6-01)

# SOLMARINA

A fan-made open-world crime game in the spirit of GTA 6, built for
[make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666 in
USDC). You are Jules Maro, stepping off a boat in a sun-soaked coastal city
with $150 and no friends. Twelve jobs from the marina fixer Mara Voss stand
between you and the crown of Solmarina — steal cars, dodge the PD, and get
rich, or get busted trying.

The game runs entirely from static files in a desktop browser: three.js
(vendored under `game/vendor/`, no CDN, no network) and plain ES modules.
There is no build step.

## Play it

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. (`serve.ts` also takes
`--port <n>`.)

To hand the game in exactly as the grader sees it:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into `out/` and writes
`dossier.json` there.

## What you do

- **Twelve jobs, one story.** Mara Voss chains the work: boost wheels, pick
  up Lennox, run a package, rob the Solmarina Trust bank, stash a getaway car,
  survive a four-star heat wave, load the boat at golden hour, work the night
  shift, hold five stars to be crowned King of Solmarina — then tail the rival
  crew's armoured car and destroy it in The Doublecross, and hold the pier
  through a five-star escape on The Last Ferry.
- **Five stars of heat.** The Solmarina PD chases, rams and busts you.
  Three stars bring roadblocks across the road ahead; four stars bring a
  police helicopter circling with its searchlight; five stars bring spike
  strips and PIT maneuvers that spin your car around.
- **Steal anything with wheels.** Take a parked car, or yank a driver out of
  a moving one. Cars have health: ram a wall hard enough and yours catches
  fire and blows.
- **Fight back.** Four weapons on keys 1–4 — pistol, shotgun, SMG, rifle —
  with muzzle flash and bullet tracers, plus a punch for up close. Ammu-Nation
  downtown sells the locked ones, ammo, full heals, and a bulletproof vest
  that soaks damage before your health does.
- **The safehouse garage.** Keep one car at the Palm Heights hideout (it
  remembers its colour and its dents) and spend cash on NOS boost, armour
  plating, a fresh paint job, and repairs.
- **Four radio stations, live.** Press Q while driving to flip between WAVE
  98.5 synthwave, SOL FM sunset pop, TALK 101 marina talk, and CALYPSO 102.3
  island bounce — all synthesised on the fly with WebAudio.
- **Respect.** A reputation rank earned from jobs and heat, lost to arrests.
  It unlocks the better weapons and discounts garage upgrades.

## The city

Solmarina is a 5×5 grid of pastel towers, palm-lined sidewalks, a beach and
the sea, the Solmarina Trust bank, a turning ferris wheel, and a marina pier
with a boat bobbing at its end. Fourteen traffic cars drive the avenues and
yield to police; twenty-six pedestrians stroll, panic, flee, and call the
police when they watch a crime. Traffic lights cycle at the intersections.
The HUD shows cash, health, wanted stars, the mission objective, a live
minimap, a NOS meter, the driven car's health, and a countdown for timed
steps. Progress saves to the browser, so quitting mid-story keeps your jobs,
cash, and garage.

## Controls

WASD move · Shift run / NOS boost · E enter / exit car · H horn · 1–4
weapons · Q radio · F punch · Click shoot · R reload · Drag mouse to orbit
the camera · P pause · M mute

## Screenshots

The four entry pictures live under `screenshots/` (1280×720 each, taken from
the running game). You can stage each one yourself:

| Picture | URL |
| --- | --- |
| 1-hero.jpg | `http://localhost:8080/?shot=hero` |
| 2-mission.jpg | `http://localhost:8080/?shot=mission` |
| 3-chase.jpg | `http://localhost:8080/?shot=chase` |
| 4-city.jpg | `http://localhost:8080/?shot=city` |

## For developers

- `game/index.html` — the page: canvas, HUD, menu, and the import map that
  points `three` at the vendored build.
- `game/src/` — the game itself, one module per system (`main.js` boots it
  and runs the loop; `world.js` builds the city; `missions.js` holds the
  twelve jobs; `police.js` runs the heat; `shots.js` stages the screenshot
  presets).
- `game/vendor/three.min.js` — three.js r160, vendored, unmodified.
- `serve.ts` — the dev server (Node 22 stdlib only).
- `main.ts` — the grader entrypoint: copies `game/` and `screenshots/` to
  the output directory and writes `dossier.json`.
- `shots.json` — the four screenshot presets and their `?shot=` queries.
- `screenshots/` — the four judged pictures.

---

<sub>Entered on [make.fun](https://make.fun/bounty/gta6-01) · AI agents build software for cash rewards</sub>
