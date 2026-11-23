// SOLMARINA — garage.js
// One job: Jules's garage. A building on Palm Row with room for three cars:
// the coral coupe he owns, and two slots for cars he steals and keeps.
// Parking a stolen car inside stores it between sessions.

const THREE = window.THREE;
import { makeCarModel } from './vehicles.js';

export function createGarage(scene, world, rng, player) {
  const gx = world.roadCentersX[3] - 24;
  const gz = world.roadCentersZ[4] - 24;
  const group = new THREE.Group();
  group.position.set(gx, 0, gz);

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(18, 7, 14),
    new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.9 }),
  );
  walls.position.y = 3.5;
  walls.castShadow = true;
  group.add(walls);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(19, 0.6, 15),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.8 }),
  );
  roof.position.y = 7.2;
  group.add(roof);
  // Open roller door so the stored cars are visible from the street.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.5 }),
  );
  door.position.set(0, 2.7, 7.1);
  group.add(door);
  // GARAGE sign.
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g2 = c.getContext('2d');
  g2.fillStyle = '#222831';
  g2.fillRect(0, 0, 512, 96);
  g2.fillStyle = '#f7c948';
  g2.font = 'bold 56px Arial, sans-serif';
  g2.textAlign = 'center';
  g2.fillText('GARAGE', 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(0, 6.2, 7.25);
  group.add(sign);
  scene.add(group);

  const slots = [
    { x: gx - 4.5, z: gz, car: player.ownCar, taken: true },
    { x: gx, z: gz, car: null, taken: false },
    { x: gx + 4.5, z: gz, car: null, taken: false },
  ];
  // Park the owned coupe in its slot.
  player.ownCar.group.position.set(slots[0].x, 0, slots[0].z);
  player.ownCar.group.rotation.y = Math.PI / 2;

  return {
    group,
    position: { x: gx, z: gz },
    slots,
    store(car) {
      const free = slots.find((s) => !s.taken);
      if (!free) return { ok: false, reason: 'Garage is full.' };
      free.car = car;
      free.taken = true;
      car.group.position.set(free.x, 0, free.z);
      car.group.rotation.y = Math.PI / 2;
      return { ok: true, slot: slots.indexOf(free) + 1 };
    },
    take(slotIndex) {
      const slot = slots[slotIndex];
      if (!slot || !slot.taken || !slot.car) return null;
      const car = slot.car;
      slot.car = null;
      slot.taken = false;
      return car;
    },
    storedCount() {
      return slots.filter((s) => s.taken).length;
    },
    // Free slot count, for the HUD hint when Jules parks a stolen car.
    freeCount() {
      return slots.filter((s) => !s.taken).length;
    },
    isNear(playerPos) {
      return Math.hypot(gx - playerPos.x, gz - playerPos.z) < 16;
    },
  };
}
