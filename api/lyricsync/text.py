"""Pure logic of the pipeline: words, alignment, segmentation, timing rules and SRT output.

Nothing here touches audio or loads a model, so it runs and is tested without PyTorch.
"""

from __future__ import annotations

import difflib
import re
import statistics
from dataclasses import dataclass, replace
from typing import Literal, Optional

SrtMode = Literal["sentence", "paragraph"]

MIN_GAP_S = 0.08
"""Smallest gap kept between two subtitles."""
MIN_DUR_S = 0.30
"""Shortest time a subtitle stays on screen."""
SILENCE_GAP_S = 0.50
"""A pause this long in the singing starts a new subtitle (and counts as an instrumental gap)."""
LONE_WORD_MAX_GAP_S = 2.0
"""A single word stays with what follows unless the pause after it is at least this long."""

Span = tuple[float, float]


@dataclass(frozen=True)
class Word:
    display: str
    norm: str
    start: Optional[float] = None
    end: Optional[float] = None
    boundary_after: bool = False
    """The word ends a sentence (. ! ?)."""
    line_break_after: bool = False
    """The word ends a line of the lyrics."""

    @property
    def timed(self) -> bool:
        return self.start is not None and self.end is not None


# --- SRT -----------------------------------------------------------------------------------


def format_srt_time(seconds: float) -> str:
    total = int(round(max(0.0, float(seconds)) * 1000))
    hours, rest = divmod(total, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    secs, millis = divmod(rest, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def build_srt(segments: list[dict]) -> str:
    """Numbered SRT text. Segments without text or times are skipped and numbering stays continuous."""
    blocks: list[str] = []
    for seg in segments:
        text = (seg.get("text") or "").strip()
        if not text or seg.get("start") is None or seg.get("end") is None:
            continue
        blocks.append(
            f"{len(blocks) + 1}\n{format_srt_time(seg['start'])} --> {format_srt_time(seg['end'])}\n{text}"
        )
    return "\n\n".join(blocks) + "\n" if blocks else ""


# --- Words ---------------------------------------------------------------------------------

_STRONG_BOUNDARY = re.compile(r"[.!?]+$")
_EDGE_PUNCT = re.compile(r"^[^\w']+|[^\w']+$", re.UNICODE)
_NON_WORD = re.compile(r"[^\w']+", re.UNICODE)


def normalize_token(token: str) -> str:
    token = (token or "").strip().lower()
    token = token.replace("’", "'").replace("‘", "'").replace("´", "'")
    return _NON_WORD.sub("", _EDGE_PUNCT.sub("", token))


def cleanup_spacing(text: str) -> str:
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return text.strip()


def parse_lyrics(lyrics_text: str) -> list[Word]:
    """Lyrics text to words. Line ends and blank lines (verse breaks) are kept as boundaries."""
    words: list[Word] = []
    for line in (lyrics_text or "").splitlines():
        tokens = [t for t in line.split() if normalize_token(t)]
        if not tokens:
            if words:
                words[-1] = replace(words[-1], boundary_after=True, line_break_after=True)
            continue
        for i, tok in enumerate(tokens):
            words.append(
                Word(
                    display=tok,
                    norm=normalize_token(tok),
                    boundary_after=bool(_STRONG_BOUNDARY.search(tok)),
                    line_break_after=i == len(tokens) - 1,
                )
            )
    return words


try:
    # Indel similarity, 2 × common letters / total letters: the same measure as difflib's
    # ratio, computed in C++ and exact where difflib's block heuristic can undercount.
    from rapidfuzz.distance import Indel

    _ratio = Indel.normalized_similarity
except ImportError:  # pragma: no cover - rapidfuzz is in requirements.txt
    def _ratio(a: str, b: str) -> float:
        return difflib.SequenceMatcher(None, a, b).ratio()


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if len(a) >= 3 and (a in b or b in a):
        return 0.86
    return _ratio(a, b)


def _cost(sim: float) -> float:
    return 0.0 if sim >= 0.90 else 0.25 if sim >= 0.82 else 0.6 if sim >= 0.74 else 1.0


def align(lyrics: list[Word], heard: list[Word]) -> list[Optional[int]]:
    """Needleman–Wunsch on normalised words: for each lyric word, the index of the heard word
    it matches, or None. Close spellings ("gonna" / "gon") count as matches."""
    n, m = len(lyrics), len(heard)
    if n == 0 or m == 0:
        return [None] * n

    # Songs repeat their words (choruses), so score each distinct pair of spellings once.
    lyric_ids, heard_ids, sims = _pair_scores([w.norm for w in lyrics], [w.norm for w in heard])
    costs = [[_cost(s) for s in row] for row in sims]

    back = [bytearray(m + 1) for _ in range(n + 1)]  # 0 diagonal, 1 skip lyric, 2 skip heard
    for j in range(1, m + 1):
        back[0][j] = 2
    prev = [float(j) for j in range(m + 1)]
    for i in range(1, n + 1):
        cur = [float(i)] + [0.0] * m
        back[i][0] = 1
        row_costs = costs[lyric_ids[i - 1]]
        row_back = back[i]
        for j in range(1, m + 1):
            best, move = prev[j - 1] + row_costs[heard_ids[j - 1]], 0
            if prev[j] + 1.0 < best:
                best, move = prev[j] + 1.0, 1
            if cur[j - 1] + 1.0 < best:
                best, move = cur[j - 1] + 1.0, 2
            cur[j] = best
            row_back[j] = move
        prev = cur

    mapping: list[Optional[int]] = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        move = back[i][j]
        if move == 0:
            if sims[lyric_ids[i - 1]][heard_ids[j - 1]] >= 0.74:
                mapping[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif move == 1:
            i -= 1
        else:
            j -= 1
    return mapping


def _pair_scores(a: list[str], b: list[str]) -> tuple[list[int], list[int], list[list[float]]]:
    """Index of each word among the distinct spellings, and the similarity of every pair."""
    a_unique = list(dict.fromkeys(a))
    b_unique = list(dict.fromkeys(b))
    a_index = {w: k for k, w in enumerate(a_unique)}
    b_index = {w: k for k, w in enumerate(b_unique)}
    scores = [[similarity(x, y) for y in b_unique] for x in a_unique]
    return [a_index[w] for w in a], [b_index[w] for w in b], scores


def apply_alignment(lyrics: list[Word], heard: list[Word], mapping: list[Optional[int]]) -> list[Word]:
    """Lyric words carrying the times of the heard words they matched."""
    out: list[Word] = []
    for word, j in zip(lyrics, mapping):
        if j is not None and heard[j].timed:
            out.append(replace(word, start=heard[j].start, end=heard[j].end))
        else:
            out.append(replace(word, start=None, end=None))
    return out


def untimed_runs(words: list[Word]) -> list[tuple[int, int]]:
    """(first, last) indexes of each run of consecutive words without times."""
    runs: list[tuple[int, int]] = []
    i = 0
    while i < len(words):
        if words[i].timed:
            i += 1
            continue
        start = i
        while i < len(words) and not words[i].timed:
            i += 1
        runs.append((start, i - 1))
    return runs


def interpolate(words: list[Word], voice: Optional[list[Span]] = None, default_dur: float = 0.25) -> list[Word]:
    """Gives times to words the alignment missed: spread over the sung parts between the known
    neighbours when the singing detector found some, evenly over the gap otherwise."""
    words = list(words)
    durations = [w.end - w.start for w in words if w.timed and w.end > w.start]  # type: ignore[operator]
    avg = statistics.median(durations) if durations else default_dur
    avg = max(0.08, min(0.60, avg))

    def sung_ranges(left: float, right: float) -> list[Span]:
        return [(max(left, s), min(right, e)) for s, e in (voice or []) if min(right, e) > max(left, s)]

    for first, last in untimed_runs(words):
        k = last - first + 1
        before = words[first - 1] if first > 0 else None
        after = words[last + 1] if last + 1 < len(words) else None

        if before and after:
            left, right = float(before.end), float(after.start)  # type: ignore[arg-type]
            ranges = sung_ranges(left, right)
            total = sum(e - s for s, e in ranges)
            for r in range(k):
                if total >= 0.20:
                    target = (r + 1) / (k + 1) * total
                    t, end_limit, acc = left, right, 0.0
                    for s, e in ranges:
                        if acc + (e - s) >= target:
                            t, end_limit = s + (target - acc), e
                            break
                        acc += e - s
                    start, end = t, min(end_limit, t + avg)
                else:
                    step = max(0.001, right - left) / (k + 1)
                    start = left + step * (r + 1)
                    end = min(right, start + min(avg, step * 0.9))
                words[first + r] = replace(words[first + r], start=start, end=max(end, start + 0.06))
        else:
            if after:
                base = max(0.0, float(after.start) - (avg + 0.02) * k)  # type: ignore[arg-type]
            elif before:
                base = float(before.end) + avg + 0.02  # type: ignore[arg-type]
            else:
                base = 0.0
            for r in range(k):
                start = base + (avg + 0.02) * r
                words[first + r] = replace(words[first + r], start=start, end=start + avg)
    return words


# --- Subtitles -----------------------------------------------------------------------------


def segment(words: list[Word], mode: SrtMode, silence_gap: float = SILENCE_GAP_S) -> list[dict]:
    """Groups timed words into subtitles. Sentence mode: short lines (8 words, 7 s) cut at
    punctuation, line ends and pauses. Paragraph mode: longer blocks (24 words, 14 s)."""
    max_words = 8 if mode == "sentence" else 24
    max_dur = 7.0 if mode == "sentence" else 14.0
    segs: list[dict] = []
    cur: list[Word] = []

    def flush() -> None:
        if cur:
            text = cleanup_spacing(" ".join(w.display for w in cur))
            if text:
                segs.append({"start": float(cur[0].start), "end": float(cur[-1].end), "text": text})  # type: ignore[arg-type]
            cur.clear()

    for w in words:
        if not w.timed:
            continue
        gap = float(w.start) - float(cur[-1].end) if cur else 0.0  # type: ignore[arg-type]
        # A pause splits the line, except right after a single word in the middle of a lyric
        # line: a one-word subtitle flashing for a fraction of a second ("I") reads as a glitch.
        lone_word = len(cur) == 1 and not cur[0].line_break_after and not cur[0].boundary_after
        if cur and gap >= silence_gap and not (lone_word and gap < LONE_WORD_MAX_GAP_S):
            flush()
        cur.append(w)
        if (
            len(cur) >= max_words
            or float(cur[-1].end) - float(cur[0].start) >= max_dur  # type: ignore[arg-type]
            or w.boundary_after
            or (mode == "sentence" and w.line_break_after)
            or (mode == "paragraph" and w.line_break_after and len(cur) >= 16)
        ):
            flush()
    flush()
    return segs


def enforce_timing(segments: list[dict]) -> list[dict]:
    """Sorted, never overlapping, each shown at least MIN_DUR_S."""
    fixed: list[dict] = []
    for seg in sorted(segments, key=lambda s: (float(s["start"]), float(s["end"]))):
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        start = max(float(seg["start"]), fixed[-1]["end"] + MIN_GAP_S) if fixed else max(0.0, float(seg["start"]))
        end = max(float(seg["end"]), start + MIN_DUR_S)
        fixed.append({"start": start, "end": end, "text": text})
    return fixed


def overlaps(start: float, end: float, spans: list[Span]) -> bool:
    return any(max(start, s) < min(end, e) for s, e in spans)


def instrumental_segments(gaps: list[Span], min_gap: float = SILENCE_GAP_S) -> list[dict]:
    return [{"start": s, "end": e, "text": "[INSTRUMENTAL]"} for s, e in gaps if e - s >= min_gap]


def merge_voiced(frames: list[Span], tolerance: float = 0.06, gap: float = SILENCE_GAP_S) -> tuple[list[Span], list[Span]]:
    """Voiced frames from the detector to (sung spans, instrumental gaps longer than `gap`)."""
    if not frames:
        return [], []
    merged: list[Span] = []
    cur_s, cur_e = frames[0]
    for s, e in frames[1:]:
        if s <= cur_e + tolerance:
            cur_e = max(cur_e, e)
        else:
            merged.append((cur_s, cur_e))
            cur_s, cur_e = s, e
    merged.append((cur_s, cur_e))
    gaps = [(e1, s2) for (_, e1), (s2, _) in zip(merged, merged[1:]) if s2 - e1 >= gap]
    return merged, gaps
