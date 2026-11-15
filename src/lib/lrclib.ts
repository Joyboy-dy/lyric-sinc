import type { TrackInfo } from "./metadata";

/** A track as LRCLIB returns it (https://lrclib.net/docs). */
export interface LrclibTrack {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const API = "https://lrclib.net/api";

/** Drops what LRCLIB titles rarely carry: `(Official Video)`, `[Remastered]`, `feat. X`. */
export function cleanQuery(value: string): string {
  return value
    .replace(/\s*[[(][^\])]*[\])]\s*/g, " ")
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds synced lyrics for a track: exact lookups first (artist and title, then swapped in
 * case the file name had them the other way round, then the title alone), then a free search.
 */
export async function findSyncedLyrics(
  info: TrackInfo,
  fetcher: typeof fetch = fetch,
): Promise<LrclibTrack | null> {
  const title = info.title ? cleanQuery(info.title) : "";
  const artist = info.artist ? cleanQuery(info.artist) : "";
  if (!title) return null;

  const attempts: [string, string][] = artist
    ? [
        [artist, title],
        [title, artist],
        ["", title],
      ]
    : [["", title]];

  for (const [a, t] of attempts) {
    const params = new URLSearchParams({ track_name: t });
    if (a) params.set("artist_name", a);
    if (info.duration) params.set("duration", String(info.duration));
    const track = await getJson<LrclibTrack>(fetcher, `${API}/get?${params}`);
    if (track?.syncedLyrics) return track;
  }

  const results = await getJson<LrclibTrack[]>(
    fetcher,
    `${API}/search?${new URLSearchParams({ q: [artist, title].filter(Boolean).join(" ") })}`,
  );
  const synced = (results ?? []).filter((r) => r.syncedLyrics);
  if (!info.duration) return synced[0] ?? null;
  // Lyrics timed for another cut of the song (radio edit, live) would drift: same length only.
  const closest = synced
    .map((r) => ({ r, gap: Math.abs(r.duration - info.duration!) }))
    .filter(({ gap }) => gap <= DURATION_TOLERANCE)
    .sort((a, b) => a.gap - b.gap)[0];
  return closest?.r ?? null;
}

/** Seconds of difference accepted between the file and a search result. */
export const DURATION_TOLERANCE = 3;

async function getJson<T>(fetcher: typeof fetch, url: string): Promise<T | null> {
  try {
    const response = await fetcher(url);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}
