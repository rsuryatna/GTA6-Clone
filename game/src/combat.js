// SOLMARINA — combat.js
// One job: fighting. Fists up close, a pistol at range, enemy thugs who
// swing back, muzzle flashes, tracers, health and the wanted heat a fight
// brings. No gore — a flash, a fall, a wanted star.

const THREE = window.THREE;

export function createCombat(scene, world, rng, player, police) {
  const enemies = [];
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });

  function makeEnemy(x, z) {
    const g = new THREE.Group();
    g.name = 'Thug';
    const shirt = new THREE.MeshStandardMaterial({ color: 0x8a2b2b, roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.86, 0.19), pants);
    legL.position.set(-0.12, 0.43, 0);
    const legR = legL.clone();
    legR.position.x = 0.12;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.26), shirt);
    torso.position.y = 1.18;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.14), shirt);
    armL.position.set(-0.31, 1.12, 0);
    const armR = armL.clone();
    armR.position.x = 0.31;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
    head.position.y = 1.66;
    g.add(legL, legR, torso, armL, armR, head);
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    return {
      group: g, health: 60, armL, armR, swing: 0, cooldown: 0,
    };
  }

  function spawnTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), tracerMat);
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.lookAt(to);
    m.userData.life = 0.08;
    scene.add(m);
    tracers.push(m);
  }

  const combat = {
    enemies,
    ammo: 24,
    hasGun: false,
    punchCooldown: 0,
    shootCooldown: 0,
    spawnThugs(x, z, n) {
      for (let i = 0; i < n; i++) {
        enemies.push(makeEnemy(x + rng.range(-6, 6), z + rng.range(-6, 6)));
      }
      return enemies.length;
    },
    punch() {
      if (this.punchCooldown > 0 || !player.onFoot) return false;
      this.punchCooldown = 0.45;
      let hit = false;
      for (const e of enemies) {
        const d = e.group.position.distanceTo(player.position);
        if (d < 2.6) {
          e.health -= 20;
          hit = true;
          e.group.position.add(new THREE.Vector3(
            Math.sin(player.heading) * 0.6, 0, Math.cos(player.heading) * 0.6,
          ));
        }
      }
      if (hit && police) police.addWanted(1, 'Street fight');
      return hit;
    },
    shoot(target) {
      if (this.shootCooldown > 0 || !this.hasGun || this.ammo <= 0) return false;
      this.shootCooldown = 0.28;
      this.ammo -= 1;
      const from = player.position.clone();
      from.y = 1.5;
      const to = target || from.clone().add(new THREE.Vector3(Math.sin(player.heading) * 30, 1.4, Math.cos(player.heading) * 30));
      spawnTracer(from, to);
      let hit = false;
      for (const e of enemies) {
        if (e.group.position.distanceTo(to) < 3 || e.group.position.distanceTo(player.position) < 30) {
          const aim = new THREE.Vector3().subVectors(e.group.position, from).normalize();
          const want = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
          if (aim.dot(want) > 0.96) {
            e.health -= 34;
            hit = true;
          }
        }
      }
      if (police) police.addWanted(1, 'Shots fired');
      return hit;
    },
    muzzleFlash() {
      const flash = new THREE.PointLight(0xffe9a8, 40, 12, 1.5);
      const p = player.position.clone();
      p.y = 1.5;
      p.add(new THREE.Vector3(Math.sin(player.heading) * 1.2, 0, Math.cos(player.heading) * 1.2));
      flash.position.copy(p);
      scene.add(flash);
      setTimeout(() => scene.remove(flash), 60);
    },
    // Give Jules a pistol: the gun shop and mission 3 both call this.
    giveGun(ammo) {
      this.hasGun = true;
      this.ammo += ammo || 24;
      return this.ammo;
    },
    update(dt) {
      this.punchCooldown = Math.max(0, this.punchCooldown - dt);
      this.shootCooldown = Math.max(0, this.shootCooldown - dt);
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].userData.life -= dt;
        if (tracers[i].userData.life <= 0) {
          scene.remove(tracers[i]);
          tracers.splice(i, 1);
        }
      }
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.cooldown -= dt;
        const d = e.group.position.distanceTo(player.position);
        if (e.health <= 0) {
          // Downed thug: fall over, fade out, stay out of the way.
          e.group.rotation.x = -Math.PI / 2;
          e.group.position.y = 0.3;
          e.fallT = (e.fallT || 0) + dt;
          if (e.fallT > 4) {
            scene.remove(e.group);
            enemies.splice(i, 1);
          }
          continue;
        }
        if (d < 26) {
          const dx = player.position.x - e.group.position.x;
          const dz = player.position.z - e.group.position.z;
          const heading = Math.atan2(dx, dz);
          e.group.rotation.y = heading;
          if (d > 2.2) {
            e.group.position.x += Math.sin(heading) * 3.4 * dt;
            e.group.position.z += Math.cos(heading) * 3.4 * dt;
            e.swing += dt * 8;
            e.armL.rotation.x = Math.sin(e.swing) * 0.5;
            e.armR.rotation.x = -Math.sin(e.swing) * 0.5;
          } else if (e.cooldown <= 0) {
            e.cooldown = 1.1;
            player.damage(9);
            e.armL.rotation.x = -1.4;
            e.armR.rotation.x = -1.4;
          }
        }
      }
    },
  };
  return combat;
}
