import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "./session";

type Session = typeof import("./session");
let session: Session;

beforeEach(async () => {
  vi.resetModules();
  session = await import("./session");
  await session.clearSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function state(overrides: Partial<SessionState> = {}): SessionState {
  return {
    createdAt: 1_000_000,
    info: { artist: "Artist", title: "Title", duration: 180 },
    lyrics: "One line",
    autoLyrics: null,
    mode: "sentence",
    instrumentalTags: false,
    result: { cues: [{ start: 1, end: 2, text: "One line" }], source: "synced lyrics from LRCLIB" },
    lookupNote: "Synced lyrics found on LRCLIB",
    job: { id: "j1", createdAt: 1_000_500 },
    songKey: "song.mp3|3|42",
    ...overrides,
  };
}

const song = () => new File(["abc"], "song.mp3", { type: "audio/mpeg", lastModified: 42 });

describe("browser session", () => {
  it("round-trips state and audio", async () => {
    await session.saveAudio(song());
    await session.saveState(state());
    const loaded = await session.loadSession(1_000_000 + 1000);
    expect(loaded?.state).toEqual(state());
    expect(loaded?.file.name).toBe("song.mp3");
    expect(loaded?.file.type).toBe("audio/mpeg");
    expect(await loaded?.file.text()).toBe("abc");
  });

  it("drops and deletes an expired session", async () => {
    await session.saveAudio(song());
    await session.saveState(state());
    expect(await session.loadSession(1_000_000 + session.SESSION_TTL_MS + 1)).toBeNull();
    expect(await session.loadSession(1_000_000 + 1)).toBeNull();
  });

  it("returns null without audio", async () => {
    await session.saveState(state());
    expect(await session.loadSession(1_000_000 + 1)).toBeNull();
  });

  it("clears everything", async () => {
    await session.saveAudio(song());
    await session.saveState(state());
    await session.clearSession();
    expect(await session.loadSession(1_000_000 + 1)).toBeNull();
  });

  it("returns null when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.resetModules();
    const fresh: Session = await import("./session");
    await expect(fresh.saveAudio(song())).resolves.toBeUndefined();
    await expect(fresh.saveState(state())).resolves.toBeUndefined();
    await expect(fresh.loadSession()).resolves.toBeNull();
    await expect(fresh.clearSession()).resolves.toBeUndefined();
  });

  it("rejects audio of another song than the state", async () => {
    await session.saveAudio(new File(["other song"], "other.mp3", { type: "audio/mpeg", lastModified: 7 }));
    await session.saveState(state());
    expect(await session.loadSession(1_000_000 + 1)).toBeNull();
  });

  it("keys a song by name, size and date", () => {
    expect(session.songKey(song())).toBe("song.mp3|3|42");
  });

  it("isFresh uses a strict 24 h window", () => {
    expect(session.isFresh(0, session.SESSION_TTL_MS - 1)).toBe(true);
    expect(session.isFresh(0, session.SESSION_TTL_MS)).toBe(false);
  });
});
