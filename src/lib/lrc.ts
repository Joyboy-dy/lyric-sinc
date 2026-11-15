import type { Cue } from "./srt";

/**
 * Longest a line stays on screen when the next one is far away. Without a cap, the last
 * sung line would sit through a whole instrumental break.
 */
export const MAX_LINE_SECONDS = 8;

/** Seconds the final line stays when nothing follows it. */
const LAST_LINE_SECONDS = 4;

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[(ar|ti|al|au|by|re|ve|length|#):/i;

/**
 * Synced lyrics (LRC) to cues. Handles `[mm:ss.xx]` and `[mm:ss.xxx]`, several timestamps on
 * one line (a repeated chorus), the `[offset:±ms]` tag, and skips metadata and empty lines.
 * Pass the track duration so the last line never outlasts the song.
 */
export function lrcToCues(lrc: string, duration?: number | null): Cue[] {
  let offset = 0;
  const timed: { time: number; text: string }[] = [];

  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim();
    const offsetMatch = line.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (offsetMatch) {
      offset = Number(offsetMatch[1]) / 1000;
      continue;
    }
    if (!line || META_TAG.test(line)) continue;

    const tags = [...line.matchAll(TIME_TAG)];
    const text = line.replace(TIME_TAG, "").trim();
    if (tags.length === 0 || !text) continue;

    for (const [, min, sec, frac = "0"] of tags) {
      const time = Number(min) * 60 + Number(sec) + Number(frac.padEnd(3, "0").slice(0, 3)) / 1000;
      // A positive LRC offset means the lyrics should show earlier.
      timed.push({ time: Math.max(0, time - offset), text });
    }
  }

  timed.sort((a, b) => a.time - b.time);
  const unique = timed.filter(
    (t, i) =>
      (i === 0 || t.time !== timed[i - 1].time || t.text !== timed[i - 1].text) &&
      // Lyrics of a longer version than the file (radio edit, preview) stop with the song.
      !(duration && t.time >= duration),
  );

  return unique.map((cur, i) => {
    const next = unique[i + 1];
    let end = next ? Math.min(next.time, cur.time + MAX_LINE_SECONDS) : cur.time + LAST_LINE_SECONDS;
    if (duration) end = Math.min(end, duration);
    if (end <= cur.time) end = cur.time + 0.5;
    return { start: cur.time, end, text: cur.text };
  });
}
