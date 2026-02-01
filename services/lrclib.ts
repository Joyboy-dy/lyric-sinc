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
 */
export async function searchLyrics(metadata: AudioMetadata): Promise<LRCLIBResponse | null> {
    const { artist, title, duration } = metadata;

    if (!artist || !title) {
        console.log('Missing artist or title, cannot search LRCLIB');
        return null;
    }

    // Build query params
    const params = new URLSearchParams({
        artist_name: artist,
        track_name: title,
    });

    if (duration) {
        params.append('duration', duration.toString());
    }

    try {
        const response = await fetch(`${LRCLIB_API}/get?${params}`, {
            headers: {
                'User-Agent': 'LyricSync/1.0',
            },
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log('No lyrics found on LRCLIB for:', artist, '-', title);
                return null;
            }
            throw new Error(`LRCLIB API error: ${response.status}`);
        }

        const data: LRCLIBResponse = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching from LRCLIB:', error);
        return null;
    }
}
