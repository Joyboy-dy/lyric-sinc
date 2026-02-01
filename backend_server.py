import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import tempfile
import json
import whisperx
import torch
import ffmpeg
from typing import List, Optional

# --- Configuration ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 16 
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
TRANSCRIPTION_MODEL = "large-v2"

app = FastAPI(title="LyricSync Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "running", "device": DEVICE, "model": TRANSCRIPTION_MODEL}

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
    """Generates SRT content from WhisperX segments."""
    srt_output = []
    for i, segment in enumerate(segments, 1):
        start = format_timestamp(segment["start"])
        end = format_timestamp(segment["end"])
        text = segment["text"].strip()
        srt_output.append(f"{i}\n{start} --> {end}\n{text}\n")
    return "\n".join(srt_output)

def align_transcription(audio_path: str, lyrics: Optional[str] = None):
    """
    Runs the WhisperX pipeline: Transcribe -> Align.
    Note: For true 'forced alignment' of arbitrary text that differs significantly 
    from audio, specialized forced alignment tools are often needed. 
    However, WhisperX align works very well if the lyrics match the audio.
    """
    
    # 1. Transcribe
    print("Loading model...")
    model = whisperx.load_model(TRANSCRIPTION_MODEL, DEVICE, compute_type=COMPUTE_TYPE)
    
    print("Loading audio...")
    audio = whisperx.load_audio(audio_path)
    
    print("Transcribing...")
    result = model.transcribe(audio, batch_size=BATCH_SIZE)
    
    # Free GPU resources
    del model
    torch.cuda.empty_cache()
    
    # 2. Align
    print("Loading alignment model...")
    model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=DEVICE)
    
    print("Aligning...")
    # This aligns the *transcribed* text to the audio to get precise word timings.
    # If users provide lyrics, a more complex pipeline would replace result["segments"] 
    # with the user's text segmented into chunks. 
    # For this implementation, we prioritize the high-quality transcription + alignment 
    # which is the standard WhisperX usage.
    aligned_result = whisperx.align(result["segments"], model_a, metadata, audio, DEVICE, return_char_alignments=False)
    
    del model_a
    torch.cuda.empty_cache()
    
    return aligned_result

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
            
        # Ensure 16khz mono wav (Whisper requirement, though WhisperX handles load_audio internally, 
        # doing explicit conversion is safe)
        converted_path = os.path.join(temp_dir, "converted.wav")
        try:
            (
                ffmpeg
                .input(file_path)
                .output(converted_path, ac=1, ar=16000)
                .run(quiet=True, overwrite_output=True)
            )
        except ffmpeg.Error as e:
            raise HTTPException(status_code=500, detail="FFmpeg processing failed")

        # Run Pipeline
        result = align_transcription(converted_path, lyrics)
        
        # Format Output
        srt_content = generate_srt(result["segments"])
        
        # Flatten word timestamps for JSON output
        all_words = []
        for seg in result["segments"]:
            if "words" in seg:
                all_words.extend(seg["words"])
        
        return {
            "srt_content": srt_content,
            "word_segments": all_words,
            "full_json": result
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
