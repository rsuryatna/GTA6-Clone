// Ammu-Nation, the gun shop downtown: walk in on foot, press E, and buy
// what the law would not approve of. The shop sells the three locked
// weapons, ammo refills, a full heal and a bulletproof vest; the better
// weapons need the reputation rank to match. The shop itself never touches
// the game state — main.js checks the cash and the respect and calls these
// price lists.

import { AMMO_PRICE, HEALTH_PRICE, SHOP, VEST_PRICE, WEAPONS } from './config.js';

export function createShop() {
  const radiusSquared = SHOP.radius * SHOP.radius;

  // Every item the shop can sell, with its price and the respect it needs.
  function stockList() {
    // The pistol and the knife are never listed: Jules starts with both
    // and neither has a price.
    const weapons = WEAPONS.filter((weapon) => weapon.id !== 'pistol' && weapon.id !== 'knife').map((weapon) => ({
      kind: 'weapon',
      id: weapon.id,
      name: weapon.name,
      price: weapon.price,
      respect: weapon.respect,
    }));
    const consumables = [
      { kind: 'ammo', id: 'ammo', name: 'Ammo refill (all weapons)', price: AMMO_PRICE, respect: 0 },
      { kind: 'health', id: 'health', name: 'Full heal', price: HEALTH_PRICE, respect: 0 },
      { kind: 'vest', id: 'vest', name: 'Bulletproof vest', price: VEST_PRICE, respect: 0 },
    ];
    return weapons.concat(consumables);
  }

  return {
    spot: { x: SHOP.x, z: SHOP.z, radius: SHOP.radius },
    inZone(x, z) {
      const dx = x - SHOP.x;
      const dz = z - SHOP.z;
      return dx * dx + dz * dz < radiusSquared;
    },
    items: stockList,
  };
}
