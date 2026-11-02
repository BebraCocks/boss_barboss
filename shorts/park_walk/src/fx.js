// Kicked stones (precomputed ballistic flight with bounces and spin), dust puffs, the impact burst and
// small heel puffs. Everything is deterministic in t so any frame can be rendered on its own.
import * as THREE from "three";
import { KICKS, WALK, FRAMES, FPS, smooth } from "./story.js";
import { rock } from "./world.js";

const G = 9.8;

function spriteTex(paint, w = 256, h = 256) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const dustTex = spriteTex((g) => {
  const blobs = [[128, 150, 70], [70, 160, 50], [186, 162, 52], [100, 105, 50], [160, 100, 46]];
  g.fillStyle = "#211a14";
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r + 7, 0, 7); g.fill(); }
  g.fillStyle = "#efe4c4";
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.fillStyle = "#d9cba2";
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x + r * 0.2, y + r * 0.25, r * 0.6, 0, 7); g.fill(); }
});
const burstTex = spriteTex((g, w, h) => {
  const star = (r0, r1, n) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 + 0.2, r = i % 2 ? r0 : r1; g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.closePath(); };
  star(48, 124, 9); g.fillStyle = "#1b1410"; g.fill();
  star(40, 112, 9); g.fillStyle = "#ffd84a"; g.fill();
  star(22, 64, 9); g.fillStyle = "#fffbe6"; g.fill();
});

function card(tex) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.renderOrder = 5; m.visible = false; return m;
}

export class FX {
  constructor(scene, hero) {
    this.scene = scene; this.hero = hero;
    this.events = []; // for the sound track: {t, type, x, strength}
    this.stones = KICKS.map((k, i) => this.makeStone(k, i));
    this.puffs = [];
    // heel strikes -> small puffs + footstep sounds
    for (let f = 0; f < 2; f++) {
      const off = hero.off(f);
      for (let n = -1; n < 12; n++) {
        const t = (n - off + 1) * WALK.T; // start of the next stance
        if (t < 0.02 || t > FRAMES / FPS) continue;
        const kicked = !!hero.kickFor(f, n);
        hero.pose(t); const ft = hero.foot(f, t + 1e-4);
        this.events.push({ t, type: kicked ? "land" : "step", x: ft.x, foot: f });
  
      }
    }
    for (const s of this.stones) {
      this.events.push({ t: s.t0, type: "kick", x: s.p0.x, strength: 1 });
      this.addPuff(s.t0, s.p0.clone().add(new THREE.Vector3(-0.12, 0.0, -0.04)), 0.38, 0.4);
      this.bursts = this.bursts ?? [];
      const b = card(burstTex); scene.add(b); this.bursts.push({ m: b, t: s.t0, p: s.p0.clone().add(new THREE.Vector3(-0.04, 0.06, 0.12)) });
      for (const h of s.hits) {
        this.events.push({ t: h.t, type: "bounce", x: h.p.x, strength: h.v });
        if (h.v > 1.0) this.addPuff(h.t, h.p.clone().setY(0.04), 0.18 + 0.1 * Math.min(h.v, 4), 0.4);
      }
    }
    this.events.sort((a, b) => a.t - b.t);
  }

  makeStone(k, i) {
    const h = this.hero;
    const t0 = h.kickTime(k);
    h.pose(t0);
    const toe = h.toe(k.foot);
    const r = k.stone.r;
    const p0 = new THREE.Vector3(toe.x + r * 0.95, r * 0.8, WALK.lane + 0.02);
    const mesh = rock(r, 300 + i * 17, k.stone.hue ? 0xc2b8a3 : 0xb3b5bd);
    this.scene.add(mesh);
    // blob shadow
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(20,30,10,0.5)"); gr.addColorStop(1, "rgba(20,30,10,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 1; this.scene.add(sh);
    // integrate the flight once, sampled per frame
    const dt = 1 / 600, samples = [], hits = [];
    const p = p0.clone(), v = new THREE.Vector3(...k.stone.vel), w = new THREE.Vector3(...k.stone.spin);
    const q = new THREE.Quaternion(), dq = new THREE.Quaternion(), ax = new THREE.Vector3();
    let t = t0, next = Math.ceil(t0 * FPS) / FPS;
    while (t < FRAMES / FPS + 0.1) {
      v.y -= G * dt; p.addScaledVector(v, dt);
      if (p.y < r * 0.8 && v.y <= 0) {
        p.y = r * 0.8;
        if (v.y < -0.4) { hits.push({ t, p: p.clone(), v: -v.y }); v.y = -v.y * 0.42; v.x *= 0.72; v.z *= 0.72; w.multiplyScalar(0.6); }
        else { v.y = 0; v.x *= 1 - 3.2 * dt; v.z *= 1 - 3.2 * dt; w.set(v.z / r, 0, -v.x / r); }
      }
      const wl = w.length(); if (wl > 1e-6) { ax.copy(w).divideScalar(wl); dq.setFromAxisAngle(ax, wl * dt); q.premultiply(dq); }
      t += dt;
      if (t >= next) { samples.push({ t: next, p: p.clone(), q: q.clone() }); next += 1 / FPS; }
    }
    return { mesh, sh, p0, t0, r, samples, hits };
  }

  addPuff(t, p, size, life) {
    const m = card(dustTex); this.scene.add(m);
    this.puffs.push({ m, t, p, size, life });
  }

  update(t, camera) {
    for (const s of this.stones) {
      let p = s.p0, q = null;
      if (t > s.t0) {
        const i = Math.min(s.samples.length - 1, Math.max(0, Math.round((t - s.t0) * FPS) - 1));
        const smp = s.samples.find((x) => Math.abs(x.t - t) < 0.5 / FPS) ?? s.samples[i];
        p = smp.p; q = smp.q;
      }
      s.mesh.position.copy(p); if (q) s.mesh.quaternion.copy(q);
      s.sh.position.set(p.x, 0.007, p.z);
      const hgt = Math.max(0, p.y - s.r);
      const k = 1 / (1 + hgt * 1.8);
      s.sh.scale.set(s.r * 3.2 * (1 + hgt * 0.6), s.r * 2.2 * (1 + hgt * 0.6), 1);
      s.sh.material.opacity = k;
    }
    for (const f of this.puffs) {
      const a = (t - f.t) / f.life;
      f.m.visible = a >= 0 && a < 1;
      if (!f.m.visible) continue;
      const e = smooth(a);
      const s = f.size * (0.45 + 0.9 * Math.sqrt(a));
      f.m.position.set(f.p.x + 0.12 * e, f.p.y + s * 0.35 + 0.1 * e, f.p.z);
      f.m.scale.set(s, s, 1); f.m.quaternion.copy(camera.quaternion);
      f.m.material.opacity = 1 - smooth((a - 0.45) / 0.55);
    }
    for (const b of this.bursts ?? []) {
      const a = (t - b.t) * FPS; // frames since contact
      b.m.visible = a >= -0.5 && a < 5.5;
      if (!b.m.visible) continue;
      const s = 0.42 * (a < 1.5 ? 0.7 + a * 0.3 : 1.1 - (a - 1.5) * 0.15);
      b.m.position.copy(b.p); b.m.scale.set(s, s, 1); b.m.quaternion.copy(camera.quaternion);
      b.m.rotateZ(a * 0.12);
    }
  }
}
