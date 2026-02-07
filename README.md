# LyricSync — Whisper SRT Generator

Web app (React + FastAPI) to generate SRT subtitles for lyric videos from **audio only** using the official OpenAI Whisper model **`large-v2`** on **CPU**.

## Workflow

1. Upload audio
2. Choose SRT mode (**Lyric** / **Paragraph**)
3. Generate SRT
4. (Optional) Translate subtitles
5. Download final SRT

## SRT modes

- **Lyric (default)**: short subtitle lines (≈ max 8 words), split on punctuation + pauses (editor-friendly).
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

## Translation

Translation runs server-side via OpenAI and requires `OPENAI_API_KEY` on the backend environment.

Optional env var:

- `OPENAI_TRANSLATE_MODEL` (default: `gpt-4o-mini`)

