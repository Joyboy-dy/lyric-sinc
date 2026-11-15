import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Cue } from "@/lib/srt";
import { formatClock } from "@/lib/srt";
import { cn } from "@/lib/utils";

interface TimelineProps {
  peaks: Float32Array | null;
  duration: number;
  cues: Cue[];
  time: number;
  active: number;
  onSeek: (seconds: number) => void;
}

/**
 * The song as an editor shows it: its waveform, the subtitles as blocks on a track under
 * it, and the playhead. Click or drag to move the playhead; arrow keys move it 5 seconds.
 */
export function Timeline({ peaks, duration, cues, time, active, onSeek }: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [scheme, setScheme] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setScheme((n) => n + 1);
    media.addEventListener("change", onScheme);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onScheme);
    };
  }, []);

  // Waveform: bars of the peaks, sung parts drawn darker than the gaps between cues.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || width === 0 || duration <= 0) return;
    const height = 72;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(canvas);
    const strong = styles.getPropertyValue("--foreground").trim() || "#888";
    const step = 3;
    const bar = 2;
    const count = Math.floor(width / step);
    for (let i = 0; i < count; i++) {
      const t = ((i + 0.5) / count) * duration;
      const peak = peaks[Math.min(peaks.length - 1, Math.floor((i / count) * peaks.length))];
      const h = Math.max(2, peak * (height - 8));
      const sung = cues.some((c) => t >= c.start && t < c.end);
      ctx.globalAlpha = sung ? 0.55 : 0.2;
      ctx.fillStyle = strong;
      ctx.fillRect(i * step, (height - h) / 2, bar, h);
    }
  }, [peaks, width, duration, cues, scheme]);

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: 5, ArrowLeft: -5, PageUp: 30, PageDown: -30 };
    if (event.key in moves) onSeek(Math.min(duration, Math.max(0, time + moves[event.key])));
    else if (event.key === "Home") onSeek(0);
    else if (event.key === "End") onSeek(duration);
    else return;
    event.preventDefault();
  };

  const x = duration > 0 ? (time / duration) * width : 0;

  return (
    <div
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label="Position in the song"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        document.documentElement.style.cursor = "ew-resize";
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
      }}
      onLostPointerCapture={() => {
        document.documentElement.style.cursor = "";
      }}
      onKeyDown={onKey}
      className="relative touch-none rounded-md outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block h-18 w-full" />

      <div aria-hidden="true" className="relative mt-2 h-6 rounded-sm bg-raised">
        {duration > 0 &&
          cues.map((cue, i) => (
            <span
              key={i}
              className={cn(
                "absolute inset-y-0 rounded-[3px] border transition-colors duration-150",
                i === active ? "border-playhead bg-playhead/25" : "border-foreground/15 bg-foreground/[0.07]",
              )}
              style={{
                left: `${(cue.start / duration) * 100}%`,
                width: `max(2px, ${((cue.end - cue.start) / duration) * 100}%)`,
              }}
            />
          ))}
      </div>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-y-1 left-0 w-px bg-playhead"
        style={{ transform: `translateX(${x}px)` }}
      >
        <span className="absolute -top-0.5 -left-[3px] size-[7px] rotate-45 rounded-[1px] bg-playhead" />
      </span>
    </div>
  );
}
