// The screenshot presets behind ?shot=hero|mission|chase|city.
// Each one stages a real scene — a fresh game, the rules played forward
// for a fixed number of steps — so the frame is what a short game really
// looks like, and the same seed always gives the same frame. The presets
// live here, not in main.js, so the staging is one module with one job.
//
//   hero    — Jules on foot on the -36 avenue, the city behind him.
//   mission — Job 12, The Last Ferry: Jules at the marina pier at dusk,
//             the golden beacon on the pier, the boat waiting.
//   chase   — five stars, the police helicopter overhead, cruisers behind,
//             a roadblock ahead; the camera looks up so the helicopter
//             shares the frame with the car.
//   city    — Jules driving south down the -36 avenue toward the marina,
//             the ferris wheel on the left, the city receding behind.
export function createShots(deps) {
  const {
    startGame, vehicles, player, cameraRig, police, missions, hud, state,
    combat, radio, traffic, update, setShotCam, document, window,
    hudState,
  } = deps;

  // Put Jules in a parked car on the -36 street, heading south.
  function putJulesInCar(z, speed) {
    const car = vehicles.parked[3] || vehicles.parked[0];
    if (!car) return null;
    vehicles.enterCar(car);
    player.group.visible = false;
    car.mesh.position.set(-36, 0, z);
    car.heading = 0;
    vehicles.driven.speed = speed;
    return car;
  }

  function look(yaw, pitch, dist) {
    cameraRig.yaw = yaw;
    cameraRig.pitch = pitch;
    if (dist !== undefined) cameraRig.dist = dist;
  }

  // One staging function per preset; stage() below only dispatches.
  const PRESETS = {
    mission() {
      // Job 12, The Last Ferry: Jules at the marina dock, the golden
      // beacon on the pier ahead of him, the boat waiting at the end of
      // the pier. Jules stands 8 m short of the target, so the goto step
      // is still the active one (its radius is 8) and the beacon reads
      // in the frame.
      missions.setProgress(11);
      player.teleport(-40, 160, 0);
      look(0, 0.35);
    },
    chase() {
      putJulesInCar(-60, 24);
      // Five stars: the helicopter is out, cruisers behind, roadblocks ahead.
      police.setWanted(5);
      // Frame the shot ahead and up: the car at the bottom, the roadblock
      // in the middle, the helicopter in the sky above it. In normal play
      // the helicopter body stays out of frame — only this staged camera
      // looks up.
      setShotCam({ dx: 0, dz: 20, y: 5.0, pitch: 0.12, dist: 14 });
      look(0, 0.12);
    },
    drive() {
      // A plain drive down the -36 avenue: the car, the street, the city.
      putJulesInCar(-60, 18);
      // Behind the car: the camera looks along the heading, so yaw = heading.
      look(0, 0.32);
    },
    city() {
      // A wide drive down the -36 avenue toward the marina: the ferris
      // wheel on the left, the bank and the towers behind, the sea ahead.
      putJulesInCar(60, 18);
      setShotCam({ dx: 0, dz: 30, y: 4, pitch: 0.3, dist: 16 });
      look(0, 0.3);
    },
    hero() {
      // On foot on the -36 avenue, the street receding north into the
      // city behind the player.
      player.teleport(-36, 100, Math.PI);
      // Camera south of the player, looking north up the avenue.
      look(Math.PI, 0.32, 13);
    },
  };

  // Let the world settle (traffic moves, police spawn) before the shot.
  function settle() {
    for (let step = 0; step < 90; step += 1) update(1 / 60);
  }

  function finish() {
    // A staged shot needs no welcome toast across the middle of the frame.
    document.getElementById('toast').style.opacity = '0';
    hud.update(hudState());
    window.__shotReady = true;
  }

  function stage(name) {
    startGame(true);
    setShotCam(null);
    const setup = PRESETS[name] || PRESETS.hero;
    setup();
    settle();
    if (name === 'chase') {
      const ride = vehicles.currentCar();
      if (ride) {
        const at = ride.mesh.position;
        // Pull the nearest cruiser in ahead of the player's car, head-on,
        // so the chase reads in the frame, lights flashing.
        police.placeNearest(at.x, at.z + 24, Math.PI);
        // Park the helicopter ahead and to the right of the car, clear of
        // the objective box, searchlight on the car.
        police.placeHeli(at.x + 30, at.z + 45, at.x, at.z);
      }
    }
    finish();
  }

  return { stageShot: stage };
}
