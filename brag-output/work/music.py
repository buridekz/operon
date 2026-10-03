"""Original soundtrack for the SterileVoice pitch video, synthesized to the storyboard.

Clinical A-minor pad + bass, a soft monitor beep and heartbeat under the OR scenes,
and effects (blocked alert, confirm chimes, allergy tone, phone ring) pitched to the
chord underneath. Resolves to C major at the end.
"""
import wave
import numpy as np

SR = 44100
DUR = 26.6
N = int(SR * DUR)
t_all = np.arange(N) / SR


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n, attack, release):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def add(bus, start, sig):
    i = int(start * SR)
    j = min(N, i + len(sig))
    if 0 <= i < N:
        bus[i:j] += sig[: j - i]


AM, F, DM, C, G = [57, 60, 64], [57, 60, 65], [57, 62, 65], [55, 60, 64], [55, 59, 62]
CHORDS = [
    (0.0, 3.4, 45, AM),    # hook
    (3.4, 5.4, 41, F),     # reveal lifts
    (5.4, 7.5, 45, AM),    # time-out begins
    (7.5, 10.4, 38, DM),   # blocked: tension
    (10.4, 11.4, 48, C),   # time-out complete: relief
    (11.4, 14.6, 41, F),   # read-back
    (14.6, 16.4, 38, DM),  # allergy alert
    (16.4, 18.4, 45, AM),  # calling vascular
    (18.4, 19.9, 41, F),   # briefing
    (19.9, 21.4, 43, G),
    (21.4, 23.8, 48, C),   # record
    (23.8, 25.2, 41, F),   # outro: plagal resolve
    (25.2, 26.6, 48, C),
]

pad = np.zeros(N)
bass = np.zeros(N)
for s, e, root, notes in CHORDS:
    length = e - s + 0.8
    n = int(length * SR)
    tt = np.arange(n) / SR
    ev = env(n, 0.6, 0.8)
    for k, m in enumerate(notes):
        f = hz(m)
        trem = 1 + 0.05 * np.sin(2 * np.pi * (0.2 + 0.05 * k) * tt + k)
        tone = (np.sin(2 * np.pi * f * tt) + 0.18 * np.sin(2 * np.pi * 2 * f * tt + 0.3)
                + 0.5 * np.sin(2 * np.pi * f * 1.003 * tt))
        add(pad, s, 0.045 * tone * trem * ev)
    add(bass, s, 0.10 * np.sin(2 * np.pi * hz(root) * tt) * env(n, 0.3, 0.8))


def tone(m, dur, vel, partials, decay_scale=1.0, attack=0.004):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = hz(m)
    sig = sum(a * np.exp(-tt * d * decay_scale) * np.sin(2 * np.pi * f * p * tt) for p, a, d in partials)
    return vel * sig * np.minimum(1, tt / attack)


PIANO = [(1, 1.0, 1.6), (2, 0.35, 3.0), (3, 0.12, 4.5), (4, 0.05, 6.0)]
BELL = [(1, 1.0, 1.8), (2.0, 0.4, 2.6), (3.01, 0.18, 3.5), (4.2, 0.08, 5.0)]
piano = lambda m, v=1.0, d=2.2: tone(m, d, 0.10 * v, PIANO)
bell = lambda m, v=1.0, d=2.0: tone(m, d, 0.065 * v, BELL)

keys = np.zeros(N)
for at, m, v in [(0.2, 76, 0.8), (1.0, 72, 0.7), (1.6, 69, 0.75), (2.5, 71, 0.6)]:   # hook (Am)
    add(keys, at, piano(m, v))
for at, m, v in [(3.45, 77, 0.8), (4.3, 76, 0.6)]:                                   # reveal (F)
    add(keys, at, piano(m, v))
for at, m, v in [(23.95, 72, 0.7), (24.4, 76, 0.7), (24.85, 79, 0.75), (25.3, 84, 0.6)]:  # outro
    add(keys, at, piano(m, v, 3.0))

# Monitor beep + soft heartbeat at 66 BPM under the OR scenes.
mon = np.zeros(N)
beat = 60 / 66
at = 5.6
while at < 21.3:
    n = int(0.07 * SR)
    tt = np.arange(n) / SR
    add(mon, at, 0.035 * np.sin(2 * np.pi * hz(81) * tt) * env(n, 0.004, 0.02))   # A5 beep
    for off, amp in ((0.0, 0.16), (0.24, 0.10)):                                   # lub-dub
        n2 = int(0.18 * SR)
        t2 = np.arange(n2) / SR
        f = 58 * np.exp(-t2 * 6)
        add(mon, at + off, amp * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t2 * 18))
    at += beat

fx = np.zeros(N)
add(fx, 7.5, bell(76, 0.7, 1.2)); add(fx, 7.68, bell(72, 0.7, 1.4))            # blocked: E5 -> C5
for i, m in enumerate([84, 88, 91]):                                           # time-out complete: C6 E6 G6
    add(fx, 10.4 + i * 0.08, bell(m, 0.7, 2.0))
add(fx, 13.5, bell(81, 0.6, 1.5)); add(fx, 13.5, bell(84, 0.4, 1.5))            # read-back confirmed
add(fx, 14.6, bell(77, 0.75, 1.2)); add(fx, 14.78, bell(74, 0.75, 1.4))         # allergy: F5 -> D5
for start in (17.1, 17.45):                                                    # phone ring bursts
    for k in range(6):
        add(fx, start + k * 0.045, bell(88 if k % 2 == 0 else 84, 0.35, 0.25))
add(fx, 17.7, bell(81, 0.6, 1.0)); add(fx, 17.8, bell(88, 0.55, 1.4))           # connected
add(fx, 21.6, bell(84, 0.55, 1.6)); add(fx, 21.7, bell(91, 0.45, 1.8))          # record ready

left = pad + bass + keys + mon * 0.9 + fx * 0.9
right = pad * 0.97 + bass + keys * 0.95 + mon + fx


def space(x, taps):
    out = np.zeros_like(x)
    for d, g in taps:
        i = int(d * SR)
        out[i:] += g * x[:-i]
    return out


TAPS_L = [(0.029, 0.30), (0.047, 0.25), (0.073, 0.21), (0.109, 0.17), (0.151, 0.13), (0.211, 0.10), (0.283, 0.07)]
TAPS_R = [(0.033, 0.29), (0.053, 0.24), (0.079, 0.20), (0.117, 0.16), (0.163, 0.12), (0.227, 0.09), (0.301, 0.06)]
left = left + space(space(left, TAPS_L), TAPS_R) * 0.3
right = right + space(space(right, TAPS_R), TAPS_L) * 0.3

ARC = [(0.0, 0.5), (3.2, 0.55), (3.6, 0.8), (5.6, 0.85), (21.4, 0.85), (23.8, 0.95), (26.6, 0.95)]
arc = np.interp(t_all, [a for a, _ in ARC], [g for _, g in ARC])
fade = np.ones(N)
fi, fo = int(0.05 * SR), int(1.4 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
left *= arc * fade
right *= arc * fade

stereo = np.stack([left, right], axis=1)
stereo /= np.max(np.abs(stereo)) / 0.89
with wave.open("music.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype(np.int16).tobytes())
print("wrote music.wav", DUR, "s")
