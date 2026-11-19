// Ammu-Nation, the gun shop downtown: walk in on foot, press E, and buy
// what the law would not approve of. The shop sells the three locked
// weapons, ammo refills and a full heal; the better weapons need the
// reputation rank to match. The shop itself never touches the game state —
// main.js checks the cash and the respect and calls these price lists.

import { AMMO_PRICE, HEALTH_PRICE, SHOP, WEAPONS } from './config.js';

export function createShop() {
  return {
    spot: { x: SHOP.x, z: SHOP.z, radius: SHOP.radius },
    inZone(x, z) {
      return Math.hypot(x - SHOP.x, z - SHOP.z) < SHOP.radius;
    },
    // Every item the shop can sell, with its price and the respect it needs.
    items() {
      // The pistol is never listed: Jules starts with it and it has no price.
      const list = [];
      for (const weapon of WEAPONS) {
        if (weapon.id === 'pistol') continue;
        list.push({ kind: 'weapon', id: weapon.id, name: weapon.name, price: weapon.price, respect: weapon.respect });
      }
      list.push({ kind: 'ammo', id: 'ammo', name: 'Ammo refill (all weapons)', price: AMMO_PRICE, respect: 0 });
      list.push({ kind: 'health', id: 'health', name: 'Full heal', price: HEALTH_PRICE, respect: 0 });
      return list;
    },
  };
}
