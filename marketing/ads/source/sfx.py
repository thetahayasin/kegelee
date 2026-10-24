"""Builds the soundtrack for one ad: the voiceover plus sound effects.

    python3 sfx.py cues.json out.wav

The cue file comes from ads.html (via render.mjs). It lists a sound effect
for each beat (a thump under each word that slams in, a click on each
countdown second, a chime on the end card)
and, when the ad has one, its voiceover: the take, how much to speed it up,
and the time each spoken phrase should start (see vo.py).

The thump and the whoosh are ElevenLabs sound effects in sfx/. The rest is
synthesised here. There is no music: lay that over the finished video.
"""

import json
import os
import sys
import wave

import numpy as np

from vo import RATE, lines, load, stretch

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)


def env(n, decay):
    return np.exp(-np.arange(n) / RATE * decay)


def sample(name, length):
    """A sound effect file from sfx/, cut to `length` seconds with a short fade out."""
    audio = load(os.path.join(HERE, 'sfx', f'{name}.mp3'))[:int(length * RATE)]
    fade = min(len(audio), int(.08 * RATE))
    audio[-fade:] *= np.linspace(1, 0, fade)
    return audio / (np.max(np.abs(audio)) or 1)


def tick():
    n = int(.04 * RATE)
    t = np.arange(n) / RATE
    return (np.sin(2 * np.pi * 1900 * t) * .6 + rng.standard_normal(n) * .4) * env(n, 170) * .32


def pop():
    n = int(.1 * RATE)
    t = np.arange(n) / RATE
    freq = 520 + 500 * t / .1
    return np.sin(2 * np.pi * np.cumsum(freq) / RATE) * env(n, 38) * .38


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
    tone = np.sign(np.sin(2 * np.pi * 98 * t)) * .5 + np.sin(2 * np.pi * 147 * t) * .5
    return tone * env(n, 9) * .32


SOUNDS = {
    'hit': lambda: sample('hit', .6) * .8,
    'whoosh': lambda: sample('whoosh', .5) * .45,
    'tick': tick, 'pop': pop, 'chime': chime, 'buzz': buzz,
}


def effects(cues, size):
    track = np.zeros(size)
    made = {}
    for cue in cues:
        sound = made.setdefault(cue['type'], SOUNDS[cue['type']]())
        start = int(cue['t'] * RATE)
        end = min(size, start + len(sound))
        if start < end:
            track[start:end] += sound[:end - start]
    return track


def voiceover(spec, size):
    """Cuts the take into phrases and puts each one at its own time."""
    take = load(os.path.join(HERE, spec['file']))
    phrases = lines(take, spec.get('gap', .3))
    if len(phrases) != len(spec['at']):
        sys.exit(f"{spec['file']}: found {len(phrases)} phrases but ads.html places {len(spec['at'])}")
    track = np.zeros(size)
    placed = []
    for (s, e), at in zip(phrases, spec['at']):
        piece = stretch(take[int(s * RATE):int(e * RATE)], spec.get('tempo', 1))
        edge = int(.005 * RATE)
        piece[:edge] *= np.linspace(0, 1, edge)
        piece[-edge:] *= np.linspace(1, 0, edge)
        start = int(at * RATE)
        end = min(size, start + len(piece))
        track[start:end] += piece[:end - start]
        placed.append((at, at + len(piece) / RATE))
    for (a, b), (c, _) in zip(placed, placed[1:]):
        if b > c:
            print(f"  warning: phrase at {a:.2f}s runs to {b:.2f}s, past the next one at {c:.2f}s")
    if placed[-1][1] > size / RATE:
        print(f"  warning: the last phrase runs past the end of the video ({placed[-1][1]:.2f}s)")
    return track / (np.max(np.abs(track)) or 1)


def main(cue_path, out_path):
    spec = json.load(open(cue_path))
    size = int(spec['duration'] * RATE)
    sfx = effects(spec['cues'], size)
    sfx /= np.max(np.abs(sfx)) or 1
    if spec.get('vo'):
        voice = voiceover(spec['vo'], size)
        # Duck the effects while someone is talking, so the voice stays on top.
        hop = int(.02 * RATE)
        level = np.array([np.max(np.abs(voice[i:i + hop])) for i in range(0, size, hop)])
        talking = np.repeat(np.convolve(level > .05, np.ones(8) / 8, 'same'), hop)[:size]
        track = voice + sfx * .42 * (1 - .5 * talking)
    else:
        track = sfx
    track = track / (np.max(np.abs(track)) or 1) * 10 ** (-1 / 20)
    pcm = (np.repeat(track[:, None], 2, axis=1) * 32767).astype('<i2')
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
