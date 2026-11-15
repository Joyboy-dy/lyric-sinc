import importlib
import threading
import time

import pytest
from fastapi.testclient import TestClient

FAKE_SRT = "1\n00:00:01,000 --> 00:00:02,000\nHello\n"


@pytest.fixture
def gate():
    """Set by default; clear it to make the fake alignment wait."""
    event = threading.Event()
    event.set()
    return event


@pytest.fixture
def client(monkeypatch, tmp_path, gate):
    monkeypatch.setenv("WHISPER_MODEL", "none")
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    import server

    server = importlib.reload(server)

    def fake_align(source, lyrics_text, mode, instrumental_tags):
        gate.wait(5)
        return FAKE_SRT

    monkeypatch.setattr(server, "align_audio", fake_align)
    with TestClient(server.app) as c:
        c.data_dir = tmp_path / "data"
        yield c


def post_job(client, name="song.mp3", **fields):
    data = {"lyrics_text": "", "srt_mode": "sentence", "add_instrumental_tags": "false", **fields}
    return client.post("/jobs", files={"audio_file": (name, b"0123456789", "audio/mpeg")}, data=data)


def wait_for(client, job_id, status, timeout=3.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/jobs/{job_id}").json()
        if body["status"] == status:
            return body
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} never reached {status}")


def test_job_lifecycle(client):
    response = post_job(client)
    assert response.status_code == 202
    body = response.json()
    assert body["status"] in ("queued", "running")
    assert body["expires_at"] - body["created_at"] == 86400
    done = wait_for(client, body["id"], "done")
    assert done["srt"] == FAKE_SRT
    assert done["error"] is None


def test_unknown_job_is_404(client):
    response = client.get("/jobs/nope")
    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown or expired job"


def test_bad_mode_is_400(client):
    assert post_job(client, srt_mode="karaoke").status_code == 400


def test_queue_full_is_429(client, gate):
    gate.clear()
    try:
        first = post_job(client).json()
        wait_for(client, first["id"], "running")
        for _ in range(5):
            assert post_job(client).status_code == 202
        response = post_job(client)
        assert response.status_code == 429
        assert response.json()["detail"] == "The queue is full: 5 songs are waiting. Try again in a few minutes"
    finally:
        gate.set()


def test_cancel_queued_job(client, gate):
    gate.clear()
    try:
        post_job(client)
        second = post_job(client).json()
        assert second["position"] >= 0
        assert client.delete(f"/jobs/{second['id']}").status_code == 204
        assert client.get(f"/jobs/{second['id']}").json()["status"] == "cancelled"
        assert client.delete(f"/jobs/{second['id']}").status_code == 404
    finally:
        gate.set()


def test_queue_position_is_reported(client, gate):
    gate.clear()
    try:
        first = post_job(client).json()
        wait_for(client, first["id"], "running")
        post_job(client)
        third = post_job(client).json()
        assert client.get(f"/jobs/{third['id']}").json()["position"] == 1
    finally:
        gate.set()


def test_job_done_while_away_is_still_served(client):
    job = post_job(client).json()
    wait_for(client, job["id"], "done")
    for _ in range(2):  # the page comes back later, maybe twice
        again = client.get(f"/jobs/{job['id']}").json()
        assert (again["status"], again["srt"]) == ("done", FAKE_SRT)


def test_upload_is_deleted_after_the_job(client):
    job = post_job(client).json()
    wait_for(client, job["id"], "done")
    uploads = client.data_dir / "uploads"
    assert not uploads.exists() or list(uploads.iterdir()) == []


def test_upload_file_name_is_not_used_as_path(client, tmp_path):
    response = post_job(client, name="../../evil.mp3")
    assert response.status_code == 202
    assert not any(p.name == "evil.mp3" for p in tmp_path.rglob("*"))


def test_srt_endpoint_still_works(client):
    response = client.post(
        "/srt",
        files={"audio_file": ("song.mp3", b"0123456789", "audio/mpeg")},
        data={"srt_mode": "sentence"},
    )
    assert response.status_code == 200
    assert response.text == FAKE_SRT


def test_health_without_model(client):
    assert client.get("/health").json() == {"status": "healthy"}
