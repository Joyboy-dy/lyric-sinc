---
title: LyricSync API
emoji: 🎤
colorFrom: gray
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# LyricSync API

The alignment server behind [LyricSync](https://github.com/Joyboy-dy/lyric-sinc): a song in, an SRT file timed to its vocals out. This folder is also the content of the Hugging Face Space (the block above is its configuration).

## Pipeline

1. **ffmpeg** converts the upload to WAV.
2. **Demucs** (`htdemucs`, two stems) isolates the vocals.
3. **WebRTC VAD** finds the sung parts and the instrumental gaps.
4. **faster-whisper** (`large-v3-turbo`, CPU, int8) transcribes the vocals with word timestamps.
5. With lyrics: each lyric word is matched to a heard word (Needleman–Wunsch on normalised spellings, similarity from rapidfuzz, each distinct pair of spellings scored once). Long stretches it missed get a second, closer listen, the rest is placed inside the sung parts.
6. Words are grouped into subtitles, nothing is shown over an instrumental, and timing rules apply (no overlap, at least 0.3 s on screen).

## API

### Jobs (used by the web app)

An alignment takes minutes, so the app does not wait on one request: it queues a job and polls it, and a page reload picks the job up again.

| Route | Answer |
| --- | --- |
| `POST /jobs` (same form as `/srt` below) | `202` and the job. `429` when 5 songs are already waiting |
| `GET /jobs/{id}` | The job, or `404` when unknown or expired |
| `DELETE /jobs/{id}` | `204`. A waiting job is dropped; a running one finishes but its result is thrown away |

A job is `{"id", "status", "position", "srt", "error", "created_at", "expires_at"}`, times in epoch seconds. `status` is `queued`, `running`, `done`, `failed` or `cancelled`; `position` counts the songs waiting ahead.

The id is long and random: it is the only key to the result. Jobs live in SQLite (`DATA_DIR/jobs.sqlite`) and are deleted 24 hours after creation, checked every hour. The song is deleted as soon as its job ends. On a free Space the disk is erased when the Space restarts (rebuild, crash, after 48 h asleep), which loses the jobs sooner; a job that was running at restart is marked failed.

### Synchronous

`POST /srt` (multipart form), returns `application/x-subrip`:

| Field | Value |
| --- | --- |
| `audio_file` | The song |
| `lyrics_text` | Optional lyrics, one line per subtitle line |
| `srt_mode` | `sentence` (about 8 words, cut at punctuation and pauses) or `paragraph` (up to 24 words) |
| `add_instrumental_tags` | `true` adds `[INSTRUMENTAL]` subtitles over the breaks |

`GET /health` answers `healthy` once the model is loaded. `POST /align` is the former name of `/srt`.

Songs are processed one at a time; the next request waits for the current one.

## Settings

| Variable | Default | Role |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `*` | Comma-separated front-end origins allowed by CORS |
| `DATA_DIR` | `data` | Jobs database and queued uploads |
| `MAX_UPLOAD_MB` | `60` | Largest accepted upload |
| `WHISPER_MODEL` | `large-v3-turbo` | faster-whisper model (also a Docker build argument); `large-v2` is slower and was the previous default |
| `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE` | `cpu`, `int8` | Where and how the model runs |

## Run locally

Needs Python 3.11 and ffmpeg. `requirements.txt` installs PyTorch for CPU.

```bash
pip install -r requirements.txt
uvicorn server:app --port 7860
```

For work on the web app only, `python dev_fake.py` starts the same API without any model: every job waits 20 seconds (`FAKE_SECONDS`) and returns three demo subtitles.

The first start downloads the Whisper and Demucs weights (several GB). With Docker: `docker build -t lyricsync-api . && docker run -p 7860:7860 lyricsync-api`.

## Tests

The text logic (`lyricsync/text.py`: alignment, segmentation, timing, SRT) has no audio dependency:

```bash
pip install -r requirements-dev.txt
pytest
python bench/align_bench.py   # alignment time on songs of 150 to 700 words
```

## Deploy to the Space

The Space is its own git repository, built by Hugging Face from this `Dockerfile`. Deploy the server before the web app: the app calls `/jobs`.

1. Clone the Space: `git clone https://huggingface.co/spaces/Joyboy-dy/lyric-sync-api space`
2. Copy into it from this folder: `Dockerfile`, `README.md`, `requirements.txt`, `server.py`, `.dockerignore`, `.gitignore` and `lyricsync/`. Leave out `tests/`, `bench/`, `.venv/`, `data/`, `dev_fake.py` and `requirements-dev.txt`.
3. Commit and push with a fine-grained Hugging Face token that has **Write** access to this Space only. Give it to git when it asks (credential manager, or a credential helper that reads an environment variable), **never inside the remote URL**, where it would stay in plain text in `.git/config`.
4. Watch the build in the Space's *Logs* tab, then check that `/health` answers `{"status":"healthy"}`.

Build notes:

- The image is `python:3.11-slim`, which has no C compiler: every dependency must ship a prebuilt wheel. That is why the VAD comes from `webrtcvad-wheels` (same `webrtcvad` module) and not `webrtcvad`.
- PyTorch comes from its CPU index (`torch==…+cpu` in `requirements.txt`). The default build would add about 2.5 GB of CUDA libraries the CPU Space never uses.
- The Whisper and Demucs weights are downloaded at build time, so a sleeping Space wakes without fetching them.
