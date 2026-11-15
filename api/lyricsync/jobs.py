"""Alignment jobs kept in SQLite for 24 hours, so a page reload does not lose them.

No audio or model code here: the store and the worker are tested on their own.
"""

from __future__ import annotations

import logging
import os
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Callable, Literal, Optional

JobStatus = Literal["queued", "running", "done", "failed", "cancelled"]

logger = logging.getLogger("lyricsync.jobs")

RESTART_ERROR = "The server restarted during the alignment"

_COLUMNS = (
    "id, status, mode, lyrics, instrumental_tags, audio_path, srt, error, "
    "created_at, started_at, finished_at, expires_at"
)


@dataclass(frozen=True)
class Job:
    id: str
    status: JobStatus
    mode: str
    lyrics: str
    instrumental_tags: bool
    audio_path: Optional[str]
    srt: Optional[str]
    error: Optional[str]
    created_at: float
    started_at: Optional[float]
    finished_at: Optional[float]
    expires_at: float


class QueueFull(Exception):
    """Too many jobs are waiting."""


def _job(row: tuple) -> Job:
    values = list(row)
    values[4] = bool(values[4])
    return Job(*values)


class JobStore:
    def __init__(
        self,
        path: str,
        *,
        retention_s: float = 86400,
        max_queued: int = 5,
        clock: Callable[[], float] = time.time,
    ) -> None:
        directory = os.path.dirname(os.path.abspath(path))
        os.makedirs(directory, exist_ok=True)
        self._retention = retention_s
        self._max_queued = max_queued
        self._clock = clock
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                mode TEXT NOT NULL,
                lyrics TEXT NOT NULL,
                instrumental_tags INTEGER NOT NULL,
                audio_path TEXT,
                srt TEXT,
                error TEXT,
                created_at REAL NOT NULL,
                started_at REAL,
                finished_at REAL,
                expires_at REAL NOT NULL
            )"""
        )
        self._db.execute("CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status, created_at)")

    def close(self) -> None:
        with self._lock:
            self._db.close()

    def create(self, *, audio_path: str, mode: str, lyrics: str, instrumental_tags: bool) -> Job:
        now = self._clock()
        job = Job(
            id=secrets.token_urlsafe(16),
            status="queued",
            mode=mode,
            lyrics=lyrics,
            instrumental_tags=instrumental_tags,
            audio_path=audio_path,
            srt=None,
            error=None,
            created_at=now,
            started_at=None,
            finished_at=None,
            expires_at=now + self._retention,
        )
        with self._lock:
            (waiting,) = self._db.execute("SELECT COUNT(*) FROM jobs WHERE status = 'queued'").fetchone()
            if waiting >= self._max_queued:
                raise QueueFull(waiting)
            self._db.execute(
                f"INSERT INTO jobs ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (job.id, job.status, job.mode, job.lyrics, int(job.instrumental_tags), job.audio_path,
                 job.srt, job.error, job.created_at, job.started_at, job.finished_at, job.expires_at),
            )
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            row = self._db.execute(
                f"SELECT {_COLUMNS} FROM jobs WHERE id = ? AND expires_at > ?", (job_id, self._clock())
            ).fetchone()
        return _job(row) if row else None

    def position(self, job_id: str) -> int:
        with self._lock:
            row = self._db.execute(
                """SELECT COUNT(*) FROM jobs AS other, jobs AS me
                   WHERE me.id = ? AND me.status = 'queued'
                     AND other.status = 'queued'
                     AND (other.created_at < me.created_at
                          OR (other.created_at = me.created_at AND other.rowid < me.rowid))""",
                (job_id,),
            ).fetchone()
        return row[0] if row else 0

    def claim_next(self) -> Optional[Job]:
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                row = self._db.execute(
                    f"SELECT {_COLUMNS} FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1"
                ).fetchone()
                if row is None:
                    self._db.execute("COMMIT")
                    return None
                started = self._clock()
                self._db.execute(
                    "UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?", (started, row[0])
                )
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
        job = _job(row)
        return Job(**{**job.__dict__, "status": "running", "started_at": started})

    def finish(self, job_id: str, srt: str) -> None:
        self._end(job_id, "done", srt=srt)

    def fail(self, job_id: str, error: str) -> None:
        self._end(job_id, "failed", error=error)

    def _end(self, job_id: str, status: str, *, srt: Optional[str] = None, error: Optional[str] = None) -> None:
        with self._lock:
            # A cancelled job stays cancelled: its result is thrown away.
            self._db.execute(
                """UPDATE jobs SET status = ?, srt = ?, error = ?, finished_at = ?
                   WHERE id = ? AND status IN ('queued', 'running')""",
                (status, srt, error, self._clock(), job_id),
            )

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            cursor = self._db.execute(
                """UPDATE jobs SET status = 'cancelled', finished_at = ?
                   WHERE id = ? AND status IN ('queued', 'running')""",
                (self._clock(), job_id),
            )
        return cursor.rowcount == 1

    def clear_audio(self, job_id: str) -> None:
        with self._lock:
            self._db.execute("UPDATE jobs SET audio_path = NULL WHERE id = ?", (job_id,))

    def release_finished_audio(self) -> list[str]:
        """Audio files no job will read again (finished, failed, or cancelled before it started),
        detached from their jobs so the caller can delete them. A job cancelled while running
        keeps its file: the worker still reads it and deletes it when done."""
        with self._lock:
            condition = """audio_path IS NOT NULL AND (status IN ('done', 'failed')
                           OR (status = 'cancelled' AND started_at IS NULL))"""
            paths = [p for (p,) in self._db.execute(f"SELECT audio_path FROM jobs WHERE {condition}")]
            self._db.execute(f"UPDATE jobs SET audio_path = NULL WHERE {condition}")
        return paths

    def purge_expired(self) -> list[str]:
        with self._lock:
            now = self._clock()
            paths = [
                p for (p,) in self._db.execute(
                    "SELECT audio_path FROM jobs WHERE expires_at <= ? AND audio_path IS NOT NULL", (now,)
                )
            ]
            self._db.execute("DELETE FROM jobs WHERE expires_at <= ?", (now,))
        return paths

    def recover(self) -> list[Job]:
        with self._lock:
            self._db.execute(
                "UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE status = 'running'",
                (RESTART_ERROR, self._clock()),
            )
            rows = self._db.execute(
                f"SELECT {_COLUMNS} FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid"
            ).fetchall()
        return [_job(r) for r in rows]


def _delete(path: Optional[str]) -> None:
    if not path:
        return
    try:
        os.remove(path)
    except OSError:
        pass


def delete_files(paths: list[str]) -> None:
    for path in paths:
        _delete(path)


class Worker:
    """Drains the queue one job at a time on a background thread and purges expired jobs."""

    def __init__(
        self,
        store: JobStore,
        process: Callable[[Job], str],
        *,
        idle_wait_s: float = 1.0,
        purge_every_s: float = 3600,
    ) -> None:
        self._store = store
        self._process = process
        self._idle_wait = idle_wait_s
        self._purge_every = purge_every_s
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def run_once(self) -> bool:
        job = self._store.claim_next()
        if job is None:
            return False
        try:
            self._store.finish(job.id, self._process(job))
        except Exception as e:  # noqa: BLE001 - reported to the user through the job
            # The user sees one line; tool output with server paths stays in the log.
            message = (str(e).strip().splitlines() or [type(e).__name__])[0][:200]
            logger.warning("Job %s failed: %s", job.id, e)
            self._store.fail(job.id, message)
        finally:
            # The song is never kept once its job is over, whatever the outcome.
            _delete(job.audio_path)
            self._store.clear_audio(job.id)
        return True

    def purge(self) -> None:
        delete_files(self._store.purge_expired())
        delete_files(self._store.release_finished_audio())

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="lyricsync-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _loop(self) -> None:
        next_purge = time.monotonic()
        while not self._stop.is_set():
            try:
                if time.monotonic() >= next_purge:
                    self.purge()
                    next_purge = time.monotonic() + self._purge_every
                if self.run_once():
                    continue
            except Exception:  # noqa: BLE001 - one bad turn (disk full, closed db) must not end the queue
                logger.exception("Job worker error, retrying")
            self._stop.wait(self._idle_wait)
