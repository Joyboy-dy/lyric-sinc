"""Alignment jobs kept in SQLite for 24 hours, so a page reload does not lose them.

No audio or model code here: the store and the worker are tested on their own.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Callable, Literal, Optional

JobStatus = Literal["queued", "running", "done", "failed", "cancelled"]

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
