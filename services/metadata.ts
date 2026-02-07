import * as musicMetadata from 'music-metadata-browser';

export interface AudioMetadata {
    artist: string | null;
    title: string | null;
    album: string | null;
    year: string | null;
    duration: number | null;
}

/**
 * Parse filename to extract artist and title
 * Handles common patterns like:
 * - "Artist - Title.mp3"
 * - "Artist-Title.mp3"
 * - "Title - Artist.mp3"
 * - "Title-Artist-Name.wav"
 */
function parseFilename(filename: string): { artist: string | null; title: string | null } {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.(mp3|wav|m4a|flac|ogg|aac)$/i, '');

    // Replace common separators with standard dash
    const normalized = nameWithoutExt
        .replace(/_/g, ' ')
        .replace(/\s*-\s*/g, ' - ')
        .trim();

    // Try to split by " - " first (most common format)
    if (normalized.includes(' - ')) {
        const parts = normalized.split(' - ').map(p => p.trim());
        if (parts.length >= 2) {
            // Could be "Artist - Title" or "Title - Artist"
            return {
                artist: parts[parts.length - 1], // Last part is often artist for downloads
                title: parts.slice(0, -1).join(' - '), // Everything else is title
            };
        }
    }

    // Try splitting by just dash (no spaces)
    if (normalized.includes('-')) {
        const parts = normalized.split('-').map(p => p.trim());
        if (parts.length >= 2) {
            return {
                artist: parts[parts.length - 1],
                title: parts.slice(0, -1).join(' '),
            };
        }
    }

    // No separator found, return the whole thing as title
    return {
        artist: null,
        title: normalized || null,
    };
}

/**
 * Extract metadata from an audio file
 * First tries ID3 tags, then falls back to filename parsing
 */
export async function extractMetadata(file: File): Promise<AudioMetadata> {
    let metadata: AudioMetadata = {
        artist: null,
        title: null,
        album: null,
        year: null,
        duration: null,
    };

    // Try to read ID3 tags
    try {
        const parsed = await musicMetadata.parseBlob(file);
        metadata = {
            artist: parsed.common.artist || null,
            title: parsed.common.title || null,
            album: parsed.common.album || null,
            year: parsed.common.year?.toString() || null,
            duration: parsed.format.duration ? Math.round(parsed.format.duration) : null,
        };
    } catch (error) {
        console.warn('Could not parse ID3 tags:', error);
    }

    // If no artist/title from ID3, try parsing filename
    if (!metadata.artist || !metadata.title) {
        console.log('No ID3 tags found, parsing filename:', file.name);
        const fromFilename = parseFilename(file.name);

        if (!metadata.artist && fromFilename.artist) {
            metadata.artist = fromFilename.artist;
        }
        if (!metadata.title && fromFilename.title) {
            metadata.title = fromFilename.title;
        }
    }

    // Get duration from audio element if not in metadata
    if (!metadata.duration) {
        metadata.duration = await getAudioDuration(file);
    }

    return metadata;
}

/**
 * Get audio duration from file
 */
export async function getAudioDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
        const audio = document.createElement('audio');
        const url = URL.createObjectURL(file);

        audio.addEventListener('loadedmetadata', () => {
            const duration = Math.round(audio.duration);
            URL.revokeObjectURL(url);
            resolve(duration);
        });

        audio.addEventListener('error', () => {
            URL.revokeObjectURL(url);
            resolve(null);
        });

        audio.src = url;
    });
}
