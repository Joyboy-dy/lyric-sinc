import { useEffect, useState } from "react";
import { checkServer, type ServerState } from "@/lib/api";

/** State of the alignment server, polled every 15 s while it boots. */
export function useServerState() {
  const [state, setState] = useState<ServerState | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const next = await checkServer();
      if (cancelled) return;
      setState(next);
      // Keep asking while it boots, so the dot turns green on its own.
      if (next === "waking") timer = setTimeout(poll, 15_000);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return state;
}
