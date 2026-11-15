import { createStore, del, get, set, type UseStore } from "idb-keyval";
import type { SrtMode } from "./api";
import type { TrackInfo } from "./metadata";
import type { Cue } from "./srt";

/** How long the browser keeps a session, counted from the moment the song was chosen. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface SessionState {
  createdAt: number;
  info: TrackInfo | null;
  lyrics: string;
  /** Lyrics filled in from LRCLIB, so a new song can drop them but not the user's own. */
  autoLyrics: string | null;
  mode: SrtMode;
  instrumentalTags: boolean;
  result: { cues: Cue[]; source: string } | null;
  lookupNote: string | null;
  /** The server alignment in progress, to pick up again after a reload. */
  job: { id: string; createdAt: number } | null;
}

/** The song as stored: a File loses its name in some browsers' storage, so keep it apart. */
interface StoredAudio {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}

const AUDIO = "audio";
const STATE = "state";

let store: UseStore | null | undefined;

/** The IndexedDB store, or null when the browser has none or refuses it (private mode). */
function db(): UseStore | null {
  if (store !== undefined) return store;
  try {
    store = typeof indexedDB === "undefined" ? null : createStore("lyricsync", "session");
  } catch {
    store = null;
  }
  return store;
}

export function isFresh(createdAt: number, now: number): boolean {
  return now - createdAt < SESSION_TTL_MS;
}

export async function saveAudio(file: File): Promise<void> {
  const audio: StoredAudio = { blob: file, name: file.name, type: file.type, lastModified: file.lastModified };
  await quietly(() => set(AUDIO, audio, db()!));
}

export async function saveState(state: SessionState): Promise<void> {
  await quietly(() => set(STATE, state, db()!));
}

/** The saved session, or null when there is none, it is incomplete or older than 24 h. */
export async function loadSession(now = Date.now()): Promise<{ state: SessionState; file: File } | null> {
  const loaded = await quietly(async () => {
    const [state, audio] = await Promise.all([
      get<SessionState>(STATE, db()!),
      get<StoredAudio>(AUDIO, db()!),
    ]);
    return { state, audio };
  });
  if (!loaded?.state || !loaded.audio) return null;
  if (!isFresh(loaded.state.createdAt, now)) {
    await clearSession();
    return null;
  }
  const { blob, name, type, lastModified } = loaded.audio;
  return { state: loaded.state, file: new File([blob], name, { type, lastModified }) };
}

export async function clearSession(): Promise<void> {
  await quietly(() => Promise.all([del(AUDIO, db()!), del(STATE, db()!)]));
}

/** Storage is a convenience: a failure is logged and the app carries on as if nothing was kept. */
async function quietly<T>(work: () => Promise<T>): Promise<T | null> {
  if (!db()) return null;
  try {
    return await work();
  } catch (error) {
    console.warn("LyricSync could not use browser storage", error);
    return null;
  }
}
