"""Times the lyric alignment on realistic song sizes. Run: python bench/align_bench.py"""

import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lyricsync.text import Word, align  # noqa: E402

random.seed(1)
# Songs repeat a small vocabulary (choruses), which is what makes caching pay off.
VOCAB = ["".join(random.choice("abcdefghijklmnoprstuvwy") for _ in range(random.randint(2, 8))) for _ in range(180)]


def run(n: int, m: int) -> tuple[float, list]:
    lyrics = [Word(w, w) for w in random.choices(VOCAB, k=n)]
    heard = [Word(w, w, i * 0.4, i * 0.4 + 0.3) for i, w in enumerate(random.choices(VOCAB, k=m))]
    start = time.perf_counter()
    mapping = align(lyrics, heard)
    return time.perf_counter() - start, mapping


for n, m in [(150, 180), (400, 500), (700, 850)]:
    best = min(run(n, m)[0] for _ in range(3))
    print(f"{n:>4} lyric words x {m:>4} heard: {best:.3f} s")
