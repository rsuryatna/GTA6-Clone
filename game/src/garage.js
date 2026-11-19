// The safehouse garage at the Palm Heights hideout: one parking slot for
// a stolen car, and two upgrades for whatever Jules is driving — NOS boost
// (hold Shift) and armour plating that takes the sting out of police rams.
// A stored car waits in the garage until Jules takes it out again; the
// garage remembers it across saves.

import { GARAGE, RESPECT } from './config.js';

export function createGarage() {
  // stored: null, or the colour (a hex number) of the car in the garage.
  let stored = null;
  let nos = false;
  let armor = false;

  function inZone(x, z) {
    return Math.hypot(x - GARAGE.x, z - GARAGE.z) < GARAGE.radius;
  }

  return {
    spot: { x: GARAGE.x, z: GARAGE.z, radius: GARAGE.radius },
    inZone,
    hasStored() { return stored !== null; },
    storedColor() { return stored; },
    store(color) {
      stored = color;
    },
    takeOut() {
      // Only the colour is kept: the car itself is rebuilt when Jules takes it out.
      const color = stored;
      stored = null;
      return color;
    },
    hasNos() { return nos; },
    hasArmor() { return armor; },
    buyNos() {
      if (nos) return false;
      nos = true;
      return true;
    },
    buyArmor() {
      if (armor) return false;
      armor = true;
      return true;
    },
    // The price of an upgrade, with the Respected-rank discount applied.
    price(base, respect) {
      if (respect >= RESPECT.discountAt) return Math.round(base * (1 - RESPECT.discount));
      return base;
    },
    getState() {
      return { stored, nos, armor };
    },
    setState(data) {
      // No data (a fresh game) empties the garage and its upgrades.
      if (!data) {
        stored = null;
        nos = false;
        armor = false;
        return;
      }
      stored = typeof data.stored === 'number' ? data.stored : null;
      nos = data.nos === true;
      armor = data.armor === true;
    },
  };
}
