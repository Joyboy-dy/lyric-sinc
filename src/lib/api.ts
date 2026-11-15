/** Address of the alignment server (the FastAPI app in `api/`), set at build time. */
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export type SrtMode = "sentence" | "paragraph";

export interface AlignOptions {
  lyrics: string;
  mode: SrtMode;
  instrumentalTags: boolean;
}

export type ServerState = "unconfigured" | "online" | "waking" | "offline";

/**
 * Pings the server. A free Hugging Face Space sleeps when idle and answers slowly or with
 * an error page while it boots, so anything but a quick 200 reads as "waking".
 */
export async function checkServer(timeoutMs = 6000): Promise<ServerState> {
  if (!API_URL) return "unconfigured";
  try {
    const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? "online" : "waking";
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError" ? "waking" : "offline";
  }
}

/** Sends the song to the server and returns the SRT text. */
export async function alignOnServer(file: File, options: AlignOptions, signal?: AbortSignal): Promise<string> {
  if (!API_URL) throw new Error("No alignment server is configured (VITE_API_URL)");

  const body = new FormData();
  body.append("audio_file", file);
  body.append("lyrics_text", options.lyrics);
  body.append("srt_mode", options.mode);
  body.append("add_instrumental_tags", String(options.instrumentalTags));

  let response: Response;
  try {
    response = await fetch(`${API_URL}/srt`, { method: "POST", body, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("The alignment server did not answer. It may still be waking up: try again in a minute", {
      cause: error,
    });
  }

  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = typeof data.detail === "string" ? data.detail : "";
    } catch {
      // Not JSON: a proxy or boot page.
    }
    throw new Error(detail ? `Server error ${response.status}: ${firstLine(detail)}` : `Server error ${response.status}`);
  }
  return response.text();
}

function firstLine(text: string): string {
  return text.split("\n")[0].slice(0, 200);
}
