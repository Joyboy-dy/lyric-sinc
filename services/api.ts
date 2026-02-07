import { SrtResult } from '../types';

// API URL must be defined in .env.local (VITE_API_URL)
const API_URL = import.meta.env.VITE_API_URL;

export class SrtService {
  /**
   * Sends audio to the Python backend and returns SRT content.
   */
  static async generateSrt(
    audioFile: File,
    params: { lyricsText?: string; srtMode?: 'sentence' | 'paragraph'; addInstrumentalTags?: boolean } = {}
  ): Promise<SrtResult> {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('srt_mode', params.srtMode ?? 'sentence');
    formData.append('lyrics_text', params.lyricsText ?? '');
    formData.append('add_instrumental_tags', String(params.addInstrumentalTags ?? false));

    try {
      const response = await fetch(`${API_URL}/srt`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SRT generation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const srtContent = await response.text();
      return {
        srt_content: srtContent,
      };
    } catch (error) {
      console.error("API Error:", error);
      // Check for network error (server down, CORS, etc)
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
        throw new Error("Could not connect to backend server at " + API_URL + ". Is it running?");
      }
      throw error;
    }
  }
}
