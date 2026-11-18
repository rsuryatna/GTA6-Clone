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

  // A slow two-chord pad with a walking bassline, scheduled in 8th notes.
  const BASS_LINE = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  const PAD_CHORDS = [[110, 130.81, 164.81], [87.31, 110, 130.81]];
  let musicStep = 0;
  let musicInterval = null;

  function startMusic() {
    if (!ensure() || musicOn || muted) return;
    musicOn = true;
    musicNodes = [];
    const padGain = context.createGain();
    padGain.gain.value = 0.05;
    padGain.connect(master);
    for (const chord of PAD_CHORDS) {
      for (const freq of chord) {
        const osc = context.createOscillator();
        osc.type = 'sawtooth';
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
      const freq = BASS_LINE[musicStep % BASS_LINE.length];
      musicStep += 1;
      blip(freq, 0.22, 'triangle', 0.16);
      if (musicStep % 2 === 0) noiseHit(0.05, 0.05, 6000);
    }, 230);
  }

  function stopMusic() {
    musicOn = false;
    if (musicInterval !== null) window.clearInterval(musicInterval);
    musicInterval = null;
    if (musicNodes) for (const osc of musicNodes) { try { osc.stop(); } catch { /* already stopped */ } }
    musicNodes = null;
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
