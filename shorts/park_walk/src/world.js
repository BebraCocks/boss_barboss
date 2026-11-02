// The park: painted grass, a paved alley, cartoon trees with black ink outlines, benches, lamps, bushes,
// flower beds and a gradient sky. Toon-shaded 3D, colours picked from the source drawing's park.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { rng, WALK } from "./story.js";

const R = rng(7);
const rand = (a, b) => a + (b - a) * R();

// ---------- toon material + screen-space ink outlines ----------
const ramp = (() => {
  const d = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
export const toon = (color, map) => new THREE.MeshToonMaterial({ color, map: map ?? null, gradientMap: ramp });

export const INK = { px: 4.6, res: new THREE.Vector2(1080, 1920) };
const inkMat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPx: { value: INK.px }, uRes: { value: INK.res }, uColor: { value: new THREE.Color(0x0b0a0c) } }]),
  side: THREE.BackSide,
  vertexShader: /* glsl */`
    uniform float uPx; uniform vec2 uRes;
    #include <fog_pars_vertex>
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec4 clip = projectionMatrix * mv;
      vec3 nv = normalize(normalMatrix * normal);
      vec2 nc = normalize((projectionMatrix * vec4(nv, 0.0)).xy + 1e-6);
      float far = clamp((-mv.z - 6.0) / 60.0, 0.0, 1.0);
      float px = uPx * mix(1.0, 0.6, far);
      clip.xy += nc * px * 2.0 / uRes * clip.w;
      gl_Position = clip;
      vec4 mvPosition = mv;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    #include <fog_pars_fragment>
    void main(){
      gl_FragColor = vec4(uColor, 1.0);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
  fog: true,
});
inkMat.uniforms.uRes.value = INK.res;
export const setInk = (px, w, h) => { inkMat.uniforms.uPx.value = px; INK.res.set(w, h); };
const inkGeoCache = new Map();
/** add a mesh with an ink hull (smooth normals so corners close) */
export function inked(geo, mat, { ink = true, cast = true, receive = true } = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; g.add(m);
  if (ink) {
    let ig = inkGeoCache.get(geo);
    if (!ig) {
      ig = geo.clone(); for (const k of Object.keys(ig.attributes)) if (k !== "position") ig.deleteAttribute(k);
      ig = mergeVertices(ig, 1e-4); ig.computeVertexNormals(); inkGeoCache.set(geo, ig);
    }
    const h = new THREE.Mesh(ig, inkMat); h.renderOrder = -1; g.add(h);
  }
  return g;
}

// ---------- painted textures ----------
function canvasTex(w, h, paint, repeat = [1, 1]) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  paint(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  return t;
}
const grassTex = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = "#4cb43a"; g.fillRect(0, 0, w, h);
  const r = rng(11);
  for (let i = 0; i < 60; i++) { // soft patches
    g.fillStyle = r() < 0.5 ? "rgba(110,214,80,0.35)" : "rgba(40,140,40,0.30)";
    g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, 7); g.fill();
  }
  g.lineCap = "round";
  for (let i = 0; i < 1600; i++) { // blades
    const x = r() * w, y = r() * h, l = 6 + r() * 10, a = -Math.PI / 2 + (r() - 0.5) * 0.8;
    g.strokeStyle = r() < 0.55 ? "rgba(32,120,34,0.75)" : "rgba(140,230,100,0.7)"; g.lineWidth = 1.6 + r() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}, [36, 36]);
const pathTex = () => canvasTex(1024, 512, (g, w, h) => {
  // olive-grey paving like the source ground, slabs with ink seams and a few cracks
  g.fillStyle = "#9a956f"; g.fillRect(0, 0, w, h);
  const r = rng(23);
  const rows = 4, rh = h / rows;
  for (let j = 0; j < rows; j++) {
    let x = (j % 2) * 90 - 90;
    while (x < w) {
      const sw = 150 + r() * 70;
      const v = Math.floor(r() * 18 - 9);
      g.fillStyle = `rgb(${154 + v},${149 + v},${112 + v})`;
      g.fillRect(x + 3, j * rh + 3, sw - 6, rh - 6);
      g.fillStyle = "rgba(255,255,230,0.10)"; g.fillRect(x + 6, j * rh + 6, sw - 12, 8);
      x += sw;
      g.fillStyle = "rgba(40,36,24,0.85)"; g.fillRect(x - 3, j * rh, 5, rh);
    }
    g.fillStyle = "rgba(40,36,24,0.85)"; g.fillRect(0, j * rh - 2, w, 5);
  }
  g.strokeStyle = "rgba(40,36,24,0.7)"; g.lineWidth = 2.5;
  for (let i = 0; i < 14; i++) {
    let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.3) * 40; y += (r() - 0.5) * 18; g.lineTo(x, y); }
    g.stroke();
  }
}, [1, 1]);
const barkTex = () => canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = "#9c4d1f"; g.fillRect(0, 0, w, h);
  const r = rng(5);
  g.strokeStyle = "rgba(60,25,10,0.8)"; g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    g.lineWidth = 2 + r() * 3; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { y += 20 + r() * 30; x += (r() - 0.5) * 10; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = "rgba(200,110,50,0.25)"; for (let i = 0; i < 20; i++) g.fillRect(r() * w, r() * h, 6, 40 + r() * 50);
}, [2, 1]);

// ---------- props ----------
function tree(x, z, s = 1, seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const th = (2.6 + r() * 1.2) * s, tr = (0.17 + r() * 0.06) * s;
  const trunk = inked(new THREE.CylinderGeometry(tr * 0.75, tr * 1.25, th, 9, 1), toon(0xffffff, barkTex()));
  trunk.position.y = th / 2; g.add(trunk);
  // a couple of branches
  for (let i = 0; i < 2; i++) {
    const b = inked(new THREE.CylinderGeometry(tr * 0.28, tr * 0.45, 1.1 * s, 6), toon(0x8f461d));
    b.position.set((i ? -1 : 1) * 0.35 * s, th * 0.82, 0); b.rotation.z = (i ? 1 : -1) * 0.7; g.add(b);
  }
  const greens = [0x3fbf3f, 0x4ccb46, 0x36ac38];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const rr = (0.8 + r() * 0.55) * s;
    const geo = new THREE.IcosahedronGeometry(rr, 3);
    const leaf = inked(geo, toon(greens[i % 3]));
    const a = (i / n) * Math.PI * 2 + r();
    leaf.position.set(Math.cos(a) * 0.75 * s, th + 0.45 * s + r() * 0.8 * s, Math.sin(a) * 0.5 * s);
    leaf.scale.set(1, 0.82, 1); g.add(leaf);
  }
  const top = inked(new THREE.IcosahedronGeometry(1.05 * s, 3), toon(0x55d24d)); top.position.y = th + 1.2 * s; top.scale.set(1, 0.85, 1); g.add(top);
  return g;
}
function bench(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const wood = toon(0xc98a3a), iron = toon(0x2d2a2c);
  for (let i = 0; i < 3; i++) { const p = inked(new THREE.BoxGeometry(1.8, 0.05, 0.13), wood); p.position.set(0, 0.45, -0.16 + i * 0.16); g.add(p); }
  for (let i = 0; i < 2; i++) { const p = inked(new THREE.BoxGeometry(1.8, 0.12, 0.04), wood); p.position.set(0, 0.68 + i * 0.17, -0.27); p.rotation.x = -0.15; g.add(p); }
  for (const sx of [-0.75, 0.75]) {
    const l = inked(new THREE.BoxGeometry(0.06, 0.45, 0.45), iron); l.position.set(sx, 0.225, -0.05); g.add(l);
    const b = inked(new THREE.BoxGeometry(0.05, 0.5, 0.05), iron); b.position.set(sx, 0.72, -0.29); g.add(b);
  }
  return g;
}
function lamp(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const iron = toon(0x2f3a36);
  const base = inked(new THREE.CylinderGeometry(0.12, 0.16, 0.35, 10), iron); base.position.y = 0.17; g.add(base);
  const pole = inked(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 8), iron); pole.position.y = 1.9; g.add(pole);
  const head = inked(new THREE.CylinderGeometry(0.16, 0.24, 0.42, 6), iron); head.position.y = 3.55; g.add(head);
  const glass = inked(new THREE.CylinderGeometry(0.18, 0.13, 0.32, 6), toon(0xfff2b0), { ink: false }); glass.position.y = 3.3; g.add(glass);
  const cap = inked(new THREE.ConeGeometry(0.26, 0.22, 6), iron); cap.position.y = 3.86; g.add(cap);
  return g;
}
function bush(x, z, s = 1, seed = 3) {
  const r = rng(seed); const g = new THREE.Group(); g.position.set(x, 0, z);
  for (let i = 0; i < 4; i++) {
    const b = inked(new THREE.IcosahedronGeometry((0.45 + r() * 0.25) * s, 2), toon(i % 2 ? 0x2e9e34 : 0x3db53c));
    b.position.set((i - 1.5) * 0.45 * s, 0.35 * s + r() * 0.15, (r() - 0.5) * 0.3); b.scale.y = 0.8; g.add(b);
  }
  return g;
}
function flowers(x, z, seed) {
  const r = rng(seed); const g = new THREE.Group(); g.position.set(x, 0, z);
  const cols = [0xff5a6e, 0xffd23f, 0xffffff, 0xff8c2a, 0xb36bff];
  const head = new THREE.IcosahedronGeometry(0.045, 1), stem = new THREE.CylinderGeometry(0.008, 0.01, 0.16, 4);
  const stemMat = toon(0x2d8a2a);
  for (let i = 0; i < 12; i++) {
    const fx = (r() - 0.5) * 1.2, fz = (r() - 0.5) * 0.4, hh = 0.12 + r() * 0.08;
    const st = new THREE.Mesh(stem, stemMat); st.position.set(fx, hh / 2, fz); st.scale.y = hh / 0.16; g.add(st);
    const f = inked(head, toon(cols[Math.floor(r() * cols.length)]), { cast: false });
    f.position.set(fx, hh, fz); f.scale.y = 0.7; g.add(f);
  }
  return g;
}
export function rock(radius, seed, color = 0x9b968c) {
  const r = rng(seed);
  const geo = new THREE.DodecahedronGeometry(radius, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + r() * 0.3), p.getY(i) * (0.7 + r() * 0.2), p.getZ(i) * (0.85 + r() * 0.3));
  geo.computeVertexNormals();
  return inked(geo, toon(color));
}

// ---------- sky ----------
function sky() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color("#3f86dc") }, hor: { value: new THREE.Color("#c4defa") } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 hor; varying vec3 vP;
      void main(){ float h = clamp(normalize(vP).y*2.2, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.7)), 1.0);
      #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geo, mat);
}
function cloud(x, y, z, s) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  for (let i = 0; i < 5; i++) {
    const b = inked(new THREE.SphereGeometry((1.2 + (i % 2) * 0.6) * s, 16, 10), m, { cast: false, receive: false });
    b.position.set((i - 2) * 1.3 * s, (i % 2) * 0.5 * s, 0); b.scale.y = 0.7; g.add(b);
  }
  return g;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color("#c4defa");
  scene.fog = new THREE.Fog("#c4defa", 30, 140);
  scene.add(sky());

  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x5d7a35, 1.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-6, 11, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 50 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);

  // ground
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon(0xffffff, grassTex()));
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
  const pw = 3.2;
  const pt = pathTex(); pt.repeat.set(120 / 3.0, 1);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(120, pw), toon(0xffffff, pt));
  path.rotation.x = -Math.PI / 2; path.position.set(20, 0.004, WALK.lane - 0.1); path.receiveShadow = true; scene.add(path);
  for (const side of [-1, 1]) { // curbs
    const c = inked(new THREE.BoxGeometry(120, 0.1, 0.16), toon(0xb9b39a));
    c.position.set(20, 0.05, WALK.lane - 0.1 + side * (pw / 2 + 0.08)); scene.add(c);
  }

  // back row along the alley + deeper park
  for (let x = -14; x < 30; x += 3.4 + rand(0, 1.4)) scene.add(tree(x, -3.6 - rand(0, 1.2), 1.0, Math.floor(rand(1, 999))));
  for (let i = 0; i < 70; i++) scene.add(tree(rand(-30, 45), -7 - rand(0, 30), rand(1.0, 1.6), i + 100));
  // a few trees in front of the alley, kept away from the camera's line of sight
  for (let x = -10; x < 26; x += 6.2) { scene.add(bench(x + 1.7, -2.15)); }
  for (let x = -12; x < 30; x += 8) scene.add(lamp(x + 4.6, -1.75));
  for (let x = -12; x < 30; x += 2.4 + rand(0, 1.8)) scene.add(bush(x, -2.75 - rand(0, 0.4), rand(0.8, 1.15), Math.floor(rand(1, 999))));
    for (let x = -12; x < 30; x += 2 + rand(0, 3)) scene.add(flowers(x, -2.5 + rand(-0.2, 0.2), Math.floor(rand(1, 999))));
  // dressing pebbles at the alley edges
  for (let i = 0; i < 26; i++) {
    const p = rock(rand(0.025, 0.06), i + 900, 0x8f8a80);
    p.position.set(rand(-6, 14), 0.02, WALK.lane - 0.1 + (R() < 0.5 ? -1 : 1) * rand(1.1, 1.5)); p.rotation.y = rand(0, 6); scene.add(p);
  }
  scene.add(cloud(-14, 34, -120, 3.2)); scene.add(cloud(16, 44, -140, 4)); scene.add(cloud(40, 30, -110, 2.6));
  return { sun };
}
