// The car radio: three switchable stations of synthesised music and talk,
// played only while Jules is driving. Q cycles the station; the radio
// starts on WAVE 98.5 whenever Jules gets in a car and stops when he gets
// out. The audio module owns the sound of each station — this module only
// owns which one is on.

export const STATIONS = [
  { id: 'wave', name: 'WAVE 98.5', desc: 'Synthwave' },
  { id: 'sol', name: 'SOL FM', desc: 'Sunset pop' },
  { id: 'talk', name: 'TALK 101', desc: 'Marina talk' },
];

export function createRadio(audio) {
  let station = 0;
  let on = false;

  return {
    // Called every frame with whether Jules is driving: the radio follows
    // the car, never the player on foot.
    update(driving) {
      if (driving && !on) {
        on = true;
        audio.startStation(station);
      } else if (!driving && on) {
        on = false;
        audio.stopStation();
      }
    },
    // Q cycles forward only; there is no previous-station key.
    cycle() {
      station = (station + 1) % STATIONS.length;
      if (on) audio.startStation(station);
      return STATIONS[station];
    },
    current() { return STATIONS[station]; },
    isOn() { return on; },
    setStation(index) {
      station = Math.max(0, Math.min(STATIONS.length - 1, index));
      if (on) audio.startStation(station);
      return STATIONS[station];
    },
    stop() {
      on = false;
      audio.stopStation();
    },
  };
}
