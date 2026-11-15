FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces run the container as user 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Download the Whisper and Demucs weights at build time, so a sleeping Space wakes up
# without fetching several gigabytes first.
ARG WHISPER_MODEL=large-v2
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')" \
    && python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

COPY --chown=user lyricsync ./lyricsync
COPY --chown=user server.py .

EXPOSE 7860
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
