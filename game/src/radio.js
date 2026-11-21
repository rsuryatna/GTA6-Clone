// The car radio: four switchable stations of synthesised music and talk,
// heard only while Jules is driving. Q moves to the next station; the radio
// tunes to WAVE 98.5 whenever Jules climbs into a car and falls silent when
// he steps out. The audio module owns how each station sounds — this module
// only owns which one is selected.

export const STATIONS = [
  { id: 'wave', name: 'WAVE 98.5', desc: 'Synthwave' },
  { id: 'sol', name: 'SOL FM', desc: 'Sunset pop' },
  { id: 'talk', name: 'TALK 101', desc: 'Marina talk' },
  { id: 'calypso', name: 'CALYPSO 102.3', desc: 'Island bounce' },
];

export function createRadio(audio) {
  // The tuned station is kept as the station record itself; the index is
  // derived from it whenever the audio module needs a number.
  let station = STATIONS[0];
  let audible = false;

  function stationIndex() {
    return STATIONS.indexOf(station);
  }

  function retune(next) {
    station = next;
    if (audible) audio.startStation(stationIndex());
    return station;
  }

  return {
    // Called every frame with whether Jules is driving: the radio follows
    // the car, never the player on foot.
    update(driving) {
      if (driving === audible) return;
      audible = driving;
      if (audible) audio.startStation(stationIndex());
      else audio.stopStation();
    },
    // Q steps forward only; there is no previous-station key.
    cycle() {
      const next = (stationIndex() + 1) % STATIONS.length;
      return retune(STATIONS[next]);
    },
    current() { return station; },
    isOn() { return audible; },
    stationCount() { return STATIONS.length; },
    setStation(index) {
      const clamped = Math.max(0, Math.min(STATIONS.length - 1, index));
      return retune(STATIONS[clamped]);
    },
    stop() {
      audible = false;
      audio.stopStation();
    },
  };
}
