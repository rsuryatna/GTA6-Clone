// SOLMARINA live sound kit. Nothing here is a recording: every engine
// growl, gunshot, siren wail and radio tune is built at run time out of
// Web Audio oscillators and shaped noise, then mixed through one master
// bus. The game never ships an audio file.

export function createAudio() {
  // One mutable bundle holds the whole graph so the helpers below can stay
  // small and stateless. `ctx` starts null and is only built from a user
  // gesture, because browsers refuse audio before the player interacts.
  const rig = {
    ctx: null,
    master: null,
    muted: false,
    noiseBuf: null,
    drive: null,
    wail: null,
    radio: null,
  };

  // MIDI note number -> frequency in Hz. Stations are written as note
  // numbers instead of raw frequencies, which keeps the patterns readable
  // and far shorter than frequency tables.
  function hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function acquire() {
    if (rig.ctx) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      rig.ctx = new Ctor();
      rig.master = rig.ctx.createGain();
      rig.master.gain.value = 0.5;
      rig.master.connect(rig.ctx.destination);
    } catch (err) {
      return false;
    }
    return true;
  }

  function now() {
    return rig.ctx.currentTime;
  }

  // One reusable second of white noise, generated lazily and shared by
  // every burst so gunshots and surf never pay the allocation cost twice.
  function sharedNoise() {
    if (rig.noiseBuf) return rig.noiseBuf;
    const len = rig.ctx.sampleRate;
    const buf = rig.ctx.createBuffer(1, len, rig.ctx.sampleRate);
    const chan = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) chan[i] = Math.random() * 2 - 1;
    rig.noiseBuf = buf;
    return buf;
  }

  // The single voice builder everything else is made from: an oscillator
  // with an attack-free exponential decay envelope, optionally gliding to
  // a second pitch, optionally routed through a lowpass filter.
  function voice(spec) {
    if (!acquire() || rig.muted) return null;
    const t0 = now() + (spec.delay || 0);
    const osc = rig.ctx.createOscillator();
    osc.type = spec.type || 'sine';
    osc.frequency.setValueAtTime(hz(spec.note), t0);
    if (spec.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(hz(spec.glideTo), t0 + spec.dur);
    }
    const env = rig.ctx.createGain();
    env.gain.setValueAtTime(spec.vol || 0.12, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + spec.dur);
    let tail = osc;
    if (spec.cutoff) {
      const filt = rig.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = spec.cutoff;
      osc.connect(filt);
      tail = filt;
    }
    tail.connect(env);
    env.connect(spec.dest || rig.master);
    osc.start(t0);
    osc.stop(t0 + spec.dur + 0.05);
    return osc;
  }

  // Filtered noise with a decay envelope: the raw material for shots,
  // explosions, tyre squeal and the NOS whoosh.
  function burst(spec) {
    if (!acquire() || rig.muted) return;
    const t0 = now() + (spec.delay || 0);
    const src = rig.ctx.createBufferSource();
    src.buffer = sharedNoise();
    src.loop = true;
    const filt = rig.ctx.createBiquadFilter();
    filt.type = spec.filterType || 'lowpass';
    filt.frequency.value = spec.cutoff || 3000;
    const env = rig.ctx.createGain();
    env.gain.setValueAtTime(spec.vol || 0.2, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + spec.dur);
    src.connect(filt);
    filt.connect(env);
    env.connect(rig.master);
    src.start(t0);
    src.stop(t0 + spec.dur + 0.05);
  }

  // A short melody: a list of [midiNote, delaySeconds, lengthSeconds].
  // Each step is a separate voice so the timing stays exact.
  function jingle(steps, type, vol) {
    for (const step of steps) {
      voice({ note: step[0], delay: step[1], dur: step[2], type, vol });
    }
  }

  // ---- the car radio -------------------------------------------------
  // Four stations, each described as a step pattern over a shared clock.
  // `bass` walks a low line, `lead` answers above it, `chord` holds the
  // pad underneath, and `talk` stations swap the lead for a chatter of
  // short syllable blips over a slow bass.
  const STATIONS = [
    {
      name: 'wave',
      bass: [33, 33, 36, 31, 33, 40, 38, 36],
      lead: [null, null, null, null, null, null, null, null],
      chord: [45, 48, 52],
      wave: 'sawtooth',
      stepMs: 230,
      padVol: 0.05,
      talk: false,
    },
    {
      name: 'sol',
      bass: [36, 36, 40, 43, 36, 38, 40, 43],
      lead: [72, 76, 79, 76, 79, 76, 72, 67],
      chord: [48, 52, 55],
      wave: 'triangle',
      stepMs: 180,
      padVol: 0.06,
      talk: false,
    },
    {
      name: 'talk',
      bass: [31, 31, 31, 31, 34, 34, 31, 29],
      lead: [null, null, null, null, null, null, null, null],
      chord: [45, 48],
      wave: 'sine',
      stepMs: 320,
      padVol: 0.04,
      talk: true,
    },
    {
      name: 'calypso',
      bass: [34, 36, 38, 36, 34, 31, 34, 36],
      lead: [74, 78, 81, 78, 74, 71, 74, 78],
      chord: [46, 50, 53],
      wave: 'triangle',
      stepMs: 150,
      padVol: 0.06,
      talk: false,
    },
  ];

  function killRadio() {
    const r = rig.radio;
    if (!r) return;
    rig.radio = null;
    if (r.timer !== null) window.clearInterval(r.timer);
    for (const osc of r.pad) {
      try { osc.stop(); } catch (err) { /* voice already ended */ }
    }
    if (r.padBus) {
      try { r.padBus.disconnect(); } catch (err) { /* already gone */ }
    }
  }

  function tuneRadio(index) {
    if (!acquire() || rig.muted) return;
    killRadio();
    const def = STATIONS[((index % STATIONS.length) + STATIONS.length) % STATIONS.length];
    const padBus = rig.ctx.createGain();
    padBus.gain.value = def.padVol;
    padBus.connect(rig.master);
    const pad = [];
    // The pad is a chord of slightly detuned pairs: two oscillators per
    // tone, one a few cents sharp, so the station hums instead of droning.
    for (const midiNote of def.chord) {
      for (const cents of [-6, 6]) {
        const osc = rig.ctx.createOscillator();
        osc.type = def.wave;
        osc.frequency.value = hz(midiNote);
        osc.detune.value = cents;
        const filt = rig.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 900;
        osc.connect(filt);
        filt.connect(padBus);
        osc.start();
        pad.push(osc);
      }
    }
    const seq = { timer: null, pad, padBus, step: 0, def };
    seq.timer = window.setInterval(() => {
      if (rig.muted || rig.radio !== seq) return;
      const slot = seq.step % def.bass.length;
      if (def.talk) {
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i += 1) {
          voice({ note: 50 + Math.floor(Math.random() * 8), delay: i * 0.09, dur: 0.07, type: 'square', vol: 0.05 });
        }
        voice({ note: def.bass[slot], dur: 0.22, type: 'triangle', vol: 0.1 });
      } else {
        voice({ note: def.bass[slot], dur: 0.22, type: 'triangle', vol: 0.16 });
        const leadNote = def.lead[slot];
        if (leadNote !== null && leadNote !== undefined) {
          voice({ note: leadNote, dur: 0.18, type: 'sine', vol: 0.1 });
        }
        if (seq.step % 2 === 0) {
          burst({ dur: 0.05, vol: 0.05, cutoff: 6000, filterType: 'highpass' });
        }
      }
      seq.step += 1;
    }, def.stepMs);
    rig.radio = seq;
  }

  // ---- the driven car ------------------------------------------------
  // Engine: a sawtooth growl plus a sub-octave sine, both pushed through
  // one lowpass whose cutoff opens as the car goes faster.
  function driveEngine(throttle, speed01) {
    if (!acquire() || rig.muted) return;
    if (!rig.drive) {
      const growl = rig.ctx.createOscillator();
      growl.type = 'sawtooth';
      const sub = rig.ctx.createOscillator();
      sub.type = 'sine';
      const filt = rig.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 500;
      const out = rig.ctx.createGain();
      out.gain.value = 0;
      growl.connect(filt);
      sub.connect(filt);
      filt.connect(out);
      out.connect(rig.master);
      growl.start();
      sub.start();
      rig.drive = { growl, sub, filt, out };
    }
    const d = rig.drive;
    const pitch = 40 + speed01 * 160 + throttle * 30;
    d.growl.frequency.setTargetAtTime(pitch, now(), 0.08);
    d.sub.frequency.setTargetAtTime(pitch / 2, now(), 0.08);
    d.filt.frequency.setTargetAtTime(350 + speed01 * 900, now(), 0.1);
    d.out.gain.setTargetAtTime(0.03 + throttle * 0.05 + speed01 * 0.02, now(), 0.1);
  }

  function cutEngine() {
    if (rig.drive) rig.drive.out.gain.setTargetAtTime(0, now(), 0.1);
  }

  // Police siren: one triangle voice whose pitch is swept by a slow LFO,
  // so the wail rises and falls instead of jumping between two notes.
  function policeSiren(on, dt) {
    if (!acquire() || rig.muted || !on) {
      if (rig.wail) rig.wail.out.gain.setTargetAtTime(0, now(), 0.1);
      return;
    }
    if (!rig.wail) {
      const toneOsc = rig.ctx.createOscillator();
      toneOsc.type = 'triangle';
      toneOsc.frequency.value = 770;
      const lfo = rig.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1.1;
      const depth = rig.ctx.createGain();
      depth.gain.value = 110;
      lfo.connect(depth);
      depth.connect(toneOsc.frequency);
      const out = rig.ctx.createGain();
      out.gain.value = 0;
      toneOsc.connect(out);
      out.connect(rig.master);
      toneOsc.start();
      lfo.start();
      rig.wail = { out };
    }
    rig.wail.out.gain.setTargetAtTime(0.045, now(), 0.1);
  }

  return {
    // Call from a user gesture (the Start button): browsers block audio
    // until the player has interacted with the page.
    unlock() {
      if (acquire() && rig.ctx.state === 'suspended') rig.ctx.resume();
      if (!rig.radio && !rig.muted) tuneRadio(0);
    },
    setMuted(value) {
      rig.muted = value;
      if (rig.master) rig.master.gain.value = rig.muted ? 0 : 0.5;
      if (rig.muted) killRadio();
      else if (rig.ctx && !rig.radio) tuneRadio(0);
    },
    isMuted() { return rig.muted; },
    stationCount() { return STATIONS.length; },
    startStation(index) { tuneRadio(index); },
    stopStation() { killRadio(); },
    beginStation() {
      if (!acquire() || rig.radio || rig.muted) return;
      tuneRadio(0);
    },
    // Public one-shot helpers the radio sequencer and the game share.
    noiseBurst(duration, volume, filterFreq) {
      burst({ dur: duration, vol: volume, cutoff: filterFreq });
    },
    bass(freq, dur) {
      if (!acquire() || rig.muted) return;
      const osc = rig.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const env = rig.ctx.createGain();
      const t0 = now();
      env.gain.setValueAtTime(0.16, t0);
      env.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.22));
      osc.connect(env);
      env.connect(rig.master);
      osc.start(t0);
      osc.stop(t0 + (dur || 0.22) + 0.05);
    },
    lead(freq, dur) {
      if (!acquire() || rig.muted) return;
      const osc = rig.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const env = rig.ctx.createGain();
      const t0 = now();
      env.gain.setValueAtTime(0.1, t0);
      env.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.18));
      osc.connect(env);
      env.connect(rig.master);
      osc.start(t0);
      osc.stop(t0 + (dur || 0.18) + 0.05);
    },
    chords(freqs, dur) {
      if (!acquire() || rig.muted) return;
      for (const freq of freqs) {
        const osc = rig.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        const env = rig.ctx.createGain();
        const t0 = now();
        env.gain.setValueAtTime(0.04, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 1.5));
        osc.connect(env);
        env.connect(rig.master);
        osc.start(t0);
        osc.stop(t0 + (dur || 1.5) + 0.05);
      }
    },
    // NOS boost: a rising whoosh as the boost kicks in.
    nos() {
      burst({ dur: 0.5, vol: 0.25, cutoff: 2400 });
      voice({ note: 57, glideTo: 81, dur: 0.45, type: 'sawtooth', vol: 0.12 });
    },
    click() { voice({ note: 76, dur: 0.06, type: 'square', vol: 0.08 }); },
    punch() {
      burst({ dur: 0.12, vol: 0.25, cutoff: 900 });
      voice({ note: 47, glideTo: 35, dur: 0.1, type: 'sine', vol: 0.2 });
    },
    shot() {
      burst({ dur: 0.18, vol: 0.4, cutoff: 3200 });
      voice({ note: 53, glideTo: 31, dur: 0.12, type: 'square', vol: 0.15 });
    },
    // A car going up: a deep boom, then a low rumble a beat later.
    explosion() {
      burst({ dur: 0.7, vol: 0.5, cutoff: 500 });
      voice({ note: 41, glideTo: 24, dur: 0.6, type: 'sine', vol: 0.4 });
      burst({ dur: 0.5, vol: 0.2, cutoff: 300, delay: 0.25 });
    },
    // Tyres sliding on asphalt: a short high hiss.
    screech() { burst({ dur: 0.25, vol: 0.14, cutoff: 5200, filterType: 'highpass' }); },
    // The car horn: two tones, H key.
    horn() {
      voice({ note: 66, dur: 0.18, type: 'square', vol: 0.1 });
      voice({ note: 70, dur: 0.18, type: 'square', vol: 0.1 });
    },
    pickup() { jingle([[81, 0, 0.09], [88, 0.09, 0.12]], 'sine', 0.14); },
    cash() { jingle([[84, 0, 0.1], [88, 0.09, 0.1], [91, 0.18, 0.16]], 'triangle', 0.16); },
    busted() {
      voice({ note: 67, glideTo: 55, dur: 0.3, type: 'sawtooth', vol: 0.18 });
      voice({ note: 55, glideTo: 43, dur: 0.5, type: 'sawtooth', vol: 0.18, delay: 0.05 });
    },
    wasted() { voice({ note: 57, glideTo: 43, dur: 0.4, type: 'sawtooth', vol: 0.2 }); },
    mission() { jingle([[72, 0, 0.12], [76, 0.11, 0.12], [79, 0.22, 0.2]], 'triangle', 0.16); },
    // Continuous engine hum: call every frame with 0..1 throttle and speed.
    engine: driveEngine,
    engineOff: cutEngine,
    // Two-tone police siren, toggled by the police system while wanted.
    siren: policeSiren,
  };
}
