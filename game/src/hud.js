// SOLMARINA — hud.js
// One job: everything drawn over the game — cash, health, wanted stars,
// the mission line, speed, the clock, toasts, and the minimap: a zoomed,
// player-centred street map with the player, the objective, police and
// traffic on it.

import { districtAt } from './config.js';

export function createHud(ctx) {
  const el = (id) => document.getElementById(id);
  const cashEl = el('hud-cash');
  const healthFill = el('hud-health-fill');
  const starsEl = el('hud-stars');
  const missionEl = el('hud-mission');
  const districtEl = el('hud-district');
  const clockEl = el('hud-clock');
  const speedEl = el('hud-speed');
  const toastEl = el('hud-toast');
  const hintEl = el('hud-hint');
  const ammoEl = el('hud-ammo');
  const mapCanvas = el('minimap');
  const mapCtx = mapCanvas ? mapCanvas.getContext('2d') : null;

  let toastTimer = 0;
  let zoom = 1; // minimap zoom, M cycles 1 -> 1.8 -> 2.6

  function starRow(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    return s;
  }

  const hud = {
    zoom,
    cycleZoom() {
      zoom = zoom === 1 ? 1.8 : zoom === 1.8 ? 2.6 : 1;
      this.zoom = zoom;
      return zoom;
    },
    toast(text, seconds = 4) {
      if (!toastEl) return;
      toastEl.textContent = text;
      toastEl.style.opacity = '1';
      toastTimer = seconds;
    },
    setHint(text) {
      if (hintEl) hintEl.textContent = text;
    },
    update(dt) {
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0 && toastEl) toastEl.style.opacity = '0';
      }
      const { player, police, missions, daynight, combat } = ctx;
      if (cashEl) cashEl.textContent = `$${player.cash.toLocaleString('en-US')}`;
      if (healthFill) {
        healthFill.style.width = `${player.health}%`;
        healthFill.style.background = player.health > 50 ? '#4caf50' : player.health > 25 ? '#ff9800' : '#f44336';
      }
      if (starsEl) {
        starsEl.textContent = starRow(police.wanted);
        starsEl.classList.toggle('hot', police.wanted >= 3);
      }
      if (missionEl) missionEl.textContent = missions.objectiveText();
      if (districtEl) districtEl.textContent = districtAt(player.position.x, player.position.z);
      if (clockEl && daynight) clockEl.textContent = daynight.clockText();
      if (speedEl) {
        speedEl.textContent = player.onFoot
          ? `${Math.round(Math.abs(player.speed) * 3.6)} km/h on foot`
          : `${Math.round(Math.abs(player.speed) * 3.6)} km/h`;
      }
      if (ammoEl && combat) {
        ammoEl.textContent = combat.hasGun ? `🔫 ${combat.ammo}` : '👊 fists';
      }
      this.drawMinimap();
    },
    drawMinimap() {
      if (!mapCtx || !mapCanvas) return;
      const { player, world, missions, police, traffic } = ctx;
      const S = mapCanvas.width;
      const scale = (S / 260) * zoom; // world units -> pixels, player centred
      const px = player.position.x;
      const pz = player.position.z;
      mapCtx.clearRect(0, 0, S, S);
      // Sea and sand at the edges.
      mapCtx.fillStyle = '#12303f';
      mapCtx.fillRect(0, 0, S, S);
      const toMap = (x, z) => [S / 2 + (x - px) * scale, S / 2 + (z - pz) * scale];
      // Land.
      mapCtx.fillStyle = '#3d6b34';
      const [lx, lz] = toMap(world.bounds.minX, world.bounds.minZ);
      const [rx, rz] = toMap(world.bounds.maxX, world.bounds.maxZ);
      mapCtx.fillRect(lx, lz, rx - lx, rz - lz);
      // Beach strip.
      mapCtx.fillStyle = '#e8d5a4';
      const [bx] = toMap(world.bounds.minX, 0);
      const [, bz] = toMap(0, -205);
      mapCtx.fillRect(bx, bz - 6 * scale, (rx - lx), 12 * scale);
      // Roads.
      mapCtx.strokeStyle = '#2e2f33';
      mapCtx.lineWidth = Math.max(2, 13 * scale);
      for (const x of world.roadCentersX) {
        const [mx, mz0] = toMap(x, world.bounds.minZ);
        const [, mz1] = toMap(x, world.bounds.maxZ);
        mapCtx.beginPath();
        mapCtx.moveTo(mx, mz0);
        mapCtx.lineTo(mx, mz1);
        mapCtx.stroke();
      }
      for (const z of world.roadCentersZ) {
        const [mx0, mz] = toMap(world.bounds.minX, z);
        const [mx1] = toMap(world.bounds.maxX, z);
        mapCtx.beginPath();
        mapCtx.moveTo(mx0, mz);
        mapCtx.lineTo(mx1, mz);
        mapCtx.stroke();
      }
      // Buildings as pale blocks.
      mapCtx.fillStyle = '#c9bda6';
      for (const b of world.buildings) {
        const [mx, mz] = toMap(b.x - b.w / 2, b.z - b.d / 2);
        mapCtx.fillRect(mx, mz, b.w * scale, b.d * scale);
      }
      // Traffic dots.
      if (traffic) {
        mapCtx.fillStyle = '#ffd54f';
        for (const car of traffic.cars) {
          const [mx, mz] = toMap(car.model.group.position.x, car.model.group.position.z);
          mapCtx.fillRect(mx - 1.5, mz - 1.5, 3, 3);
        }
      }
      // Police dots, blue-red.
      mapCtx.fillStyle = '#4aa3ff';
      for (const c of police.cruisers) {
        const [mx, mz] = toMap(c.car.group.position.x, c.car.group.position.z);
        mapCtx.beginPath();
        mapCtx.arc(mx, mz, 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Mission target: a gold diamond.
      if (missions.active) {
        const [mx, mz] = toMap(missions.active.target.x, missions.active.target.z);
        mapCtx.fillStyle = '#ffc93c';
        mapCtx.save();
        mapCtx.translate(mx, mz);
        mapCtx.rotate(Math.PI / 4);
        mapCtx.fillRect(-5, -5, 10, 10);
        mapCtx.restore();
      }
      // Player: a white arrow, always centred, pointing where Jules faces.
      mapCtx.save();
      mapCtx.translate(S / 2, S / 2);
      mapCtx.rotate(Math.PI - player.heading);
      mapCtx.fillStyle = '#ffffff';
      mapCtx.strokeStyle = '#111111';
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.moveTo(0, -8);
      mapCtx.lineTo(6, 6);
      mapCtx.lineTo(0, 3);
      mapCtx.lineTo(-6, 6);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.stroke();
      mapCtx.restore();
      // Ring frame.
      mapCtx.strokeStyle = 'rgba(255,255,255,0.85)';
      mapCtx.lineWidth = 3;
      mapCtx.beginPath();
      mapCtx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
      mapCtx.stroke();
      // North tick, so the player can orient at a glance.
      mapCtx.fillStyle = '#ffffff';
      mapCtx.font = 'bold 11px Arial, sans-serif';
      mapCtx.textAlign = 'center';
      mapCtx.fillText('N', S / 2, 13);
    },
  };
  return hud;
}
