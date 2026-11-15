import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ServerState } from "@/lib/api";
import { cn } from "@/lib/utils";

const LABEL: Record<ServerState | "checking", string> = {
  checking: "Checking server",
  online: "Server online",
  waking: "Server waking up",
  offline: "Server unreachable",
  unconfigured: "No server set",
};

const HINT: Record<ServerState | "checking", string> = {
  checking: "Asking the alignment server whether it is up",
  online: "Vocal alignment is available",
  waking: "The free server sleeps when idle and takes a minute or two to start. Synced lyrics from LRCLIB work meanwhile",
  offline: "Vocal alignment is unavailable right now. Synced lyrics from LRCLIB still work",
  unconfigured: "Set VITE_API_URL to enable vocal alignment. Synced lyrics from LRCLIB still work",
};

const DOT: Record<ServerState | "checking", string> = {
  checking: "bg-muted-foreground/50",
  online: "bg-positive",
  waking: "bg-playhead",
  offline: "bg-destructive",
  unconfigured: "bg-muted-foreground/50",
};

export function ServerStatus({ state }: { state: ServerState | "checking" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex h-8 cursor-help items-center gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[state])} />
          {LABEL[state]}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{HINT[state]}</TooltipContent>
    </Tooltip>
  );
}
