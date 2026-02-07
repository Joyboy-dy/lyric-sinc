# LyricSync — Production Lyric-to-SRT

Web app (React + FastAPI) to generate production-grade SRT subtitles for lyric videos using open-source components:

- **Demucs** (vocals isolation)
- **VAD** (instrumental gap detection)
- **faster-whisper** (`large-v2`, CPU int8) for word timestamps
- Optional **lyrics-guided forced matching** (lyrics become the source of truth)

## Workflow

1. Upload audio
2. (Optional) Paste/upload lyrics text
3. Choose SRT mode (**Sentence** / **Paragraph**)
4. Generate SRT
5. Download SRT

## SRT modes

- **Sentence (default)**: short subtitle lines (≈ max 8 words), split on punctuation + VAD silence gaps (editor-friendly).
- **Paragraph**: natural Whisper segments (longer transcript blocks).

## Project structure

- `components/`, `services/`, `utils/`: frontend (React + Vite + TypeScript)
- `lyric-sync-api/`: backend (FastAPI)

## Local dev

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
cd lyric-sync-api
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 7860
```

Set `VITE_API_URL` in `.env.local`:

```bash
VITE_API_URL=http://localhost:7860
```

## Notes

- Backend requires `ffmpeg` available in PATH.
