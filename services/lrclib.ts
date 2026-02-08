import type { AudioMetadata } from './metadata';

export interface LRCLIBResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string | null;
}

const LRCLIB_API = 'https://lrclib.net/api';

function normalizeQueryPart(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*[\[\(].*?[\]\)]\s*/g, ' ')
    .replace(/\s+(feat\.|ft\.)\s+.*$/i, '')
    .trim();
}

/**
 * Best-effort search for synced lyrics on LRCLIB.
 * Tries multiple strategies (artist+title, swapped, title-only, and query search).
 */
export async function searchLyrics(metadata: AudioMetadata): Promise<LRCLIBResponse | null> {
  const titleRaw = metadata.title ? normalizeQueryPart(metadata.title) : '';
  const artistRaw = metadata.artist ? normalizeQueryPart(metadata.artist) : '';
  const duration = metadata.duration ?? null;

  if (!titleRaw) return null;

  const attempts: Array<{ artist: string; title: string }> = [];

  if (artistRaw && titleRaw) {
    attempts.push({ artist: artistRaw, title: titleRaw });
    attempts.push({ artist: titleRaw, title: artistRaw });
  }

  attempts.push({ artist: '', title: titleRaw });

  for (const attempt of attempts) {
    const result = await tryGet(attempt.artist, attempt.title, duration);
    if (result?.syncedLyrics) return result;
  }

  return await searchByQuery(artistRaw, titleRaw);
}

async function tryGet(artist: string, title: string, duration: number | null): Promise<LRCLIBResponse | null> {
  const params = new URLSearchParams();
  if (artist) params.set('artist_name', artist);
  if (title) params.set('track_name', title);
  if (duration) params.set('duration', String(duration));

  try {
    const response = await fetch(`${LRCLIB_API}/get?${params.toString()}`, {
      headers: { 'User-Agent': 'LyricSync/1.0' },
    });
    if (!response.ok) return null;
    return (await response.json()) as LRCLIBResponse;
  } catch {
    return null;
  }
}

async function searchByQuery(artist: string, title: string): Promise<LRCLIBResponse | null> {
  const query = [artist, title].filter(Boolean).join(' ').trim();
  if (!query) return null;

  try {
    const response = await fetch(`${LRCLIB_API}/search?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'LyricSync/1.0' },
    });
    if (!response.ok) return null;

    const results = (await response.json()) as LRCLIBResponse[];
    return results.find((r) => r.syncedLyrics) ?? null;
  } catch {
    return null;
  }
}

