// SOLMARINA — missions.js
// One job: the story. Twelve missions for Jules Maro, each with a giver,
// a job, a place in the city and a payout. The mission system tracks the
// current job, its objective marker, and the cash and respect it pays.

const THREE = window.THREE;

export const MISSION_LIST = [
  { id: 1, title: 'Welcome to Solmarina', giver: 'Aunt Rosa', pay: 200, kind: 'drive', text: 'Drive Aunt Rosa’s coupe to the marina and park it by the pier. The city is yours — learn the avenues.' },
  { id: 2, title: 'The Palm Row Pickup', giver: 'Dario', pay: 350, kind: 'collect', text: 'Dario left three packages along Palm Row. Collect them all before the patrols get curious.' },
  { id: 3, title: 'Beachfront Brawl', giver: 'Rosa', pay: 400, kind: 'combat', text: 'The Crescent crew is muscling in on the beach bars. Clear them out — fists first, questions later.' },
  { id: 4, title: 'Harbour Heights Heist', giver: 'Mira', pay: 650, kind: 'steal', text: 'A courier van full of harbour goods is parked in Harbour Heights. Take it. Don’t scratch it.' },
  { id: 5, title: 'The Getaway', giver: 'Dario', pay: 700, kind: 'chase', text: 'You tripped an alarm. Lose the cruisers — three stars and counting — then meet Dario at the old church.' },
  { id: 6, title: 'Old Town Tail', giver: 'Mira', pay: 550, kind: 'follow', text: 'Follow the grey sedan through Old Town without being spotted. Keep your distance and stay cool.' },
  { id: 7, title: 'The Strip Run', giver: 'Rosa', pay: 800, kind: 'race', text: 'Three checkpoints down The Strip, against the clock. Beat 90 seconds and the street is yours.' },
  { id: 8, title: 'Marina Nights', giver: 'Captain Eli', pay: 900, kind: 'boat', text: 'A boat is waiting at the marina after dark. Deliver the cargo to the far pier before dawn patrols.' },
  { id: 9, title: 'Lockdown', giver: 'Dario', pay: 1100, kind: 'survive', text: 'Four stars. The whole harbour force is out. Survive two minutes and slip away through the back streets.' },
  { id: 10, title: 'The Informant', giver: 'Mira', pay: 950, kind: 'escort', text: 'Walk the informant from Palm Row to the safe house. If anyone follows, deal with them quietly.' },
  { id: 11, title: 'Crescent Gold', giver: 'Captain Eli', pay: 1500, kind: 'heist', text: 'The casino courier moves gold across Crescent Beach at dusk. Intercept it — and make it look like an accident.' },
  { id: 12, title: 'King of Solmarina', giver: 'Rosa', pay: 2500, kind: 'finale', text: 'One last job: take the mayor’s convoy, outrun the helicopter, and end the night on the marina roof. Solmarina is yours.' },
];

export function createMissions(scene, world, rng, player, police) {
  // Objective marker: a tall golden beam plus a floating diamond.
  const marker = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  marker.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xaa7700, emissiveIntensity: 0.8, roughness: 0.3 }),
  );
  diamond.position.y = 6;
  marker.add(diamond);
  marker.visible = false;
  scene.add(marker);

  const state = {
    list: MISSION_LIST,
    index: 0,
    active: null,
    completed: 0,
    timer: 0,
    marker,
    current() {
      return this.list[this.index] || null;
    },
    start(i) {
      const m = this.list[i];
      if (!m) return null;
      this.index = i;
      const spot = this.pickSpot(m);
      this.active = { ...m, target: spot, progress: 0, done: false };
      this.timer = 0;
      marker.position.set(spot.x, 0, spot.z);
      marker.visible = true;
      return this.active;
    },
    pickSpot(m) {
      // Each mission kind gets a sensible place in the city.
      if (m.kind === 'boat' || m.kind === 'heist') return { x: world.marinaPoint.x, z: world.marinaPoint.z };
      if (m.kind === 'combat' || m.kind === 'finale') return { x: world.beachPoint.x, z: world.beachPoint.z };
      if (m.kind === 'race') return { x: world.roadCentersX[5], z: world.roadCentersZ[1] };
      const spot = world.randomRoadPoint(rng);
      return { x: spot.x, z: spot.z };
    },
    objectiveText() {
      if (!this.active) return 'No active mission — press N for the next job.';
      const m = this.active;
      return `Mission ${m.id}/12 — ${m.title}: ${m.text}`;
    },
    update(dt, t) {
      diamond.rotation.y += dt * 2;
      diamond.position.y = 6 + Math.sin(t * 2) * 0.5;
      if (!this.active) return null;
      this.timer += dt;
      const m = this.active;
      const dx = m.target.x - player.position.x;
      const dz = m.target.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      // Timed kinds fail on the clock; the rest complete on arrival.
      if (m.kind === 'race' && this.timer > 90) {
        this.fail('Too slow — the street keeps its name.');
        return 'failed';
      }
      if (m.kind === 'survive' && this.timer > 120) {
        return this.complete();
      }
      if (dist < 6) {
        if (m.kind === 'collect') {
          m.progress += 1;
          if (m.progress >= 3) return this.complete();
          const spot = world.randomRoadPoint(rng);
          m.target = { x: spot.x, z: spot.z };
          marker.position.set(spot.x, 0, spot.z);
          return 'progress';
        }
        return this.complete();
      }
      return null;
    },
    complete() {
      const m = this.active;
      if (!m) return null;
      this.completed += 1;
      player.addCash(m.pay);
      player.heal(25);
      marker.visible = false;
      this.active = null;
      const next = this.index + 1;
      if (next < this.list.length) this.index = next;
      return { completed: m, next: this.list[this.index] || null };
    },
    fail(reason) {
      marker.visible = false;
      this.active = null;
      return { failed: true, reason };
    },
    skipTo(i) {
      this.active = null;
      marker.visible = false;
      return this.start(i);
    },
    // A one-line progress report for the pause menu and the HUD.
    progressText() {
      return `Missions ${this.completed}/12 complete — ${this.current() ? this.current().title : 'story finished'}`;
    },
    distanceToTarget() {
      if (!this.active) return null;
      return Math.hypot(
        this.active.target.x - player.position.x,
        this.active.target.z - player.position.z,
      );
    },
  };
  return state;
}
