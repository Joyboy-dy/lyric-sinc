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

/**
 * Search for synced lyrics on LRCLIB
 * Tries multiple search strategies
 */
export async function searchLyrics(metadata: AudioMetadata): Promise<LRCLIBResponse | null> {
    const { artist, title, duration } = metadata;

    if (!title) {
        console.log('LRCLIB: No title available, cannot search');
        return null;
    }

    // Try different search strategies
    const searchAttempts: Array<{ artist: string; title: string }> = [];

    if (artist && title) {
        // Primary: artist + title as detected
        searchAttempts.push({ artist, title });

        // Try swapped (some filenames are Title-Artist)
        searchAttempts.push({ artist: title, title: artist });
    }

    // Also try just searching by title (broader search)
    if (title) {
        searchAttempts.push({ artist: '', title });
    }

    for (const attempt of searchAttempts) {
        console.log(`LRCLIB: Trying "${attempt.artist}" - "${attempt.title}"`);

        const result = await trySearch(attempt.artist, attempt.title, duration);
        if (result?.syncedLyrics) {
            console.log(`LRCLIB: Found lyrics! Artist: ${result.artistName}, Track: ${result.trackName}`);
            return result;
        }
    }

    // Last resort: try the search endpoint instead of get
    console.log('LRCLIB: Trying search endpoint as last resort...');
    return await searchByQuery(artist, title);
}

async function trySearch(artist: string, title: string, duration: number | null): Promise<LRCLIBResponse | null> {
    const params = new URLSearchParams();

    if (artist) params.append('artist_name', artist);
    if (title) params.append('track_name', title);
    if (duration) params.append('duration', duration.toString());

    try {
        const response = await fetch(`${LRCLIB_API}/get?${params}`, {
            headers: { 'User-Agent': 'LyricSync/1.0' },
        });

        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.warn('LRCLIB search error:', error);
        return null;
    }
}

async function searchByQuery(artist: string | null, title: string | null): Promise<LRCLIBResponse | null> {
    const query = [artist, title].filter(Boolean).join(' ');
    if (!query) return null;

    try {
        const response = await fetch(`${LRCLIB_API}/search?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'LyricSync/1.0' },
        });

        if (response.ok) {
            const results: LRCLIBResponse[] = await response.json();
            // Return first result with synced lyrics
            const withSynced = results.find(r => r.syncedLyrics);
            if (withSynced) {
                console.log(`LRCLIB search: Found "${withSynced.artistName} - ${withSynced.trackName}"`);
                return withSynced;
            }
        }
        return null;
    } catch (error) {
        console.warn('LRCLIB query search error:', error);
        return null;
    }
}
