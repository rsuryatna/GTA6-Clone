// SOLMARINA — shops.js
// One job: the shops of Solmarina. Each shop is a place in the city with a
// sign, a marker and a menu: food that heals, clothes that change Jules's
// look, and a gun shop that sells the pistol and ammo. Buying costs cash.

const THREE = window.THREE;

export const SHOP_STOCK = {
  food: [
    { name: 'Marina taco', price: 12, heal: 20, desc: 'Fish, lime, attitude.' },
    { name: 'Palm Row coffee', price: 8, heal: 8, desc: 'Hot, strong, gone in seconds.' },
    { name: 'Beach burger', price: 18, heal: 35, desc: 'Two patties, one sunset.' },
  ],
  clothes: [
    { name: 'Harbour jacket', price: 150, shirt: 0x274156, desc: 'Navy, sharp, waterproof-ish.' },
    { name: 'Sunset shirt', price: 90, shirt: 0xe08a2e, desc: 'Loud enough to be seen from the marina.' },
    { name: 'Old Town tee', price: 45, shirt: 0xffffff, desc: 'Plain white, always in style.' },
  ],
  guns: [
    { name: 'Pistol', price: 400, ammo: 24, desc: 'A harbour classic. Loud.' },
    { name: 'Ammo box (48)', price: 120, ammo: 48, desc: 'For when the night gets long.' },
  ],
};

export function createShops(scene, world, rng, player, combat, hud) {
  // The HUD is created after the shops (circular wiring), so keep the
  // reference mutable and let main.js hand it over with setHud().
  let hudRef = hud;
  const shops = [];
  const spots = [
    { kind: 'food', x: world.roadCentersX[2] + 20, z: world.roadCentersZ[2] + 20, sign: 'TACO MARINA', color: 0xe4572e },
    { kind: 'clothes', x: world.roadCentersX[4] - 20, z: world.roadCentersZ[3] - 20, sign: 'PALM THREADS', color: 0x2e86ab },
    { kind: 'guns', x: world.roadCentersX[1] + 20, z: world.roadCentersZ[4] + 20, sign: 'HARBOUR ARMS', color: 0x222831 },
    { kind: 'food', x: world.roadCentersX[5] - 20, z: world.roadCentersZ[1] - 20, sign: 'BEACH BITES', color: 0xef476f },
  ];
  for (const s of spots) {
    const group = new THREE.Group();
    group.position.set(s.x, 0, s.z);
    // Shopfront: a bright box with a big sign board.
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(12, 6, 10),
      new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.8 }),
    );
    front.position.y = 3;
    front.castShadow = true;
    group.add(front);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(11, 1.6, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }),
    );
    sign.position.set(0, 5.6, 5.2);
    group.add(sign);
    // The sign text, drawn on a canvas so it reads from the street.
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#111111';
    g2.fillRect(0, 0, 512, 64);
    g2.fillStyle = '#ffd54f';
    g2.font = 'bold 36px Arial, sans-serif';
    g2.textAlign = 'center';
    g2.fillText(s.sign, 256, 46);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const signFace = new THREE.Mesh(
      new THREE.PlaneGeometry(10.6, 1.35),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    signFace.position.set(0, 5.6, 5.42);
    group.add(signFace);
    // Awning and door.
    const awn = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.25, 3.4),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 }),
    );
    awn.position.set(0, 3.6, 6.2);
    awn.rotation.x = 0.3;
    group.add(awn);
    scene.add(group);
    shops.push({ ...s, group });
  }

  return {
    shops,
    nearest() {
      let best = null;
      let bestD = 9;
      for (const s of shops) {
        const d = Math.hypot(s.x - player.position.x, s.z - player.position.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    },
    buy(shop, item) {
      if (!shop || !item) return { ok: false, reason: 'Nothing to buy.' };
      if (player.cash < item.price) return { ok: false, reason: 'Not enough cash.' };
      player.cash -= item.price;
      if (shop.kind === 'food') player.heal(item.heal || 0);
      if (shop.kind === 'guns' && combat) combat.giveGun(item.ammo || 0);
      if (shop.kind === 'clothes' && item.shirt !== undefined) {
        // Recolour Jules's shirt on the spot.
        player.body.group.traverse((o) => {
          if (o.isMesh && o.material && o.geometry && o.geometry.parameters
            && o.geometry.parameters.width === 0.5 && o.position.y === 1.18) {
            o.material = new THREE.MeshStandardMaterial({ color: item.shirt, roughness: 0.85 });
          }
        });
      }
      if (hudRef) hudRef.toast(`Bought ${item.name} for $${item.price}`);
      return { ok: true, item };
    },
    setHud(h) {
      hudRef = h;
    },
    stockFor(kind) {
      return SHOP_STOCK[kind] || [];
    },
    // The shop's sign text, for the HUD prompt ("Press E — TACO MARINA").
    signFor(shop) {
      return shop ? shop.sign : '';
    },
  };
}
