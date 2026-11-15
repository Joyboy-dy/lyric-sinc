export interface TrackInfo {
  artist: string | null;
  title: string | null;
  /** Seconds, rounded. */
  duration: number | null;
}

const EXTENSION = /\.[a-z0-9]{2,5}$/i;

/**
 * Guesses artist and title from a file name: `Artist - Title.mp3`, `Artist_-_Title.flac`,
 * `Artist-Title.wav`. Without a separator the whole name is the title.
 */
export function parseFilename(filename: string): Pick<TrackInfo, "artist" | "title"> {
  const name = filename.replace(EXTENSION, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return { artist: null, title: null };

  const spaced = name.split(/\s+[-–—]\s+/);
  if (spaced.length >= 2) {
    return { artist: spaced[0] || null, title: spaced.slice(1).join(" - ") || null };
  }
  const dashed = name.split("-").map((p) => p.trim());
  if (dashed.length >= 2 && dashed[0] && dashed[1]) {
    return { artist: dashed[0], title: dashed.slice(1).join(" ") };
  }
  return { artist: null, title: name };
}

/** Download name for the subtitles: `Artist - Title.srt`, else the audio file name. */
export function srtFilename(info: Pick<TrackInfo, "artist" | "title">, audioName: string): string {
  const base =
    info.artist && info.title ? `${info.artist} - ${info.title}` : audioName.replace(EXTENSION, "") || "subtitles";
  const safe = [...base]
    .map((c) => (c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? "-" : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe}.srt`;
}

/** Tags first (ID3, Vorbis, MP4), the file name for whatever is missing. */
export async function readTrackInfo(file: File): Promise<TrackInfo> {
  const info: TrackInfo = { artist: null, title: null, duration: null };

  try {
    const { parseBlob } = await import("music-metadata");
    const parsed = await parseBlob(file, { skipCovers: true });
    info.artist = parsed.common.artist?.trim() || null;
    info.title = parsed.common.title?.trim() || null;
    if (parsed.format.duration) info.duration = Math.round(parsed.format.duration);
  } catch {
    // Unreadable tags: the file name and the audio element still work.
  }

  if (!info.artist || !info.title) {
    const guess = parseFilename(file.name);
    info.artist ??= guess.artist;
    info.title ??= guess.title;
  }
  // LRCLIB matches on duration (±2 s), so it is worth asking the browser when tags lack it.
  info.duration ??= await audioDuration(file);
  return info;
}

function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
