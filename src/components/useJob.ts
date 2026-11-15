import { useEffect, useRef, useState } from "react";
import { getJob, JobGoneError, type JobStatus, type JobView } from "@/lib/api";

/** Every 3 s while the page is in view, every 10 s in a background tab. */
export function pollDelay(visible: boolean): number {
  return visible ? 3000 : 10000;
}

export function isTerminal(status: JobStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

/**
 * Follows a server job until it ends. `onEnd` gets the final job, or `gone` when the server
 * no longer knows it (expired, or lost in a restart). Network errors only delay the next try.
 */
export function useJob(id: string | null, onEnd: (job: JobView | null, gone: boolean) => void): JobView | null {
  const [latest, setLatest] = useState<JobView | null>(null);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    if (!id) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(poll, pollDelay(document.visibilityState === "visible"));
    };

    async function poll() {
      try {
        const job = await getJob(id!);
        if (stopped) return;
        setLatest(job);
        if (isTerminal(job.status)) {
          stopped = true;
          onEndRef.current(job, false);
          return;
        }
      } catch (error) {
        if (stopped) return;
        if (error instanceof JobGoneError) {
          stopped = true;
          onEndRef.current(null, true);
          return;
        }
      }
      schedule();
    }

    // Coming back to the tab: ask at once instead of waiting out the slow interval.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        clearTimeout(timer);
        void poll();
      }
    };

    void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [id]);

  return latest && latest.id === id ? latest : null;
}
