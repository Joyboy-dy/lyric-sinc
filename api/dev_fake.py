"""Local alignment server without the models, for working on the web app.

Every job waits FAKE_SECONDS (20 by default) and returns the same three subtitles.
Run: python dev_fake.py, then set VITE_API_URL=http://localhost:7860 in .env.local.
"""

import os
import time

os.environ["WHISPER_MODEL"] = "none"

import server  # noqa: E402  (reads WHISPER_MODEL at import)

DEMO_SRT = (
    "1\n00:00:01,000 --> 00:00:04,000\nThe river runs beneath the city lights\n\n"
    "2\n00:00:04,500 --> 00:00:08,000\nI keep on walking through the night\n\n"
    "3\n00:00:08,500 --> 00:00:12,000\nWe will find the way back home\n"
)


def fake_align(source: str, lyrics_text: str, mode: str, instrumental_tags: bool) -> str:
    time.sleep(float(os.environ.get("FAKE_SECONDS", "20")))
    return DEMO_SRT


server.align_audio = fake_align

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(server.app, host="127.0.0.1", port=int(os.environ.get("PORT", "7860")))
