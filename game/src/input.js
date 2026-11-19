// Keyboard and mouse input for SOLMARINA.
// Tracks held keys, mouse-drag camera deltas, wheel zoom and clicks, and
// offers edge-triggered "just pressed" queries the game loop consumes.

export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let wheelDelta = 0;
  let clicked = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const CODE_ALIASES = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };

  function codeOf(event) {
    return CODE_ALIASES[event.code] ?? event.code;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const code = codeOf(event);
    keys.add(code);
    justPressed.add(code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(codeOf(event)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    clicked = true;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  canvas.addEventListener('wheel', (event) => {
    wheelDelta += event.deltaY;
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    isDown(code) { return keys.has(code); },
    wasPressed(code) { return justPressed.has(code); },
    // Movement axes, -1..1. Forward is W / Up, strafe is A / D — or the
    // arrow keys, which steer as well as move.
    moveForward() {
      return (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
    },
    moveStrafe() {
      return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    },
    takeMouseDelta() {
      const d = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return d;
    },
    takeWheel() {
      const w = wheelDelta;
      wheelDelta = 0;
      return w;
    },
    takeClick() {
      const c = clicked;
      clicked = false;
      return c;
    },
    // The weapon wheel: which digit key (1-4) was pressed this frame, or 0.
    // Edge-triggered like wasPressed, so holding a digit does not cycle.
    takeDigit() {
      for (let d = 1; d <= 4; d += 1) {
        if (justPressed.has(`Digit${d}`)) return d;
      }
      return 0;
    },
    // Called at the end of every frame: edge triggers live for one frame only.
    endFrame() { justPressed.clear(); },
  };
}
