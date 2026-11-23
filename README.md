# SOLMARINA

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/rsuryatna/GTA6-Clone/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/rsuryatna/GTA6-Clone/reward.svg)](https://make.fun/bounty/gta6-01)

An original, sun-soaked open-world crime game for the
[make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01) — built from
scratch in three.js, played offline in a desktop browser.

## The game

Jules Maro came home to Solmarina — a fictional coastal city of palm
avenues, a marina, a beach boardwalk and a diagonal boulevard — with
$250, a coral coupe and a family that owes the harbour too much money.
Twelve missions stand between him and the top of the city.

**What is in it:**

- A full city on foot and by car: a road grid plus a diagonal avenue,
  varied buildings (towers, slabs, L-shapes, shopfront rows, a domed
  church), real-frond palms, ornate European street lamps, a beach and
  a marina with moored boats
- Dense traffic (26 moving cars in 7 silhouettes plus 26 parked cars)
  and 64 pedestrians with readable legs, arms, clothing and hair
- Stealable cars, a garage with three slots, shops (food, clothes,
  guns) and a save system
- A wanted system: black-and-white American police cruisers with
  readable POLICE markings, alternating red/blue lightbars and real
  headlight beams, foot police who try to arrest Jules, and a
  bubble-canopy helicopter at 3+ stars
- 12 story missions with a golden objective marker, combat (fists and
  pistol), a HUD with cash, health, wanted stars and a zoomed,
  player-centred minimap
- A full day/night cycle (dawn, noon, golden hour, night lamps) and a
  synthesized WebAudio soundtrack — three radio stations, engine hum,
  sirens — with no audio files and no network

## How to play

Serve `game/` with any static server and open `game/index.html` in
desktop Chrome, for example:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080/
```

| Key | Action |
| --- | ------ |
| W A S D | Move / drive |
| Shift | Sprint |
| E | Enter / exit car · shop |
| F | Punch / fire |
| Space | Jump / handbrake |
| M | Minimap zoom |
| N | Next mission |
| R | Radio station |
| Q | Save game |
| C | Camera |
| H | Horn |

Screenshot presets: open `game/index.html?shot=hero`,
`?shot=mission`, `?shot=chase` or `?shot=city` to stage the four
submitted screenshots.

## How to build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/`
into the output directory, validates the four 1280×720 JPEG
screenshots, and writes `dossier.json` with
`vendor/makefun-game.ts` `buildDossier`. Running it twice writes the
same bytes.

## Layout

- `main.ts` — the entry program
- `game/index.html` — the page, HUD and menus
- `game/vendor/three.min.js` — vendored three.js (r160)
- `game/src/` — the game's own source, one job per file:
  `config`, `random`, `world`, `human`, `traffic`, `vehicles`,
  `player`, `police`, `footpolice`, `missions`, `combat`, `hud`,
  `daynight`, `audio`, `radio`, `shops`, `garage`, `save`,
  `settings`, `shots`, `render`, `main`
- `screenshots/` — four real renders of the game (1280×720 JPEG)

## License

MIT — see [LICENSE](LICENSE).

> Note: the rank and reward badges above name the final GitHub
> repository `rsuryatna/GTA6-Clone`; adjust the repo slug in the badge
> URLs if the game is pushed under a different name.
