// daynight.js — the SOLMARINA day/night cycle.
//
// One full day lasts 12 minutes of gameplay, so the player visibly
// watches the light change during a session. Four phases — Pagi, Siang,
// Sore, Malam — each with its own lighting preset; the light, sky and
// fog lerp smoothly between phases over a 1-hour blend window, never
// jumping. Siang is the existing daytime exactly (built from the
// dayLight snapshot main.js keeps), so midday looks as it always did.
// At night the street lanterns glow, building windows light up, car
// headlights brighten, and stars and a moon come out — the city stays
// navigable, never pitch black.
import * as THREE from 'three';

// Seconds of gameplay per full day (12 minutes).
export const DAY_LENGTH = 720;
// Game hours over which one phase blends into the next.
const BLEND_HOURS = 1;

// Phase starts, in game hours. Malam wraps past midnight.
const PHASES = [
  { name: 'Pagi', icon: '☀', start: 5 },
  { name: 'Siang', icon: '☀', start: 11 },
  { name: 'Sore', icon: '☀', start: 16 },
  { name: 'Malam', icon: '☾', start: 20 },
];

function makePreset(o) {
  return {
    bg: new THREE.Color(o.bg),
    fog: new THREE.Color(o.fog),
    fogNear: o.fogNear,
    fogFar: o.fogFar,
    sunPos: new THREE.Vector3(o.sunPos[0], o.sunPos[1], o.sunPos[2]),
    sunColor: new THREE.Color(o.sunColor),
    sunIntensity: o.sunIntensity,
    hemiSky: new THREE.Color(o.hemiSky),
    hemiGround: new THREE.Color(o.hemiGround),
    hemiIntensity: o.hemiIntensity,
    cloudColor: new THREE.Color(o.cloudColor),
    cloudOpacity: o.cloudOpacity,
  };
}

export function createDayNight(scene, opts) {
  const { sun, hemi, dayLight, windowMats, lanternGlow, lanternPool, cloudMat } = opts;

  // Siang is the existing daytime, exactly as dayLight recorded it.
  // Cloud tint/opacity per phase: deep warm cream at full opacity in
  // the morning (pale white vanished against the pale blue dawn sky),
  // white at midday, orange-pink at sunset, dim dark blue at night
  // (still there, just barely — never a bright day cloud in a night sky).
  const presets = [
    makePreset({
      bg: 0x9fc4e8, fog: 0xc8d8e8, fogNear: 200, fogFar: 620,
      // Morning sun low in the east ([180, 60, 40], ~18°), warm and
      // gold. The sun/shadow contrast is kept gentle on purpose: the
      // low eastern sun shines through the cross streets and leaves
      // bright sunlit ovals on the otherwise shadowed avenue road, and
      // at full sun (1.9) against a dim ambient (0.8) one of those
      // ovals read as a pale patch in the 4-city shot — not as
      // sunlight. So the sun runs softer (1.4) and the ambient higher
      // (1.1): the road stays evenly readable, the morning keeps its
      // warm gold on the building faces, and no single sunlit patch
      // stands out as a pale oval. (Raising the sun to ~38° only made
      // the patch bigger; lowering it to ~9° stretched it longer — the
      // fix is the contrast, not the angle.)
      sunPos: [180, 60, 40], sunColor: 0xffd9a0, sunIntensity: 1.4,
      hemiSky: 0xcfe0ff, hemiGround: 0x9a8a6a, hemiIntensity: 1.1,
      cloudColor: 0xe6d3ae, cloudOpacity: 1.0,
    }),
    makePreset({
      bg: dayLight.bg, fog: dayLight.fogColor,
      fogNear: dayLight.fogNear, fogFar: dayLight.fogFar,
      sunPos: [dayLight.sunPos.x, dayLight.sunPos.y, dayLight.sunPos.z],
      sunColor: dayLight.sunColor, sunIntensity: dayLight.sunIntensity,
      hemiSky: dayLight.hemiSky, hemiGround: dayLight.hemiGround,
      hemiIntensity: dayLight.hemiIntensity,
      cloudColor: 0xffffff, cloudOpacity: 0.9,
    }),
    makePreset({
      bg: 0xe08a68, fog: 0xe8a878, fogNear: 180, fogFar: 600,
      sunPos: [-180, 55, -40], sunColor: 0xff9a4a, sunIntensity: 2.0,
      hemiSky: 0xff9a6b, hemiGround: 0x5a4030, hemiIntensity: 0.7,
      // Sore clouds: deep warm cream at full opacity (same fix as the
      // Pagi clouds in round 6). The old orange-pink 0xffb38a at 0.85
      // was too close to the orange Sore sky 0xe08a68, so the clouds
      // vanished into a uniform sky. Cream reads as a cloud against
      // orange, so the lumpy mass shows. (Round 9: the bright vertical
      // streak in the 4-city frame was the mission beacon, not a cloud
      // — the beacon is now hidden for the city shot instead.)
      cloudColor: 0xe6d3ae, cloudOpacity: 1.0,
    }),
    makePreset({
      bg: 0x0e1a30, fog: 0x121f36, fogNear: 160, fogFar: 560,
      sunPos: [-60, 160, -80], sunColor: 0x8ab0ff, sunIntensity: 0.9,
      hemiSky: 0x2c3e63, hemiGround: 0x1a2027, hemiIntensity: 0.6,
      cloudColor: 0x2a3a55, cloudOpacity: 0.35,
    }),
  ];

  // New game starts in the morning.
  let timeOfDay = 7;
  let titleActive = false;
  let nightFactor = 0;

  // --- Night sky: stars and a moon, faded in by the night factor. ------
  const skyGroup = new THREE.Group();
  skyGroup.name = 'solmarina-night-sky';
  const starPositions = [];
  for (let i = 0; i < 320; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 0.85);
    const r = 600 + Math.random() * 150;
    starPositions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) + 40,
      r * Math.sin(phi) * Math.sin(theta),
    );
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 2, sizeAttenuation: false,
    transparent: true, opacity: 0,
  });
  skyGroup.add(new THREE.Points(starGeo, starMat));
  const moonGlowMat = new THREE.MeshBasicMaterial({
    color: 0x8ab0ff, transparent: true, opacity: 0,
  });
  const moonGlow = new THREE.Mesh(new THREE.CircleGeometry(26, 24), moonGlowMat);
  moonGlow.position.set(-260, 320, -180);
  moonGlow.lookAt(0, 0, 0);
  skyGroup.add(moonGlow);
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xe8f0ff, transparent: true, opacity: 0,
  });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(18, 24), moonMat);
  moon.position.set(-260, 320, -179);
  moon.lookAt(0, 0, 0);
  skyGroup.add(moon);
  skyGroup.visible = false;
  scene.add(skyGroup);

  // --- Scratch values, so apply() never allocates. ----------------------
  const bgColor = new THREE.Color();
  const fogColor = new THREE.Color();
  const sunPos = new THREE.Vector3();
  const sunColor = new THREE.Color();
  const hemiSky = new THREE.Color();
  const hemiGround = new THREE.Color();
  const cloudColor = new THREE.Color();
  const lanternDay = new THREE.Color(0x9a8a5a);
  const lanternNight = new THREE.Color(0xffe9a8);

  // Headlight beams, re-scanned from the scene every couple of seconds
  // because cars come and go. Each entry keeps the material's base
  // opacity, so night brightens it instead of replacing it.
  let beams = [];
  let beamTimer = 0;
  function scanBeams() {
    const found = [];
    const seen = new Set();
    scene.traverse((obj) => {
      if (obj.name !== 'headlight-beam') return;
      for (const child of obj.children) {
        const mat = child.material;
        if (mat && mat.transparent && !seen.has(mat)) {
          seen.add(mat);
          // The base opacity recorded on the material at creation — NOT
          // the live opacity, which apply() already brightened. Reading
          // the live value made each re-scan multiply the boost again
          // (x3.8 every 2 s) until the beams blew out into giant white
          // cones that drowned the arrest scene.
          found.push({ mat, base: mat.userData.baseOpacity ?? mat.opacity });
        }
      }
    });
    beams = found;
  }

  // Which phase the hour falls in, which phase comes next, how far
  // through the blend into the next phase we are (t, 0..1, smoothed),
  // and how much of the blend is the Malam preset (night, 0..1).
  function phaseMix(hour) {
    let i = 0;
    for (let k = 0; k < PHASES.length; k++) {
      const start = PHASES[k].start;
      const next = PHASES[(k + 1) % PHASES.length].start;
      const end = next > start ? next : next + 24;
      let h = hour;
      if (h < start) h += 24;
      if (h >= start && h < end) { i = k; break; }
    }
    const j = (i + 1) % PHASES.length;
    let nextStart = PHASES[j].start;
    if (nextStart <= PHASES[i].start) nextStart += 24;
    let h = hour;
    if (h < PHASES[i].start) h += 24;
    let t = (h - (nextStart - BLEND_HOURS)) / BLEND_HOURS;
    t = Math.max(0, Math.min(1, t));
    t = t * t * (3 - 2 * t);
    let night = 0;
    if (PHASES[i].name === 'Malam') night = 1 - t;
    else if (PHASES[j].name === 'Malam') night = t;
    return { a: i, b: j, t, night };
  }

  // Push the current phase lighting into the scene.
  function apply() {
    const mix = phaseMix(timeOfDay);
    const A = presets[mix.a];
    const B = presets[mix.b];
    const t = mix.t;
    bgColor.lerpColors(A.bg, B.bg, t);
    scene.background = bgColor;
    fogColor.lerpColors(A.fog, B.fog, t);
    scene.fog.color.copy(fogColor);
    scene.fog.near = A.fogNear + (B.fogNear - A.fogNear) * t;
    scene.fog.far = A.fogFar + (B.fogFar - A.fogFar) * t;
    sunPos.lerpVectors(A.sunPos, B.sunPos, t);
    sun.position.copy(sunPos);
    sunColor.lerpColors(A.sunColor, B.sunColor, t);
    sun.color.copy(sunColor);
    sun.intensity = A.sunIntensity + (B.sunIntensity - A.sunIntensity) * t;
    hemiSky.lerpColors(A.hemiSky, B.hemiSky, t);
    hemi.color.copy(hemiSky);
    hemiGround.lerpColors(A.hemiGround, B.hemiGround, t);
    hemi.groundColor.copy(hemiGround);
    hemi.intensity = A.hemiIntensity + (B.hemiIntensity - A.hemiIntensity) * t;

    // Night extras, driven by how much of the blend is Malam. Brighter
    // than the first pass: the moon and the ambient lift the road, the
    // lit windows glow half as bright again, the lantern pools are
    // bigger and stronger, and the headlight beams run brighter — the
    // night reads clearly but stays night (dark blue sky, cool light).
    // The lantern pools are ZERO in daylight: even 0.04 read as a pale
    // oval patch on the road in the morning shots, so daytime pools are
    // gone entirely (the sun already lights the road). Beam/pool night
    // boost is x1.05 total (n*1.05), down from x2.8, x1.8 and x1.3: the
    // first passes overshot — the pools read as giant pale blobs and the
    // beams blew out into a pale wedge across the foreground of the night
    // chase; even at x1.8 an oncoming taxi's cone still washed the
    // foreground, so the cone itself was also shortened (3.5 m) and the
    // boost cut again. The road is already readable from the moon/hemi
    // lift, so the beams only need to read as beams. The daytime factor
    // is ZERO: even 0.25x base still read as a pale oval on the road in
    // the morning shots (a headlight pool at 0.25x is still a visible
    // patch on dark asphalt), and in real daylight headlight beams and
    // pools are invisible anyway — the sun already lights the road. The
    // lamp squares themselves are separate opaque meshes and stay lit.
    // The beam materials record their own base opacity (vehicles.js), so
    // the 2-second re-scan never multiplies an already-boosted value.
    nightFactor = mix.night;
    const n = nightFactor;
    for (const m of windowMats) m.emissiveIntensity = n * 1.5;
    if (lanternGlow) lanternGlow.color.lerpColors(lanternDay, lanternNight, n);
    if (lanternPool) lanternPool.opacity = n * 0.46;
    for (const b of beams) b.mat.opacity = b.base * n * 1.05;
    if (cloudMat) {
      cloudColor.lerpColors(A.cloudColor, B.cloudColor, t);
      cloudMat.color.copy(cloudColor);
      cloudMat.opacity = A.cloudOpacity + (B.cloudOpacity - A.cloudOpacity) * t;
    }
    starMat.opacity = n * 0.9;
    moonMat.opacity = n * 0.95;
    moonGlowMat.opacity = n * 0.35;
    skyGroup.visible = !titleActive && n > 0.02;
  }

  // Advance the clock by game time and re-apply the lighting.
  function advance(dt) {
    timeOfDay = (timeOfDay + (dt / DAY_LENGTH) * 24) % 24;
    beamTimer += dt;
    // Re-scan every 2 s for cars that spawned or despawned — and also
    // immediately while the beam list is still empty. The list starts
    // empty and the first timed scan only fires after 2 s of game time,
    // but a screenshot is staged ~0.6 s after the shot is ready: without
    // the empty-list scan the headlight pools sit at their creation
    // opacity (0.11) in that first frame and read as a pale oval on the
    // road in the morning shots, even though the daytime factor is 0.
    // Scanning while empty costs one scene traversal per frame for the
    // first few frames only, until the first cars are found.
    if (beamTimer > 2 || beams.length === 0) {
      beamTimer = 0;
      scanBeams();
    }
    apply();
  }

  function setTime(hours) {
    timeOfDay = ((hours % 24) + 24) % 24;
    apply();
  }

  function getTime() {
    return timeOfDay;
  }

  function clockText() {
    const h = Math.floor(timeOfDay);
    const m = Math.floor((timeOfDay - h) * 60);
    const phase = PHASES[phaseMix(timeOfDay).a];
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${phase.icon} ${hh}:${mm} · ${phase.name}`;
  }

  // The title screen keeps its own sunset override; the night sky hides
  // while it is up.
  function setTitleActive(on) {
    titleActive = on;
    skyGroup.visible = !on && nightFactor > 0.02;
  }

  return { advance, apply, setTime, getTime, clockText, setTitleActive };
}
