import { AlignmentResult } from '../types';

// This is the URL where the python backend is expected to run
const API_URL = 'http://localhost:8000';

export class AlignmentService {
  /**
   * Sends audio and lyrics to the Python backend for alignment.
   */
  static async alignAudio(audioFile: File, lyrics: string): Promise<AlignmentResult> {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('lyrics', lyrics);

    try {
      const response = await fetch(`${API_URL}/align`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Alignment failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return data as AlignmentResult;
    } catch (error) {
      console.error("API Error:", error);
      // Check for network error (server down, CORS, etc)
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
        throw new Error("Could not connect to backend server at " + API_URL + ". Is it running? Try 'Demo Mode' for testing.");
      }
      throw error;
    }
  }

  /**
   * Generates mock data for demonstration purposes if the backend is not running.
   */
  static async mockAlign(lyrics: string): Promise<AlignmentResult> {
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    const words = lyrics.split(/\s+/).filter(w => w.length > 0);
    const mockSegments = [];
    let currentTime = 0.5;

    const wordTimestamps = words.map((word) => {
      const duration = 0.3 + Math.random() * 0.4;
      const start = currentTime;
      const end = parseFloat((currentTime + duration).toFixed(3));
      currentTime = end + 0.1; // small gap
      return { word, start, end, score: 0.95 };
    });

    // Create chunks of ~5 words for SRT segments
    const chunkSize = 5;
    for (let i = 0; i < wordTimestamps.length; i += chunkSize) {
      const chunk = wordTimestamps.slice(i, i + chunkSize);
      if (chunk.length > 0) {
        mockSegments.push({
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          text: chunk.map(w => w.word).join(' '),
          words: chunk
        });
      }
    }

    // Generate SRT string
    const srtContent = mockSegments.map((seg, index) => {
      const formatTime = (seconds: number) => {
        const date = new Date(0);
        date.setMilliseconds(seconds * 1000);
        return date.toISOString().substr(11, 12).replace('.', ',');
      };
      
      return `${index + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text}\n`;
    }).join('\n');

    return {
      srt_content: srtContent,
      word_segments: wordTimestamps,
      full_json: { segments: mockSegments }
    };
  }
}