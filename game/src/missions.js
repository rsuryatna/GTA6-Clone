// SOLMARINA — the twelve jobs.
//
// Mara Voss runs the marina and hands Jules one job at a time. A job is a
// short chain of steps: steal a car, drive somewhere, pick someone up,
// outlast the heat, stand your ground while something loads, tail a rival,
// wreck a rival, run for the hideout. This module is the runner that walks
// those chains. Every frame main.js hands it the live facts — where Jules
// is, whether he is driving, whether Lennox got in, where the rival car is
// — and this module decides when a step is done, points a gold beacon at
// whatever comes next, and reports back through callbacks when a job is
// finished, when a delivery runs late, or when the whole story is over.
//
// Shape of the code: the run's state lives in a single record, and every
// kind of step is one small rule in a table. A rule reads the facts and
// answers 'done', 'fail' or 'wait'; the runner alone acts on the answer.
// Nothing here knows about the police, the player or the traffic — facts
// come in from outside, news goes out through callbacks.
import * as THREE from 'three';

// The twelve jobs, in story order. The game plays them one at a time.
const JOBS = [
  {
    id: 'wheels', title: 'Job 1 — Wheels', giver: 'Mara Voss',
    briefing: 'Fresh off the boat and already broke. Steal any car on the street, then bring it to the marina marker. No questions, no witnesses.',
    reward: 300,
    steps: [
      { type: 'stealCar', text: 'Steal any parked car (walk up to one and press E)' },
      { type: 'goto', x: -40, z: 168, radius: 8, text: 'Drive to the marina marker' },
    ],
  },
  {
    id: 'pickup', title: 'Job 2 — The Pickup', giver: 'Mara Voss',
    briefing: 'Lennox is waiting by the Old Town square and the PD knows his face. Drive over, let him in with E, and get him to the Harbor warehouse.',
    reward: 600,
    steps: [
      { type: 'goto', x: 40, z: -40, radius: 8, text: 'Drive to Lennox at Old Town square' },
      { type: 'pickupPerson', text: 'Press E to let Lennox in' },
      { type: 'goto', x: 144, z: 108, radius: 8, text: 'Drive Lennox to the Harbor warehouse' },
    ],
  },
  {
    id: 'heat', title: 'Job 3 — Heat', giver: 'Mara Voss',
    briefing: "A rival crew tipped off the PD. Three stars and counting — stay out of the cruisers' hands for 45 seconds, then lose them at the hideout.",
    reward: 900,
    steps: [
      { type: 'survive', seconds: 45, wanted: 3, text: 'Survive the heat for 45 seconds' },
      { type: 'goto', x: -150, z: -108, radius: 8, text: 'Reach the hideout in Palm Heights' },
    ],
  },
  {
    id: 'drop', title: 'Job 4 — The Drop', giver: 'Mara Voss',
    briefing: 'A package is waiting at the boardwalk. Pick it up and run it to the Palm Heights villa — ninety seconds, and the client does not like lateness.',
    reward: 1200,
    steps: [
      { type: 'goto', x: -40, z: 168, radius: 6, text: 'Pick up the package at the boardwalk' },
      { type: 'deliver', x: -150, z: -108, radius: 8, seconds: 90, text: 'Deliver the package to the villa (90s)' },
    ],
  },
  {
    id: 'score', title: 'Job 5 — The Big Score', giver: 'Mara Voss',
    briefing: 'The Solmarina Trust keeps its vault light on Sundays. Walk in, hold the lobby for five seconds while the bag fills, then run — four stars — to the hideout. This one retires us both.',
    reward: 2500,
    steps: [
      { type: 'goto', x: 36, z: 36, radius: 8, text: 'Reach the Solmarina Trust bank downtown' },
      { type: 'hold', x: 36, z: 36, seconds: 5, text: 'Hold the lobby while the bag fills' },
      { type: 'escape', wanted: 4, x: -150, z: -108, radius: 8, text: 'Escape the four-star heat to the hideout' },
    ],
  },
  {
    id: 'getaway', title: 'Job 6 — The Getaway', giver: 'Mara Voss',
    briefing: 'Retirement was a nice idea, but the crew needs one clean car that no one has seen. Steal any car on the street and park it in the safehouse garage at the hideout — it is yours to keep.',
    reward: 1500,
    steps: [
      { type: 'stealCar', text: 'Steal any car (walk up to one and press E)' },
      { type: 'goto', x: -150, z: -108, radius: 9, text: 'Park it in the safehouse garage' },
    ],
  },
  {
    id: 'heatwave', title: 'Job 7 — Heat Wave', giver: 'Mara Voss',
    briefing: 'A rival crew put a price on your head and the whole PD is out. Four stars, a helicopter overhead — survive the heat for a full minute, then lose them at the hideout.',
    reward: 1800,
    steps: [
      { type: 'survive', seconds: 60, wanted: 4, text: 'Survive the four-star heat for 60 seconds' },
      { type: 'goto', x: -150, z: -108, radius: 8, text: 'Reach the hideout in Palm Heights' },
    ],
  },
  {
    id: 'golden', title: 'Job 8 — The Golden Hour', giver: 'Mara Voss',
    briefing: 'The boat leaves at golden hour and the cargo is already on the pier. Load it at the marina — eight seconds on the dock — then run five stars of heat to the hideout. The helicopter will be watching.',
    reward: 4000,
    steps: [
      { type: 'goto', x: -40, z: 168, radius: 8, text: 'Reach the marina dock at golden hour' },
      { type: 'hold', x: -40, z: 168, seconds: 8, text: 'Hold the dock while the cargo loads' },
      { type: 'escape', wanted: 5, x: -150, z: -108, radius: 8, text: 'Escape the five-star heat to the hideout' },
    ],
  },
  {
    id: 'nightshift', title: 'Job 9 — Night Shift', giver: 'Mara Voss',
    briefing: 'A client at the boardwalk wants a package at the bank before the night shift ends — seventy-five seconds — then the night manager at the Trust wants a word, five seconds of your time, no more.',
    reward: 2200,
    steps: [
      { type: 'goto', x: -40, z: 168, radius: 6, text: 'Pick up the package at the boardwalk' },
      { type: 'deliver', x: 36, z: 36, radius: 8, seconds: 75, text: 'Deliver the package to the bank (75s)' },
      { type: 'hold', x: 36, z: 36, seconds: 5, text: 'Hold the lobby while the manager counts' },
    ],
  },
  {
    id: 'king', title: 'Job 10 — King of Solmarina', giver: 'Mara Voss',
    briefing: 'The whole city knows your name now, and the PD is bringing everything — five stars, the helicopter, roadblocks on every avenue. Survive the full heat for 45 seconds, then come home to the hideout.',
    reward: 5000,
    steps: [
      { type: 'survive', seconds: 45, wanted: 5, text: 'Survive the five-star heat for 45 seconds' },
      { type: 'goto', x: -150, z: -108, radius: 8, text: 'Come home to the hideout' },
    ],
  },
  {
    id: 'doublecross', title: 'Job 11 — The Double Cross', giver: 'Mara Voss',
    briefing: 'Dario Kane double-crossed me, and his armoured car is cruising downtown — matte black, gold stripe, twice the steel of a street car. Tail it until you know its route, then destroy it. Bullets or rams, I do not care.',
    reward: 3500,
    steps: [
      { type: 'follow', target: 'rival', seconds: 10, radius: 15, text: 'Tail the armoured car — stay within 15 m for 10 seconds' },
      { type: 'destroy', target: 'rival', text: 'Destroy the armoured car — shoot it or ram it' },
      { type: 'escape', wanted: 3, x: -150, z: -108, radius: 8, text: 'Escape the three-star heat to the hideout' },
    ],
  },
  {
    id: 'lastferry', title: 'Job 12 — The Last Ferry', giver: 'Mara Voss',
    briefing: 'Last job. The score is loaded on the boat at the pier — hold the dock for ten seconds while the crew finishes, then run five stars of heat to the hideout. Do this and the morning ferry carries us out of Solmarina rich.',
    reward: 6000,
    steps: [
      { type: 'goto', x: -40, z: 168, radius: 8, text: 'Reach the pier at the marina' },
      { type: 'hold', x: -40, z: 168, seconds: 10, text: 'Hold the pier while the crew loads the boat' },
      { type: 'escape', wanted: 5, x: -150, z: -108, radius: 8, text: 'Escape the five-star heat to the hideout' },
    ],
  },
];

// Tuning for the runner and the beacon. Hold steps carry no radius of their
// own, so they share one fixed zone; fill and drain rates are shared too.
const TOO_SLOW = 'Too slow — the client walked away.';
const HOLD_RADIUS = 8;
const DRAIN_RATE = 2;
const BEACON = {
  color: 0xffc861,
  shaftRadius: 1.6,
  shaftHeight: 30,
  ringRadius: 3.2,
  ringTube: 0.22,
  ringRest: 0.4,
  bobSpeed: 0.004,
  bobAmount: 0.25,
};

// Flat distance on the ground plane, and whether the player has arrived
// inside a step's circle.
function gap(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function reached(facts, step, radius) {
  return gap(facts.x, facts.z, step.x, step.z) < radius;
}

// One rule per step kind. A rule reads the live facts and answers 'done'
// when its step is satisfied, 'fail' when the step itself has failed (only
// a late delivery can fail), or 'wait' while it is still open. Rules never
// move the job forward themselves — the runner does that from the answer.
// `env` bundles the run record, the step, the facts and the frame time.
const STEP_RULES = {
  stealCar(env) {
    return env.facts.inCar ? 'done' : 'wait';
  },
  goto(env) {
    return reached(env.facts, env.step, env.step.radius) ? 'done' : 'wait';
  },
  deliver(env) {
    env.run.clock += env.dt;
    if (env.run.clock > env.step.seconds) return 'fail';
    return reached(env.facts, env.step, env.step.radius) ? 'done' : 'wait';
  },
  pickupPerson(env) {
    return env.facts.personPickedUp ? 'done' : 'wait';
  },
  survive(env) {
    env.run.clock += env.dt;
    return env.run.clock >= env.step.seconds ? 'done' : 'wait';
  },
  hold(env) {
    if (reached(env.facts, env.step, HOLD_RADIUS)) {
      env.run.hold += env.dt;
      return env.run.hold >= env.step.seconds ? 'done' : 'wait';
    }
    env.run.hold = Math.max(0, env.run.hold - env.dt * DRAIN_RATE);
    return 'wait';
  },
  escape(env) {
    return reached(env.facts, env.step, env.step.radius) ? 'done' : 'wait';
  },
  follow(env) {
    const rival = env.facts.rival;
    if (!rival) return 'wait';
    if (gap(env.facts.x, env.facts.z, rival.x, rival.z) < env.step.radius) {
      env.run.clock += env.dt;
      return env.run.clock >= env.step.seconds ? 'done' : 'wait';
    }
    env.run.clock = Math.max(0, env.run.clock - env.dt * DRAIN_RATE);
    return 'wait';
  },
  destroy(env) {
    return env.facts.rivalDestroyed ? 'done' : 'wait';
  },
};

// The gold beacon: a glowing upright shaft with a floating ring at its foot.
// Built once, then moved to the current target whenever the step changes —
// and every frame while the target itself is driving.
function makeBeacon(scene) {
  const group = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({
    color: BEACON.color,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(BEACON.shaftRadius, BEACON.shaftRadius, BEACON.shaftHeight, 12, 1, true),
    glow,
  );
  shaft.position.y = BEACON.shaftHeight / 2;
  group.add(shaft);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(BEACON.ringRadius, BEACON.ringTube, 8, 32),
    new THREE.MeshBasicMaterial({ color: BEACON.color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = BEACON.ringRest;
  group.add(ring);
  group.visible = false;
  scene.add(group);
  return { group, ring };
}

export function createMissions(scene, callbacks) {
  const beacon = makeBeacon(scene);

  // Staging suppression (round 9): when true the beacon stays hidden —
  // pointBeacon and trackMovingTarget both respect it, and setting it
  // hides the shaft immediately. Only a screenshot preset sets this;
  // real gameplay never does, so the beacon still marks the objective
  // in every real game.
  let beaconSuppressed = false;
  function setBeaconSuppressed(suppressed) {
    beaconSuppressed = suppressed;
    if (suppressed) beacon.group.visible = false;
  }

  // The whole run in one record: which job, which step inside it, how far
  // the two step clocks have filled, and whether the story is still live.
  const run = {
    job: 0,
    step: 0,
    clock: 0,
    hold: 0,
    over: false,
    live: true,
  };

  // Last place the rival car was seen. The beacon and the minimap follow
  // it while a tail or wreck step is active, even across frames where the
  // traffic module reports no rival at all.
  let rivalSeen = null;

  function activeJob() { return JOBS[run.job]; }

  function activeStep() {
    const job = activeJob();
    return job ? job.steps[run.step] : null;
  }

  // Where the beacon (and the minimap arrow) should point right now: the
  // rival's last known spot for tail and wreck steps, the step's own
  // coordinates for the rest, nowhere for steps with no place to go.
  function resolveTarget() {
    const step = activeStep();
    if (!step) return null;
    if ((step.type === 'follow' || step.type === 'destroy') && rivalSeen) {
      return { x: rivalSeen.x, z: rivalSeen.z };
    }
    if (step.x === undefined) return null;
    return { x: step.x, z: step.z };
  }

  function pointBeacon() {
    // Staging suppression (round 9): a screenshot preset can hide the
    // beacon for its frame — the gold shaft is a gameplay marker, not
    // city scenery, and in the 4-city Sore shot it stood at the end of
    // the avenue as a bright vertical streak. The flag is only ever set
    // by a staging preset; real gameplay never suppresses the beacon.
    if (beaconSuppressed) {
      beacon.group.visible = false;
      return;
    }
    const target = resolveTarget();
    if (!target) {
      beacon.group.visible = false;
      return;
    }
    beacon.group.position.set(target.x, 0, target.z);
    beacon.group.visible = true;
  }

  // Keep the rival's last known spot fresh. When no rival is reported and
  // the step is not a tail or wreck step, the old spot is forgotten; during
  // those two steps it is kept, so the beacon does not blink out.
  function refreshRival(facts, step) {
    if (facts.rival) {
      rivalSeen = { x: facts.rival.x, z: facts.rival.z };
    } else if (step.type !== 'follow' && step.type !== 'destroy') {
      rivalSeen = null;
    }
  }

  // While a tail or wreck step is live, glue the beacon to the rival car
  // itself as it drives, instead of leaving it where the step began.
  function trackMovingTarget(facts) {
    if (beaconSuppressed) return;
    const step = activeStep();
    if (!step) return;
    if ((step.type === 'follow' || step.type === 'destroy') && facts.rival) {
      beacon.group.position.set(facts.rival.x, 0, facts.rival.z);
      beacon.group.visible = true;
    }
  }

  // The current step is done: wipe both clocks and move to the next step,
  // or close out the job when its chain is spent.
  function finishStep() {
    run.step += 1;
    run.clock = 0;
    run.hold = 0;
    if (run.step < activeJob().steps.length) {
      pointBeacon();
      return;
    }
    finishJob(activeJob());
  }

  // The current job is done: pay it out through the callback, then either
  // open the next job or close the story when the twelfth is spent.
  function finishJob(job) {
    callbacks.onMissionComplete(job);
    run.job += 1;
    run.step = 0;
    if (run.job >= JOBS.length) {
      run.over = true;
      run.live = false;
      beacon.group.visible = false;
      callbacks.onStoryComplete();
      return;
    }
    callbacks.onMissionStart(activeJob());
    pointBeacon();
  }

  function start() {
    run.job = 0;
    run.step = 0;
    run.clock = 0;
    run.hold = 0;
    run.over = false;
    run.live = true;
    callbacks.onMissionStart(activeJob());
    pointBeacon();
  }

  // Called every frame with the live game facts. The beacon spins and its
  // ring bobs; the current step's rule is asked for a verdict; the runner
  // acts on it — advance, report a late delivery and restart its clock, or
  // wait for the next frame.
  function update(dt, facts) {
    if (!run.live) return;
    const step = activeStep();
    if (!step) return;
    beacon.group.rotation.y += dt;
    beacon.ring.position.y = BEACON.ringRest + Math.sin(performance.now() * BEACON.bobSpeed) * BEACON.bobAmount;
    refreshRival(facts, step);
    const rule = STEP_RULES[step.type];
    const verdict = rule ? rule({ run, step, facts, dt }) : 'wait';
    if (verdict === 'done') finishStep();
    else if (verdict === 'fail') {
      callbacks.onMissionFailed(TOO_SLOW);
      run.clock = 0;
    }
    trackMovingTarget(facts);
  }

  // Which clock a timed step reads: the fill clock for deliveries, survival
  // and tails; the hold meter for stand-your-ground steps; nothing at all
  // for the rest, so the HUD shows no countdown there.
  const CLOCK_OF_STEP = { deliver: 'clock', survive: 'clock', follow: 'clock', hold: 'hold' };

  function timeLeft() {
    const step = activeStep();
    if (!step) return null;
    const which = CLOCK_OF_STEP[step.type];
    if (!which) return null;
    return Math.max(0, step.seconds - run[which]);
  }

  // The minimap marker: the active target when it has a place, else
  // the next located step of the current job. A location-free step
  // (Job 1's "steal a car", a pickup, a hold) has no coordinates, so
  // the minimap would otherwise show no objective at all — but the
  // job still has a destination (the marina marker), and the GTA
  // minimap always points at where the player is headed. The beacon
  // and the step logic keep using resolveTarget; only the minimap
  // falls back, so the objective itself never moves.
  function mapTargetPosition() {
    const direct = resolveTarget();
    if (direct) return direct;
    const job = activeJob();
    if (!job) return null;
    for (let s = run.step + 1; s < job.steps.length; s += 1) {
      const step = job.steps[s];
      if (step.x !== undefined) return { x: step.x, z: step.z };
    }
    return null;
  }

  function targetPosition() {
    return resolveTarget();
  }

  function setProgress(missionIndex) {
    run.job = Math.min(missionIndex, JOBS.length - 1);
    run.step = 0;
    run.clock = 0;
    run.hold = 0;
    run.over = run.job >= JOBS.length;
    run.live = !run.over;
    if (run.live) {
      callbacks.onMissionStart(activeJob());
      pointBeacon();
    }
  }

  return {
    start,
    update,
    placeBeacon: pointBeacon,
    setBeaconSuppressed,
    current: activeJob,
    step: activeStep,
    getIndex() { return run.job; },
    getStepIndex() { return run.step; },
    getStepTimer() { return run.clock; },
    getHoldTimer() { return run.hold; },
    getCount() { return JOBS.length; },
    timeLeft,
    isCompleted() { return run.over; },
    isActive() { return run.live; },
    setProgress,
    targetPosition,
    mapTargetPosition,
    missionCount() { return JOBS.length; },
  };
}
