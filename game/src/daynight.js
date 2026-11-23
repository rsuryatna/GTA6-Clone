// SOLMARINA — daynight.js
// One job: the sun. A full day cycle — dawn gold, noon blue, dusk orange,
// night with street lamps on — driven by one clock the HUD reads.

const THREE = window.THREE;
import { CFG, PALETTE } from './config.js';

export function createDayNight(scene, world) {
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xbfd8ff, 0.55);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.25);
  scene.add(moon);

  const sky = new THREE.Color(PALETTE.skyDay);
  scene.background = sky;
  scene.fog = new THREE.Fog(0x9fc4e0, 320, 900);

  const state = {
    hour: CFG.startHour, // 0..24
    speed: 24 / CFG.dayLengthSec, // hours per second at 1x
    paused: false,
    setHour(h) {
      this.hour = ((h % 24) + 24) % 24;
      this.apply();
    },
    // 0 = deep night, 1 = full noon.
    daylight() {
      const h = this.hour;
      if (h < 5 || h > 20.5) return 0;
      if (h < 7) return (h - 5) / 2;
      if (h < 17) return 1;
      if (h < 20.5) return 1 - (h - 17) / 3.5;
      return 0;
    },
    isNight() {
      return this.daylight() < 0.25;
    },
    clockText() {
      const h = Math.floor(this.hour);
      const m = Math.floor((this.hour - h) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    phaseName() {
      const h = this.hour;
      if (h < 5) return 'Night';
      if (h < 7) return 'Dawn';
      if (h < 11) return 'Morning';
      if (h < 15) return 'Midday';
      if (h < 18) return 'Afternoon';
      if (h < 20.5) return 'Golden hour';
      return 'Night';
    },
    // Advance the clock by whole hours (debug / staging helper).
    advance(hours) {
      this.setHour(this.hour + hours);
    },
    apply() {
      const day = this.daylight();
      const h = this.hour;
      // Sun angle: rises east, sets west.
      const sunAngle = ((h - 6) / 12) * Math.PI;
      sun.position.set(Math.cos(sunAngle) * 300, Math.sin(sunAngle) * 300 + 60, 120);
      sun.intensity = 0.4 + day * 2.6;
      ambient.intensity = 0.4 + day * 0.5;
      moon.intensity = day < 0.2 ? 0.35 : 0;
      // Sky colour: night blue -> day blue, with a dusk orange band.
      const cDay = new THREE.Color(PALETTE.skyDay);
      const cNight = new THREE.Color(PALETTE.skyNight);
      const cDusk = new THREE.Color(PALETTE.skyDusk);
      sky.copy(cNight).lerp(cDay, day);
      if (h > 16.5 && h < 20.5) {
        const dusk = 1 - Math.abs(h - 18.4) / 2;
        sky.lerp(cDusk, Math.max(0, dusk) * 0.55);
      }
      scene.fog.color.copy(sky);
      // Street lamps glow after dark.
      const lampOn = this.isNight() || (h > 17.5 && h < 20.5);
      for (const lamp of world.lamps) {
        if (lamp.userData.bulb) lamp.userData.bulb.intensity = lampOn ? 7 : 0;
      }
    },
    update(dt) {
      if (!this.paused) {
        this.hour += this.speed * dt;
        if (this.hour >= 24) this.hour -= 24;
      }
      this.apply();
    },
  };
  state.apply();
  return state;
}
