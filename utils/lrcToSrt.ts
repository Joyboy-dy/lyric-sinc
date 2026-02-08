type ParsedLine = { time: number; text: string };

/**
 * Convert synced lyrics (LRC) to SRT.
 * Supports:
 * - [mm:ss.xx] and [mm:ss.xxx]
 * - multiple timestamps per line
 * - [offset:+/-ms] tag
 */
export function lrcToSrt(lrcContent: string): string {
  const lines = (lrcContent || '').split(/\r?\n/);
  const parsed: ParsedLine[] = [];

  let offsetMs = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const offsetMatch = line.match(/^\[offset:([+-]?\d+)\]$/i);
    if (offsetMatch) {
      offsetMs = Number(offsetMatch[1]) || 0;
      continue;
    }

    if (/^\[(ar|ti|al|by|re|ve|length):/i.test(line)) continue;

    const timeTags = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (timeTags.length === 0) continue;

    const text = line.replace(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g, '').trim();
    if (!text) continue;

    for (const tag of timeTags) {
      const minutes = Number(tag[1]);
      const seconds = Number(tag[2]);
      const frac = tag[3] ?? '0';
      const millis = Number(frac.padEnd(3, '0').slice(0, 3));
      const t = minutes * 60 + seconds + millis / 1000 + offsetMs / 1000;
      parsed.push({ time: Math.max(0, t), text });
    }
  }

  if (parsed.length === 0) return '';

  parsed.sort((a, b) => a.time - b.time);

  const uniq: ParsedLine[] = [];
  for (const item of parsed) {
    const prev = uniq[uniq.length - 1];
    if (prev && Math.abs(prev.time - item.time) < 0.001 && prev.text === item.text) continue;
    uniq.push(item);
  }

  const srt: string[] = [];
  for (let i = 0; i < uniq.length; i++) {
    const cur = uniq[i];
    const next = uniq[i + 1];
    let end = next ? next.time : cur.time + 4;
    if (end <= cur.time) end = cur.time + 0.8;

    srt.push(String(i + 1));
    srt.push(`${formatSrtTime(cur.time)} --> ${formatSrtTime(end)}`);
    srt.push(cur.text);
    srt.push('');
  }

  return srt.join('\n').trimEnd() + '\n';
}

function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

