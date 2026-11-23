// SOLMARINA — police.js
// One job: the wanted system and everyone who enforces it — black-and-white
// American cruisers with a readable POLICE marking, alternating red/blue
// lightbars, real headlight beams, and a bubble-canopy helicopter that
// circles at high wanted levels.

const THREE = window.THREE;
import { CFG, WANTED_LABELS } from './config.js';
import { makeCarModel } from './vehicles.js';

function policeTexture() {
  // The door marking, drawn once on a canvas and pasted on the cruiser.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#14161a';
  g.font = 'bold 44px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('POLICE', 128, 56);
  g.font = 'bold 20px Arial, sans-serif';
  g.fillText('SOLMARINA PD', 128, 92);
  g.fillStyle = '#c8a020';
  g.fillRect(28, 104, 200, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCruiser(rng) {
  const car = makeCarModel('sedan', { name: 'Police', body: 0x14161a, trim: 0xf4f4f0 }, rng);
  const g = car.group;
  // White doors and roof over the black body: the classic American look.
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.4, metalness: 0.2 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.92), doorMat);
  door.position.set(-0.1, 0.62, 0);
  g.add(door);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.7), doorMat);
  roof.position.set(-0.15, 1.32, 0);
  g.add(roof);
  // POLICE door decals, both sides, readable at screenshot distance.
  const tex = policeTexture();
  const decalMat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
  for (const side of [-1, 1]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), decalMat);
    decal.position.set(-0.1, 0.62, side * 0.97);
    decal.rotation.y = side > 0 ? 0 : Math.PI;
    g.add(decal);
  }
  // Lightbar: red left, blue right, alternating flashes.
  const barBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }),
  );
  barBase.position.set(-0.15, 1.42, 0);
  g.add(barBase);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xff1111, emissive: 0xff1111, emissiveIntensity: 2 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 2 });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.6), redMat);
  red.position.set(-0.15, 1.5, 0.42);
  g.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.6), blueMat);
  blue.position.set(-0.15, 1.5, -0.42);
  g.add(blue);
  // Real headlight beams: two spotlights that sweep the road ahead.
  const beams = [];
  for (const side of [-1, 1]) {
    const spot = new THREE.SpotLight(0xfff2c0, 60, 34, 0.5, 0.5, 1.2);
    spot.position.set(2.2, 0.7, side * 0.6);
    const target = new THREE.Object3D();
    target.position.set(14, 0, side * 1.2);
    g.add(target);
    spot.target = target;
    g.add(spot);
    beams.push(spot);
  }
  return {
    car,
    redMat,
    blueMat,
    beams,
    flashPhase: rng.float() * Math.PI * 2,
    setFlash(t) {
      const on = Math.sin(t * 9 + this.flashPhase) > 0;
      this.redMat.emissiveIntensity = on ? 3.2 : 0.15;
      this.blueMat.emissiveIntensity = on ? 0.15 : 3.2;
    },
    setBeams(on) {
      for (const b of this.beams) b.intensity = on ? 60 : 0;
    },
  };
}

function makeHelicopter() {
  const g = new THREE.Group();
  g.name = 'PoliceHelicopter';
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 1.8), bodyMat);
  body.castShadow = true;
  g.add(body);
  // Bubble canopy: a clear dome at the nose, the helicopter's signature.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({
      color: 0x9fd4e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75,
    }),
  );
  canopy.position.set(1.5, 0.25, 0);
  canopy.scale.set(1.15, 0.9, 0.95);
  g.add(canopy);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.5), bodyMat);
  tail.position.set(-3.2, 0.3, 0);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.9), bodyMat);
  fin.position.set(-4.8, 0.8, 0);
  g.add(fin);
  const skids = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.6 });
  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), skids);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(0.3, -1.0, side * 0.8);
    g.add(skid);
  }
  // Main rotor and tail rotor, spinning.
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
  const rotor = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 4.4), rotorMat);
    blade.rotation.y = (i * Math.PI) / 2;
    rotor.add(blade);
  }
  rotor.position.y = 1.1;
  g.add(rotor);
  const tailRotor = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.05), rotorMat);
    blade.rotation.z = i * Math.PI / 2;
    tailRotor.add(blade);
  }
  tailRotor.position.set(-4.9, 0.6, 0.45);
  g.add(tailRotor);
  // Searchlight under the nose.
  const search = new THREE.SpotLight(0xffffff, 120, 70, 0.32, 0.6, 1);
  search.position.set(1.2, -0.8, 0);
  const searchTarget = new THREE.Object3D();
  searchTarget.position.set(1.2, -30, 0);
  g.add(searchTarget);
  search.target = searchTarget;
  g.add(search);
  return { group: g, rotor, tailRotor, search, angle: 0 };
}

export function createPolice(scene, world, rng, player) {
  const cruisers = [];
  for (let i = 0; i < CFG.policeCruiserCount; i++) {
    const cruiser = makeCruiser(rng);
    const spot = world.randomRoadPoint(rng);
    cruiser.car.group.position.set(spot.x, 0, spot.z);
    scene.add(cruiser.car.group);
    cruisers.push({ ...cruiser, speed: 0, state: 'patrol', patrolTarget: spot });
  }
  const heli = makeHelicopter();
  heli.group.position.set(60, 55, -60);
  heli.group.visible = false;
  scene.add(heli.group);

  const police = {
    cruisers,
    heli,
    wanted: 0,
    heliHold: false,
    holdStaged: false,
    label() {
      return WANTED_LABELS[Math.max(0, Math.min(CFG.maxWanted, this.wanted))];
    },
    setWanted(n, reason) {
      const next = Math.max(0, Math.min(CFG.maxWanted, n));
      if (next !== this.wanted) {
        this.wanted = next;
        return { changed: true, reason: reason || '', level: next };
      }
      return { changed: false, level: next };
    },
    addWanted(n, reason) {
      return this.setWanted(this.wanted + n, reason);
    },
    decay(dt) {
      if (this.wanted > 0) {
        this._decayT = (this._decayT || 0) + dt;
        if (this._decayT > 45) {
          this._decayT = 0;
          this.setWanted(this.wanted - 1, 'The heat cools off');
        }
      }
    },
    update(dt, t, playerPos) {
      // Lightbars always flash; beams come on at dusk.
      for (const c of cruisers) c.setFlash(t);
      heli.rotor.rotation.y += dt * 22;
      heli.tailRotor.rotation.x += dt * 30;
      if (this.wanted >= 3) {
        heli.group.visible = true;
        if (!this.heliHold) {
          heli.angle += dt * 0.25;
          const r = 26;
          heli.group.position.set(
            playerPos.x + Math.cos(heli.angle) * r,
            52 + Math.sin(t * 0.7) * 3,
            playerPos.z + Math.sin(heli.angle) * r,
          );
          heli.group.rotation.y = -heli.angle;
        }
        heli.search.intensity = 140;
      } else {
        heli.group.visible = false;
        heli.search.intensity = 0;
      }
      for (const c of cruisers) {
        // Screenshot staging: hold the staged positions so the cruisers
        // do not drive through the camera before the shot is taken.
        if (this.holdStaged) {
          c.setBeams(true);
          continue;
        }
        const g = c.car.group;
        const dx = playerPos.x - g.position.x;
        const dz = playerPos.z - g.position.z;
        const dist = Math.hypot(dx, dz);
        if (this.wanted > 0 && dist < 140) {
          c.state = 'chase';
        } else if (this.wanted === 0 && dist > 60) {
          c.state = 'patrol';
        }
        if (c.state === 'chase') {
          const wantHeading = Math.atan2(dx, dz);
          let diff = wantHeading - g.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          g.rotation.y += diff * Math.min(1, dt * 2.2);
          c.speed = Math.min(34 + this.wanted * 2, c.speed + 18 * dt);
          g.position.x += Math.sin(g.rotation.y) * c.speed * dt;
          g.position.z += Math.cos(g.rotation.y) * c.speed * dt;
          c.car.steer(diff * 0.5, c.speed);
          // Ramming the player hurts.
          if (dist < 3.4 && player.onFoot) {
            player.damage(18 * dt * 4);
          }
        } else {
          // Patrol: cruise to a random road point, then pick another.
          if (!c.patrolTarget || Math.hypot(c.patrolTarget.x - g.position.x, c.patrolTarget.z - g.position.z) < 6) {
            c.patrolTarget = world.randomRoadPoint(rng);
          }
          const dx2 = c.patrolTarget.x - g.position.x;
          const dz2 = c.patrolTarget.z - g.position.z;
          const wantHeading = Math.atan2(dx2, dz2);
          let diff = wantHeading - g.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          g.rotation.y += diff * Math.min(1, dt * 1.4);
          c.speed += (9 - c.speed) * Math.min(1, dt);
          g.position.x += Math.sin(g.rotation.y) * c.speed * dt;
          g.position.z += Math.cos(g.rotation.y) * c.speed * dt;
          c.car.steer(0, c.speed);
        }
        c.setBeams(true);
      }
      this.decay(dt);
    },
    // Stage a chase right behind the player for a screenshot.
    stageChase(playerPos, heading) {
      this.setWanted(3, 'Staged pursuit');
      cruisers.slice(0, 3).forEach((c, i) => {
        const back = 10 + i * 7;
        const side = (i - 1) * 4;
        c.car.group.position.set(
          playerPos.x - Math.sin(heading) * back + Math.cos(heading) * side,
          0,
          playerPos.z - Math.cos(heading) * back - Math.sin(heading) * side,
        );
        c.car.group.rotation.y = heading;
        c.state = 'chase';
        c.speed = 24;
      });
      heli.group.visible = true;
    },
    // How many cruisers are actively chasing right now.
    chasingCount() {
      return cruisers.filter((c) => c.state === 'chase').length;
    },
  };
  return police;
}
