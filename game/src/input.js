// SOLMARINA — input.js
// One job: keyboard and mouse state, exposed as a plain object the player,
// the camera and the menus all read from. No game logic lives here.

export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since the last consume
  let mouseDX = 0;
  let mouseDY = 0;
  let locked = false;

  const down = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  };
  const up = (e) => keys.delete(e.code);
  const move = (e) => {
    if (!locked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('mousemove', move);
  window.addEventListener('blur', () => keys.clear());

  return {
    keys,
    is(code) {
      return keys.has(code);
    },
    // True once for the frame after the key goes down.
    wasPressed(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    consumeMouse() {
      const d = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return d;
    },
    endFrame() {
      pressed.clear();
    },
    requestLock(canvas) {
      if (canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      }
    },
    setLocked(v) {
      locked = v;
    },
    get locked() {
      return locked;
    },
    // WASD / arrows as a -1..1 steering pair, for driving and walking alike.
    axis() {
      const x = (this.is('KeyD') || this.is('ArrowRight') ? 1 : 0)
        - (this.is('KeyA') || this.is('ArrowLeft') ? 1 : 0);
      const y = (this.is('KeyW') || this.is('ArrowUp') ? 1 : 0)
        - (this.is('KeyS') || this.is('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    // Any movement key held down, for idle detection and the menu prompt.
    anyMove() {
      return this.is('KeyW') || this.is('KeyA') || this.is('KeyS') || this.is('KeyD')
        || this.is('ArrowUp') || this.is('ArrowDown') || this.is('ArrowLeft') || this.is('ArrowRight');
    },
  };
}
