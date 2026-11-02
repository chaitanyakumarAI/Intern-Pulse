"""Durable state in Supabase: request shapes and fallbacks, against a fake PostgREST."""
import types

import pytest

import cloud_state
import db_manager
import email_history
import sync_quota


class FakeRest:
    """Stands in for db_manager.rest; answers from {(method, path prefix): (status, json)}."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def __call__(self, method, path, json=None, prefer=None):
        self.calls.append((method, path, json, prefer))
        for (m, prefix), (status, body) in self.routes.items():
            if m == method and path.startswith(prefix):
                return types.SimpleNamespace(status_code=status, json=lambda body=body: body, text="")
        return types.SimpleNamespace(status_code=404, json=lambda: {}, text="")


@pytest.fixture
def fake_rest(monkeypatch):
    def install(routes):
        fake = FakeRest(routes)
        monkeypatch.setattr(db_manager, "rest", fake)
        cloud_state.reset()
        return fake
    return install


def test_unavailable_without_tables(fake_rest):
    fake_rest({})
    assert cloud_state.available() is False


def test_processed_ids_come_from_the_table(fake_rest):
    fake = fake_rest({("GET", "sync_runs"): (200, []),
                      ("GET", "processed_emails"): (200, [{"gmail_id": "a"}])})
    assert email_history.filter_unprocessed(["a", "b", "c"]) == ["b", "c"]
    assert any("gmail_id=in.(a,b,c)" in call[1] for call in fake.calls)


def test_read_failure_treats_batch_as_new(fake_rest):
    fake_rest({("GET", "sync_runs"): (200, []), ("GET", "processed_emails"): (500, {})})
    assert email_history.filter_unprocessed(["a", "b"]) == ["a", "b"]


def test_mark_processed_upserts_ignoring_duplicates(fake_rest):
    fake = fake_rest({("GET", "sync_runs"): (200, []), ("POST", "processed_emails"): (201, None)})
    email_history.mark_processed(["a", "b"])
    method, path, body, prefer = fake.calls[-1]
    assert (method, path) == ("POST", "processed_emails?on_conflict=gmail_id")
    assert body == [{"gmail_id": "a"}, {"gmail_id": "b"}]
    assert "ignore-duplicates" in prefer


def test_quota_counts_todays_successful_runs(fake_rest):
    fake_rest({("GET", "sync_runs?select=id&limit=1"): (200, []),
               ("GET", "sync_runs?select=id&status=in."): (200, [{"id": 1}, {"id": 2}]),
               ("GET", "sync_runs?select=started_at"): (200, [{"started_at": "2026-11-02T08:00:00Z"}])})
    quota = sync_quota.get_quota(daily_limit=12)
    assert (quota["syncs_today"], quota["remaining"], quota["last_sync_time"]) == (2, 10, "2026-11-02T08:00:00Z")


def test_new_opportunity_reported_once(fake_rest):
    fake_rest({("POST", "opportunities"): (201, [{"id": "x"}])})
    assert cloud_state.save_opportunity({"company": "Globex", "role": "ML Intern"}) is True
    fake_rest({("POST", "opportunities"): (201, [])})  # duplicate: ignored, nothing returned
    assert cloud_state.save_opportunity({"company": "Globex", "role": "ML Intern"}) is False


def test_company_key_is_url_encoded(fake_rest):
    fake = fake_rest({("GET", "company_research"): (200, [])})
    cloud_state.company_get("at&t inc")
    assert "company_key=eq.at%26t%20inc" in fake.calls[-1][1]


def test_unavailable_is_rechecked_later(fake_rest, monkeypatch):
    fake_rest({})
    assert cloud_state.available() is False
    monkeypatch.setattr(db_manager, "rest", FakeRest({("GET", "sync_runs"): (200, [])}))
    assert cloud_state.available() is False          # cached for a while
    monkeypatch.setattr(cloud_state, "_checked_at", 0.0 - cloud_state.RECHECK_SECONDS - 1)
    assert cloud_state.available() is True           # tables created since: picked up
