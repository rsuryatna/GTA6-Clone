// The HUD: cash, health, wanted stars, the mission objective, prompts,
// and the minimap — a live top-down canvas of Solmarina with the player,
// the mission marker, traffic and police. All DOM lives in index.html;
// this module only writes into it. It also shows the weapon bar (the four
// weapons, owned ones lit, the active one marked), the car radio station
// while driving, Jules' respect rank, the NOS meter and the driven car's
// health while driving, a countdown for timed mission steps, and which
// job of twelve Jules is on.
import { CITY } from './config.js';

export function createHud(document) {
  // Grab every element by id in one pass instead of a long list of
  // individual lookups; the ids are the contract with index.html.
  const ids = [
    'cash', 'health-fill', 'health-text', 'stars', 'objective',
    'objective-title', 'objective-text', 'job-count', 'mission-timer',
    'toast', 'prompt', 'speed', 'crosshair', 'ammo', 'weapon-bar',
    'radio', 'respect', 'nos-row', 'nos-fill', 'car-health-row',
    'car-health-fill', 'minimap', 'menu', 'menu-title', 'menu-text',
    'menu-buttons',
  ];
  const el = {};
  for (const id of ids) el[id] = document.getElementById(id);
  const mapCtx = el.minimap.getContext('2d');

  // `seen` remembers what the DOM already shows, so update() only writes
  // what actually changed instead of touching every node every frame.
  const seen = {
    cash: null, stars: null, ammo: null, weaponName: null,
    weaponBar: null, radio: null, respect: null, jobCount: null,
    timer: null,
  };
  let toastTimer = null;

  // Write textContent only when the string differs from the last write.
  function setText(node, key, value) {
    if (seen[key] === value) return false;
    seen[key] = value;
    node.textContent = value;
    return true;
  }

  // Health-bar colour: green while healthy, amber when hurt, red when low.
  function healthColor(pct) {
    if (pct > 50) return '#2ecc71';
    if (pct > 25) return '#f39c12';
    return '#e74c3c';
  }

  function showToast(text, seconds) {
    el.toast.textContent = text;
    el.toast.style.opacity = '1';
    if (toastTimer) window.clearTimeout(toastTimer);
    const hold = (seconds === undefined || seconds === null ? 3.5 : seconds) * 1000;
    toastTimer = window.setTimeout(() => { el.toast.style.opacity = '0'; }, hold);
  }

  // A filled polygon from a list of [x, y] corners — the shared primitive
  // behind diamonds and the player arrow.
  function poly(points, color) {
    mapCtx.fillStyle = color;
    mapCtx.beginPath();
    mapCtx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) mapCtx.lineTo(points[i][0], points[i][1]);
    mapCtx.closePath();
    mapCtx.fill();
  }

  function drawDot(x, y, radius, color) {
    mapCtx.fillStyle = color;
    mapCtx.beginPath();
    mapCtx.arc(x, y, radius, 0, Math.PI * 2);
    mapCtx.fill();
  }

  function drawRing(x, y, radius, color, width) {
    mapCtx.strokeStyle = color;
    mapCtx.lineWidth = width;
    mapCtx.beginPath();
    mapCtx.arc(x, y, radius, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  function drawDiamond(x, y, half, color) {
    poly([[x, y - half], [x + half, y], [x, y + half], [x - half, y]], color);
  }

  function renderWeaponBar(weapons) {
    if (!weapons) return;
    const parts = [];
    for (let i = 0; i < weapons.length; i += 1) {
      const w = weapons[i];
      const label = w.owned ? w.name : '???';
      const mark = w.active ? '*' : '';
      const ammo = w.owned ? String(w.ammo) : '-';
      parts.push(`${i + 1}:${label}${mark} ${ammo}`);
    }
    if (setText(el['weapon-bar'], 'weaponBar', parts.join(' | '))) {
      el['weapon-bar'].style.opacity = '1';
    }
  }

  function drawMinimap(state) {
    const size = el.minimap.width;
    const span = CITY.halfSize * 2 + 40;
    const scale = size / span;
    // World (x, z) -> canvas (px, py). The map is centred on the city.
    function project(x, z) {
      return [size / 2 + x * scale, size / 2 + z * scale];
    }
    mapCtx.fillStyle = '#16202b';
    mapCtx.fillRect(0, 0, size, size);
    // Sea and sand along the south edge.
    const beachTop = project(0, CITY.beachStartZ)[1];
    mapCtx.fillStyle = '#2e7f9e';
    mapCtx.fillRect(0, beachTop + 14 * scale, size, size - beachTop);
    mapCtx.fillStyle = '#e8d49a';
    mapCtx.fillRect(0, beachTop, size, 14 * scale);
    // Streets as pale bands across the map: one vertical and one
    // horizontal band per street line, instead of stroked centre lines.
    mapCtx.fillStyle = '#5a636e';
    for (const s of state.streets) {
      const vx = project(s, 0)[0];
      const hz = project(0, s)[1];
      mapCtx.fillRect(vx - 2.5, 0, 5, size);
      mapCtx.fillRect(0, hz - 2.5, size, 5);
    }
    // Traffic as pale squares, police as red dots, the mission as a gold
    // diamond, Lennox as a green dot.
    for (const car of state.trafficCars) {
      const p = project(car.x, car.z);
      mapCtx.fillStyle = '#cfd6dd';
      mapCtx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    }
    for (const cop of state.policeCars) {
      const p = project(cop.x, cop.z);
      drawDot(p[0], p[1], 3, '#ff4444');
    }
    if (state.lennox) {
      const p = project(state.lennox.x, state.lennox.z);
      drawDot(p[0], p[1], 3, '#2ecc71');
    }
    // The rival car: a black dot with a gold ring, so the tail job reads.
    if (state.rival) {
      const p = project(state.rival.x, state.rival.z);
      drawDot(p[0], p[1], 4, '#111111');
      drawRing(p[0], p[1], 5.5, '#f7c948', 1.5);
    }
    if (state.mission) {
      const p = project(state.mission.x, state.mission.z);
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 1.5;
      drawDiamond(p[0], p[1], pulse, '#ffc861');
    }
    // The player: a white arrow rotated to the heading. The arrow is drawn
    // pointing up (-y), and world heading h points at (sin h, cos h) on the
    // map, so the rotation is PI - h.
    const pp = project(state.playerX, state.playerZ);
    mapCtx.save();
    mapCtx.translate(pp[0], pp[1]);
    mapCtx.rotate(Math.PI - state.heading);
    poly([[0, -6], [4.5, 5], [-4.5, 5]], '#ffffff');
    mapCtx.restore();
  }

  return {
    showToast,
    setObjective(title, text) {
      el['objective-title'].textContent = title;
      el['objective-text'].textContent = text;
      el.objective.style.opacity = '1';
    },
    hideObjective() { el.objective.style.opacity = '0'; },
    setJobCounter(text) {
      if (!setText(el['job-count'], 'jobCount', text || '')) return;
      el['job-count'].style.opacity = text ? '1' : '0';
    },
    // A countdown for timed steps (deliveries, survivals, tailing): the
    // seconds left, or null to hide it.
    setTimer(seconds) {
      const text = seconds === null || seconds === undefined ? '' : `${Math.ceil(seconds)}s`;
      if (!setText(el['mission-timer'], 'timer', text)) return;
      el['mission-timer'].style.opacity = text ? '1' : '0';
    },
    setPrompt(text) {
      el.prompt.textContent = text || '';
      el.prompt.style.opacity = text ? '1' : '0';
    },
    setSpeed(kmh) {
      if (kmh === null) { el.speed.style.opacity = '0'; return; }
      el.speed.style.opacity = '1';
      el.speed.textContent = `${Math.round(kmh)} km/h`;
    },
    setCrosshair(visible) { el.crosshair.style.opacity = visible ? '1' : '0'; },
    // The NOS meter: 0..1 while driving with NOS installed, hidden otherwise.
    setNos(fraction, visible) {
      el['nos-row'].style.opacity = visible ? '1' : '0';
      if (!visible) return;
      const clamped = Math.max(0, Math.min(1, fraction));
      el['nos-fill'].style.width = `${Math.round(clamped * 100)}%`;
    },
    // The driven car's health bar: shown while driving, hidden on foot.
    setCarHealth(health, max, visible) {
      el['car-health-row'].style.opacity = visible ? '1' : '0';
      if (!visible || max <= 0) return;
      const pct = Math.max(0, Math.round((health / max) * 100));
      el['car-health-fill'].style.width = `${pct}%`;
      el['car-health-fill'].style.background = healthColor(pct);
    },
    showMenu(title, text, buttons) {
      el['menu-title'].textContent = title;
      el['menu-text'].innerHTML = text;
      el['menu-buttons'].innerHTML = '';
      for (const button of buttons) {
        const node = document.createElement('button');
        node.textContent = button.label;
        node.addEventListener('click', button.onClick);
        el['menu-buttons'].appendChild(node);
      }
      el.menu.style.display = 'flex';
    },
    hideMenu() { el.menu.style.display = 'none'; },
    drawMinimap,
    drawDiamond,
    drawDot,
    drawRing,
    renderWeaponBar,
    update(state) {
      setText(el.cash, 'cash', `$${state.cash.toLocaleString('en-US')}`);
      const healthPct = Math.max(0, Math.round(state.health));
      el['health-fill'].style.width = `${healthPct}%`;
      el['health-fill'].style.background = healthColor(healthPct);
      el['health-text'].textContent = `${healthPct}`;
      const starsText = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
      if (setText(el.stars, 'stars', starsText)) {
        el.stars.style.color = state.wanted > 0 ? '#ffcf3f' : '#8899aa';
        // The stars pulse while the PD is after Jules.
        el.stars.classList.toggle('hot', state.wanted > 0);
      }
      const ammoText = `${state.weaponName || 'Pistol'} — Ammo ${state.ammo} / ${state.magSize || 12}`;
      if (seen.ammo !== state.ammo || seen.weaponName !== state.weaponName) {
        seen.ammo = state.ammo;
        seen.weaponName = state.weaponName;
        el.ammo.textContent = ammoText;
      }
      renderWeaponBar(state.weapons);
      // The radio only shows while driving; respect always shows.
      if (setText(el.radio, 'radio', state.radio || '')) {
        el.radio.style.opacity = state.radio ? '1' : '0';
      }
      if (setText(el.respect, 'respect', state.respect || '')) {
        el.respect.style.opacity = state.respect ? '1' : '0';
      }
      drawMinimap(state);
    },
  };
}
