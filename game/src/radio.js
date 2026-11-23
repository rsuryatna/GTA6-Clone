// SOLMARINA — radio.js
// One job: the car radio. Three stations, each a loop of synthesized notes
// played through the audio engine — surf-pop, late-night jazz and a
// harbour bass station. No audio files, no network.

export const STATIONS = [
  {
    name: 'SOL FM — Surf Pop',
    desc: 'Bright guitars and sunshine choruses',
    bpm: 132,
    bass: [110, 110, 130.8, 98],
    lead: [440, 523.25, 659.25, 523.25, 587.33, 659.25, 783.99, 659.25],
  },
  {
    name: 'MARINA 88 — Late Jazz',
    desc: 'Slow keys for the drive home',
    bpm: 84,
    bass: [87.31, 103.83, 98, 82.41],
    lead: [220, 261.63, 329.63, 392, 329.63, 261.63, 246.94, 220],
  },
  {
    name: 'BASS HARBOUR',
    desc: 'Deep low end for the night avenues',
    bpm: 104,
    bass: [55, 55, 65.41, 49],
    lead: [330, 330, 392, 330, 294.66, 330, 370, 440],
  },
];

export function createRadio(audio, settings) {
  let step = 0;
  let stationIndex = settings.radioStation || 0;
  let playing = false;

  function station() {
    return STATIONS[stationIndex % STATIONS.length];
  }

  const radio = {
    stationIndex,
    name() {
      return station().name;
    },
    next() {
      stationIndex = (stationIndex + 1) % STATIONS.length;
      this.stationIndex = stationIndex;
      step = 0;
      return station().name;
    },
    start() {
      if (playing) return;
      playing = true;
      const st = station();
      const beatMs = 60000 / st.bpm / 2;
      audio.startMusicTimer(() => {
        if (!playing) return;
        const bassNote = st.bass[step % st.bass.length];
        audio.playNote(bassNote, beatMs / 1000 * 0.9, 'sine', 0.16);
        if (step % 2 === 0) {
          const leadNote = st.lead[(step / 2) % st.lead.length];
          audio.playNote(leadNote, beatMs / 1000 * 0.8, 'triangle', 0.09);
        }
        step += 1;
      }, beatMs);
    },
    stop() {
      playing = false;
      audio.stopMusicTimer();
    },
    toggle() {
      if (playing) this.stop();
      else this.start();
      return playing;
    },
    isPlaying() {
      return playing;
    },
    // The station's one-line blurb for the HUD toast.
    blurb() {
      return `${station().name} — ${station().desc}`;
    },
  };
  return radio;
}
