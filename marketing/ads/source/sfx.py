"""Synthesises the sound bed for one ad from its cue list.

    python3 sfx.py cues.json out.wav

Every sound is generated here (no samples, nothing licensed): a low thump
under each word that slams in, a click on each countdown second, a whoosh
when the phone rises and a two-note chime on the end card. It is a bed to
lay music over, not a soundtrack.
"""

import json
import sys
import wave

import numpy as np

RATE = 44100
rng = np.random.default_rng(7)


def env(n, decay):
    return np.exp(-np.arange(n) / RATE * decay)


def hit():
    n = int(.26 * RATE)
    t = np.arange(n) / RATE
    freq = 48 + 70 * np.exp(-t * 22)
    body = np.sin(2 * np.pi * np.cumsum(freq) / RATE) * env(n, 14)
    click = rng.standard_normal(n) * env(n, 260) * .35
    return (body + click) * .9


def tick():
    n = int(.04 * RATE)
    t = np.arange(n) / RATE
    return (np.sin(2 * np.pi * 1900 * t) * .6 + rng.standard_normal(n) * .4) * env(n, 170) * .32


def pop():
    n = int(.1 * RATE)
    t = np.arange(n) / RATE
    freq = 520 + 500 * t / .1
    return np.sin(2 * np.pi * np.cumsum(freq) / RATE) * env(n, 38) * .38


def whoosh():
    n = int(.55 * RATE)
    noise = rng.standard_normal(n)
    # A one-pole low-pass whose cutoff opens and closes, shaped by a swell.
    shape = np.sin(np.pi * np.arange(n) / n) ** 2
    out = np.zeros(n)
    y = 0.0
    for i in range(n):
        a = .02 + .25 * shape[i]
        y += a * (noise[i] - y)
        out[i] = y
    return out * shape * 1.4


def chime():
    n = int(1.4 * RATE)
    t = np.arange(n) / RATE
    first = np.sin(2 * np.pi * 880 * t) * env(n, 4)
    second = np.zeros(n)
    lag = int(.09 * RATE)
    second[lag:] = np.sin(2 * np.pi * 1318.5 * t[:n - lag]) * env(n - lag, 3.5)
    return (first + second) * .22


def buzz():
    n = int(.3 * RATE)
    t = np.arange(n) / RATE
    wave_ = np.sign(np.sin(2 * np.pi * 98 * t)) * .5 + np.sin(2 * np.pi * 147 * t) * .5
    return wave_ * env(n, 9) * .32


SOUNDS = {'hit': hit, 'tick': tick, 'pop': pop, 'whoosh': whoosh, 'chime': chime, 'buzz': buzz}


def main(cue_path, out_path):
    spec = json.load(open(cue_path))
    track = np.zeros(int(spec['duration'] * RATE) + RATE)
    for cue in spec['cues']:
        sound = SOUNDS[cue['type']]()
        start = int(cue['t'] * RATE)
        end = min(len(track), start + len(sound))
        if start < end:
            track[start:end] += sound[:end - start]
    track = track[:int(spec['duration'] * RATE)]
    peak = np.max(np.abs(track)) or 1
    track = track / peak * 10 ** (-3 / 20)
    pcm = (np.repeat(track[:, None], 2, axis=1) * 32767).astype('<i2')
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
