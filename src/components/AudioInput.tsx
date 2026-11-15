import { useId, useState } from "react";
import { FileAudio, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrackInfo } from "@/lib/metadata";
import { formatClock } from "@/lib/srt";
import { cn } from "@/lib/utils";

interface AudioInputProps {
  file: File | null;
  info: TrackInfo | null;
  disabled?: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
}

export function AudioInput({ file, info, disabled, onSelect, onClear }: AudioInputProps) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  if (file) {
    const meta = [
      info?.duration ? formatClock(info.duration) : null,
      `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    ].filter(Boolean);
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-raised/60 p-3">
        <FileAudio aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {info?.artist && info.title ? `${info.artist} – ${info.title}` : file.name}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
            {info?.artist && info.title ? `${file.name} · ` : ""}
            {meta.join(" · ")}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClear} disabled={disabled} aria-label="Remove the song">
          <X strokeWidth={1.5} />
        </Button>
      </div>
    );
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) onSelect(dropped);
      }}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-input px-4 py-8 text-center transition-colors duration-150",
        "hover:bg-raised/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        dragging && "border-playhead bg-raised",
      )}
    >
      <Upload aria-hidden="true" className="size-[18px] text-muted-foreground" strokeWidth={1.5} />
      <span className="text-sm font-medium">Drop a song or choose a file</span>
      <span className="text-xs text-muted-foreground">MP3, WAV, FLAC, M4A or OGG</span>
      <input
        id={id}
        type="file"
        accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac"
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onSelect(picked);
          e.target.value = "";
        }}
      />
    </label>
  );
}
