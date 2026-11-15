import type { JobView } from "./api";

/** The line under the timer while a song is aligned. */
export function aligningText({
  sending,
  waking,
  queuedBehind,
}: {
  sending: boolean;
  waking: boolean;
  queuedBehind: number;
}): string {
  // Until the server has the job, nothing is kept: a reload would lose the upload.
  if (sending) return "Sending the song to the server";
  let text = waking
    ? "Starting the server, then isolating the vocals and aligning the words. "
    : "Isolating the vocals and aligning the words. ";
  if (queuedBehind > 0) text = `${queuedBehind} ${queuedBehind === 1 ? "song" : "songs"} ahead of yours. `;
  return `${text}On the free CPU server this takes a few minutes. You can reload or close this page meanwhile`;
}

/**
 * Sends the song and returns the job to follow, or null when the page moved on during the
 * upload (Clear, another song): that job is cancelled on the server instead of left running.
 */
export async function startAlignment({
  create,
  cancel,
  isCurrent,
  now = Date.now,
}: {
  create: () => Promise<JobView>;
  cancel: (id: string) => Promise<void>;
  isCurrent: () => boolean;
  now?: () => number;
}): Promise<{ id: string; createdAt: number } | null> {
  const startedAt = now();
  const job = await create();
  if (!isCurrent()) {
    await cancel(job.id).catch(() => undefined);
    return null;
  }
  return { id: job.id, createdAt: startedAt };
}
