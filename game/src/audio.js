// Synthesised sound for SOLMARINA: no audio files, everything is WebAudio.
// Engine hum, police siren, gunshots, punches, cash chimes and a light
// synthwave pad, all generated from oscillators and filtered noise.

export function createAudio() {
  let context = null;
  let master = null;
  let musicNodes = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;
  let musicOn = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  // White noise for gunshots and surf. Math.random is fine here — sound is
  // never part of the deterministic game state.
  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(frequency, duration, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration + 0.02);
  }

  function noiseHit(duration, volume, filterFreq) {
    if (!ensure() || muted) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  // The car radio: three stations of synthesised sound, each with its own
  // bass line, chords, tempo and voice. WAVE 98.5 is the synthwave pad the
  // game always had; SOL FM adds a bright lead line; TALK 101 is a
  // talk-show cadence of short syllables over a slow bass.
  const STATION_DEFS = [
    {
      bass: [55, 55, 65.41, 49, 55, 55, 82.41, 73.42],
      chords: [[110, 130.81, 164.81], [87.31, 110, 130.81]],
      tempo: 230, wave: 'sawtooth', pad: 0.05, lead: null, talk: false,
    },
    {
      bass: [65.41, 65.41, 82.41, 98, 65.41, 73.42, 82.41, 98],
      chords: [[130.81, 164.81, 196], [98, 123.47, 146.83]],
      tempo: 180, wave: 'triangle', pad: 0.06, lead: [523.25, 659.25, 783.99, 659.25, 783.99, 659.25, 523.25, 392], talk: false,
    },
    {
      bass: [49, 49, 49, 49, 58.27, 58.27, 49, 43.65],
      chords: [[110, 130.81], [98, 123.47]],
      tempo: 320, wave: 'sine', pad: 0.04, lead: null, talk: true,
    },
  ];
  let musicStep = 0;
  let musicInterval = null;

  function stopStation() {
    musicOn = false;
    if (musicInterval !== null) window.clearInterval(musicInterval);
    musicInterval = null;
    if (musicNodes) for (const osc of musicNodes) { try { osc.stop(); } catch { /* already stopped */ } }
    musicNodes = null;
  }

  function startStation(index) {
    if (!ensure() || muted) return;
    stopStation();
    const def = STATION_DEFS[index % STATION_DEFS.length];
    musicOn = true;
    musicNodes = [];
    const padGain = context.createGain();
    padGain.gain.value = def.pad;
    padGain.connect(master);
    for (const chord of def.chords) {
      for (const freq of chord) {
        const osc = context.createOscillator();
        osc.type = def.wave;
        osc.frequency.value = freq;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        osc.connect(filter);
        filter.connect(padGain);
        osc.start();
        musicNodes.push(osc);
      }
    }
    musicInterval = window.setInterval(() => {
      if (muted || !musicOn) return;
      if (def.talk) {
        // A talk-show cadence: two or three short syllables, then a pause,
        // over a slow bass note.
        const syllables = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < syllables; i += 1) {
          window.setTimeout(() => blip(120 + Math.random() * 90, 0.07, 'square', 0.05), i * 90);
        }
        blip(def.bass[musicStep % def.bass.length], 0.22, 'triangle', 0.1);
      } else {
        const freq = def.bass[musicStep % def.bass.length];
        musicStep += 1;
        blip(freq, 0.22, 'triangle', 0.16);
        if (def.lead) blip(def.lead[musicStep % def.lead.length], 0.18, 'sine', 0.1);
        if (musicStep % 2 === 0) noiseHit(0.05, 0.05, 6000);
      }
      musicStep += 1;
    }, def.tempo);
  }

  function startMusic() {
    if (!ensure() || musicOn || muted) return;
    startStation(0);
  }

  function stopMusic() {
    stopStation();
  }

  return {
    // Must be called from a user gesture (the Start button) — browsers block
    // audio before the player has interacted with the page.
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
      startMusic();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) stopMusic();
      else if (context) startMusic();
    },
    isMuted() { return muted; },
    // The car radio: switch stations (the radio module owns which one).
    startStation,
    stopStation,
    // NOS boost: a rising whoosh as the boost kicks in.
    nos() { noiseHit(0.5, 0.25, 2400); blip(220, 0.45, 'sawtooth', 0.12, 880); },
    click() { blip(660, 0.06, 'square', 0.08); },
    punch() { noiseHit(0.12, 0.25, 900); blip(120, 0.1, 'sine', 0.2, 60); },
    shot() { noiseHit(0.18, 0.4, 3200); blip(180, 0.12, 'square', 0.15, 50); },
    pickup() { blip(880, 0.09, 'sine', 0.14); window.setTimeout(() => blip(1318, 0.12, 'sine', 0.14), 90); },
    cash() {
      blip(1046, 0.1, 'triangle', 0.16);
      window.setTimeout(() => blip(1318, 0.1, 'triangle', 0.16), 90);
      window.setTimeout(() => blip(1568, 0.16, 'triangle', 0.16), 180);
    },
    busted() { blip(392, 0.3, 'sawtooth', 0.18, 196); blip(196, 0.5, 'sawtooth', 0.18, 98); },
    wasted() { blip(220, 0.4, 'sawtooth', 0.2, 55); },
    mission() {
      blip(523, 0.12, 'triangle', 0.16);
      window.setTimeout(() => blip(659, 0.12, 'triangle', 0.16), 110);
      window.setTimeout(() => blip(784, 0.2, 'triangle', 0.16), 220);
    },
    // Continuous engine hum: call every frame with 0..1 throttle and speed.
    engine(throttle, speed01) {
      if (!ensure() || muted) return;
      if (!engineOsc) {
        engineOsc = context.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = context.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 500;
        engineGain = context.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const target = 40 + speed01 * 160 + throttle * 30;
      engineOsc.frequency.setTargetAtTime(target, context.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.03 + throttle * 0.05 + speed01 * 0.02, context.currentTime, 0.1);
    },
    engineOff() {
      if (engineGain) engineGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
    },
    // Two-tone police siren, toggled by the police system while wanted.
    siren(on, dt) {
      if (!ensure() || muted || !on) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = context.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = context.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenTimer += dt;
      if (sirenTimer > 0.45) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setValueAtTime(sirenHigh ? 880 : 660, context.currentTime);
      }
      sirenGain.gain.setTargetAtTime(0.045, context.currentTime, 0.1);
    },
  };
}
