import threading

import pytest

import time

from lyricsync.jobs import JobStore, QueueFull, Worker


@pytest.fixture
def clock():
    return [1000.0]


@pytest.fixture
def store(tmp_path, clock):
    s = JobStore(str(tmp_path / "jobs.db"), clock=lambda: clock[0])
    yield s
    s.close()


def create(store, audio_path="a.mp3"):
    return store.create(audio_path=audio_path, mode="sentence", lyrics="", instrumental_tags=False)


def test_create_and_get(store):
    job = store.create(audio_path="a.mp3", mode="paragraph", lyrics="la la", instrumental_tags=True)
    assert job.status == "queued"
    assert len(job.id) >= 20
    assert job.expires_at == job.created_at + 86400
    assert (job.mode, job.lyrics, job.instrumental_tags) == ("paragraph", "la la", True)
    assert store.get(job.id) == job


def test_ids_are_unique(store):
    assert len({create(store).id for _ in range(5)}) == 5


def test_queue_limit(store):
    for _ in range(5):
        create(store)
    with pytest.raises(QueueFull):
        create(store)
    store.claim_next()
    create(store)


def test_position_counts_jobs_ahead(store, clock):
    a = create(store)
    clock[0] += 1
    create(store)
    clock[0] += 1
    c = create(store)
    assert store.position(c.id) == 2
    store.claim_next()
    assert store.position(a.id) == 0
    assert store.position(c.id) == 1


def test_claim_next_is_fifo_and_marks_running(store, clock):
    a = create(store)
    clock[0] += 1
    b = create(store)
    first = store.claim_next()
    assert first.id == a.id
    assert first.status == "running"
    assert first.started_at == clock[0]
    assert store.claim_next().id == b.id
    assert store.claim_next() is None


def test_finish_and_fail(store, clock):
    a, b = create(store), create(store)
    store.finish(a.id, "1\n00:00:00,000 --> 00:00:01,000\nHi\n")
    done = store.get(a.id)
    assert done.status == "done"
    assert done.srt.startswith("1\n")
    assert done.finished_at == clock[0]
    store.fail(b.id, "boom")
    failed = store.get(b.id)
    assert (failed.status, failed.error) == ("failed", "boom")


def test_finish_after_cancel_keeps_cancelled(store):
    a = create(store)
    store.claim_next()
    assert store.cancel(a.id) is True
    store.finish(a.id, "x")
    job = store.get(a.id)
    assert job.status == "cancelled"
    assert job.srt is None


def test_cancel_finished_returns_false(store):
    a = create(store)
    store.finish(a.id, "x")
    assert store.cancel(a.id) is False
    assert store.cancel("nope") is False


def test_expired_jobs_are_hidden_and_purged(store, clock):
    a = create(store, audio_path="a.mp3")
    clock[0] += 86401
    assert store.get(a.id) is None
    assert store.purge_expired() == ["a.mp3"]
    assert store.purge_expired() == []


def test_clear_audio(store, clock):
    a = create(store)
    store.clear_audio(a.id)
    assert store.get(a.id).audio_path is None
    clock[0] += 86401
    assert store.purge_expired() == []


def test_recover_fails_running_and_requeues_queued(tmp_path):
    path = str(tmp_path / "jobs.db")
    first = JobStore(path)
    a = create(first)
    b = create(first)
    first.claim_next()
    first.close()

    second = JobStore(path)
    queued = second.recover()
    assert [j.id for j in queued] == [b.id]
    lost = second.get(a.id)
    assert lost.status == "failed"
    assert lost.error == "The server restarted during the alignment"
    second.close()


def test_survives_concurrent_threads(tmp_path):
    s = JobStore(str(tmp_path / "jobs.db"), max_queued=10)
    ids, errors = [], []

    def worker():
        try:
            ids.append(create(s).id)
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    s.close()
    assert errors == []
    assert len(set(ids)) == 8


def test_position_breaks_ties_by_arrival(store):
    create(store)
    second = create(store)  # same clock value as the first
    assert store.position(second.id) == 1


SRT = "1\n00:00:00,000 --> 00:00:01,000\nHi\n"


def audio_file(tmp_path, name="a.mp3"):
    path = tmp_path / name
    path.write_bytes(b"x")
    return path


def test_worker_processes_and_deletes_audio(store, tmp_path):
    audio = audio_file(tmp_path)
    job = create(store, audio_path=str(audio))
    worker = Worker(store, lambda j: SRT)
    assert worker.run_once() is True
    done = store.get(job.id)
    assert (done.status, done.srt) == ("done", SRT)
    assert not audio.exists()
    assert done.audio_path is None
    assert worker.run_once() is False


def test_worker_records_failures(store, tmp_path):
    audio = audio_file(tmp_path)
    job = create(store, audio_path=str(audio))

    def broken(_job):
        raise ValueError("bad audio")

    Worker(store, broken).run_once()
    failed = store.get(job.id)
    assert (failed.status, failed.error) == ("failed", "bad audio")
    assert not audio.exists()


def test_worker_discards_result_of_cancelled_job(store, tmp_path):
    job = create(store, audio_path=str(audio_file(tmp_path)))

    def cancelled_midway(j):
        store.cancel(j.id)
        return SRT

    Worker(store, cancelled_midway).run_once()
    result = store.get(job.id)
    assert (result.status, result.srt) == ("cancelled", None)


def test_worker_thread_drains_queue(store, tmp_path):
    worker = Worker(store, lambda j: SRT, idle_wait_s=0.01)
    worker.start()
    try:
        jobs = [create(store, audio_path=str(audio_file(tmp_path, f"{i}.mp3"))) for i in range(2)]
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and any(store.get(j.id).status != "done" for j in jobs):
            time.sleep(0.02)
        assert [store.get(j.id).status for j in jobs] == ["done", "done"]
    finally:
        worker.stop()


def test_purge_deletes_files_of_expired_jobs(store, tmp_path, clock):
    audio = audio_file(tmp_path)
    create(store, audio_path=str(audio))
    clock[0] += 86401
    Worker(store, lambda j: SRT).purge()
    assert not audio.exists()
