// SOLMARINA — audio.js
// One job: all sound, synthesized live with WebAudio — no audio files.
// Engine hum, siren wail, gunshots, footsteps, cash chimes and the radio
// music sequencer all come from oscillators and filtered noise.

export function createAudio(settings) {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that wails between two pitches.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      started = true;
      return true;
    } catch (err) {
      console.warn('audio: WebAudio unavailable', err);
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || !ctx) return;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ensure() || !ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  const audio = {
    started() {
      return started;
    },
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setEngine(ratio, speed) {
      if (!ensure() || !engineOsc) return;
      engineOsc.frequency.value = 55 + ratio * 165 + Math.abs(speed) * 0.4;
      engineGain.gain.value = speed !== 0 || ratio > 0 ? 0.05 + ratio * 0.05 : 0;
    },
    setSiren(on, wanted) {
      if (!ensure() || !sirenOsc) return;
      if (!on || wanted === 0) {
        sirenGain.gain.value = 0;
        return;
      }
      sirenGain.gain.value = 0.045 + wanted * 0.008;
      const t = ctx.currentTime;
      sirenOsc.frequency.setValueAtTime(680, t);
      sirenOsc.frequency.linearRampToValueAtTime(920, t + 0.45);
      sirenOsc.frequency.linearRampToValueAtTime(680, t + 0.9);
    },
    horn() {
      blip(370, 0.35, 'square', 0.16);
      blip(466, 0.35, 'square', 0.12);
    },
    gunshot() {
      noiseBurst(0.16, 0.5, 2400);
      blip(140, 0.1, 'square', 0.25, 60);
    },
    punch() {
      noiseBurst(0.09, 0.3, 500);
    },
    cash() {
      blip(880, 0.12, 'sine', 0.18);
      setTimeout(() => blip(1318, 0.18, 'sine', 0.18), 90);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.2), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.18), i * 130));
    },
    click() {
      blip(660, 0.06, 'square', 0.1);
    },
    footstep() {
      noiseBurst(0.05, 0.08, 300);
    },
    // A short two-note "wasted"-style sting for when Jules is busted.
    busted() {
      blip(220, 0.4, 'sawtooth', 0.14, 110);
      setTimeout(() => blip(165, 0.5, 'sawtooth', 0.14, 82), 200);
    },
    // A tiny chiptune sequencer for the radio: a bass line and a lead.
    playNote(freq, dur, type, vol) {
      blip(freq, dur, type || 'triangle', vol || 0.12);
    },
    setMusicVolume(v) {
      if (master) master.gain.value = 0.4 + v * 0.6;
    },
    stopMusicTimer() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    startMusicTimer(fn, ms) {
      this.stopMusicTimer();
      musicTimer = setInterval(fn, ms);
    },
  };
  return audio;
}
