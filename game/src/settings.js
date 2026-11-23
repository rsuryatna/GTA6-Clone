// SOLMARINA — settings.js
// One job: player-facing settings with safe defaults, persisted locally.
// Quality here only changes pixel ratio and crowd density, never the rules.

export const DEFAULT_SETTINGS = {
  quality: 'high', // low | medium | high
  musicVolume: 0.5,
  sfxVolume: 0.7,
  radioStation: 0,
  cameraDistance: 9,
  showMinimap: true,
  showHints: true,
  invertY: false,
};

const KEY = 'solmarina-settings-v1';

export function loadSettings() {
  const out = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return out;
    const saved = JSON.parse(raw);
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (saved[k] !== undefined) out[k] = saved[k];
    }
  } catch (err) {
    console.warn('settings: could not load saved settings', err);
  }
  return out;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('settings: could not save settings', err);
  }
}

export function pixelRatioFor(quality) {
  if (quality === 'low') return Math.min(window.devicePixelRatio || 1, 1);
  if (quality === 'medium') return Math.min(window.devicePixelRatio || 1, 1.5);
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function crowdScaleFor(quality) {
  if (quality === 'low') return 0.55;
  if (quality === 'medium') return 0.8;
  return 1;
}

// Clamp a volume slider into the range the audio engine expects.
export function clampVolume(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}
