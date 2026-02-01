/**
 * Convert LRC format to SRT format
 * 
 * LRC format example:
 * [00:12.00]Line 1
 * [00:17.20]Line 2
 * 
 * SRT format example:
 * 1
 * 00:00:12,000 --> 00:00:17,200
 * Line 1
 * 
 * 2
 * 00:00:17,200 --> 00:00:21,500
 * Line 2
 */
export function lrcToSrt(lrcContent: string): string {
    const lines = lrcContent.split('\n').filter(line => line.trim());
    const timestampedLines: Array<{ time: number; text: string }> = [];

    // Parse LRC lines
    for (const line of lines) {
        const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/);
        if (match) {
            const [, minutes, seconds, centiseconds, text] = match;
            const time =
                parseInt(minutes) * 60 +
                parseInt(seconds) +
                parseInt(centiseconds.padEnd(3, '0')) / 1000;

            if (text.trim()) {
                timestampedLines.push({ time, text: text.trim() });
            }
        }
    }

    if (timestampedLines.length === 0) {
        return '';
    }

    // Convert to SRT
    const srtLines: string[] = [];

    for (let i = 0; i < timestampedLines.length; i++) {
        const current = timestampedLines[i];
        const next = timestampedLines[i + 1];

        // End time is the start of next line, or +4 seconds if it's the last line
        const endTime = next ? next.time : current.time + 4;

        srtLines.push(
            `${i + 1}`,
            `${formatSrtTime(current.time)} --> ${formatSrtTime(endTime)}`,
            current.text,
            ''
        );
    }

    return srtLines.join('\n');
}

function formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}
