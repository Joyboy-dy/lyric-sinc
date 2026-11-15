/**
 * Loudness of `buckets` equal slices of a track, from 0 to 1: the peak absolute sample of
 * each slice, scaled so the loudest slice is 1. Enough to draw a waveform.
 */
export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  const peaks = new Float32Array(buckets);
  if (samples.length === 0 || buckets <= 0) return peaks;

  const size = samples.length / buckets;
  let max = 0;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.max(from + 1, Math.floor((b + 1) * size));
    let peak = 0;
    for (let i = from; i < to && i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
    if (peak > max) max = peak;
  }
  if (max > 0) for (let b = 0; b < buckets; b++) peaks[b] /= max;
  return peaks;
}

/** Decodes a file and returns its peaks, mixed down to one channel. */
export async function filePeaks(file: File, buckets: number): Promise<{ peaks: Float32Array; duration: number }> {
  const context = new OfflineAudioContext(1, 1, 44100);
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return { peaks: computePeaks(mono, buckets), duration: buffer.duration };
}
