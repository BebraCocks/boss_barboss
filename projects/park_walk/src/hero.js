// The hero: the cut-out drawing split into a 2D skeleton (body -> shoulders -> elbows, hips -> knees -> ankles).
// Legs are solved with 2-bone IK toward foot targets that stay planted on the ground during stance,
// so the feet never slide. Every piece is a flat unlit card (the drawing keeps its own ink and colours).
import * as THREE from "three";
import { WALK, KICKS, KICK_CONTACT, bodyX, smooth, smoother, lerp } from "./story.js";

const S = 0.00146;          // metres per source pixel (1268 px tall drawing -> 1.85 m)
const HIP_PX = [580, 950];  // body origin in the drawing (between the hips)

const loader = new THREE.TextureLoader();
const tex = (name) => new Promise((res) => loader.load(`../assets/parts/${name}.png`, (t) => {
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t);
}));

/** a card whose origin is the pivot (px inside the image) */
function card(map, w, h, pivot, z = 0) {
  const g = new THREE.PlaneGeometry(w * S, h * S);
  g.translate((w / 2 - pivot[0]) * S, (pivot[1] - h / 2) * S, z);
  const m = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide });
  return mesh;
}
const px = (x, y) => new THREE.Vector3((x - HIP_PX[0]) * S, (HIP_PX[1] - y) * S, 0);

export class Hero {
  async init(scene) {
    const rig = await (await fetch("../assets/parts/rig.json")).json();
    this.rig = rig;
    const P = rig.parts;
    const [tTorso, tUp, tLo, tThigh, tShin, tShoe] = await Promise.all(["torso", "arm_up", "arm_lo", "thigh", "shin", "shoe"].map(tex));
    this.L1 = rig.knee_drop * S; this.L2 = rig.shin_len * S; this.ankleH = rig.ankle_to_sole * S;
    this.root = new THREE.Group(); this.root.position.z = WALK.lane; scene.add(this.root);

    // body: torso + both arms
    this.body = new THREE.Group(); this.root.add(this.body);
    const tb = P.torso.box;
    this.body.add(card(tTorso, tb[2], tb[3], [HIP_PX[0] - tb[0], HIP_PX[1] - tb[1]], 0));
    const makeArm = (mirror) => {
      const sh = new THREE.Group();
      const au = P.arm_up, al = P.arm_lo;
      sh.add(card(tUp, au.box[2], au.box[3], [au.pivot[0] - au.box[0], au.pivot[1] - au.box[1]], 0.012));
      const el = new THREE.Group();
      el.position.set((au.child[0] - au.pivot[0]) * S, (au.pivot[1] - au.child[1]) * S, 0);
      el.add(card(tLo, al.box[2], al.box[3], [al.pivot[0] - al.box[0], al.pivot[1] - al.box[1]], 0.016));
      sh.add(el);
      const holder = new THREE.Group();
      const at = mirror ? px(392, 478) : px(rig.shoulder_R[0], rig.shoulder_R[1]);
      holder.position.copy(at);
      if (mirror) holder.scale.x = -1;
      holder.add(sh);
      this.body.add(holder);
      return { sh, el, mirror };
    };
    this.armR = makeArm(false); // screen right (front of the walk)
    this.armL = makeArm(true);

    // legs live in root space (IK); z: left leg furthest back, right leg (the kicker) just behind the torso
    const makeLeg = (hipPx, z) => {
      const thigh = new THREE.Group(); this.root.add(thigh);
      thigh.add(card(tThigh, P.thigh.size[0], P.thigh.size[1], P.thigh.pivot, z));
      const shin = new THREE.Group(); shin.position.y = -this.L1; thigh.add(shin);
      shin.add(card(tShin, P.shin.size[0], P.shin.size[1], P.shin.pivot, z + 0.001));
      const shoe = new THREE.Group(); shoe.position.y = -this.L2; shin.add(shoe);
      shoe.add(card(tShoe, P.shoe.size[0], P.shoe.size[1], P.shoe.pivot, z + 0.002));
      return { thigh, shin, shoe, hip: px(hipPx[0], hipPx[1]) };
    };
    this.legs = [makeLeg(rig.hip_L, -0.04), makeLeg(rig.hip_R, -0.02)];
    this.hipOff = this.legs.map((l) => l.hip.x);
    this.H0 = this.L1 + this.L2 + this.ankleH - 0.035; // hip height: knees slightly soft

    // contact shadow blob under the feet
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(20,30,10,0.55)"); gr.addColorStop(0.6, "rgba(20,30,10,0.32)"); gr.addColorStop(1, "rgba(20,30,10,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const bt = new THREE.CanvasTexture(c);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, toneMapped: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.set(0, 0.006, WALK.lane); this.blob.renderOrder = 1;
    scene.add(this.blob);
  }

  // ---------------- gait ----------------
  off(f) { return f === 0 ? 0 : 0.5; }
  plant(f, n) { const { T, duty } = WALK; return bodyX((n - this.off(f) + duty / 2) * T) + this.hipOff[f]; }
  kickFor(f, n) { return KICKS.find((k) => k.foot === f && k.cycle === n); }
  /** sole point (x, y) and shoe angle for foot f at time t */
  foot(f, t) {
    const { T, duty } = WALK;
    const q = t / T + this.off(f), n = Math.floor(q), u = q - n;
    const p0 = this.plant(f, n), p1 = this.plant(f, n + 1);
    if (u < duty) return { x: p0, y: 0, a: 0, swing: 0 };
    const s = (u - duty) / (1 - duty);
    const k = this.kickFor(f, n);
    if (!k) {
      return { x: lerp(p0, p1, smoother(s)), y: 0.085 * Math.sin(Math.PI * s), a: 0.22 * Math.sin(Math.PI * s) - 0.12 * Math.sin(2 * Math.PI * s), swing: s };
    }
    // kick: wind back, sweep low through the stone, follow through high, step down
    const hx = bodyX(t) + this.hipOff[f];
    const keys = [
      [0, p0, 0, 0],
      [0.17, p0 - 0.07, 0.11, -0.25],
      [KICK_CONTACT, hx + 0.03, 0.03, 0.05],
      [0.6, hx + 0.36, 0.3, 0.6],
      [0.82, lerp(hx + 0.28, p1, 0.4), 0.15, 0.3],
      [1, p1, 0, 0],
    ];
    let i = 0; while (i < keys.length - 2 && s > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], kk = smooth((s - a[0]) / (b[0] - a[0]));
    return { x: lerp(a[1], b[1], kk), y: lerp(a[2], b[2], kk), a: lerp(a[3], b[3], kk), swing: s, kick: true };
  }
  /** time of the swing window of foot f in cycle n */
  swingSpan(f, n) { const { T, duty } = WALK; return [(n - this.off(f) + duty) * T, (n - this.off(f) + 1) * T]; }
  kickTime(k) { const [a, b] = this.swingSpan(k.foot, k.cycle); return lerp(a, b, KICK_CONTACT); }
  /** 0..1 envelope of the whole-body kick reaction */
  kickEnv(t) {
    let e = 0;
    for (const k of KICKS) {
      const [a, b] = this.swingSpan(k.foot, k.cycle);
      const up = smooth((t - (a - 0.08)) / 0.14), down = 1 - smooth((t - (b - 0.02)) / 0.22);
      e = Math.max(e, Math.min(up, down));
    }
    return e;
  }

  pose(t) {
    const { T } = WALK;
    const bx = bodyX(t), ke = this.kickEnv(t);
    const ph = 2 * Math.PI * (t / T - WALK.duty / 2);
    const hipY = this.H0 + 0.02 * Math.cos(2 * ph) - 0.03 * ke;
    const sway = 0.035 * Math.sin(ph);
    this.body.position.set(bx, hipY, 0);
    this.body.rotation.z = sway + 0.11 * ke;
    this.body.updateMatrix();

    // arms: swing opposite to the same-side leg, flail out on kicks
    // screen-space convention: + = counter-clockwise = hand moves toward +x (forward). The left arm sits in a
    // mirrored holder, so its local angle is negated; "+ke" on both turns each arm outward (a flail).
    const aR = -0.3 * Math.sin(ph), aL = 0.3 * Math.sin(ph);
    this.armR.sh.rotation.z = aR + 0.5 * ke;
    this.armL.sh.rotation.z = -aL + 0.5 * ke;
    this.armR.el.rotation.z = 0.12 + 0.25 * Math.max(0, aR) + 0.35 * ke;
    this.armL.el.rotation.z = -(0.12 + 0.25 * Math.max(0, aL)) + 0.35 * ke;

    // legs: 2-bone IK from the hip (moved with the body) to the ankle above the sole target
    const feet = [];
    for (let f = 0; f < 2; f++) {
      const leg = this.legs[f];
      const hip = leg.hip.clone().applyMatrix4(this.body.matrix);
      const ft = this.foot(f, t); feet.push(ft);
      const ax = ft.x - Math.sin(ft.a) * this.ankleH * 0.4, ay = ft.y + this.ankleH;
      let dx = ax - hip.x, dy = ay - hip.y, d = Math.hypot(dx, dy);
      const L1 = this.L1, L2 = this.L2, dMax = (L1 + L2) * 0.999;
      d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), dMax);
      const base = Math.atan2(dy, dx);
      const a1 = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      const thighDir = base + a1; // knee bends toward +x (forward)
      const kx = hip.x + L1 * Math.cos(thighDir), ky = hip.y + L1 * Math.sin(thighDir);
      const shinDir = Math.atan2(ay - ky, ax - kx);
      leg.thigh.position.set(hip.x, hip.y, 0);
      leg.thigh.rotation.z = thighDir + Math.PI / 2;
      leg.shin.rotation.z = shinDir - thighDir;
      leg.shoe.rotation.z = ft.a - (shinDir + Math.PI / 2);
    }
    this.blob.position.x = bx + 0.02;
    const spread = Math.abs(feet[0].x - feet[1].x);
    const lift = Math.max(feet[0].y, feet[1].y);
    this.blob.scale.set(0.95 + spread * 0.8, 0.36, 1);
    this.blob.material.opacity = 1 - lift * 0.8;
    return { bx, feet };
  }

  /** world toe tip of foot f after pose(t) */
  toe(f) {
    const shoe = this.legs[f].shoe;
    shoe.updateWorldMatrix(true, false);
    return new THREE.Vector3((290 - this.rig.parts.shoe.pivot[0]) * S, -(70 - this.rig.parts.shoe.pivot[1]) * S, 0).applyMatrix4(shoe.matrixWorld);
  }
}
