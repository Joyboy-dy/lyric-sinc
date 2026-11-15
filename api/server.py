"""LyricSync alignment server: a song in, an SRT timed to its vocals out.

Pipeline: ffmpeg → Demucs (vocals stem) → WebRTC VAD (sung parts, instrumental gaps) →
faster-whisper (word timestamps) → optional alignment of the user's lyrics → subtitles.
"""

from __future__ import annotations

import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response

from lyricsync.jobs import Job, JobStore, QueueFull, Worker, delete_files
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

# Jobs database and uploads waiting in the queue. On a free Space this disk is erased at restart.
DATA_DIR = os.environ.get("DATA_DIR", "data")
QUEUE_FULL = "The queue is full: {n} songs are waiting. Try again in a few minutes"

_model: Any = None
# One song at a time: Demucs and Whisper each fill the CPU and most of the RAM of a free Space.
_job_lock = threading.Lock()
_store: Optional[JobStore] = None


class PipelineError(Exception):
    """A failure to report to the user, with the HTTP status the synchronous route answers."""

    def __init__(self, message: str, status: int = 500) -> None:
        super().__init__(message)
        self.status = status


def _process(job: Job) -> str:
    # align_audio is looked up at call time, so tests can swap it.
    return align_audio(job.audio_path or "", job.lyrics, job.mode, job.instrumental_tags)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _model, _store
    if MODEL_NAME != "none":  # "none": no model, for tests and front-end development
        from faster_whisper import WhisperModel

        print(f"Loading faster-whisper {MODEL_NAME} on {DEVICE} ({COMPUTE_TYPE})", flush=True)
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
        print("Model ready", flush=True)

    _store = JobStore(os.path.join(DATA_DIR, "jobs.sqlite"))
    # Jobs cut short by a restart fail; queued ones stay and the worker picks them up.
    _store.recover()
    delete_files(_store.release_finished_audio())
    worker = Worker(_store, _process)
    worker.start()
    try:
        yield
    finally:
        worker.stop()
        _store.close()
        _store = None


app = FastAPI(title="LyricSync", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "HEAD", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"])
def root() -> dict:
    return {"service": "LyricSync", "model": MODEL_NAME, "device": DEVICE, "ready": _model is not None}


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict:
    return {"status": "healthy" if _model is not None or MODEL_NAME == "none" else "loading"}


# --- Audio ---------------------------------------------------------------------------------


def _run(cmd: list[str]) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        output = (e.stderr or e.stdout or "").replace("\r", "\n")
        tail = "\n".join(line for line in output.splitlines() if line.strip())[-4000:]
        raise PipelineError(f"{cmd[0]} failed\n{tail}") from e


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
        raise PipelineError("Demucs produced no vocals stem")
    return str(stems[0])


def _sung_spans(wav_16k_mono: str, aggressiveness: int = 2) -> tuple[list[Span], list[Span]]:
    import soundfile as sf
    import webrtcvad

    audio, rate = sf.read(wav_16k_mono, dtype="int16", always_2d=True)
    if rate != 16000 or audio.shape[1] != 1:
        raise PipelineError("Voice detection needs 16 kHz mono audio")
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
        raise PipelineError("The speech model is still loading", status=503)
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


# --- Pipeline ------------------------------------------------------------------------------


def align_audio(source: str, lyrics_text: str, mode: str, instrumental_tags: bool) -> str:
    """The whole pipeline on one audio file: SRT text, empty when nothing is sung.
    One song at a time across the synchronous route and the job worker."""
    if not os.path.exists(source):
        raise PipelineError("The uploaded song is no longer on the server")
    work = tempfile.mkdtemp(prefix="lyricsync-")
    try:
        with _job_lock:
            stereo = os.path.join(work, "input.wav")
            _to_wav(source, stereo, rate=44100, mono=False)
            vocals = os.path.join(work, "vocals_16k.wav")
            _to_wav(_isolate_vocals(stereo, work), vocals, rate=16000, mono=True)
            voice, gaps = _sung_spans(vocals)

            heard = _transcribe(vocals, beam_size=6)
            if not heard:
                return ""

            if lyrics_text.strip():
                lyrics = parse_lyrics(lyrics_text)
                if not lyrics:
                    raise PipelineError("The lyrics contain no words", status=400)
                words = _align_lyrics(lyrics, heard, vocals, voice, work)
            else:
                words = heard

        # No subtitle over an instrumental part.
        subtitles = [s for s in segment(words, mode) if overlaps(s["start"], s["end"], voice)]  # type: ignore[arg-type,misc]
        if instrumental_tags:
            subtitles += instrumental_segments(gaps)
        return build_srt(enforce_timing(subtitles))
    finally:
        shutil.rmtree(work, ignore_errors=True)


# --- API -----------------------------------------------------------------------------------


def _check_mode(srt_mode: str) -> str:
    mode = (srt_mode or "").strip().lower()
    if mode not in ("sentence", "paragraph"):
        raise HTTPException(status_code=400, detail="srt_mode must be 'sentence' or 'paragraph'")
    return mode


def _save_upload(audio_file: UploadFile, directory: str) -> str:
    """Writes the upload under a random name. The client's file name is never used as a path:
    only a checked extension survives."""
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, secrets.token_hex(8) + _safe_suffix(audio_file.filename))
    try:
        with open(path, "wb") as out:
            shutil.copyfileobj(audio_file.file, out)
    finally:
        audio_file.file.close()
    if os.path.getsize(path) > MAX_UPLOAD_MB * 1024 * 1024:
        os.remove(path)
        raise HTTPException(status_code=413, detail=f"The file is over {MAX_UPLOAD_MB} MB")
    return path


def _view(job: Job) -> dict:
    assert _store is not None
    return {
        "id": job.id,
        "status": job.status,
        "position": _store.position(job.id),
        "srt": job.srt,
        "error": job.error,
        "created_at": job.created_at,
        "expires_at": job.expires_at,
    }


@app.post("/jobs", status_code=202)
def create_job(
    audio_file: UploadFile = File(...),
    lyrics_text: str = Form(""),
    srt_mode: str = Form("sentence"),
    add_instrumental_tags: bool = Form(False),
) -> dict:
    """Queues an alignment and answers at once. Poll GET /jobs/{id} for the result."""
    assert _store is not None
    mode = _check_mode(srt_mode)
    path = _save_upload(audio_file, os.path.join(DATA_DIR, "uploads"))
    try:
        job = _store.create(audio_path=path, mode=mode, lyrics=lyrics_text, instrumental_tags=add_instrumental_tags)
    except QueueFull as full:
        os.remove(path)
        raise HTTPException(status_code=429, detail=QUEUE_FULL.format(n=full.args[0])) from full
    return _view(job)


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    assert _store is not None
    job = _store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown or expired job")
    return _view(job)


@app.delete("/jobs/{job_id}", status_code=204)
def cancel_job(job_id: str) -> Response:
    """Cancels a waiting job. A running one goes to the end but its result is thrown away."""
    assert _store is not None
    if not _store.cancel(job_id):
        raise HTTPException(status_code=404, detail="Unknown, expired or finished job")
    # A job cancelled before it started will never be read: its song goes now.
    delete_files(_store.release_finished_audio())
    return Response(status_code=204)


@app.post("/srt", response_class=PlainTextResponse)
def generate_srt(
    audio_file: UploadFile = File(...),
    lyrics_text: str = Form(""),
    srt_mode: str = Form("sentence"),
    add_instrumental_tags: bool = Form(False),
):
    """Synchronous alignment, kept for older clients. Runs in FastAPI's thread pool."""
    mode = _check_mode(srt_mode)
    work = tempfile.mkdtemp(prefix="lyricsync-upload-")
    try:
        source = _save_upload(audio_file, work)
        srt = align_audio(source, lyrics_text, mode, add_instrumental_tags)
        return PlainTextResponse(srt, media_type="application/x-subrip")
    except PipelineError as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 - reported to the client as a 500 with its message
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
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
