// SOLMARINA input: keyboard + mouse, sampled once per frame by the loop.
//
// Held keys live in one plain object, frame-fresh presses in another, and
// the pointer state in a third; the loop drains the fresh presses and the
// pointer deltas at the end of each frame. W/Up and S/Down both count as
// forward/back, so arrows steer as well as walk; H honks while driving.

const FORWARD_MAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
const PAGE_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(canvas) {
  const down = Object.create(null);
  const fresh = Object.create(null);
  const pointer = { dx: 0, dy: 0, wheel: 0, clicked: false, dragging: false, px: 0, py: 0 };

  function codeOf(ev) {
    return FORWARD_MAP[ev.code] || ev.code;
  }

  function onKeyDown(ev) {
    if (ev.repeat) return;
    const code = codeOf(ev);
    down[code] = true;
    fresh[code] = true;
    if (PAGE_KEYS.has(ev.code)) ev.preventDefault();
  }

  function onKeyUp(ev) {
    delete down[codeOf(ev)];
  }

  function onBlur() {
    for (const code of Object.keys(down)) delete down[code];
  }

  function onMouseDown(ev) {
    pointer.dragging = true;
    pointer.px = ev.clientX;
    pointer.py = ev.clientY;
    pointer.clicked = true;
  }

  function onMouseMove(ev) {
    if (!pointer.dragging) return;
    pointer.dx += ev.clientX - pointer.px;
    pointer.dy += ev.clientY - pointer.py;
    pointer.px = ev.clientX;
    pointer.py = ev.clientY;
  }

  function onWheel(ev) {
    pointer.wheel += ev.deltaY;
    ev.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mouseup', () => { pointer.dragging = false; });
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  function axis(negCodes, posCodes) {
    let value = 0;
    for (const code of posCodes) if (down[code]) value += 1;
    for (const code of negCodes) if (down[code]) value -= 1;
    return value;
  }

  return {
    isDown(code) { return Boolean(down[code]); },
    wasPressed(code) { return Boolean(fresh[code]); },
    // Movement axes, -1..1. Forward is W / Up, strafe is A / D — or the
    // arrow keys, which steer as well as walk.
    moveForward() {
      return (down.up ? 1 : 0) - (down.down ? 1 : 0);
    },
    moveStrafe() {
      return axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    },
    takeMouseDelta() {
      const out = { dx: pointer.dx, dy: pointer.dy };
      pointer.dx = 0;
      pointer.dy = 0;
      return out;
    },
    takeWheel() {
      const amount = pointer.wheel;
      pointer.wheel = 0;
      return amount;
    },
    takeClick() {
      const wasClicked = pointer.clicked;
      pointer.clicked = false;
      return wasClicked;
    },
    // The weapon wheel: which digit key (1-5) was pressed this frame, or 0.
    // Edge-triggered like wasPressed, so holding a digit does not cycle.
    takeDigit() {
      for (let d = 1; d <= 5; d += 1) {
        if (fresh[`Digit${d}`]) return d;
      }
      return 0;
    },
    // Called at the end of every frame: edge triggers live for one frame only.
    endFrame() {
      for (const code of Object.keys(fresh)) delete fresh[code];
    },
  };
}
