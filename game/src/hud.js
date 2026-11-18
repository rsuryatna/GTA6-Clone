// The HUD: cash, health, wanted stars, the mission objective, prompts, and
// the minimap — a live top-down canvas of Solmarina with the player, the
// mission marker, traffic and police. All DOM is built in index.html; this
// module only writes into it.
import { CITY } from './config.js';

export function createHud(document) {
  const cashEl = document.getElementById('cash');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const starsEl = document.getElementById('stars');
  const objectiveEl = document.getElementById('objective');
  const objectiveTitle = document.getElementById('objective-title');
  const objectiveText = document.getElementById('objective-text');
  const toastEl = document.getElementById('toast');
  const promptEl = document.getElementById('prompt');
  const speedEl = document.getElementById('speed');
  const crosshairEl = document.getElementById('crosshair');
  const ammoEl = document.getElementById('ammo');
  const minimap = document.getElementById('minimap');
  const mapCtx = minimap.getContext('2d');
  const menuEl = document.getElementById('menu');
  const menuTitle = document.getElementById('menu-title');
  const menuText = document.getElementById('menu-text');
  const menuButtons = document.getElementById('menu-buttons');

  let toastTimer = null;
  let lastCash = -1;
  let lastStars = -1;
  let lastAmmo = -1;

  function showToast(text, seconds) {
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.style.opacity = '0'; }, (seconds || 3.5) * 1000);
  }

  function drawMinimap(state) {
    const size = minimap.width;
    const scale = size / (CITY.halfSize * 2 + 40);
    const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    mapCtx.fillStyle = '#16202b';
    mapCtx.fillRect(0, 0, size, size);
    // Sea and sand along the south edge.
    const [, beachY] = toMap(0, CITY.beachStartZ);
    mapCtx.fillStyle = '#2e7f9e';
    mapCtx.fillRect(0, beachY + 14 * scale, size, size - beachY);
    mapCtx.fillStyle = '#e8d49a';
    mapCtx.fillRect(0, beachY, size, 14 * scale);
    // Streets.
    mapCtx.strokeStyle = '#5a636e';
    mapCtx.lineWidth = 5;
    for (const s of state.streets) {
      const [x] = toMap(s, 0);
      const [, z] = toMap(0, s);
      mapCtx.beginPath(); mapCtx.moveTo(x, 0); mapCtx.lineTo(x, size); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(0, z); mapCtx.lineTo(size, z); mapCtx.stroke();
    }
    // Traffic as pale dots, police as red dots, the mission as a gold diamond.
    mapCtx.fillStyle = '#cfd6dd';
    for (const car of state.trafficCars) {
      const [x, y] = toMap(car.x, car.z);
      mapCtx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    mapCtx.fillStyle = '#ff4444';
    for (const cop of state.policeCars) {
      const [x, y] = toMap(cop.x, cop.z);
      mapCtx.beginPath(); mapCtx.arc(x, y, 3, 0, Math.PI * 2); mapCtx.fill();
    }
    if (state.lennox) {
      const [x, y] = toMap(state.lennox.x, state.lennox.z);
      mapCtx.fillStyle = '#2ecc71';
      mapCtx.beginPath(); mapCtx.arc(x, y, 3, 0, Math.PI * 2); mapCtx.fill();
    }
    if (state.mission) {
      const [x, y] = toMap(state.mission.x, state.mission.z);
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 1.5;
      mapCtx.fillStyle = '#ffc861';
      mapCtx.beginPath();
      mapCtx.moveTo(x, y - pulse);
      mapCtx.lineTo(x + pulse, y);
      mapCtx.lineTo(x, y + pulse);
      mapCtx.lineTo(x - pulse, y);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // The player: a white arrow rotated to the heading. The arrow is drawn
    // pointing up (-y), and world heading h points at (sin h, cos h) on the
    // map, so the rotation is PI - h.
    const [px, py] = toMap(state.playerX, state.playerZ);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(Math.PI - state.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4.5, 5);
    mapCtx.lineTo(-4.5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  return {
    showToast,
    setObjective(title, text) {
      objectiveTitle.textContent = title;
      objectiveText.textContent = text;
      objectiveEl.style.opacity = '1';
    },
    hideObjective() { objectiveEl.style.opacity = '0'; },
    setPrompt(text) {
      promptEl.textContent = text || '';
      promptEl.style.opacity = text ? '1' : '0';
    },
    setSpeed(kmh) {
      if (kmh === null) { speedEl.style.opacity = '0'; return; }
      speedEl.style.opacity = '1';
      speedEl.textContent = `${Math.round(kmh)} km/h`;
    },
    setCrosshair(visible) { crosshairEl.style.opacity = visible ? '1' : '0'; },
    showMenu(title, text, buttons) {
      menuTitle.textContent = title;
      menuText.innerHTML = text;
      menuButtons.innerHTML = '';
      for (const button of buttons) {
        const el = document.createElement('button');
        el.textContent = button.label;
        el.addEventListener('click', button.onClick);
        menuButtons.appendChild(el);
      }
      menuEl.style.display = 'flex';
    },
    hideMenu() { menuEl.style.display = 'none'; },
    update(state) {
      if (state.cash !== lastCash) {
        lastCash = state.cash;
        cashEl.textContent = `$${state.cash.toLocaleString('en-US')}`;
      }
      const healthPct = Math.max(0, Math.round(state.health));
      healthFill.style.width = `${healthPct}%`;
      healthFill.style.background = healthPct > 50 ? '#2ecc71' : healthPct > 25 ? '#f39c12' : '#e74c3c';
      healthText.textContent = `${healthPct}`;
      if (state.wanted !== lastStars) {
        lastStars = state.wanted;
        starsEl.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
        starsEl.style.color = state.wanted > 0 ? '#ffcf3f' : '#8899aa';
      }
      if (state.ammo !== lastAmmo) {
        lastAmmo = state.ammo;
        ammoEl.textContent = `Ammo ${state.ammo} / 12`;
      }
      drawMinimap(state);
    },
  };
}
