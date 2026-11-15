# Conservation 24 h Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Survive page reloads: the browser keeps the session for 24 h, and server alignments become jobs tracked in SQLite that keep running and can be picked up again after a reload.

**Architecture:** The alignment pipeline in `api/server.py` becomes one function used by the existing synchronous `POST /srt` and by a single worker thread that drains a SQLite job queue (`api/lyricsync/jobs.py`, no ML imports, fully testable). The web app stores the song (Blob) and its state in IndexedDB, creates jobs with `POST /jobs`, and polls `GET /jobs/{id}`, resuming after a reload from the stored job id.

**Tech Stack:** FastAPI, Python `sqlite3` (WAL), pytest + FastAPI `TestClient`; React 19, TypeScript, `idb-keyval`, vitest + `fake-indexeddb`, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-15-conservation-24h-design.md`

## Global Constraints

- Retention: 24 h = `86400` s on the server, `24 * 60 * 60 * 1000` ms in the browser, counted from creation (job creation on the server; song selection in the browser).
- At most `5` jobs in `queued` status at once; beyond that `POST /jobs` answers `429`.
- One song processed at a time across `/srt` and the worker (the existing `_job_lock`).
- Uploaded audio is deleted as soon as its job finishes, fails or is cancelled. Never kept for 24 h.
- Expired jobs purged every `3600` s.
- Job ids: `secrets.token_urlsafe(16)`; they are the only access key.
- SQLite file in `DATA_DIR` (env, default `data` relative to the working directory), `PRAGMA journal_mode=WAL`.
- Polling: every `3000` ms while the tab is visible, `10000` ms while hidden.
- `POST /srt` stays, synchronous, unchanged contract.
- Browser storage failures (private mode, quota, no IndexedDB) never break the app: the app behaves as today.
- UI copy in English, sentence case, no exclamation marks, no trailing period on labels and short lines (unslop rules already applied in the app).
- Every new clickable element follows the cursor grid in `src/index.css` (buttons already get `pointer`, disabled gets `not-allowed`).
- shadcn/ui components only for new UI.

## Review Focus

- **Reload during a running alignment:** after reload the busy view comes back with the right elapsed time and the result appears when the job ends, even if it ended while the page was closed. Pinned by `test_job_done_while_away_is_still_served` (Task 3) and the reload check in Task 6.
- **No IndexedDB (private browsing, blocked storage):** load and save resolve without throwing and the app starts empty. Pinned by `"returns null when IndexedDB is unavailable"` (Task 5).
- **Server restarted mid-job (Space rebuild):** the stored job id answers 404 or `failed`; the app shows why, forgets the id and offers to align again. Pinned by `test_recover_fails_running_and_requeues_queued` (Task 1) and `"maps 404 to JobGoneError"` (Task 4).
- **Session older than 24 h at load:** deleted, app starts empty. Pinned by `"drops and deletes an expired session"` (Task 5).
- **Cancel, then the job finishes anyway:** the result is discarded server-side and the app never shows it. Pinned by `test_finish_after_cancel_keeps_cancelled` (Task 1).

---

### Task 1: Job store (SQLite)

**Files:**
- Create: `api/lyricsync/jobs.py`
- Test: `api/tests/test_jobs.py`
- Modify: `api/.gitignore` (add `data/`)

**Interfaces:**
- Produces:
  - `JobStatus = Literal["queued", "running", "done", "failed", "cancelled"]`
  - `@dataclass(frozen=True) class Job`: `id: str, status: JobStatus, mode: str, lyrics: str, instrumental_tags: bool, audio_path: Optional[str], srt: Optional[str], error: Optional[str], created_at: float, started_at: Optional[float], finished_at: Optional[float], expires_at: float`
  - `class QueueFull(Exception)`
  - `class JobStore(path: str, *, retention_s: float = 86400, max_queued: int = 5, clock: Callable[[], float] = time.time)` with:
    - `create(*, audio_path: str, mode: str, lyrics: str, instrumental_tags: bool) -> Job` (raises `QueueFull`)
    - `get(job_id: str) -> Optional[Job]` (`None` when missing or expired)
    - `position(job_id: str) -> int` (queued jobs created before this one; `0` when running or next)
    - `claim_next() -> Optional[Job]` (oldest queued → `running`, sets `started_at`; atomic)
    - `finish(job_id: str, srt: str) -> None` (→ `done`; no effect if `cancelled`)
    - `fail(job_id: str, error: str) -> None` (→ `failed`; no effect if `cancelled`)
    - `cancel(job_id: str) -> bool` (`queued`/`running` → `cancelled`, `False` otherwise)
    - `clear_audio(job_id: str) -> None` (sets `audio_path` to `NULL`)
    - `purge_expired() -> list[str]` (deletes expired rows, returns their non-null `audio_path`s)
    - `recover() -> list[Job]` (startup: `running` → `failed` with error `"The server restarted during the alignment"`; returns jobs still `queued`)
    - `close() -> None`

- [ ] **Step 1: Write the failing tests** in `api/tests/test_jobs.py`. Fixtures: `t = [1000.0]` (advance with `t[0] += …`) and `store = JobStore(str(tmp_path / "jobs.db"), clock=lambda: t[0])`; `create(...)` below is `store.create(audio_path="a.mp3", mode="sentence", lyrics="", instrumental_tags=False)`:

```python
def test_create_and_get(store): job = store.create(audio_path="a.mp3", mode="sentence", lyrics="", instrumental_tags=False)
    # status "queued", len(job.id) >= 20, expires_at == created_at + 86400, store.get(job.id) == job
def test_ids_are_unique(store): ids = {create(...).id for _ in range(5)}; assert len(ids) == 5
def test_queue_limit(store): 5 creates succeed, the 6th raises QueueFull; after claim_next() one more create succeeds
def test_position_counts_jobs_ahead(store): a, b, c created; position(c.id) == 2; after claim_next() (a running) position(a.id) == 0 and position(c.id) == 1
def test_claim_next_is_fifo_and_marks_running(store): claim_next().id == a.id, status "running", started_at == clock(); a second claim returns b; with nothing queued returns None
def test_finish_and_fail(store): finish(a.id, "1\n...") → status "done", srt kept, finished_at set; fail(b.id, "boom") → status "failed", error "boom"
def test_finish_after_cancel_keeps_cancelled(store): claim a, cancel(a.id) is True, finish(a.id, "x") → status still "cancelled", srt None
def test_cancel_finished_returns_false(store): finish a, cancel(a.id) is False; cancel("nope") is False
def test_expired_jobs_are_hidden_and_purged(store): create a (audio "a.mp3"); t[0] += 86401; get(a.id) is None; purge_expired() == ["a.mp3"]; purge again == []
def test_clear_audio(store): clear_audio(a.id); get(a.id).audio_path is None; purge after expiry returns []
def test_recover_fails_running_and_requeues_queued(tmp_path): store1 creates a, b; claims a; close; store2 = JobStore(same path); queued = store2.recover(); [j.id for j in queued] == [b.id]; store2.get(a.id).status == "failed" and error == "The server restarted during the alignment"
def test_survives_concurrent_threads(tmp_path): on a JobStore(..., max_queued=10), 8 threads each create one job → 8 distinct ids, no exception
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_jobs.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'lyricsync.jobs'`

- [ ] **Step 3: Implement `JobStore` in `api/lyricsync/jobs.py`**

One `sqlite3.connect(path, check_same_thread=False)` guarded by a `threading.Lock`; create the parent directory; `PRAGMA journal_mode=WAL`; one `jobs` table with the `Job` fields (booleans as `INTEGER`). `claim_next` does select + update inside one locked transaction. `get` filters `expires_at > clock()`.

- [ ] **Step 4: Run the tests**

Run: `cd api && .venv/Scripts/python -m pytest -q`
Expected: all pass (13 existing + 12 new)

- [ ] **Step 5: Commit**

```bash
git add api/lyricsync/jobs.py api/tests/test_jobs.py api/.gitignore
git commit -m "Add a SQLite job store with 24-hour retention"
```

---

### Task 2: Worker

**Files:**
- Modify: `api/lyricsync/jobs.py` (append)
- Test: `api/tests/test_jobs.py` (append)

**Interfaces:**
- Consumes: `JobStore`, `Job` (Task 1)
- Produces: `class Worker(store: JobStore, process: Callable[[Job], str], *, idle_wait_s: float = 1.0, purge_every_s: float = 3600)` with:
  - `run_once() -> bool`: claims one job; `process(job)` → `finish(job.id, srt)`; exception → `fail(job.id, str(e) or type name)`; always deletes the audio file (ignore missing) and calls `clear_audio`; returns `False` when nothing was queued
  - `purge() -> None`: `purge_expired()` and deletes the returned audio files
  - `start() -> None` / `stop() -> None`: one daemon thread looping `run_once`, waiting `idle_wait_s` on an `Event` when idle, calling `purge()` every `purge_every_s`

- [ ] **Step 1: Write the failing tests**

```python
def test_worker_processes_and_deletes_audio(store, tmp_path): audio = tmp_path/"a.mp3"; audio.write_bytes(b"x"); job = create(audio_path=str(audio)); w = Worker(store, lambda j: "1\n00:00:00,000 --> 00:00:01,000\nHi\n"); assert w.run_once() is True; get(job.id).status == "done"; not audio.exists(); get(job.id).audio_path is None; w.run_once() is False
def test_worker_records_failures(store, tmp_path): process raises ValueError("bad audio") → status "failed", error "bad audio", audio deleted
def test_worker_discards_result_of_cancelled_job(store, tmp_path): process cancels the job itself then returns "srt" → status "cancelled", srt None
def test_worker_thread_drains_queue(store, tmp_path): Worker(..., idle_wait_s=0.01).start(); create 2 jobs; poll up to 2 s until both "done"; stop()
def test_purge_deletes_files_of_expired_jobs(store, tmp_path): queued job with existing audio file; advance clock 86401; worker.purge(); file gone
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_jobs.py -q`
Expected: FAIL, `ImportError: cannot import name 'Worker'`

- [ ] **Step 3: Implement `Worker`** as specified in Interfaces.

- [ ] **Step 4: Run the tests**

Run: `cd api && .venv/Scripts/python -m pytest -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add api/lyricsync/jobs.py api/tests/test_jobs.py
git commit -m "Add the job worker"
```

---

### Task 3: Job endpoints

**Files:**
- Modify: `api/server.py`
- Create: `api/requirements-dev.txt` (`pytest`, `rapidfuzz`, `fastapi`, `httpx`, `python-multipart`)
- Create: `api/dev_fake.py` (local server without models, for front-end work)
- Test: `api/tests/test_api.py`
- Modify: `.github/workflows/ci.yml` (api job: `pip install -r requirements-dev.txt`), `api/README.md` (API and settings sections), `api/Dockerfile` (create `data/` owned by `user`)

**Interfaces:**
- Consumes: `JobStore`, `Worker`, `QueueFull`, `Job` (Tasks 1–2)
- Produces (HTTP, consumed by Task 4):
  - `POST /jobs` multipart (`audio_file`, `lyrics_text`, `srt_mode`, `add_instrumental_tags`) → `202` JSON `JobView`; `400` bad mode; `413` too big; `429` `{"detail": "The queue is full: 5 songs are waiting. Try again in a few minutes"}`
  - `GET /jobs/{id}` → `200 JobView`, `404 {"detail": "Unknown or expired job"}`
  - `DELETE /jobs/{id}` → `204`, or `404` when unknown or already finished
  - `JobView` = `{"id": str, "status": JobStatus, "position": int, "srt": str|null, "error": str|null, "created_at": float, "expires_at": float}` (epoch seconds)
- Produces (Python): `align_audio(source: str, lyrics_text: str, mode: str, instrumental_tags: bool) -> str` — the current body of `generate_srt` from the `_to_wav` call to `build_srt`, holding `_job_lock`; `generate_srt` and the worker's `process` both call it

- [ ] **Step 1: Write the failing tests** in `api/tests/test_api.py`

Fixture: `monkeypatch.setenv("WHISPER_MODEL", "none")`, `monkeypatch.setenv("DATA_DIR", str(tmp_path))`, import `server`, `monkeypatch.setattr(server, "align_audio", fake)` where `fake` returns `"1\n00:00:01,000 --> 00:00:02,000\nHello\n"`, then `with TestClient(server.app) as client`.

```python
def test_job_lifecycle(client): r = post /jobs with a 10-byte file → 202, body status in ("queued","running"), expires_at - created_at == 86400; poll GET until status "done" (≤ 3 s) → srt == fake output
def test_unknown_job_is_404(client): GET /jobs/nope → 404, detail "Unknown or expired job"
def test_bad_mode_is_400(client): srt_mode="karaoke" → 400
def test_queue_full_is_429(client, monkeypatch): make fake block on a threading.Event; post 1 job and wait until GET shows "running"; post 5 more (queued) → the next answers 429 with the detail above; release the event
def test_cancel_queued_job(client): with a blocking fake, post 2 jobs, DELETE the second → 204, GET → status "cancelled"; DELETE again → 404
def test_job_done_while_away_is_still_served(client): post, wait until done, then GET twice more (simulating a reload) → same srt both times
def test_upload_file_name_is_not_used_as_path(client, tmp_path): filename "../../evil.mp3" → 202, no file named evil.mp3 outside DATA_DIR
def test_srt_endpoint_still_works(client): POST /srt → 200, text == fake output
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api && .venv/Scripts/python -m pip install -q -r requirements-dev.txt && .venv/Scripts/python -m pytest tests/test_api.py -q`
Expected: FAIL (import of `faster_whisper`, then 404 on `/jobs`)

- [ ] **Step 3: Make `server.py` importable without the models**

Move `import soundfile`, `import webrtcvad`, `from faster_whisper import WhisperModel` inside the functions that use them. `lifespan` loads the model only when `MODEL_NAME != "none"`, opens `JobStore(os.path.join(DATA_DIR, "jobs.sqlite"))`, calls `recover()` (queued jobs stay in the table and the worker picks them up; one whose audio file is gone fails in `align_audio` and the worker records the error), starts `Worker(store, process=lambda job: align_audio(job.audio_path, job.lyrics, job.mode, job.instrumental_tags))`, and stops it and closes the store on shutdown. `/health` answers `healthy` when the model is loaded or `MODEL_NAME == "none"`.

- [ ] **Step 4: Extract `align_audio` and add the three `/jobs` routes**

`POST /jobs` saves the upload as `os.path.join(DATA_DIR, "uploads", f"{secrets.token_hex(8)}{_safe_suffix(filename)}")`, applies the `MAX_UPLOAD_MB` check (delete the file on 413), then `store.create(...)`; on `QueueFull` delete the file and answer 429.

- [ ] **Step 5: Run all server tests**

Run: `cd api && .venv/Scripts/python -m pytest -q`
Expected: all pass

- [ ] **Step 6: Add `api/dev_fake.py`**

Sets `WHISPER_MODEL=none`, replaces `server.align_audio` with a function that sleeps `FAKE_SECONDS` (default 20) and returns a 3-line SRT, then runs uvicorn on port 7860. Run: `cd api && .venv/Scripts/python dev_fake.py` → `GET http://localhost:7860/health` answers `{"status":"healthy"}`.

- [ ] **Step 7: Update `api/README.md`** (new `/jobs` routes with the `JobView` fields, `DATA_DIR` setting, retention and its limit: a Space restart erases jobs) **and `api/Dockerfile`** (`RUN mkdir -p data` after `WORKDIR`, as `user`), **and the CI api job.**

- [ ] **Step 8: Commit**

```bash
git add api .github/workflows/ci.yml
git commit -m "Run alignments as jobs that survive a page reload"
```

---

### Task 4: Job client

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/lib/api.test.ts`

**Interfaces:**
- Consumes: HTTP contract of Task 3
- Produces:
  - `type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled"`
  - `interface JobView { id: string; status: JobStatus; position: number; srt: string | null; error: string | null; createdAt: number; expiresAt: number }` (milliseconds; converted from the server's seconds)
  - `class JobGoneError extends Error` (404 on GET)
  - `createJob(file: File, options: AlignOptions, fetcher?: typeof fetch): Promise<JobView>`
  - `getJob(id: string, fetcher?: typeof fetch): Promise<JobView>`
  - `cancelJob(id: string, fetcher?: typeof fetch): Promise<void>` (404 is not an error)
  - `alignOnServer` stays exported but unused by the app

- [ ] **Step 1: Write the failing tests** (`vi.stubEnv("VITE_API_URL", "http://api.test")`, then `vi.resetModules()` and `await import("./api")` so `API_URL` picks it up; inject `fetcher` and assert on the URLs and bodies it receives)

```ts
it("creates a job and converts times to milliseconds") // 202 body {id:"j1",status:"queued",position:2,srt:null,error:null,created_at:100,expires_at:86500} → {createdAt:100000, expiresAt:86500000, position:2}; request is POST to `${API_URL}/jobs` with a FormData holding audio_file, lyrics_text, srt_mode, add_instrumental_tags
it("maps 404 to JobGoneError") // getJob on 404 → rejects with JobGoneError
it("surfaces the server detail on 429") // createJob on 429 {detail:"The queue is full: 5 songs are waiting. Try again in a few minutes"} → rejects with that exact message
it("treats a 404 on cancel as done") // cancelJob resolves on 204 and on 404
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run src/lib/api.test.ts`
Expected: FAIL, `createJob is not a function`

- [ ] **Step 3: Implement** the functions in `src/lib/api.ts`, reusing the existing error-detail parsing of `alignOnServer` (move it into a private `errorFrom(response)` helper).

- [ ] **Step 4: Run all web tests**

Run: `pnpm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "Add the job client"
```

---

### Task 5: Browser session storage

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`
- Modify: `package.json` (dependency `idb-keyval`, dev dependency `fake-indexeddb`)

**Interfaces:**
- Consumes: `TrackInfo` (`src/lib/metadata.ts`), `Cue` (`src/lib/srt.ts`), `SrtMode` (`src/lib/api.ts`)
- Produces:
  - `SESSION_TTL_MS = 24 * 60 * 60 * 1000`
  - `interface SessionState { createdAt: number; info: TrackInfo | null; lyrics: string; autoLyrics: string | null; mode: SrtMode; instrumentalTags: boolean; result: { cues: Cue[]; source: string } | null; lookupNote: string | null; job: { id: string; createdAt: number } | null }`
  - `isFresh(createdAt: number, now: number): boolean`
  - `saveAudio(file: File): Promise<void>` (key `"audio"`)
  - `saveState(state: SessionState): Promise<void>` (key `"state"`)
  - `loadSession(now?: number): Promise<{ state: SessionState; file: File } | null>` — `null` when nothing is stored, the state or audio is missing, or the session is older than `SESSION_TTL_MS` (then both keys are deleted)
  - `clearSession(): Promise<void>`
  - All four never throw: storage errors are swallowed (logged with `console.warn`)
  - Store: `createStore("lyricsync", "session")` from `idb-keyval`

- [ ] **Step 1: Write the failing tests** (`import "fake-indexeddb/auto"` at the top; a `state(overrides)` helper builds a valid `SessionState`; audio as `new File(["abc"], "song.mp3", { type: "audio/mpeg" })`)

```ts
it("round-trips state and audio") // saveAudio + saveState, loadSession(createdAt + 1000) → state toEqual, file.name "song.mp3", await file.text() === "abc"
it("drops and deletes an expired session") // loadSession(createdAt + SESSION_TTL_MS + 1) → null; a second loadSession(createdAt + 1) → null too
it("returns null without audio") // saveState only → null
it("clears everything") // clearSession → loadSession null
it("returns null when IndexedDB is unavailable") // vi.stubGlobal("indexedDB", undefined) before importing a fresh module (vi.resetModules) → loadSession resolves null, saveState and clearSession resolve
it("isFresh uses a strict 24 h window") // isFresh(0, SESSION_TTL_MS - 1) true, isFresh(0, SESSION_TTL_MS) false
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm add idb-keyval && pnpm add -D fake-indexeddb && pnpm vitest run src/lib/session.test.ts`
Expected: FAIL, cannot resolve `./session`

- [ ] **Step 3: Implement `src/lib/session.ts`**; create the `idb-keyval` store lazily inside a guarded helper so a missing `indexedDB` is caught. If `File` does not survive storage in a browser, store `{ blob, name, type, lastModified }` and rebuild the `File` on load.

- [ ] **Step 4: Run all web tests**

Run: `pnpm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts package.json pnpm-lock.yaml
git commit -m "Keep the session in IndexedDB for 24 hours"
```

---

### Task 6: Wire it into the app

**Files:**
- Create: `src/components/useJob.ts`
- Create: `src/components/RetentionNote.tsx`
- Modify: `src/App.tsx`, `src/components/ResultPanel.tsx` (only the `busy` content stays a prop), `README.md`
- Test: `src/components/useJob.test.ts` (pure parts only)

**Interfaces:**
- Consumes: `createJob`, `getJob`, `cancelJob`, `JobView`, `JobGoneError` (Task 4); `loadSession`, `saveState`, `saveAudio`, `clearSession`, `SessionState`, `SESSION_TTL_MS` (Task 5)
- Produces:
  - `pollDelay(visible: boolean): number` → `3000` / `10000`
  - `isTerminal(status: JobStatus): boolean` → `done`, `failed`, `cancelled`
  - `useJob(id: string | null, onEnd: (job: JobView | null, gone: boolean) => void): JobView | null` — polls `getJob` with `pollDelay(document.visibilityState === "visible")`, re-polls at once when the tab becomes visible, calls `onEnd(job, false)` on a terminal status and `onEnd(null, true)` on `JobGoneError`, keeps polling through network errors
  - `RetentionNote({ expiresAt: number, onClear: () => void })`: one muted line `Kept in this browser until {time}` (`Intl.DateTimeFormat` with weekday when it is not today) and a ghost `Clear` button

- [ ] **Step 1: Write the failing tests** for the pure helpers

```ts
it("polls faster while visible") // pollDelay(true) === 3000, pollDelay(false) === 10000
it("knows terminal statuses") // isTerminal("done"|"failed"|"cancelled") true, "queued"|"running" false
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run src/components/useJob.test.ts`
Expected: FAIL, cannot resolve `./useJob`

- [ ] **Step 3: Implement `useJob.ts` and `RetentionNote.tsx`**

- [ ] **Step 4: Change `App.tsx`**

- On mount: `loadSession()`; if found, restore `file`, `info`, `lyrics`, `autoLyricsRef`, `mode`, `instrumentalTags`, `result`, the lookup line from `lookupNote`, recompute `wave` with `filePeaks`, and restore the job if any. No LRCLIB lookup on restore.
- `selectFile`: after `reset()`, `saveAudio(picked)` and a new `createdAt = Date.now()`.
- Save `SessionState` 400 ms after any change of the restored fields while a file is loaded.
- `align`: `createJob` → store `{ id, createdAt }` in state; `useJob` drives the busy view; on `done` parse `srt` (empty → existing "The server found no sung words in this song"); on `failed` show `job.error`; on `cancelled` show nothing; on gone show `This alignment is no longer on the server. It expires after 24 h or when the server restarts. Align again`; in every terminal case clear the stored job.
- Cancel button: `cancelJob(id)` then clear the job.
- Remove song (`onClear`) and `RetentionNote`'s Clear: `reset()` + `clearSession()`.
- Busy view (`Aligning`): elapsed time counted from the job's `createdAt`; when `status === "queued"` and `position > 0`, the line reads `{position} {position === 1 ? "song" : "songs"} ahead of yours`.
- Under the result header, `RetentionNote` with `expiresAt = createdAt + SESSION_TTL_MS`, and below it one muted line: `Server results are kept up to 24 h. A server restart can erase them sooner` (only when the result came from the server).

- [ ] **Step 5: Run every check**

Run: `pnpm lint && pnpm test && pnpm build && cd api && .venv/Scripts/python -m pytest -q`
Expected: all pass

- [ ] **Step 6: Check it in the browser against the fake server**

Run `cd api && .venv/Scripts/python dev_fake.py` and `pnpm dev` with `VITE_API_URL=http://localhost:7860` in `.env.local`. Verify in the browser:
1. Drop a song, type lyrics, reload → song, lyrics, waveform and `Kept in this browser until …` are back.
2. Align, reload while busy → busy view returns with the elapsed time still counting; the subtitles appear when the fake job ends.
3. Align, close the tab, wait past the fake duration, reopen → subtitles shown.
4. Align, stop the fake server, restart it (jobs file kept: the job is marked failed) → the error from the server is shown and Align works again; delete `api/data` and restart → the gone message is shown.
5. Cancel while busy, reload → idle, no busy view.
6. Clear → empty app, and reload stays empty.

- [ ] **Step 7: Update `README.md`** (section « Conservation 24 h »: what the browser keeps, what the server keeps, the restart limit)

- [ ] **Step 8: Commit**

```bash
git add src README.md
git commit -m "Restore the session and resume alignments after a reload"
```
