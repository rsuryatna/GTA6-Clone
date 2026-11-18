// The story of SOLMARINA: five jobs from Mara Voss, the fixer who runs the
// marina. Each mission is a list of steps — go somewhere, steal a car, pick
// someone up, survive the heat, deliver, hold — and the game advances when a
// step's condition is met. A golden beacon marks the target in the world, on
// the HUD arrow and on the minimap.
import * as THREE from 'three';

const MISSIONS = [
  {
    id: 'wheels',
    title: 'Job 1 — Wheels',
    giver: 'Mara Voss',
    briefing: 'Fresh off the boat and already broke. Steal any car on the street, then bring it to the marina marker. No questions, no witnesses.',
    reward: 300,
    steps: [
      { type: 'stealCar', text: 'Steal any parked car (walk up to one and press E)' },
      { type: 'goto', x: -40, z: 168, radius: 8, text: 'Drive to the marina marker' },
    ],
  },
  {
    id: 'pickup',
    title: 'Job 2 — The Pickup',
    giver: 'Mara Voss',
    briefing: 'Lennox is waiting by the Old Town square and the PD knows his face. Drive over, let him in with E, and get him to the Harbor warehouse.',
    reward: 600,
    steps: [
      { type: 'goto', x: 40, z: -40, radius: 8, text: 'Drive to Lennox at Old Town square' },
      { type: 'pickupPerson', text: 'Press E to let Lennox in' },
      { type: 'goto', x: 144, z: 108, radius: 8, text: 'Drive Lennox to the Harbor warehouse' },
    ],
  },
  {
    id: 'heat',
    title: 'Job 3 — Heat',
    giver: 'Mara Voss',
    briefing: 'A rival crew tipped off the PD. Three stars and counting — stay out of the cruisers\' hands for 45 seconds, then lose them at the hideout.',
    reward: 900,
    steps: [
      { type: 'survive', seconds: 45, wanted: 3, text: 'Survive the heat for 45 seconds' },
      { type: 'goto', x: -150, z: -108, radius: 8, text: 'Reach the hideout in Palm Heights' },
    ],
  },
  {
    id: 'drop',
    title: 'Job 4 — The Drop',
    giver: 'Mara Voss',
    briefing: 'A package is waiting at the boardwalk. Pick it up and run it to the Palm Heights villa — ninety seconds, and the client does not like lateness.',
    reward: 1200,
    steps: [
      { type: 'goto', x: -40, z: 168, radius: 6, text: 'Pick up the package at the boardwalk' },
      { type: 'deliver', x: -150, z: -108, radius: 8, seconds: 90, text: 'Deliver the package to the villa (90s)' },
    ],
  },
  {
    id: 'score',
    title: 'Job 5 — The Big Score',
    giver: 'Mara Voss',
    briefing: 'The Solmarina Trust keeps its vault light on Sundays. Walk in, hold the lobby for five seconds while the bag fills, then run — four stars — to the hideout. This one retires us both.',
    reward: 2500,
    steps: [
      { type: 'goto', x: 36, z: 36, radius: 8, text: 'Reach the Solmarina Trust bank downtown' },
      { type: 'hold', x: 36, z: 36, seconds: 5, text: 'Hold the lobby while the bag fills' },
      { type: 'escape', wanted: 4, x: -150, z: -108, radius: 8, text: 'Escape the four-star heat to the hideout' },
    ],
  },
];

export function createMissions(scene, callbacks) {
  let index = 0;
  let stepIndex = 0;
  let stepTimer = 0;
  let holdTimer = 0;
  let completed = false;
  let active = true;

  // The golden beacon: a glowing column plus a floating ring, moved to the
  // current target every time the step changes.
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  column.position.y = 15;
  beacon.add(column);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.22, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc861 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  function current() { return MISSIONS[index]; }
  function step() { return current() ? current().steps[stepIndex] : null; }

  function placeBeacon() {
    const s = step();
    if (!s || s.x === undefined) { beacon.visible = false; return; }
    beacon.position.set(s.x, 0, s.z);
    beacon.visible = true;
  }

  function advance() {
    stepIndex += 1;
    stepTimer = 0;
    holdTimer = 0;
    const mission = current();
    if (stepIndex >= mission.steps.length) {
      callbacks.onMissionComplete(mission);
      index += 1;
      stepIndex = 0;
      if (index >= MISSIONS.length) {
        completed = true;
        active = false;
        beacon.visible = false;
        callbacks.onStoryComplete();
        return;
      }
      callbacks.onMissionStart(current());
    }
    placeBeacon();
  }

  function start() {
    index = 0;
    stepIndex = 0;
    completed = false;
    active = true;
    callbacks.onMissionStart(current());
    placeBeacon();
  }

  // Called every frame with the live game facts; returns nothing, but fires
  // the callbacks when a step completes.
  function update(dt, facts) {
    if (!active) return;
    const s = step();
    if (!s) return;
    beacon.rotation.y += dt;
    ring.position.y = 0.4 + Math.sin(performance.now() * 0.004) * 0.25;

    if (s.type === 'stealCar') {
      if (facts.inCar) advance();
      return;
    }
    if (s.type === 'goto' || s.type === 'deliver') {
      if (s.type === 'deliver') {
        stepTimer += dt;
        if (stepTimer > s.seconds) {
          callbacks.onMissionFailed('Too slow — the client walked away.');
          stepTimer = 0;
          return;
        }
      }
      const d = Math.hypot(facts.x - s.x, facts.z - s.z);
      if (d < s.radius) advance();
      return;
    }
    if (s.type === 'pickupPerson') {
      if (facts.personPickedUp) advance();
      return;
    }
    if (s.type === 'survive') {
      stepTimer += dt;
      if (stepTimer >= s.seconds) advance();
      return;
    }
    if (s.type === 'hold') {
      const d = Math.hypot(facts.x - s.x, facts.z - s.z);
      if (d < 8) {
        holdTimer += dt;
        if (holdTimer >= s.seconds) advance();
      } else {
        holdTimer = Math.max(0, holdTimer - dt * 2);
      }
      return;
    }
    if (s.type === 'escape') {
      const d = Math.hypot(facts.x - s.x, facts.z - s.z);
      if (d < s.radius) advance();
    }
  }

  return {
    start,
    update,
    placeBeacon,
    current,
    step,
    getIndex() { return index; },
    getStepIndex() { return stepIndex; },
    getStepTimer() { return stepTimer; },
    getHoldTimer() { return holdTimer; },
    isCompleted() { return completed; },
    isActive() { return active; },
    setProgress(missionIndex) {
      index = Math.min(missionIndex, MISSIONS.length - 1);
      stepIndex = 0;
      stepTimer = 0;
      holdTimer = 0;
      completed = index >= MISSIONS.length;
      active = !completed;
      if (active) {
        callbacks.onMissionStart(current());
        placeBeacon();
      }
    },
    targetPosition() {
      const s = step();
      return s && s.x !== undefined ? { x: s.x, z: s.z } : null;
    },
    missionCount() { return MISSIONS.length; },
  };
}
