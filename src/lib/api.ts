/** Address of the alignment server (the FastAPI app in `api/`), set at build time. */
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export type SrtMode = "sentence" | "paragraph";

export interface AlignOptions {
  lyrics: string;
  mode: SrtMode;
  instrumentalTags: boolean;
}

export type ServerState = "unconfigured" | "online" | "waking" | "offline";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** An alignment queued on the server. Times in milliseconds. */
export interface JobView {
  id: string;
  status: JobStatus;
  /** Songs waiting ahead of this one. */
  position: number;
  srt: string | null;
  error: string | null;
  createdAt: number;
  expiresAt: number;
}

/** The server no longer knows the job: expired after 24 h, or lost when the server restarted. */
export class JobGoneError extends Error {
  constructor() {
    super("This alignment is no longer on the server");
    this.name = "JobGoneError";
  }
}

const NO_ANSWER = "The alignment server did not answer. It may still be waking up: try again in a minute";

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

/** Queues the song for alignment and returns at once. */
export async function createJob(file: File, options: AlignOptions, fetcher: typeof fetch = fetch): Promise<JobView> {
  const response = await call(fetcher, "/jobs", { method: "POST", body: alignForm(file, options) });
  if (!response.ok) throw await errorFrom(response);
  return toJobView(await response.json());
}

export async function getJob(id: string, fetcher: typeof fetch = fetch): Promise<JobView> {
  const response = await call(fetcher, `/jobs/${encodeURIComponent(id)}`);
  if (response.status === 404) throw new JobGoneError();
  if (!response.ok) throw await errorFrom(response);
  return toJobView(await response.json());
}

/** Cancels a job. A job the server no longer knows counts as cancelled. */
export async function cancelJob(id: string, fetcher: typeof fetch = fetch): Promise<void> {
  const response = await call(fetcher, `/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw await errorFrom(response);
}

/** Sends the song and waits for the SRT text (the synchronous route, for older servers). */
export async function alignOnServer(file: File, options: AlignOptions, signal?: AbortSignal): Promise<string> {
  const response = await call(fetch, "/srt", { method: "POST", body: alignForm(file, options), signal });
  if (!response.ok) throw await errorFrom(response);
  return response.text();
}

function alignForm(file: File, options: AlignOptions): FormData {
  const body = new FormData();
  body.append("audio_file", file);
  body.append("lyrics_text", options.lyrics);
  body.append("srt_mode", options.mode);
  body.append("add_instrumental_tags", String(options.instrumentalTags));
  return body;
}

async function call(fetcher: typeof fetch, path: string, init?: RequestInit): Promise<Response> {
  if (!API_URL) throw new Error("No alignment server is configured (VITE_API_URL)");
  try {
    return await fetcher(`${API_URL}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(NO_ANSWER, { cause: error });
  }
}

/** The server's own wording for errors it explains (4xx), a status line otherwise. */
async function errorFrom(response: Response): Promise<Error> {
  let detail = "";
  try {
    const data = await response.json();
    detail = typeof data.detail === "string" ? data.detail.split("\n")[0].slice(0, 200) : "";
  } catch {
    // Not JSON: a proxy or boot page.
  }
  if (response.status < 500 && detail) return new Error(detail);
  return new Error(detail ? `Server error ${response.status}: ${detail}` : `Server error ${response.status}`);
}

interface RawJob {
  id: string;
  status: JobStatus;
  position: number;
  srt: string | null;
  error: string | null;
  created_at: number;
  expires_at: number;
}

function toJobView(raw: RawJob): JobView {
  return {
    id: raw.id,
    status: raw.status,
    position: raw.position,
    srt: raw.srt,
    error: raw.error,
    createdAt: Math.round(raw.created_at * 1000),
    expiresAt: Math.round(raw.expires_at * 1000),
  };
}
