import { useEffect, useRef } from "react";
import { Copy, Download, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/Timeline";
import { usePlayback } from "@/components/usePlayback";
import { cueAt, formatClock, formatTimecode, toSrt, type Cue } from "@/lib/srt";
import { cn } from "@/lib/utils";

interface ResultPanelProps {
  file: File | null;
  peaks: Float32Array | null;
  duration: number;
  cues: Cue[] | null;
  source: string | null;
  filename: string;
  busy: React.ReactNode;
}

/**
 * The subtitles played against the song: a caption frame like the finished video, the
 * timeline, and the list of cues. Everything stays in sync with the playhead.
 */
export function ResultPanel({ file, peaks, duration, cues, source, filename, busy }: ResultPanelProps) {
  const { playing, time, toggle, seek } = usePlayback(file);
  const list = cues ?? [];
  const active = cueAt(list, time);
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the current cue in view inside the list, without scrolling the page.
  useEffect(() => {
    const container = listRef.current;
    const row = container?.children[active] as HTMLElement | undefined;
    if (!container || !row || !playing) return;
    const top = row.offsetTop - container.offsetTop;
    if (top < container.scrollTop || top + row.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: top - container.clientHeight / 3, behavior: "smooth" });
    }
  }, [active, playing]);

  const srt = cues ? toSrt(cues) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(srt);
      toast.success("SRT copied");
    } catch {
      toast.error("Copy failed: use Download instead");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([srt], { type: "application/x-subrip;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section aria-labelledby="result-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="result-title" className="text-base font-medium">
            Subtitles
          </h2>
          <p className="text-sm text-muted-foreground">
            {cues ? `${cues.length} ${cues.length === 1 ? "line" : "lines"} · ${source}` : "None yet"}
          </p>
        </div>
        {cues && cues.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={copy}>
              <Copy strokeWidth={1.5} />
              Copy
            </Button>
            <Button onClick={download}>
              <Download strokeWidth={1.5} />
              Download .srt
            </Button>
          </div>
        )}
      </div>

      {/* Caption frame: always dark, like the video the subtitles end up on. */}
      <div className="relative flex aspect-[16/7] min-h-36 items-end justify-center overflow-hidden rounded-xl bg-[#0f0f10] px-6 pb-[8%] ring-1 ring-black/5 dark:ring-white/8">
        {busy ? (
          <div className="absolute inset-0 grid place-items-center p-6">{busy}</div>
        ) : cues ? (
          <p
            aria-live="off"
            className={cn(
              "max-w-[90%] text-center text-[clamp(1rem,2.6vw,1.6rem)] leading-snug font-medium whitespace-pre-line text-white transition-opacity duration-150",
              active === -1 && "opacity-0",
            )}
            style={{ textShadow: "0 1px 2px rgb(0 0 0 / 0.6)" }}
          >
            {list[active]?.text ?? list[0]?.text}
          </p>
        ) : (
          <p className="max-w-sm self-center text-center text-sm text-[#a1a1a6]">
            {file ? "Subtitles play here, over the song, once they are ready" : "Drop a song to start"}
          </p>
        )}
      </div>

      {file && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="rounded-full"
            >
              {playing ? <Pause strokeWidth={1.5} /> : <Play strokeWidth={1.5} />}
            </Button>
            <span className="font-mono text-sm tabular-nums">
              {formatClock(time)}
              <span className="text-muted-foreground"> / {formatClock(duration)}</span>
            </span>
          </div>
          {peaks ? (
            <Timeline
              peaks={peaks}
              duration={duration}
              cues={list}
              time={time}
              active={active}
              onSeek={(t) => seek(t)}
            />
          ) : (
            <div className="grid h-26 place-items-center rounded-md bg-raised text-sm text-muted-foreground">
              Reading the waveform
            </div>
          )}
        </div>
      )}

      {cues && cues.length > 0 && (
        <ol
          ref={listRef}
          aria-label="Subtitle lines"
          className="max-h-[28rem] divide-y overflow-y-auto rounded-xl border bg-card"
        >
          {cues.map((cue, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => seek(cue.start, true)}
                aria-current={i === active ? "true" : undefined}
                className={cn(
                  "grid w-full grid-cols-[2.5rem_auto_1fr] items-baseline gap-3 px-4 py-2.5 text-start transition-colors duration-150 outline-none",
                  "hover:bg-raised focus-visible:bg-raised focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  i === active && "bg-raised shadow-[inset_2px_0_0_var(--playhead)]",
                )}
              >
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatTimecode(cue.start)}
                </span>
                <span className="text-sm whitespace-pre-line">{cue.text}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
