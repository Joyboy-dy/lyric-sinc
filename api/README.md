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
| `MAX_UPLOAD_MB` | `60` | Largest accepted upload |
| `WHISPER_MODEL` | `large-v3-turbo` | faster-whisper model (also a Docker build argument); `large-v2` is slower and was the previous default |
| `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE` | `cpu`, `int8` | Where and how the model runs |

## Run locally

Needs Python 3.11 and ffmpeg.

```bash
pip install -r requirements.txt
uvicorn server:app --port 7860
```

The first start downloads the Whisper and Demucs weights (several GB). With Docker: `docker build -t lyricsync-api . && docker run -p 7860:7860 lyricsync-api`.

## Tests

The text logic (`lyricsync/text.py`: alignment, segmentation, timing, SRT) has no audio dependency:

```bash
pip install pytest rapidfuzz
pytest
python bench/align_bench.py   # alignment time on songs of 150 to 700 words
```

## Deploy to the Space

Copy this folder into the Space repository and push it, for example:

```bash
git clone https://huggingface.co/spaces/<user>/lyric-sync-api space
rsync -a --delete --exclude .git --exclude tests --exclude .venv api/ space/
cd space && git add -A && git commit -m "Update from lyric-sinc" && git push
```

Authenticate with a Hugging Face token through a credential helper, never inside the remote URL.
