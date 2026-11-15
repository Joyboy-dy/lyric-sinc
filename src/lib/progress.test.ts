import { describe, expect, it, vi } from "vitest";
import { aligningText, startAlignment } from "./progress";
import type { JobView } from "./api";

describe("aligning text", () => {
  it("never promises a safe reload while the song is still uploading", () => {
    const text = aligningText({ sending: true, waking: false, queuedBehind: 0 });
    expect(text).toContain("Sending the song");
    expect(text).not.toMatch(/reload|close/i);
  });

  it("says a reload is safe once the server has the job", () => {
    expect(aligningText({ sending: false, waking: false, queuedBehind: 0 })).toMatch(/reload or close this page/);
  });

  it("counts the songs ahead", () => {
    expect(aligningText({ sending: false, waking: false, queuedBehind: 1 })).toContain("1 song ahead of yours");
    expect(aligningText({ sending: false, waking: false, queuedBehind: 3 })).toContain("3 songs ahead of yours");
  });
});

const view: JobView = { id: "j1", status: "queued", position: 0, srt: null, error: null, createdAt: 1, expiresAt: 2 };

describe("starting an alignment", () => {
  it("returns the job while the page still shows the same song", async () => {
    const cancel = vi.fn(async () => undefined);
    const job = await startAlignment({ create: async () => view, cancel, isCurrent: () => true, now: () => 500 });
    expect(job).toEqual({ id: "j1", createdAt: 500 });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels the job when the page moved on during the upload", async () => {
    const cancel = vi.fn(async () => undefined);
    const job = await startAlignment({ create: async () => view, cancel, isCurrent: () => false, now: () => 500 });
    expect(job).toBeNull();
    expect(cancel).toHaveBeenCalledWith("j1");
  });
});
