import * as musicMetadata from 'music-metadata-browser';

export interface AudioMetadata {
    artist: string | null;
    title: string | null;
    album: string | null;
    year: string | null;
    duration: number | null;
}

/**
 * Extract metadata from an audio file using music-metadata-browser
 */
export async function extractMetadata(file: File): Promise<AudioMetadata> {
    try {
        const metadata = await musicMetadata.parseBlob(file);
        return {
            artist: metadata.common.artist || null,
            title: metadata.common.title || null,
            album: metadata.common.album || null,
            year: metadata.common.year?.toString() || null,
            duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
        };
    } catch (error) {
        console.error('Error reading metadata:', error);
        return {
            artist: null,
            title: null,
            album: null,
            year: null,
            duration: null,
        };
    }
}

/**
 * Get audio duration from file (fallback if metadata doesn't have it)
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
