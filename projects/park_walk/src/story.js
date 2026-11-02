// Timeline of the 5 s short: one constant-speed walk along the park alley with two kicks.
export const FPS = 30;
export const FRAMES = 150; // 5 s
export const W = 1080, H = 1920;

export const WALK = {
  x0: -1.6,      // body x at t = 0 (m)
  v: 1.0,        // walking speed (m/s)
  T: 0.78,       // gait cycle (s): two steps
  duty: 0.58,    // share of the cycle a foot stays planted
  lane: 0.25,    // z of the walking line on the alley
};
export const bodyX = (t) => WALK.x0 + WALK.v * t;

// kicks: which foot (0 = left hip, 1 = right hip) and which gait cycle's swing becomes the kick.
// Swing of foot f in cycle n runs over t in [(n - off + duty) T, (n - off + 1) T], off = 0 / 0.5.
export const KICKS = [
  { foot: 1, cycle: 2, stone: { vel: [2.5, 3.3, 1.25], spin: [6, -3, 14], r: 0.11, hue: 0 } },
  { foot: 1, cycle: 5, stone: { vel: [3.3, 4.4, -0.9], spin: [-4, 5, 18], r: 0.1, hue: 1 } },
];
export const KICK_CONTACT = 0.36; // share of the kick swing where the toe meets the stone

export const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
export const smoother = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
export const lerp = (a, b, k) => a + (b - a) * k;

// seeded random
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
