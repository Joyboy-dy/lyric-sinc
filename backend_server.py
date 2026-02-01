import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import tempfile
import json
import whisper
import torch
from typing import List, Optional

# --- FFmpeg Configuration (Fix for Windows PATH issues) ---
# Add common FFmpeg installation paths to system PATH
FFMPEG_PATHS = [
    r"C:\ffmpeg\bin",
    r"C:\Program Files\ffmpeg\bin",
    r"C:\Program Files (x86)\ffmpeg\bin",
]
for ffmpeg_path in FFMPEG_PATHS:
    if os.path.exists(ffmpeg_path) and ffmpeg_path not in os.environ["PATH"]:
        os.environ["PATH"] = ffmpeg_path + os.pathsep + os.environ["PATH"]
        print(f"Added {ffmpeg_path} to PATH")

# --- Configuration ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_SIZE = "medium"  # Using 'medium' for better precision on complex songs
INSTRUMENTAL_GAP_THRESHOLD = 1.5  # Seconds of silence to trigger [Instrumental]
MIN_SEGMENT_GAP = 0.05  # Minimum gap between segments to avoid overlaps

app = FastAPI(title="LyricSync Backend (OpenAI Whisper)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "running", "device": DEVICE, "model": MODEL_SIZE, "backend": "openai-whisper"}

def format_timestamp(seconds: float) -> str:
    """Converts seconds to SRT timestamp format (HH:MM:SS,mmm)."""
    milliseconds = int((seconds % 1) * 1000)
    seconds = int(seconds)
    minutes = seconds // 60
    hours = minutes // 60
    seconds %= 60
    minutes %= 60
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

def generate_srt(segments: List[dict]) -> str:
    """Generates SRT content from segments."""
    srt_output = []
    for i, segment in enumerate(segments, 1):
        start = format_timestamp(segment["start"])
        end = format_timestamp(segment["end"])
        text = segment["text"].strip()
        srt_output.append(f"{i}\n{start} --> {end}\n{text}\n")
    return "\n".join(srt_output)

def align_lyrics_to_timestamps(whisper_segments: List[dict], provided_lyrics: str) -> List[dict]:
    """
    Maps user-provided lyrics to Whisper timestamps (Forced Alignment).
    Whisper provides WHEN words are spoken, user provides WHAT text to display.
    """
    # Split provided lyrics into lines (segments)
    lyrics_lines = [line.strip() for line in provided_lyrics.strip().split('\n') if line.strip()]
    
    if not lyrics_lines:
        # No lyrics provided, use Whisper transcription
        return whisper_segments
    
    # We have M lyrics lines and N whisper segments
    # Strategy: Distribute lyrics lines across whisper segments proportionally
    aligned_segments = []
    
    num_lyrics = len(lyrics_lines)
    num_whisper = len(whisper_segments)
    
    if num_lyrics == num_whisper:
        # Perfect 1:1 mapping
        for i, (whisper_seg, lyric_line) in enumerate(zip(whisper_segments, lyrics_lines)):
            aligned_segments.append({
                "start": whisper_seg["start"],
                "end": whisper_seg["end"],
                "text": lyric_line,
                "words": whisper_seg.get("words", [])
            })
    else:
        # Distribute lyrics across available timestamps
        # Use ratio to map lyrics to segments
        for i, lyric_line in enumerate(lyrics_lines):
            # Map lyrics line i to whisper segment based on proportion
            whisper_idx = int((i / num_lyrics) * num_whisper)
            whisper_idx = min(whisper_idx, num_whisper - 1)  # Clamp to valid range
            
            whisper_seg = whisper_segments[whisper_idx]
            aligned_segments.append({
                "start": whisper_seg["start"],
                "end": whisper_seg["end"],
                "text": lyric_line,
                "words": whisper_seg.get("words", [])
            })
    
    return aligned_segments

def post_process_timestamps(segments: List[dict]) -> List[dict]:
    """
    Cleans up timestamps to avoid overlaps and ensure proper gaps.
    """
    if not segments:
        return segments
    
    cleaned = []
    for i, seg in enumerate(segments):
        current = seg.copy()
        
        # Ensure minimum duration
        if current["end"] - current["start"] < 0.1:
            current["end"] = current["start"] + 0.1
        
        # Check for overlap with next segment
        if i < len(segments) - 1:
            next_seg = segments[i + 1]
            if current["end"] > next_seg["start"]:
                # Overlap detected: split the gap
                current["end"] = next_seg["start"] - MIN_SEGMENT_GAP
        
        # Check for overlap with previous segment
        if cleaned:
            prev = cleaned[-1]
            if prev["end"] > current["start"]:
                prev["end"] = current["start"] - MIN_SEGMENT_GAP
        
        cleaned.append(current)
    
    return cleaned

def process_transcription(audio_path: str, provided_lyrics: Optional[str] = None):
    """
    Runs openai-whisper transcription and aligns with provided lyrics if given.
    """
    print(f"Loading model {MODEL_SIZE} on {DEVICE}...")
    model = whisper.load_model(MODEL_SIZE, device=DEVICE)

    print("Transcribing...")
    result = model.transcribe(audio_path, word_timestamps=True, verbose=True)
    
    raw_segments = result["segments"]
    
    # If lyrics provided, use forced alignment
    if provided_lyrics and provided_lyrics.strip():
        print("Applying forced alignment with provided lyrics...")
        aligned_segments = align_lyrics_to_timestamps(raw_segments, provided_lyrics)
    else:
        print("No lyrics provided, using Whisper transcription...")
        aligned_segments = raw_segments
    
    # Post-process to add instrumental gaps and clean timestamps
    processed_segments = []
    all_words = []
    last_end_time = 0.0

    for segment in aligned_segments:
        seg_start = segment["start"]
        seg_end = segment["end"]
        
        # Check for instrumental gap
        gap_duration = seg_start - last_end_time
        
        if gap_duration > INSTRUMENTAL_GAP_THRESHOLD:
            processed_segments.append({
                "start": last_end_time,
                "end": seg_start,
                "text": "[Instrumental]",
                "words": []
            })
            
        # Add segment
        seg_data = {
            "start": seg_start,
            "end": seg_end,
            "text": segment.get("text", ""),
            "words": []
        }
        
        # Process words if available
        if "words" in segment:
            for word in segment["words"]:
                word_data = {
                    "word": word.get("word", ""),
                    "start": word.get("start", seg_start),
                    "end": word.get("end", seg_end),
                    "score": word.get("probability", 1.0)
                }
                seg_data["words"].append(word_data)
                all_words.append(word_data)
        
        processed_segments.append(seg_data)
        last_end_time = seg_end
    
    # Final cleanup
    processed_segments = post_process_timestamps(processed_segments)

    return processed_segments, all_words

@app.post("/align")
async def process_alignment(
    audio_file: UploadFile = File(...),
    lyrics: str = Form(...) 
):
    temp_dir = tempfile.mkdtemp()
    try:
        # Save uploaded file
        file_path = os.path.join(temp_dir, audio_file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)
            
        # Run Pipeline
        processed_segments, all_words = process_transcription(file_path, lyrics)
        
        # Format Output
        srt_content = generate_srt(processed_segments)
        
        return {
            "srt_content": srt_content,
            "word_segments": all_words,
            "full_json": {"segments": processed_segments}
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        shutil.rmtree(temp_dir)

if __name__ == "__main__":
    print("Starting server on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
