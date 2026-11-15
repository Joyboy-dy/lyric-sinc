import { Button } from "@/components/ui/button";

/** "16:20" today, "tomorrow 16:20" otherwise: a session never lasts more than 24 h. */
function until(expiresAt: number): string {
  const date = new Date(expiresAt);
  const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return date.toDateString() === new Date().toDateString() ? time : `tomorrow ${time}`;
}

/** Says how long this browser keeps the session, with a way to forget it now. */
export function RetentionNote({ expiresAt, onClear }: { expiresAt: number; onClear: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>Kept in this browser until {until(expiresAt)}</span>
      <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2">
        Clear
      </Button>
    </p>
  );
}
