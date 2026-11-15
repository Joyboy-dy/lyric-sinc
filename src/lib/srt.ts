/** One subtitle: shown from `start` to `end`, in seconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** `75.48` → `00:01:15,480`, the SRT timecode format. */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const ms = total % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

/** `75.48` → `1:15`, for players and short labels. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${pad(total % 60, 2)}`;
}

export function toSrt(cues: Cue[]): string {
  if (cues.length === 0) return "";
  return (
    cues
      .map((cue, i) => `${i + 1}\n${formatTimecode(cue.start)} --> ${formatTimecode(cue.end)}\n${cue.text}`)
      .join("\n\n") + "\n"
  );
}

const TIMING = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

/** Reads SRT text into cues. Tolerates CRLF, missing indexes and `.` as the millisecond separator. */
export function parseSrt(content: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of content.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const timingIndex = lines.findIndex((l) => TIMING.test(l));
    if (timingIndex === -1) continue;
    const m = lines[timingIndex].match(TIMING)!;
    const text = lines
      .slice(timingIndex + 1)
      .join("\n")
      .trim();
    if (!text) continue;
    cues.push({ start: toSeconds(m.slice(1, 5)), end: toSeconds(m.slice(5, 9)), text });
  }
  return cues;
}

/** Index of the cue showing at `time`, or -1 between cues. */
export function cueAt(cues: Cue[], time: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (time < cues[mid].start) hi = mid - 1;
    else if (time >= cues[mid].end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

function toSeconds([h, m, s, ms]: string[]): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
