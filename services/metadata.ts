import jsmediatags from 'jsmediatags';

export interface AudioMetadata {
    artist: string | null;
    title: string | null;
    album: string | null;
    year: string | null;
    duration: number | null; // in seconds
}

/**
 * Extract metadata from an audio file using jsmediatags
 */
export async function extractMetadata(file: File): Promise<AudioMetadata> {
    return new Promise((resolve, reject) => {
        jsmediatags.read(file, {
            onSuccess: (tag) => {
                const tags = tag.tags;
                resolve({
                    artist: tags.artist || null,
                    title: tags.title || null,
                    album: tags.album || null,
                    year: tags.year || null,
                    duration: null, // ID3 doesn't always have duration, we'll get it from audio element
                });
            },
            onError: (error) => {
                console.error('Error reading metadata:', error);
                // Don't reject, just return empty metadata
                resolve({
                    artist: null,
                    title: null,
                    album: null,
                    year: null,
                    duration: null,
                });
            },
        });
    });
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
