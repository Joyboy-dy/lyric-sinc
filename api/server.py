"""LyricSync alignment server: a song in, an SRT timed to its vocals out.

Pipeline: ffmpeg → Demucs (vocals stem) → WebRTC VAD (sung parts, instrumental gaps) →
faster-whisper (word timestamps) → optional alignment of the user's lyrics → subtitles.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import soundfile as sf
import webrtcvad
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from faster_whisper import WhisperModel

from lyricsync.text import (
    SILENCE_GAP_S,
    Span,
    Word,
    align,
    apply_alignment,
    build_srt,
    enforce_timing,
    instrumental_segments,
    interpolate,
    merge_voiced,
    normalize_token,
    overlaps,
    parse_lyrics,
    segment,
    untimed_runs,
)

# large-v3-turbo: the large-v3 encoder with a 4-layer decoder instead of 32, several times
# faster to transcribe for nearly the same accuracy. Set WHISPER_MODEL=large-v2 to go back.
MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "60"))
# Comma-separated list of front-end origins, "*" by default (the API holds no user data).
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

_model: Optional[WhisperModel] = None
# One song at a time: Demucs and Whisper each fill the CPU and most of the RAM of a free Space.
_job_lock = threading.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _model
    print(f"Loading faster-whisper {MODEL_NAME} on {DEVICE} ({COMPUTE_TYPE})", flush=True)
    _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
    print("Model ready", flush=True)
    yield


app = FastAPI(title="LyricSync", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "HEAD", "POST"],
    allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"])
def root() -> dict:
    return {"service": "LyricSync", "model": MODEL_NAME, "device": DEVICE, "ready": _model is not None}


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict:
    return {"status": "healthy" if _model is not None else "loading"}


# --- Audio ---------------------------------------------------------------------------------


def _run(cmd: list[str]) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        output = (e.stderr or e.stdout or "").replace("\r", "\n")
        tail = "\n".join(line for line in output.splitlines() if line.strip())[-4000:]
        raise HTTPException(status_code=500, detail=f"{cmd[0]} failed\n{tail}") from e


def _to_wav(src: str, dst: str, *, rate: int, mono: bool) -> None:
    _run(["ffmpeg", "-nostdin", "-y", "-i", src, "-vn", "-ac", "1" if mono else "2", "-ar", str(rate), "-f", "wav", dst])


def _clip(src: str, dst: str, start: float, end: float) -> None:
    _run(["ffmpeg", "-nostdin", "-y", "-i", src, "-ss", f"{max(0.0, start):.3f}", "-to", f"{max(0.0, end):.3f}",
          "-ac", "1", "-ar", "16000", "-f", "wav", dst])


def _isolate_vocals(wav: str, work: str) -> str:
    out = os.path.join(work, "separated")
    _run([sys.executable, "-m", "demucs.separate", "-n", "htdemucs", "--two-stems", "vocals", "-o", out, wav])
    stems = sorted(Path(out).rglob("vocals.wav"), key=lambda p: (len(p.parts), str(p)))
    if not stems:
        raise HTTPException(status_code=500, detail="Demucs produced no vocals stem")
    return str(stems[0])


def _sung_spans(wav_16k_mono: str, aggressiveness: int = 2) -> tuple[list[Span], list[Span]]:
    audio, rate = sf.read(wav_16k_mono, dtype="int16", always_2d=True)
    if rate != 16000 or audio.shape[1] != 1:
        raise HTTPException(status_code=500, detail="Voice detection needs 16 kHz mono audio")
    pcm = audio[:, 0].tobytes()
    vad = webrtcvad.Vad(aggressiveness)
    frame = 16000 * 30 // 1000 * 2  # 30 ms of 16-bit samples
    voiced: list[Span] = []
    for offset in range(0, len(pcm) - frame + 1, frame):
        if vad.is_speech(pcm[offset : offset + frame], 16000):
            t0 = offset / 2 / 16000
            voiced.append((t0, t0 + 0.03))
    return merge_voiced(voiced, gap=SILENCE_GAP_S)


def _transcribe(wav_16k_mono: str, beam_size: int) -> list[Word]:
    if _model is None:
        raise HTTPException(status_code=503, detail="The speech model is still loading")
    segments, _info = _model.transcribe(
        wav_16k_mono,
        word_timestamps=True,
        beam_size=beam_size,
        best_of=max(beam_size, 5),
        temperature=0.0,
        vad_filter=False,
        condition_on_previous_text=False,
    )
    words = [
        Word(display=w.word.strip(), norm=normalize_token(w.word), start=float(w.start), end=float(w.end),
             boundary_after=bool(re.search(r"[.!?]+$", w.word.strip())))
        for seg in segments
        for w in (seg.words or [])
        if normalize_token(w.word)
    ]
    return sorted(words, key=lambda w: (w.start, w.end))


def _align_lyrics(lyrics: list[Word], heard: list[Word], vocals: str, voice: list[Span], work: str) -> list[Word]:
    """Lyric words timed by the transcription. Long stretches it missed get a second, closer
    listen (at most three), the rest is interpolated over the sung parts."""
    words = apply_alignment(lyrics, heard, align(lyrics, heard))

    for n, (first, last) in enumerate(r for r in untimed_runs(words) if r[1] - r[0] + 1 >= 10):
        if n >= 3 or first == 0 or last + 1 >= len(words):
            continue
        start = max(0.0, float(words[first - 1].end) - 0.8)  # type: ignore[arg-type]
        end = float(words[last + 1].start) + 0.8  # type: ignore[arg-type]
        if end - start < 2.0:
            continue
        clip = os.path.join(work, f"retry_{n}.wav")
        _clip(vocals, clip, start, end)
        retry = [Word(w.display, w.norm, (w.start or 0.0) + start, (w.end or 0.0) + start, w.boundary_after)
                 for w in _transcribe(clip, beam_size=10)]
        run = words[first : last + 1]
        words[first : last + 1] = [
            fixed if fixed.timed else old for old, fixed in zip(run, apply_alignment(run, retry, align(run, retry)))
        ]

    return interpolate(words, voice=voice)


def _safe_suffix(filename: Optional[str]) -> str:
    suffix = Path(filename or "").suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{1,5}", suffix) else ".audio"


# --- API -----------------------------------------------------------------------------------


@app.post("/srt", response_class=PlainTextResponse)
def generate_srt(
    audio_file: UploadFile = File(...),
    lyrics_text: str = Form(""),
    srt_mode: str = Form("sentence"),
    add_instrumental_tags: bool = Form(False),
):
    """Runs in FastAPI's thread pool (plain `def`), so the server keeps answering /health."""
    mode = (srt_mode or "").strip().lower()
    if mode not in ("sentence", "paragraph"):
        raise HTTPException(status_code=400, detail="srt_mode must be 'sentence' or 'paragraph'")

    work = tempfile.mkdtemp(prefix="lyricsync-")
    try:
        # Never use the client's file name as a path: only a checked extension survives.
        source = os.path.join(work, "input" + _safe_suffix(audio_file.filename))
        with open(source, "wb") as out:
            shutil.copyfileobj(audio_file.file, out)
        if os.path.getsize(source) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"The file is over {MAX_UPLOAD_MB} MB")

        with _job_lock:
            stereo = os.path.join(work, "input.wav")
            _to_wav(source, stereo, rate=44100, mono=False)
            vocals = os.path.join(work, "vocals_16k.wav")
            _to_wav(_isolate_vocals(stereo, work), vocals, rate=16000, mono=True)
            voice, gaps = _sung_spans(vocals)

            heard = _transcribe(vocals, beam_size=6)
            if not heard:
                return PlainTextResponse("", media_type="application/x-subrip")

            if lyrics_text.strip():
                lyrics = parse_lyrics(lyrics_text)
                if not lyrics:
                    raise HTTPException(status_code=400, detail="The lyrics contain no words")
                words = _align_lyrics(lyrics, heard, vocals, voice, work)
            else:
                words = heard

        # No subtitle over an instrumental part.
        subtitles = [s for s in segment(words, mode) if overlaps(s["start"], s["end"], voice)]  # type: ignore[arg-type]
        if add_instrumental_tags:
            subtitles += instrumental_segments(gaps)
        return PlainTextResponse(build_srt(enforce_timing(subtitles)), media_type="application/x-subrip")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 - reported to the client as a 500 with its message
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        audio_file.file.close()
        shutil.rmtree(work, ignore_errors=True)


@app.post("/align", response_class=PlainTextResponse, include_in_schema=False)
def align_compat(
    audio_file: UploadFile = File(...),
    lyrics_text: str = Form(""),
    srt_mode: str = Form("sentence"),
    add_instrumental_tags: bool = Form(False),
):
    """Former name of /srt, kept for older front-end builds."""
    return generate_srt(audio_file, lyrics_text, srt_mode, add_instrumental_tags)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))
