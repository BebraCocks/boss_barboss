"""Sound for the park walk: footsteps on paving, kick thumps + whooshes, stone bounces, park birds and breeze,
and a small bouncy oom-pah tune locked to the step tempo. Uses the skill's own DSP kit (templates/audio).
Usage: python tools/sound.py out/events.json out/mix.wav"""
import json, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "claude-animated-shorts-main/templates/audio"))
from dsp import SR, ns, tt, rng, lp, hp, bp, modal, phase, pan, place, fades, integrated, true_peak, dbg, write_wav, make_ir, convolve_st  # noqa: E402
from sfx_gen import stroll_step, whoosh, bird_chirps, breeze, push_thump  # noqa: E402

ev = json.load(open(sys.argv[1]))
DUR = ev["frames"] / ev["fps"]
N = ns(DUR)
r = rng(42)
cam_x = lambda t: -1.6 + 1.0 * t + 0.42
pan_of = lambda x, t: float(np.clip((x - cam_x(t)) / 1.6, -0.8, 0.8))

sfx = np.zeros((2, N))
def stone_tock(strength):
    d = 0.25
    f = r.uniform(900, 1300)
    y = modal(d, [(f, 1.0, 0.018), (f * 2.4, 0.6, 0.01), (f * 4.1, 0.3, 0.006), (260, 0.5, 0.03)], r)
    t = tt(d)
    y += bp(r.standard_normal(len(t)), 1500, 7000, 1) * np.exp(-t / 0.003) * 0.6
    return fades(y * min(1.0, 0.35 + strength / 3.5), 0.0, 0.05)

for e in ev["events"]:
    t, p = e["t"], pan_of(e["x"], e["t"])
    if e["type"] in ("step", "land"):
        place(sfx, pan(stroll_step(r, scuff=0.35) * (0.55 if e["type"] == "step" else 0.75), p * 0.5), t - 0.005)
    elif e["type"] == "kick":
        place(sfx, pan(push_thump(r) * 1.1, p), t - 0.01)
        place(sfx, pan(stone_tock(4.0) * 1.2, p), t)
        w = whoosh(0.6, r, peak=0.06, f_lo=500, f_hi=2600, width=0.7, tail=0.18)
        place(sfx, pan(w * 0.45, min(0.8, p + 0.3)), t - 0.02)
    elif e["type"] == "bounce":
        place(sfx, pan(stone_tock(e["strength"]), p), t)

# ambience: birds + breeze
amb = breeze(DUR, r, level=0.12, bright=700)
b1 = bird_chirps(DUR + 1, r, density=1.2, kind="sparrow")[:N]
b2 = bird_chirps(DUR + 1, r, density=0.6, kind="blackbird")[:N]
amb += pan(b1 * 0.10, -0.5) + pan(b2 * 0.08, 0.55)

# music: oom-pah on every step (step period = gait cycle / 2), xylophone hook on the off-beats
STEP = 0.39
def bass(f, d=0.34):
    t = tt(d)
    y = (np.sin(phase(f)) + 0.45 * np.sin(phase(2 * f)) + 0.2 * np.sin(phase(3 * f))) * np.exp(-t / 0.12)
    y += 0.3 * np.sin(phase(f * (1 + 0.5 * np.exp(-t / 0.004)))) * np.exp(-t / 0.02)
    return fades(lp(y, 900), 0.002, 0.04)
def xylo(f, d=0.3):
    return fades(modal(d, [(f, 1.0, 0.09), (f * 3.93, 0.35, 0.03), (f * 9.5, 0.12, 0.012)], r), 0.0, 0.05)
def chord(fs, d=0.16):
    t = tt(d)
    y = sum(np.sign(np.sin(phase(f))) * 0.3 + np.sin(phase(f)) for f in fs) * np.exp(-t / 0.05)
    return fades(lp(y, 2400), 0.002, 0.03)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
mus = np.zeros((2, N))
roots = [36, 43, 36, 43, 41, 36, 43, 36, 36, 43, 41, 43, 36]            # C G C G F C G C ...
hook = [72, 76, 79, 76, 77, 74, 71, 74, 72, 76, 79, 84, 79]
for i in range(int(DUR / STEP) + 1):
    t = 0.39 * (i + 1) - 0.39
    if t >= DUR: break
    m = roots[i % len(roots)]
    place(mus, pan(bass(hz(m)) * 0.55, -0.15), t)
    third = 4 if m in (36, 41) else 4
    place(mus, pan(chord([hz(m + 24), hz(m + 24 + third), hz(m + 31)]) * 0.10, 0.2), t + STEP / 2)
    if i % 2 == 0 or i in (4, 10):
        place(mus, pan(xylo(hz(hook[i % len(hook)])) * 0.16, 0.35), t + STEP / 2)
# button at the end
place(mus, pan(xylo(hz(84), 0.5) * 0.22, 0.3), DUR - 0.36)

room = make_ir(0.6, 3, hf=1.4)
def verb(x, wet):
    return x + wet * convolve_st(x, room)[:, :N]
mix = verb(sfx, 0.08) * dbg(-2) + amb * dbg(-4) + verb(mus, 0.12) * dbg(-1)
def limit(x, ceil_db=-1.5, att=0.002, rel=0.06):
    # look-ahead peak limiter: gain follows the peak envelope (instant attack via a 2 ms look-ahead, smooth release)
    thr = dbg(ceil_db)
    pk = np.abs(x).max(axis=0)
    la = ns(att)
    pk = np.maximum.reduce([np.roll(pk, -k) for k in range(la)])
    g = np.minimum(1.0, thr / np.maximum(pk, 1e-9))
    a = np.exp(-1 / (rel * SR))
    out = np.empty_like(g); cur = 1.0
    for i, v in enumerate(g):
        cur = v if v < cur else a * cur + (1 - a) * v
        out[i] = cur
    return x * out
for _ in range(4):
    mix *= dbg(-14.0 - integrated(mix))
    mix = limit(mix)
tp = true_peak(mix)
if tp > -1.0:
    mix *= dbg(-1.0 - tp)
mix[:, : ns(0.01)] *= np.linspace(0, 1, ns(0.01))
mix[:, -ns(0.05):] *= np.linspace(1, 0, ns(0.05))
write_wav(sys.argv[2], mix)
print(f"{sys.argv[2]}: {DUR:.2f}s, {integrated(mix):.1f} LUFS, TP {true_peak(mix):.1f} dBTP")
