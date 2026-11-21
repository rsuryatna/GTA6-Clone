// Visual effects for SOLMARINA: one pooled particle system.
// Tyre smoke when the NOS kicks in or the car slides, muzzle sparks when
// a gun fires, dust on the beach, and a proper fireball when a car blows
// up. A single THREE.Points draw call renders the whole pool, so the
// frame rate stays honest; particles are recycled, never allocated per
// frame. The game (main.js) owns when effects fire — this module only
// owns how they look and move.
//
// Live particles are tracked in a compact index list: each frame only
// the living ones are stepped, and a dead one is swapped out of the
// list in place. Each particle carries a position, a velocity, a
// remaining life, a size that can grow as it ages (smoke puffs up,
// sparks shrink), and a colour that fades out. A tiny shader draws each
// point as a soft round sprite with its own size and alpha.

import * as THREE from 'three';
import { FX } from './config.js';

// Kinds, with the look baked in: colour range, speed, lift, life and
// whether the sprite grows as it ages.
function kindDef(hues, speed, rise, span, radius, swell, pull, alpha) {
  return { hues, speed, rise, span, radius, swell, pull, alpha };
}

const KINDS = {
  smoke: kindDef([[0.45, 0.45, 0.48], [0.62, 0.62, 0.66]], [0.6, 1.6], [1.2, 2.4], [0.9, 1.4], [1.6, 2.6], 2.4, 0.4, 0.5),
  spark: kindDef([[1, 0.75, 0.2], [1, 0.45, 0.1]], [6, 14], [2, 6], [0.2, 0.35], [0.35, 0.6], -0.5, 9, 0.95),
  fire: kindDef([[1, 0.6, 0.1], [1, 0.25, 0.05]], [2, 6], [3, 7], [0.5, 0.9], [1.8, 3.2], 1.6, -2, 0.95),
  dust: kindDef([[0.85, 0.75, 0.55], [0.75, 0.65, 0.45]], [0.5, 1.4], [0.6, 1.4], [0.7, 1.1], [1.0, 1.8], 1.8, 0.2, 0.5),
  splash: kindDef([[0.75, 0.9, 0.95], [0.55, 0.75, 0.9]], [1, 3], [2, 5], [0.4, 0.7], [0.6, 1.1], 0.8, 7, 0.95),
};

const VERT_SRC = `
attribute vec3 aTint;
attribute float aRadius;
attribute float aFade;
varying vec3 vTint;
varying float vFade;
void main() {
  vTint = aTint;
  vFade = aFade;
  vec4 eye = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aRadius * (240.0 / max(1.0, -eye.z));
  gl_Position = projectionMatrix * eye;
}`;
const FRAG_SRC = `
varying vec3 vTint;
varying float vFade;
void main() {
  vec2 off = gl_PointCoord - vec2(0.5);
  float soft = smoothstep(0.5, 0.05, length(off));
  vec4 px = vec4(vTint, vFade * soft);
  if (px.a < 0.01) discard;
  gl_FragColor = px;
}`;

function pickInRange(range) {
  return range[0] + Math.random() * (range[1] - range[0]);
}

export function createFx(scene) {
  const max = FX.maxParticles;
  const pos = new Float32Array(max * 3);
  const tint = new Float32Array(max * 3);
  const radius = new Float32Array(max);
  const fade = new Float32Array(max);
  const vel = new Float32Array(max * 3);
  const left = new Float32Array(max);
  const total = new Float32Array(max);
  const base = new Float32Array(max);
  const swell = new Float32Array(max);
  const pull = new Float32Array(max);
  const startAlpha = new Float32Array(max);
  const alive = [];
  let cursor = 0;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  geometry.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
  geometry.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT_SRC,
    fragmentShader: FRAG_SRC,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  function spawn(kind, x, y, z, count) {
    const def = KINDS[kind] || KINDS.smoke;
    for (let n = 0; n < count; n += 1) {
      const i = cursor;
      cursor = (cursor + 1) % max;
      const i3 = i * 3;
      if (left[i] <= 0) alive.push(i);
      const angle = Math.random() * Math.PI * 2;
      const speed = pickInRange(def.speed);
      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      vel[i3] = Math.cos(angle) * speed;
      vel[i3 + 1] = pickInRange(def.rise);
      vel[i3 + 2] = Math.sin(angle) * speed;
      const hue = def.hues[Math.floor(Math.random() * def.hues.length)];
      tint[i3] = hue[0];
      tint[i3 + 1] = hue[1];
      tint[i3 + 2] = hue[2];
      total[i] = pickInRange(def.span);
      left[i] = total[i];
      base[i] = pickInRange(def.radius);
      radius[i] = base[i];
      swell[i] = def.swell;
      pull[i] = def.pull;
      startAlpha[i] = def.alpha;
      fade[i] = def.alpha;
    }
  }

  function tick(dt) {
    for (let a = alive.length - 1; a >= 0; a -= 1) {
      const i = alive[a];
      left[i] -= dt;
      if (left[i] <= 0) {
        fade[i] = 0;
        alive[a] = alive[alive.length - 1];
        alive.pop();
        continue;
      }
      const i3 = i * 3;
      vel[i3 + 1] -= pull[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      // Drag: smoke hangs in the air, sparks die fast.
      const damp = 1 - Math.min(0.9, dt * 1.5);
      vel[i3] *= damp;
      vel[i3 + 2] *= damp;
      const age = 1 - left[i] / total[i];
      radius[i] = Math.max(0.1, base[i] + swell[i] * age);
      fade[i] = startAlpha[i] * (1 - age * age);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aTint.needsUpdate = true;
    geometry.attributes.aRadius.needsUpdate = true;
    geometry.attributes.aFade.needsUpdate = true;
  }

  return {
    // One burst of one kind at a point.
    burst(kind, x, y, z, count) { spawn(kind, x, y, z, count); },
    // A car going up: fire, sparks and a long smoke column.
    explode(x, y, z) {
      spawn('fire', x, y + 0.8, z, 26);
      spawn('spark', x, y + 1, z, 18);
      spawn('smoke', x, y + 1.5, z, 14);
    },
    // Tyre smoke behind a boosting or sliding car.
    tyreSmoke(x, y, z) { spawn('smoke', x, y, z, 2); },
    // Sand kicked up on the beach.
    sandDust(x, y, z) { spawn('dust', x, y, z, 2); },
    update: tick,
    count() { return alive.length; },
  };
}
