// Entry: renderer, camera, and a frame API driven by tools/render.mjs (window.renderFrame(i) -> PNG data URL).
import * as THREE from "three";
import { FPS, FRAMES, W, H, bodyX, smooth } from "./story.js";
import { buildWorld, setInk } from "./world.js";
import { Hero } from "./hero.js";
import { FX } from "./fx.js";

const q = new URLSearchParams(location.search);
const scale = Number(q.get("scale") ?? 1);
const w = Math.round(W * scale), h = Math.round(H * scale);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(w, h);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
setInk(4.6 * (h / 1920), w, h);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 600);
const { sun } = buildWorld(scene);
const hero = new Hero();
await hero.init(scene);
const fx = new FX(scene, hero);

function cameraAt(t) {
  const T = FRAMES / FPS;
  const cx = bodyX(t) + 0.42;
  const z = 5.6 - 0.45 * smooth(t / T);           // slow push-in over the whole shot
  let y = 1.32, roll = 0;
  for (const s of fx.stones) {                      // impact flip-shake, decays over 7 frames
    const f = Math.round((t - s.t0) * FPS);
    if (f >= 0 && f < 7) { const k = (1 - f / 7) * (f % 2 ? -1 : 1); y += 0.018 * k; roll += 0.006 * k; }
  }
  camera.position.set(cx, y, z);
  camera.lookAt(cx - 0.04, 1.0, 0);
  camera.rotateZ(roll - 0.012);
}

window.renderFrame = (i) => {
  const t = i / FPS;
  hero.pose(t);
  cameraAt(t);
  fx.update(t, camera);
  const hx = bodyX(t);
  sun.position.set(hx - 6, 11, 7); sun.target.position.set(hx, 0, 0); sun.target.updateMatrixWorld();
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
};
window.EVENTS = fx.events;
window.META = { FPS, FRAMES, w, h };
window.READY = true;
if (q.has("f")) window.renderFrame(Number(q.get("f")));
