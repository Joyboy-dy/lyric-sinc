import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AudioInput } from "@/components/AudioInput";
import { ResultPanel } from "@/components/ResultPanel";
import { RetentionNote } from "@/components/RetentionNote";
import { ServerStatus } from "@/components/ServerStatus";
import { useJob } from "@/components/useJob";
import { useServerState } from "@/components/useServerState";
import { cancelJob, createJob, type JobView, type SrtMode } from "@/lib/api";
import { lrcToCues } from "@/lib/lrc";
import { findSyncedLyrics } from "@/lib/lrclib";
import { readTrackInfo, srtFilename, type TrackInfo } from "@/lib/metadata";
import { filePeaks } from "@/lib/peaks";
import { aligningText, startAlignment } from "@/lib/progress";
import { clearSession, loadSession, saveAudio, saveState, SESSION_TTL_MS, songKey } from "@/lib/session";
import { formatClock, parseSrt, type Cue } from "@/lib/srt";

const REPO_URL = "https://github.com/Joyboy-dy/lyric-sinc";
const NO_WORDS = "The server found no sung words in this song";
const JOB_GONE =
  "This alignment is no longer on the server. It expires after 24 h or when the server restarts. Align again";

type Lookup =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "found"; label: string }
  | { state: "missing"; reason: string }
  /** A line restored from a previous visit, shown as it was. */
  | { state: "note"; text: string };

interface Result {
  cues: Cue[];
  source: string;
}

/** A server alignment in progress. `createdAt` is this browser's clock, for the elapsed time. */
interface RunningJob {
  id: string;
  createdAt: number;
}

function lookupText(lookup: Lookup): string | null {
  if (lookup.state === "found") return `Synced lyrics found on LRCLIB for ${lookup.label}. The subtitles are ready`;
  if (lookup.state === "missing") return lookup.reason;
  if (lookup.state === "note") return lookup.text;
  return null;
}

export default function App() {
  const ids = { lyricsFile: useId(), tags: useId(), mode: useId() };
  const server = useServerState();

  const [restoring, setRestoring] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [info, setInfo] = useState<TrackInfo | null>(null);
  const [wave, setWave] = useState<{ peaks: Float32Array; duration: number } | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [lyrics, setLyrics] = useState("");
  const [mode, setMode] = useState<SrtMode>("sentence");
  const [instrumentalTags, setInstrumentalTags] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [job, setJob] = useState<RunningJob | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);
  // Lyrics filled in from LRCLIB belong to that song; lyrics the user typed stay.
  const autoLyricsRef = useRef<string | null>(null);

  const working = sending || job !== null;

  const decode = (picked: File, run: number) => {
    filePeaks(picked, 1200)
      .then((w) => run === runRef.current && setWave(w))
      .catch(() => run === runRef.current && setError("This file could not be decoded. Try an MP3, WAV or FLAC"));
  };

  // Back from a reload: the song, its lyrics, the subtitles and any alignment still running.
  useEffect(() => {
    let cancelled = false;
    const run = runRef.current;
    loadSession().then((saved) => {
      if (cancelled) return;
      // A song dropped while the old session was loading wins over it.
      if (saved && run === runRef.current) {
        const { state } = saved;
        setFile(saved.file);
        setCreatedAt(state.createdAt);
        setInfo(state.info);
        setLyrics(state.lyrics);
        autoLyricsRef.current = state.autoLyrics;
        setMode(state.mode);
        setInstrumentalTags(state.instrumentalTags);
        setResult(state.result);
        setLookup(state.lookupNote ? { state: "note", text: state.lookupNote } : { state: "idle" });
        setJob(state.job);
        decode(saved.file, runRef.current);
      }
      setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Kept in this browser while a song is loaded, a moment after each change, at once when an
  // alignment starts or ends: a reload right then must find the job.
  const savedJobRef = useRef<string | null>(null);
  useEffect(() => {
    if (restoring || !file || createdAt === null) return;
    const jobChanged = (job?.id ?? null) !== savedJobRef.current;
    const timer = setTimeout(() => {
      savedJobRef.current = job?.id ?? null;
      void saveState({
        createdAt,
        info,
        lyrics,
        autoLyrics: autoLyricsRef.current,
        mode,
        instrumentalTags,
        result,
        lookupNote: lookupText(lookup),
        job,
        songKey: songKey(file),
      });
    }, jobChanged ? 0 : 400);
    return () => clearTimeout(timer);
  }, [restoring, file, createdAt, info, lyrics, mode, instrumentalTags, result, lookup, job]);

  const onJobEnd = (view: JobView | null, gone: boolean) => {
    setJob(null);
    if (gone) {
      setError(JOB_GONE);
      return;
    }
    if (view?.status === "done") {
      const cues = parseSrt(view.srt ?? "");
      if (cues.length === 0) {
        setError(NO_WORDS);
      } else {
        const from = lyrics.trim() ? "your lyrics" : "the transcription";
        setResult({ cues, source: `aligned on the server from ${from}, ${mode} lines` });
      }
    } else if (view?.status === "failed") {
      setError(view.error || "Alignment failed");
    }
  };
  const live = useJob(job?.id ?? null, onJobEnd);

  const reset = () => {
    if (job) void cancelJob(job.id).catch(() => undefined);
    runRef.current++;
    setFile(null);
    setCreatedAt(null);
    setInfo(null);
    setWave(null);
    setLookup({ state: "idle" });
    setResult(null);
    setJob(null);
    setError(null);
    if (autoLyricsRef.current !== null) {
      setLyrics((current) => (current === autoLyricsRef.current ? "" : current));
      autoLyricsRef.current = null;
    }
  };

  /** Removes the song and what this browser kept for it. Lyrics the user typed stay on screen. */
  const forget = () => {
    reset();
    void clearSession();
  };

  /** "Clear" next to the retention note: back to an empty page. */
  const clearAll = () => {
    forget();
    autoLyricsRef.current = null;
    setLyrics("");
    setMode("sentence");
    setInstrumentalTags(false);
  };

  const selectFile = async (picked: File) => {
    reset();
    const run = runRef.current;
    setFile(picked);
    setCreatedAt(Date.now());
    void saveAudio(picked);
    decode(picked, run);

    const track = await readTrackInfo(picked);
    if (run !== runRef.current) return;
    setInfo(track);

    if (!track.title) {
      setLookup({ state: "missing", reason: "No title in the tags or the file name, so no LRCLIB lookup" });
      return;
    }
    setLookup({ state: "searching" });
    const found = await findSyncedLyrics(track);
    if (run !== runRef.current) return;

    const cues = found?.syncedLyrics ? lrcToCues(found.syncedLyrics, track.duration) : [];
    if (found && cues.length > 0) {
      const label = `${found.artistName} – ${found.trackName}`;
      setLookup({ state: "found", label });
      setResult({ cues, source: "synced lyrics from LRCLIB" });
      setLyrics((current) => {
        if (current.trim() || !found.plainLyrics) return current;
        autoLyricsRef.current = found.plainLyrics;
        return found.plainLyrics;
      });
    } else {
      setLookup({
        state: "missing",
        reason: `LRCLIB has no synced lyrics for “${track.title}”. Align the song on the server instead`,
      });
    }
  };

  const align = async () => {
    if (!file) return;
    setError(null);
    setSending(true);
    const run = runRef.current;
    try {
      const started = await startAlignment({
        create: () => createJob(file, { lyrics, mode, instrumentalTags }),
        cancel: cancelJob,
        isCurrent: () => run === runRef.current,
      });
      if (started) setJob(started);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alignment failed");
    } finally {
      setSending(false);
    }
  };

  const cancel = () => {
    if (job) void cancelJob(job.id).catch(() => undefined);
    setJob(null);
  };

  const serverUsable = server === "online" || server === "waking";
  const fromServer = result?.source.startsWith("aligned") ?? false;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <a href="/" className="flex items-center gap-2 text-base font-medium">
              <Mark />
              LyricSync
            </a>
            <div className="flex items-center gap-1">
              <ServerStatus state={server} />
              <Button variant="ghost" asChild className="hidden sm:inline-flex">
                <a href={REPO_URL}>Source code</a>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
          <div className="mb-10 max-w-2xl">
            <h1 className="text-3xl leading-tight font-medium tracking-[-0.02em] sm:text-4xl">
              Subtitles timed to the vocals, for lyric videos
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Drop a song and get an SRT file. If LRCLIB already has synced lyrics for it, they are ready at once.
              Otherwise the server isolates the vocals and lines your lyrics up with them.
            </p>
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
            <div className="flex flex-col gap-8">
              <Step number={1} title="Song">
                <AudioInput file={file} info={info} disabled={working} onSelect={selectFile} onClear={forget} />
                <LookupLine lookup={lookup} />
              </Step>

              <Step number={2} title="Lyrics" hint="Optional. The subtitles then use your exact words">
                <Textarea
                  aria-label="Lyrics"
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  disabled={working}
                  placeholder="One line per subtitle line"
                  className="max-h-80 min-h-36 resize-y overflow-y-auto text-sm leading-relaxed"
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <label htmlFor={ids.lyricsFile} aria-disabled={working || undefined} className="aria-disabled:opacity-50">
                      <FileText strokeWidth={1.5} />
                      Import .txt
                      <input
                        id={ids.lyricsFile}
                        type="file"
                        accept=".txt,.lrc,text/plain"
                        disabled={working}
                        className="sr-only"
                        onChange={async (e) => {
                          const text = await e.target.files?.[0]?.text();
                          if (text !== undefined) setLyrics(text.replace(/\[[^\]]*\]/g, "").trim());
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </Button>
                  {lyrics && (
                    <Button variant="ghost" size="sm" onClick={() => setLyrics("")} disabled={working}>
                      Clear
                    </Button>
                  )}
                </div>
              </Step>

              <Step number={3} title="Align on the server" hint="Only needed when LRCLIB has nothing, or to use your lyrics">
                <div className="flex flex-col gap-2">
                  <Label id={ids.mode}>Line length</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    value={mode}
                    onValueChange={(v) => v && setMode(v as SrtMode)}
                    aria-labelledby={ids.mode}
                    className="grid w-full grid-cols-2"
                    disabled={working}
                  >
                    <ToggleGroupItem value="sentence" className="h-9 data-[state=on]:bg-raised">
                      Short lines
                    </ToggleGroupItem>
                    <ToggleGroupItem value="paragraph" className="h-9 data-[state=on]:bg-raised">
                      Long blocks
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <p className="text-xs text-muted-foreground">
                    {mode === "sentence"
                      ? "About 8 words, split at punctuation and pauses"
                      : "The phrases as Whisper hears them, up to 24 words"}
                  </p>
                </div>
                <div className="flex min-h-10 items-center justify-between gap-4">
                  <Label htmlFor={ids.tags} className="font-normal">
                    Mark instrumental breaks
                  </Label>
                  <Switch
                    id={ids.tags}
                    checked={instrumentalTags}
                    onCheckedChange={setInstrumentalTags}
                    disabled={working}
                  />
                </div>
                {job ? (
                  <Button variant="outline" size="lg" className="h-11" onClick={cancel}>
                    Cancel
                  </Button>
                ) : (
                  <Button size="lg" className="h-11" onClick={align} disabled={!file || !serverUsable || sending}>
                    {sending ? "Sending the song" : fromServer ? "Align again" : "Align with the vocals"}
                  </Button>
                )}
                {!serverUsable && server !== "checking" && (
                  <p className="text-xs text-muted-foreground">
                    The alignment server is unavailable. Synced lyrics from LRCLIB still work
                  </p>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle strokeWidth={1.5} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </Step>
            </div>

            <ResultPanel
              file={file}
              peaks={wave?.peaks ?? null}
              duration={wave?.duration ?? info?.duration ?? 0}
              cues={result?.cues ?? null}
              source={result?.source ?? null}
              filename={srtFilename(info ?? { artist: null, title: null }, file?.name ?? "subtitles")}
              busy={
                working && (
                  <Aligning
                    since={job?.createdAt ?? null}
                    waking={server === "waking"}
                    queuedBehind={live?.status === "queued" ? live.position : 0}
                  />
                )
              }
              note={
                file &&
                createdAt !== null && (
                  <>
                    <RetentionNote expiresAt={createdAt + SESSION_TTL_MS} onClear={clearAll} />
                    {fromServer && (
                      <p className="text-sm text-muted-foreground">
                        Server results are kept up to 24 h. A server restart can erase them sooner
                      </p>
                    )}
                  </>
                )
              }
            />
          </div>
        </main>

        <footer className="border-t">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
            <span>
              Synced lyrics from{" "}
              <a href="https://lrclib.net" className="underline underline-offset-4 hover:text-foreground">
                LRCLIB
              </a>
            </span>
            <span>Vocal alignment with Demucs and faster-whisper</span>
            <a href={REPO_URL} className="underline underline-offset-4 hover:text-foreground sm:hidden">
              Source code
            </a>
            <span>MIT licence</span>
          </div>
        </footer>
      </div>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}

function Step({
  number,
  title,
  hint,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="flex items-baseline gap-2 text-base font-medium">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">0{number}</span>
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function LookupLine({ lookup }: { lookup: Lookup }) {
  if (lookup.state === "idle") return null;
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
      {lookup.state === "searching" && (
        <>
          <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" strokeWidth={1.5} />
          Looking for synced lyrics on LRCLIB
        </>
      )}
      {lookup.state === "found" && (
        <span>
          <span className="text-foreground">Synced lyrics found on LRCLIB</span> for {lookup.label}. The subtitles are
          ready
        </span>
      )}
      {lookup.state === "missing" && <span>{lookup.reason}</span>}
      {lookup.state === "note" && <span>{lookup.text}</span>}
    </p>
  );
}

function Aligning({ since, waking, queuedBehind }: { since: number | null; waking: boolean; queuedBehind: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (since === null) return;
    const tick = () => setElapsed((Date.now() - since) / 1000);
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [since]);

  const text = aligningText({ sending: since === null, waking, queuedBehind });

  return (
    <div role="status" className="flex max-w-sm flex-col items-center gap-2 text-center">
      <span className="font-mono text-2xl text-white tabular-nums">{formatClock(elapsed)}</span>
      <p className="text-sm text-[#a1a1a6]">{text}</p>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <rect x="3" y="14" width="18" height="2.5" rx="1.25" className="fill-foreground/35" />
      <rect x="6" y="18.5" width="12" height="2.5" rx="1.25" className="fill-foreground/35" />
      <rect x="11" y="3" width="2" height="18" rx="1" className="fill-playhead" />
      <rect x="9" y="3" width="6" height="3" rx="1" className="fill-playhead" />
    </svg>
  );
}
