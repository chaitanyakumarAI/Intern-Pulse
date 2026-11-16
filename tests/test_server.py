"""Render worker endpoints: token check, force/days handling, stats (local HTTP only)."""
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

import main
import server


@pytest.fixture
def worker(monkeypatch):
    """Serve HealthAndSyncHandler on localhost; record sync calls instead of running the pipeline."""
    calls = []
    monkeypatch.setattr(server, "_run_worker_sync",
                        lambda force=False, days=None, trigger="manual": calls.append((force, days)))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.HealthAndSyncHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    def request(path, method="GET", token=None):
        req = urllib.request.Request(f"http://127.0.0.1:{httpd.server_port}{path}", method=method)
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read())

    yield request, calls
    httpd.shutdown()
    httpd.server_close()


def _wait_for(calls, n=1):
    for _ in range(100):
        if len(calls) >= n:
            return
        threading.Event().wait(0.02)


def test_without_token_configured_sync_runs_but_force_is_ignored(worker, monkeypatch):
    request, calls = worker
    monkeypatch.setattr(server, "SYNC_API_TOKEN", "")
    status, body = request("/api/sync?force=true&days=7", method="POST")
    _wait_for(calls)
    assert status == 202 and body["force"] is False
    assert calls == [(False, "7")]


def test_token_required_when_configured(worker, monkeypatch):
    request, calls = worker
    monkeypatch.setattr(server, "SYNC_API_TOKEN", "s3cret")
    assert request("/api/sync", method="POST")[0] == 401
    assert request("/api/sync", method="POST", token="wrong")[0] == 401
    status, body = request("/api/sync?force=true", method="POST", token="s3cret")
    _wait_for(calls)
    assert status == 202 and calls == [(True, None)]


def test_get_sync_honours_the_same_rules(worker, monkeypatch):
    request, calls = worker
    monkeypatch.setattr(server, "SYNC_API_TOKEN", "s3cret")
    assert request("/api/sync")[0] == 401
    assert request("/api/sync?days=30", token="s3cret")[0] == 202
    _wait_for(calls)
    assert calls == [(False, "30")]


@pytest.mark.parametrize("raw, parsed", [("7", "7"), ("0", None), ("abc", None), ("99999", None), (None, None)])
def test_parse_days(raw, parsed):
    assert server._parse_days(raw) == parsed


def test_health_reports_last_run_stats(monkeypatch):
    monkeypatch.setattr(main, "run_once", lambda days=None, force=False, trigger="manual": {"processed": 4, "created": 1})
    result = server._run_worker_sync()
    assert result["status"] == "success"
    assert server._last_sync_stats == {"processed": 4, "created": 1}


def test_recheck_endpoint_requires_token_and_defaults_to_apply(monkeypatch):
    calls = []
    monkeypatch.setattr(server, "_run_worker_recheck", lambda apply=True: calls.append(apply))
    monkeypatch.setattr(server, "SYNC_API_TOKEN", "s3cret")
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.HealthAndSyncHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        def post(path, token=None):
            req = urllib.request.Request(f"http://127.0.0.1:{httpd.server_port}{path}", method="POST")
            if token:
                req.add_header("Authorization", f"Bearer {token}")
            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    return resp.status
            except urllib.error.HTTPError as err:
                return err.code
        assert post("/api/recheck") == 401
        assert post("/api/recheck", token="s3cret") == 202
        assert post("/api/recheck?apply=false", token="s3cret") == 202
        _wait_for(calls, 2)
        assert sorted(calls) == [False, True]
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_sync_stats_count_ai_and_fallback(monkeypatch):
    monkeypatch.setattr(main, "run_once", lambda days=None, force=False, trigger="manual":
                        {"processed": 3, "ai": 2, "fallback": 1, "waiting": 1})
    server._run_worker_sync()
    assert server._last_sync_stats["ai"] == 2 and server._last_sync_stats["waiting"] == 1
