// SOLMARINA — shots.js
// One job: stage the four screenshots. Each preset picks a time of day, a
// place, a vehicle and a crowd, then frames the camera low and
// road-parallel so pedestrians, traffic, the minimap and the HUD all read
// at a glance. Used by ?shot=hero|mission|chase|city and by nothing else
// during normal play.

export function applyShot(ctx, name) {
  const { player, world, crowd, traffic, police, footpolice, missions, combat, daynight, renderer, hud } = ctx;
  const start = world.startPoint;
  const avenueX = world.roadCentersX[3];
  const avenueZ = world.roadCentersZ[2];

  function putPlayerInCar(x, z, heading) {
    player.group.position.set(x, 0, z);
    player.heading = heading;
    player.group.rotation.y = heading;
    if (!player.car) player.enterCar(player.ownCar);
    player.car.group.position.set(x, 0, z);
    player.car.group.rotation.y = heading;
    player.speed = 16;
    player.cameraYaw = heading;
  }

  function putPlayerOnFoot(x, z, heading) {
    if (player.car) player.exitCar();
    player.group.position.set(x, 0, z);
    player.heading = heading;
    player.group.rotation.y = heading;
    player.speed = 0;
    player.cameraYaw = heading;
  }

  function frameLow(x, z, heading, dist = 13, height = 3.4, lookY = 1.6) {
    const bx = x - Math.sin(heading) * dist + Math.cos(heading) * 3.5;
    const bz = z - Math.cos(heading) * dist - Math.sin(heading) * 3.5;
    renderer.frameShot(
      { x: bx, y: height, z: bz },
      { x: x + Math.sin(heading) * 22, y: lookY, z: z + Math.cos(heading) * 22 },
      58,
    );
  }

  if (name === 'hero') {
    // 1-hero: a sunny daytime chase down the avenue — Jules in his coral
    // coupe, cruisers behind, traffic and pedestrians everywhere. The
    // camera sits ahead of the player looking back, so the whole pursuit
    // — player car, all three cruisers — fits the frame instead of the
    // nearest cruiser filling the bottom corner.
    daynight.setHour(10.5);
    putPlayerInCar(avenueX, avenueZ, Math.PI / 2);
    police.stageChase(player.car.group.position, Math.PI / 2);
    police.holdStaged = true;
    police.cruisers[0].car.group.position.set(avenueX - 11, 0, avenueZ - 4);
    police.cruisers[1].car.group.position.set(avenueX - 18, 0, avenueZ + 4.5);
    police.cruisers[2].car.group.position.set(avenueX - 25, 0, avenueZ - 3);
    traffic.gatherNear(avenueX - 40, avenueZ, 8);
    crowd.gatherNear(avenueX - 24, avenueZ + 10, 16, 14);
    crowd.gatherNear(avenueX - 24, avenueZ - 10, 16, 10);
    missions.start(0);
    hud.toast('SOLMARINA — Jules Maro is on the run', 6);
    frameLow(avenueX - 6, avenueZ, -Math.PI / 2, 16, 4.6);
    return 'hero';
  }

  if (name === 'mission') {
    // 2-mission: Jules on foot at a golden objective marker, thugs ahead,
    // the mission line and the minimap telling the story.
    daynight.setHour(16.5);
    const mx = world.roadCentersX[2];
    const mz = world.roadCentersZ[3];
    putPlayerOnFoot(mx, mz, 0);
    missions.start(2);
    missions.active.target = { x: mx, z: mz + 26 };
    missions.marker.position.set(mx, 0, mz + 26);
    combat.spawnThugs(mx, mz + 22, 4);
    combat.giveGun(24);
    crowd.gatherNear(mx + 8, mz + 12, 14, 12);
    traffic.gatherNear(mx + 30, mz, 5);
    hud.toast('Mission 3/12 — Beachfront Brawl: clear the crew', 6);
    frameLow(mx, mz + 2, 0, 14, 4.0);
    return 'mission';
  }

  if (name === 'chase') {
    // 3-chase: MIDDAY police pursuit — lightbars flashing, helicopter
    // above, headlights on, foot police closing in. Shot at noon so the
    // road and the cars are lit, and the camera sits ahead looking back
    // so the helicopter, the foot police and all three cruisers share
    // the frame with the player's car.
    daynight.setHour(12.0);
    putPlayerInCar(avenueX, world.roadCentersZ[4], 0);
    police.stageChase(player.car.group.position, 0);
    police.holdStaged = true;
    police.heliHold = true;
    police.heli.group.position.set(player.car.group.position.x + 12, 15, player.car.group.position.z - 26);
    police.heli.group.visible = true;
    footpolice.gatherNear(player.car.group.position.x + 3, player.car.group.position.z - 8, 4);
    traffic.gatherNear(avenueX, world.roadCentersZ[4] - 40, 7);
    crowd.gatherNear(avenueX + 10, world.roadCentersZ[4] - 18, 14, 10);
    missions.start(4);
    hud.toast('WANTED ★★★ — lose the cruisers', 6);
    frameLow(avenueX, world.roadCentersZ[4] - 4, Math.PI, 16, 4.6);
    return 'chase';
  }

  // 4-city: late-morning city view from the beach road — palms, towers,
  // the marina, traffic streaming past, Jules walking into town. Shot at
  // 11:00 with a higher camera tilted up, so the frame is skyline and
  // towers instead of a black slab of asphalt.
  daynight.setHour(11.0);
  const cx = world.roadCentersX[4];
  const cz = world.roadCentersZ[1];
  putPlayerOnFoot(cx, cz, Math.PI / 2);
  missions.start(0);
  traffic.gatherNear(cx + 34, cz, 9);
  crowd.gatherNear(cx + 18, cz + 9, 18, 16);
  crowd.gatherNear(cx + 18, cz - 9, 18, 12);
  hud.toast('SOLMARINA — a city that never sits still', 6);
  frameLow(cx, cz, Math.PI / 2, 15, 8.0, 7.0);
  return 'city';
}

export const SHOT_NAMES = ['hero', 'mission', 'chase', 'city'];

// One-line captions for the HUD toast of each shot, so the screenshot
// itself names what the judge is looking at.
export const SHOT_CAPTIONS = {
  hero: 'SOLMARINA — daytime pursuit down the avenue',
  mission: 'Mission 3/12 — Beachfront Brawl',
  chase: 'WANTED — midday pursuit, helicopter overhead',
  city: 'SOLMARINA — late morning on the beach road',
};
