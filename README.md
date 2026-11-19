# SOLMARINA

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rsuryatna/GTA6-Clone/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rsuryatna/GTA6-Clone/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMARINA is an open-world crime game in the spirit of GTA 6, playable in a desktop browser from static files: a sun-soaked coastal city to explore on foot and by car, traffic and pedestrians, cars to steal, a wanted level with police who chase you, ten story missions from the fixer Mara Voss, combat, a HUD with a minimap, and a save. Built with three.js (vendored) and plain ES modules — no build step, no network requests. Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.

## Features

- **Ten story missions** — a chained story from Mara Voss: steal wheels, pick up Lennox, survive the heat, run packages, rob the Solmarina Trust, park a getaway car in the garage, survive a four-star heat wave, load the boat at golden hour, work the night shift, and survive five stars to become King of Solmarina.
- **Five-star wanted system** — the Solmarina PD chases, rams and busts you; at three stars it throws roadblocks across the road ahead, and at four stars a police helicopter circles overhead with its searchlight, keeping the heat from fading.
- **Weapon wheel** — four switchable weapons (keys 1–4): pistol, shotgun, SMG and rifle, each with its own damage, range, fire rate and magazine.
- **Carjacking** — steal a parked car, or yank a driver out of a moving traffic car and take it.
- **Safehouse garage** — store one car at the Palm Heights hideout and buy upgrades: NOS boost (hold Shift while driving) and armour plating that softens police rams.
- **Car radio** — three switchable stations (Q while driving): WAVE 98.5 synthwave, SOL FM sunset pop, and TALK 101 marina talk, all synthesised live with WebAudio.
- **Ammu-Nation** — the gun shop downtown sells the locked weapons, ammo refills and full heals.
- **Respect** — a reputation rank earned from jobs and heat, lost to arrests; it unlocks the better weapons and discounts garage upgrades.
- **A living city** — 5×5 blocks of pastel towers, palm-lined sidewalks, a beach and the sea, 14 AI traffic cars, 26 pedestrians who panic and run, a HUD with a live minimap, and a save that resumes the story.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

Screenshot presets: open `http://localhost:8080/?shot=cover|drive|chase|mission` to stage each of the four entry shots.

WASD move · Shift run / NOS boost · E enter / exit car · 1–4 weapons · Q radio · F punch · Click shoot · R reload · Drag mouse to orbit the camera · P pause · M mute

## Story

Jules Maro steps off a boat in Solmarina with $150 and no friends. Mara Voss, who runs the marina, has ten jobs: steal wheels, pick up Lennox, survive the heat, run a package, rob the Solmarina Trust, park a getaway car, survive a heat wave, load the boat at golden hour, work the night shift, and survive five stars of heat to become King of Solmarina. Finish them all and the city is yours.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
