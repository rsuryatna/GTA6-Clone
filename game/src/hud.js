// The HUD: cash, health, wanted stars, the mission objective, prompts,
// and the minimap — a live top-down canvas of Solmarina with the player,
// the mission marker, traffic and police. All DOM lives in index.html;
// this module only writes into it. It also shows the weapon bar (the four
// weapons, owned ones lit, the active one marked), the car radio station
// while driving, Jules' respect rank, the NOS meter and the driven car's
// health while driving, a countdown for timed mission steps, and which
// job of twelve Jules is on.
import { CITY, PLAYER, coastalRoadZ } from './config.js';

// One inline-SVG silhouette per weapon, drawn once and reused in the
// weapon bar. Each is a filled shape in a 40x24 box, coloured by CSS
// (currentColor), so the active slot can go gold and a locked slot dim.
// The speedometer gauge, NFS-style: a sweeping arc around the edge
// that FILLS as the speed rises (bright yellow, glowing), a big bold
// digital number in the centre, and a REDLINE zone at the top end
// (above 180 km/h) that turns the arc red. No classic tick-mark dial —
// a clean, modern, sporty look. The dial spans 0-220 km/h over -120°
// to +120° (0° is straight up), so the arc angle is
// -120 + speed/220 * 240.
const SPEED_MAX = 220;
const SPEED_MIN_ANGLE = -120;
const SPEED_MAX_ANGLE = 120;
const SPEED_REDLINE = 180;

function speedAngle(kmh) {
  const clamped = Math.max(0, Math.min(SPEED_MAX, kmh));
  return SPEED_MIN_ANGLE + (clamped / SPEED_MAX) * (SPEED_MAX_ANGLE - SPEED_MIN_ANGLE);
}

// An SVG arc path from one angle to another (degrees, clockwise from
// 12 o'clock), centred at (cx, cy) with radius r.
function arcPath(cx, cy, r, fromDeg, toDeg) {
  const a0 = (fromDeg * Math.PI) / 180;
  const a1 = (toDeg * Math.PI) / 180;
  const x0 = cx + r * Math.sin(a0);
  const y0 = cy - r * Math.cos(a0);
  const x1 = cx + r * Math.sin(a1);
  const y1 = cy - r * Math.cos(a1);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function speedGaugeSvg() {
  const cx = 60;
  const cy = 60;
  const r = 50;
  const redlineAngle = speedAngle(SPEED_REDLINE);
  // Background track: dark grey up to the redline, red through it.
  const track = arcPath(cx, cy, r, SPEED_MIN_ANGLE, redlineAngle);
  const redline = arcPath(cx, cy, r, redlineAngle, SPEED_MAX_ANGLE);
  return `<svg viewBox="0 0 120 120" width="120" height="120" aria-label="Speedometer">`
    + `<circle cx="60" cy="60" r="57" fill="#0f141b" stroke="rgba(255,255,255,.14)" stroke-width="1.5"/>`
    + `<path d="${track}" fill="none" stroke="#2a3440" stroke-width="8" stroke-linecap="round"/>`
    + `<path d="${redline}" fill="none" stroke="#ff2222" stroke-width="8" stroke-linecap="round" opacity="0.85"/>`
    + `<path id="speed-arc" d="" fill="none" stroke="#ffd76a" stroke-width="8" stroke-linecap="round"/>`
    + `<circle id="speed-marker" cx="60" cy="60" r="5" fill="#ffd76a" opacity="0"/>`
    + `<text id="speed-num" x="60" y="76" fill="#ffffff" font-size="30" font-weight="800" text-anchor="middle">0</text>`
    + `<text x="60" y="94" fill="#cfd6dd" font-size="10" font-weight="600" text-anchor="middle">km/h</text>`
    + `</svg>`;
}

const WEAPON_ICONS = {
  pistol: '<svg viewBox="0 0 40 24" fill="currentColor"><path d="M8 6h28v6H24l-3 10h-6l3-10H8z"/></svg>',
  shotgun: '<svg viewBox="0 0 40 24" fill="currentColor"><rect x="2" y="7" width="36" height="3.5" rx="1"/><rect x="16" y="10.5" width="10" height="4" rx="1"/><rect x="2" y="10.5" width="8" height="5" rx="1"/><path d="M2 15h8l-4 6H2z"/></svg>',
  smg: '<svg viewBox="0 0 40 24" fill="currentColor"><rect x="8" y="7" width="24" height="4" rx="1"/><rect x="8" y="11" width="6" height="5" rx="1"/><rect x="16" y="11" width="4" height="9" rx="1"/><path d="M8 16h6l-4 5H6z"/><rect x="30" y="6" width="4" height="3" rx="1"/></svg>',
  rifle: '<svg viewBox="0 0 40 24" fill="currentColor"><rect x="2" y="8" width="36" height="3" rx="1"/><rect x="14" y="4" width="8" height="3" rx="1"/><rect x="4" y="11" width="8" height="5" rx="1"/><rect x="12" y="11" width="4" height="8" rx="1"/><path d="M4 16h8l-4 5H4z"/></svg>',
  knife: '<svg viewBox="0 0 40 24" fill="currentColor"><path d="M9 10l28 2-28 2z"/><rect x="2" y="10" width="7" height="4" rx="1.5"/><rect x="8" y="8.5" width="1.8" height="7" rx="0.8"/></svg>',
};

export function createHud(document) {
  // Grab every element by id in one pass instead of a long list of
  // individual lookups; the ids are the contract with index.html.
  const ids = [
    'cash', 'health-fill', 'health-text', 'armor-wrap', 'armor-fill', 'armor-text', 'stars', 'objective',
    'objective-title', 'objective-text', 'job-count', 'mission-timer',
    'toast', 'prompt', 'speed', 'crosshair', 'ammo', 'weapon-bar',
    'radio', 'respect', 'clock', 'nos-row', 'nos-fill', 'car-health-row',
    'car-health-fill', 'minimap', 'menu', 'menu-title', 'menu-text',
    'menu-buttons', 'menu-settings',
  ];
  const el = {};
  for (const id of ids) el[id] = document.getElementById(id);
  const mapCtx = el.minimap.getContext('2d');

  // `seen` remembers what the DOM already shows, so update() only writes
  // what actually changed instead of touching every node every frame.
  const seen = {
    cash: null, stars: null, ammo: null, weaponName: null,
    weaponBar: null, weaponBarHtml: null, radio: null, respect: null, clock: null, jobCount: null,
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

  // The weapon bar: one slot per weapon — key number, silhouette icon,
  // name and ammo. The active slot is highlighted; an unowned weapon
  // shows a dimmed icon and '???'. The bar is HTML (not text) so the
  // icons render; it only re-renders when the HTML actually changes.
  function renderWeaponBar(weapons) {
    if (!weapons) return;
    const slots = [];
    for (let i = 0; i < weapons.length; i += 1) {
      const w = weapons[i];
      const icon = WEAPON_ICONS[w.id] || '';
      const label = w.owned ? w.name : '???';
      const ammo = w.owned ? (w.ammo === Infinity ? '∞' : String(w.ammo)) : '-';
      const cls = `wslot${w.active ? ' active' : ''}${w.owned ? '' : ' locked'}`;
      slots.push(`<span class="${cls}"><span class="wkey">${i + 1}</span><span class="wicon">${icon}</span><span class="wname">${label}</span><span class="wammo">${ammo}</span></span>`);
    }
    const html = slots.join('');
    if (seen.weaponBarHtml !== html) {
      seen.weaponBarHtml = html;
      el['weapon-bar'].innerHTML = html;
      el['weapon-bar'].style.opacity = '1';
    }
  }

  function drawMinimap(state) {
    const size = el.minimap.width;
    // Zoomed in on the player (GTA-style): the map shows a ~180 m window
    // around Jules instead of the whole city, so nearby streets, traffic
    // and the player arrow read at a glance. The dial itself stays 180 px
    // across; only the zoom and the centring change.
    const span = 180;
    const scale = size / span;
    // World (x, z) -> canvas (px, py). The map is centred on the player.
    const cx = state.playerX;
    const cz = state.playerZ;
    function project(x, z) {
      return [size / 2 + (x - cx) * scale, size / 2 + (z - cz) * scale];
    }
    // Circular minimap (GTA-style): clip every draw to a circle so the
    // map reads as a round dial, not a square box. The canvas element
    // itself is border-radius: 50% in index.html, so the frame is a
    // circle too; this clip keeps the map content inside it. The dial
    // stays 180 px across; only the shape changes, never the zoom or
    // the centring.
    mapCtx.save();
    mapCtx.beginPath();
    mapCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    mapCtx.clip();
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
    // The curved coastal road along the beach, as a polyline.
    mapCtx.strokeStyle = '#5a636e';
    mapCtx.lineWidth = 5;
    mapCtx.beginPath();
    for (let x = -CITY.halfSize; x <= CITY.halfSize; x += 10) {
      const p = project(x, coastalRoadZ(x));
      if (x === -CITY.halfSize) mapCtx.moveTo(p[0], p[1]);
      else mapCtx.lineTo(p[0], p[1]);
    }
    mapCtx.stroke();
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
    // The player: a white arrow rotated to the heading. The arrow is drawn
    // pointing up (-y), and world heading h points at (sin h, cos h) on the
    // map, so the rotation is PI - h.
    const pp = project(state.playerX, state.playerZ);
    mapCtx.save();
    mapCtx.translate(pp[0], pp[1]);
    mapCtx.rotate(Math.PI - state.heading);
    poly([[0, -6], [4.5, 5], [-4.5, 5]], '#ffffff');
    mapCtx.restore();
    // The mission marker, drawn AFTER the player arrow so it reads on top
    // of it instead of under it.
    if (state.mission) {
      const dx = state.mission.x - cx;
      const dz = state.mission.z - cz;
      const dist = Math.hypot(dx, dz);
      const pulse = 6 + Math.sin(performance.now() * 0.006) * 1;
      // The marker must read in a JPEG still, not just on a live
      // screen: the old pulse (4 +/- 1.5) shrank the diamond to a
      // ~5 px speck at its minimum, which JPEG at quality 82 smeared
      // into a pale smudge — the 3-chase still showed zero gold
      // pixels even though the canvas held the marker. A 6 px base
      // (5-7 through the pulse) plus the white ring reads at any
      // phase.
      // GTA-style off-screen objective: when the target is beyond the
      // dial, clamp the marker to the circle's edge and point an arrow
      // out toward it, so the objective always has a minimap presence
      // instead of vanishing past the 90 m radius. The zoom (span 180,
      // player-centred) never changes — only the marker is clamped.
      if (dist * scale > 78) {
        const ux = dx / (dist || 1);
        const uz = dz / (dist || 1);
        const ex = size / 2 + ux * 74;
        const ey = size / 2 + uz * 74;
        drawDiamond(ex, ey, 7, '#ffc861');
        drawRing(ex, ey, 10, '#ffffff', 1.5);
        // Arrow at the rim, tip at r=88 (inside the r=90 clip), base
        // at r=79, pointing outward along the objective bearing.
        poly([
          [size / 2 + ux * 88, size / 2 + uz * 88],
          [size / 2 + ux * 79 - uz * 4.5, size / 2 + uz * 79 + ux * 4.5],
          [size / 2 + ux * 79 + uz * 4.5, size / 2 + uz * 79 - ux * 4.5],
        ], '#ffc861');
      } else {
        // GAP 1 (round 6) — a very close objective (2-mission: the
        // target is 8 m away, ~8 px on the dial) lands almost on top
        // of the player arrow and gets half-hidden under it. Enforce a
        // minimum on-screen separation: push the diamond out along the
        // bearing to at least 15 px from the centre, so it reads as a
        // distinct gold marker just outside the arrow instead of a dot
        // tucked under it — and give it the white ring so it stands
        // off the arrow. The zoom/span never change and the objective
        // never moves; only the marker's drawn position is nudged.
        let mx = state.mission.x;
        let mz = state.mission.z;
        const r = dist * scale;
        const minSep = 15;
        if (r < minSep && dist > 0) {
          mx = cx + (dx / dist) * (minSep / scale);
          mz = cz + (dz / dist) * (minSep / scale);
        }
        const p = project(mx, mz);
        drawDiamond(p[0], p[1], pulse, '#ffc861');
        // Near the rim the diamond is easy to miss against the streets,
        // so give it a white ring once it is past 55 m out — and always
        // when the minimum separation was applied, so a close diamond
        // stands off the player arrow.
        if (dist * scale > 55 || r < minSep) drawRing(p[0], p[1], pulse + 3, '#ffffff', 1.5);
      }
    }
    mapCtx.restore(); // release the circular clip
    // North: one bold white "N" at 12 o'clock, just inside the rim. The
    // map is north-up and never rotates, so the N stays fixed at the top
    // while only the player arrow turns. Drawn after the clip is
    // released so it is never cut, and with a dark outline so it reads
    // over streets, sea or a rim marker in a JPEG still.
    mapCtx.font = '900 17px system-ui, sans-serif';
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';
    mapCtx.lineWidth = 4;
    mapCtx.strokeStyle = 'rgba(10, 16, 24, 0.9)';
    mapCtx.strokeText('N', size / 2, 13);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.fillText('N', size / 2, 13);
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
    // The speedometer gauge (NFS-style): a sweeping arc that fills
    // with speed, a marker dot on the arc's leading edge, and a big
    // digital number in the centre. All three are driven by the same
    // kmh value, so they always agree. The arc turns red in the
    // redline zone (above 180 km/h).
    setSpeed(kmh) {
      if (kmh === null) { el.speed.style.opacity = '0'; return; }
      if (!el.speed.querySelector('#speed-arc')) {
        el.speed.innerHTML = speedGaugeSvg();
      }
      el.speed.style.opacity = '1';
      const rounded = Math.round(kmh);
      const angle = speedAngle(rounded);
      const inRedline = rounded >= SPEED_REDLINE;
      const arc = el.speed.querySelector('#speed-arc');
      const marker = el.speed.querySelector('#speed-marker');
      const num = el.speed.querySelector('#speed-num');
      if (arc) {
        arc.setAttribute('d', rounded <= 0 ? '' : arcPath(60, 60, 50, SPEED_MIN_ANGLE, angle));
        arc.setAttribute('stroke', inRedline ? '#ff3333' : '#ffd76a');
      }
      if (marker) {
        if (rounded <= 0) {
          marker.setAttribute('opacity', '0');
        } else {
          const a = (angle * Math.PI) / 180;
          marker.setAttribute('cx', (60 + 50 * Math.sin(a)).toFixed(1));
          marker.setAttribute('cy', (60 - 50 * Math.cos(a)).toFixed(1));
          marker.setAttribute('fill', inRedline ? '#ff3333' : '#ffd76a');
          marker.setAttribute('opacity', '1');
        }
      }
      if (num) num.textContent = String(rounded);
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
      el['menu-settings'].innerHTML = '';
      for (const button of buttons) {
        const node = document.createElement('button');
        node.textContent = button.label;
        node.addEventListener('click', button.onClick);
        el['menu-buttons'].appendChild(node);
      }
      // The title screen gets its own look; the settings menu shares it;
      // every other menu (pause, BUSTED/WASTED, shops) keeps the plain
      // dark overlay.
      el.menu.classList.toggle('is-title', title === 'SOLMARINA');
      el.menu.classList.toggle('is-settings', title === 'SETTINGS');
      el.menu.style.display = 'flex';
    },
    hideMenu() {
      el['menu-settings'].innerHTML = '';
      el.menu.style.display = 'none';
    },
    // The settings rows (sliders, toggles) live in #menu-settings, which
    // showMenu clears on every menu open so a stale row never survives.
    settingsRoot() { return el['menu-settings']; },
    // The title screen hides every HUD element (cash, health, stars,
    // minimap, weapon bar, …) and the footer credit, so the menu sits
    // clean over the cinematic backdrop. Starting the game shows them
    // again; the CSS (body.title-screen) does the hiding, so it holds
    // no matter what update() last wrote.
    setTitleMode(on) { document.body.classList.toggle('title-screen', on); },
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
      // The armor bar (GTA SA style): the bulletproof vest, as a
      // percentage of a full vest. Empty and dimmed when Jules has
      // no vest, full and bright when he does.
      const armorPct = Math.max(0, Math.min(100, Math.round(((state.vest || 0) / PLAYER.vestArmor) * 100)));
      el['armor-fill'].style.width = `${armorPct}%`;
      el['armor-text'].textContent = `${armorPct}`;
      el['armor-wrap'].style.opacity = armorPct > 0 ? '1' : '0.4';
      const starsText = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
      if (setText(el.stars, 'stars', starsText)) {
        el.stars.style.color = state.wanted > 0 ? '#ffcf3f' : '#8899aa';
        // The stars pulse while the PD is after Jules.
        el.stars.classList.toggle('hot', state.wanted > 0);
      }
      const ammoText = state.ammo === Infinity
        ? `${state.weaponName || 'Knife'} — Melee (no ammo)`
        : `${state.weaponName || 'Pistol'} — Ammo ${state.ammo} / ${state.magSize || 12}`;
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
      // The clock: the time of day and the phase, from the day/night cycle.
      if (setText(el.clock, 'clock', state.clock || '')) {
        el.clock.style.opacity = state.clock ? '1' : '0';
      }
      drawMinimap(state);
    },
  };
}
