import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Api = typeof import("./api");
let api: Api;

beforeEach(async () => {
  vi.stubEnv("VITE_API_URL", "http://api.test/");
  vi.resetModules();
  api = await import("./api");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function respond(status: number, body?: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const options = { lyrics: "la la", mode: "paragraph" as const, instrumentalTags: true };
const song = new File(["abc"], "song.mp3", { type: "audio/mpeg" });

describe("job client", () => {
  it("creates a job and converts times to milliseconds", async () => {
    const { fetcher, calls } = respond(202, {
      id: "j1",
      status: "queued",
      position: 2,
      srt: null,
      error: null,
      created_at: 100,
      expires_at: 86500,
    });
    const job = await api.createJob(song, options, fetcher);
    expect(job).toEqual({
      id: "j1",
      status: "queued",
      position: 2,
      srt: null,
      error: null,
      createdAt: 100_000,
      expiresAt: 86_500_000,
    });
    expect(calls[0].url).toBe("http://api.test/jobs");
    expect(calls[0].init?.method).toBe("POST");
    const form = calls[0].init?.body as FormData;
    expect((form.get("audio_file") as File).name).toBe("song.mp3");
    expect(form.get("lyrics_text")).toBe("la la");
    expect(form.get("srt_mode")).toBe("paragraph");
    expect(form.get("add_instrumental_tags")).toBe("true");
  });

  it("reads a job by id", async () => {
    const { fetcher, calls } = respond(200, {
      id: "j/1",
      status: "done",
      position: 0,
      srt: "1\n",
      error: null,
      created_at: 1,
      expires_at: 2,
    });
    const job = await api.getJob("j/1", fetcher);
    expect(job.srt).toBe("1\n");
    expect(calls[0].url).toBe("http://api.test/jobs/j%2F1");
  });

  it("maps 404 to JobGoneError", async () => {
    const { fetcher } = respond(404, { detail: "Unknown or expired job" });
    await expect(api.getJob("old", fetcher)).rejects.toBeInstanceOf(api.JobGoneError);
  });

  it("surfaces the server detail on 429", async () => {
    const detail = "The queue is full: 5 songs are waiting. Try again in a few minutes";
    const { fetcher } = respond(429, { detail });
    await expect(api.createJob(song, options, fetcher)).rejects.toThrow(detail);
  });

  it("treats a 404 on cancel as done", async () => {
    const { fetcher, calls } = respond(204);
    await api.cancelJob("j1", fetcher);
    expect(calls[0].init?.method).toBe("DELETE");
    await expect(api.cancelJob("j1", respond(404, { detail: "x" }).fetcher)).resolves.toBeUndefined();
  });
});
