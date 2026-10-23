"""Finds the spoken lines in a voiceover take.

The voiceovers are recorded as one take per ad with a long pause between
lines. Each line is cut out at those pauses and placed on the beat of the
scene it belongs to (see sfx.py), so the voice always lands with the words on
screen however fast the take was read.

    python3 vo.py take.mp3 [gap]     prints each line's start and end

A pause between sentences inside a line is short (about 0.3-0.5s); the pause
between lines is long. `gap` is the shortest silence that counts as a break
between lines.
"""

import subprocess
import sys

import numpy as np

RATE = 44100


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(RATE), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, '<i2').astype(np.float64) / 32768


def lines(audio, gap=.62, floor_db=-40):
    """(start, end) in seconds for each stretch of speech separated by at least `gap` of silence."""
    hop = int(.01 * RATE)
    frames = len(audio) // hop
    rms = np.sqrt(np.mean(audio[:frames * hop].reshape(frames, hop) ** 2, axis=1))
    loud = 20 * np.log10(rms + 1e-9) > 20 * np.log10(np.max(rms) + 1e-9) + floor_db
    out, start, quiet = [], None, 0
    for i, on in enumerate(loud):
        if on:
            if start is None:
                start = i
            quiet = 0
        elif start is not None:
            quiet += 1
            if quiet * hop / RATE >= gap:
                out.append((start, i - quiet + 1))
                start, quiet = None, 0
    if start is not None:
        out.append((start, frames - quiet))
    # Pad each line a little so consonants at the edges are not clipped.
    pad = .04
    return [(max(0, s * hop / RATE - pad), e * hop / RATE + pad) for s, e in out]


def stretch(audio, factor):
    """Plays `audio` `factor` times faster without changing its pitch."""
    if factor == 1:
        return audio
    pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
    out = subprocess.run(['ffmpeg', '-v', 'error', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', '-',
                          '-af', f'atempo={factor}', '-f', 's16le', '-'],
                         input=pcm, check=True, capture_output=True).stdout
    return np.frombuffer(out, '<i2').astype(np.float64) / 32768


if __name__ == '__main__':
    gap = float(sys.argv[2]) if len(sys.argv) > 2 else .62
    for s, e in lines(load(sys.argv[1]), gap):
        print(f'{s:6.2f} - {e:6.2f}  ({e - s:4.2f}s)')
