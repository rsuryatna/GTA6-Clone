// The safehouse garage at the Palm Heights hideout: one parking slot for
// a stolen car, and the upgrades for whatever Jules is driving — NOS boost
// (hold Shift), armour plating that takes the sting out of police rams, a
// fresh paint job for a stored car, and a repair bench for a dented one.
// A stored car waits in the garage until Jules takes it out again; the
// garage remembers it across saves.

import { GARAGE, RESPECT } from './config.js';

export function createGarage() {
  // Two small records instead of four loose variables: what is parked
  // (colour + how dented it was when it went in) and what is fitted.
  const parked = { color: null, health: null };
  const fitted = { nos: false, armor: false };

  function reset() {
    parked.color = null;
    parked.health = null;
    fitted.nos = false;
    fitted.armor = false;
  }

  function squaredDistance(x, z) {
    const dx = x - GARAGE.x;
    const dz = z - GARAGE.z;
    return dx * dx + dz * dz;
  }

  function install(slot) {
    if (fitted[slot]) return false;
    fitted[slot] = true;
    return true;
  }

  return {
    spot: { x: GARAGE.x, z: GARAGE.z, radius: GARAGE.radius },
    inZone(x, z) {
      return squaredDistance(x, z) < GARAGE.radius * GARAGE.radius;
    },
    hasStored() { return parked.color !== null; },
    storedColor() { return parked.color; },
    storedHealth() { return parked.health; },
    store(color, health) {
      parked.color = color;
      parked.health = typeof health === 'number' ? health : null;
    },
    takeOut() {
      // Only the colour is kept: the car itself is rebuilt when Jules takes it out.
      const color = parked.color;
      parked.color = null;
      parked.health = null;
      return color;
    },
    // The repair bench: the stored car back to full health.
    repairStored(maxHealth) {
      if (parked.color === null) return false;
      parked.health = maxHealth;
      return true;
    },
    hasNos() { return fitted.nos; },
    hasArmor() { return fitted.armor; },
    buyNos() { return install('nos'); },
    buyArmor() { return install('armor'); },
    // A fresh paint job for the stored car: pick a new colour and the car
    // comes out wearing it. No car stored, no paint.
    repaint(color) {
      if (parked.color === null) return false;
      parked.color = color;
      return true;
    },
    // The price of an upgrade, with the Respected-rank discount applied.
    price(base, respect) {
      if (respect < RESPECT.discountAt) return base;
      return Math.round(base * (1 - RESPECT.discount));
    },
    getState() {
      return { stored: parked.color, storedHealth: parked.health, nos: fitted.nos, armor: fitted.armor };
    },
    setState(data) {
      // No data (a fresh game) empties the garage and its upgrades.
      if (!data) {
        reset();
        return;
      }
      parked.color = typeof data.stored === 'number' ? data.stored : null;
      parked.health = typeof data.storedHealth === 'number' ? data.storedHealth : null;
      fitted.nos = data.nos === true;
      fitted.armor = data.armor === true;
    },
  };
}
