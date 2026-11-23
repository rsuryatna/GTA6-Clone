// SOLMARINA — render.js
// One job: the renderer and the chase camera. Sets up WebGL with shadows,
// keeps the canvas sized to the window, and frames Jules low and
// road-parallel — the camera the screenshots are taken from.

const THREE = window.THREE;
import { pixelRatioFor } from './settings.js';

export function createRenderer(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(pixelRatioFor(settings.quality));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 8, -18);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  return {
    renderer,
    camera,
    resize,
    // Chase camera: low, just behind and above Jules or his car, looking
    // slightly down the street so pedestrians and traffic fill the frame.
    follow(player, dt) {
      const focus = player.cameraFocus ? player.cameraFocus() : player.position;
      const dist = player.cameraDistance || 9;
      const yaw = player.onFoot ? player.cameraYaw : player.heading;
      const pitch = player.cameraPitch || 0.32;
      const height = 2.0 + Math.sin(pitch) * dist * 0.55;
      const back = Math.cos(pitch) * dist;
      const wantX = focus.x - Math.sin(yaw) * back;
      const wantZ = focus.z - Math.cos(yaw) * back;
      const k = Math.min(1, dt * 5);
      camera.position.x += (wantX - camera.position.x) * k;
      camera.position.y += (height - camera.position.y) * k;
      camera.position.z += (wantZ - camera.position.z) * k;
      camera.lookAt(focus.x, (focus.y || 1.2) + 0.4, focus.z);
    },
    // A fixed cinematic frame for a staged shot: position, look-at, fov.
    frameShot(pos, look, fov) {
      camera.position.set(pos.x, pos.y, pos.z);
      if (fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.lookAt(look.x, look.y, look.z);
    },
    // Restore the default chase field of view after a staged shot.
    resetFov() {
      camera.fov = 62;
      camera.updateProjectionMatrix();
    },
    render(scene) {
      renderer.render(scene, camera);
    },
  };
}
