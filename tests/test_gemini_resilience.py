"""Gemini error handling: key rotation, retries and the circuit breaker (no network)."""
import json
import types

import pytest
from google.genai import errors as genai_errors

import config
import status_classifier as sc

GOOD_REPLY = json.dumps({
    "is_job_application": True, "reasoning": "interview invite", "confidence_score": 95,
    "company_name": "Acme Analytics", "role": "Data Science Intern",
    "status": "Interview Scheduled", "platform": "Direct Email",
})


def _api_error(cls, code, status, message="error"):
    return cls(code, {"error": {"code": code, "status": status, "message": message}})


class FakeClient:
    """Stands in for google.genai.Client; each call consumes the next scripted outcome."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0
        self.models = types.SimpleNamespace(generate_content=self._generate)

    def _generate(self, **kwargs):
        self.calls += 1
        self.models_used = getattr(self, "models_used", []) + [kwargs.get("model")]
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return types.SimpleNamespace(text=outcome)


@pytest.fixture
def gemini(monkeypatch):
    """Install fake Gemini clients: gemini(outcomes_key1, outcomes_key2, ...)."""
    def install(*outcome_lists):
        clients = [FakeClient(o) for o in outcome_lists]
        monkeypatch.setattr(config, "GEMINI_API_KEY", ",".join(f"test-key-{i}" for i in range(len(clients))))
        monkeypatch.setattr(sc, "_gemini_clients", clients)
        return clients
    return install


def server_error():
    return _api_error(genai_errors.ServerError, 503, "UNAVAILABLE", "This model is currently experiencing high demand.")


def test_success_is_tagged_as_gemini(gemini, job_email):
    (client,) = gemini([GOOD_REPLY])
    result = sc.classify_email_ai(job_email)
    assert (result["method"], result["status"], result["company"]) == ("gemini", "Interview Scheduled", "Acme Analytics")
    assert client.calls == 1


def test_transient_503_is_retried_not_fatal(gemini, job_email):
    # Regression: one 503 used to disable Gemini for the whole run.
    (client,) = gemini([server_error(), GOOD_REPLY])
    result = sc.classify_email_ai(job_email)
    assert result["method"] == "gemini"
    assert client.calls == 2
    assert sc._gemini_failed is False


def test_persistent_503_falls_back_for_this_email_only(gemini, job_email):
    (client,) = gemini([server_error()] * sc.GEMINI_MAX_ATTEMPTS + [GOOD_REPLY])
    assert sc.classify_email_ai(job_email)["method"] == "keyword"
    assert sc._gemini_failed is False
    assert sc.classify_email_ai(job_email)["method"] == "gemini"  # next email still tries Gemini


def test_breaker_trips_after_consecutive_failed_emails(gemini, job_email):
    attempts = sc.GEMINI_MAX_ATTEMPTS * sc.GEMINI_BREAKER_THRESHOLD
    (client,) = gemini([server_error()] * attempts)
    for _ in range(sc.GEMINI_BREAKER_THRESHOLD):
        assert sc.classify_email_ai(job_email)["method"] == "keyword"
    assert sc._gemini_failed is True
    calls = client.calls
    sc.classify_email_ai(job_email)
    assert client.calls == calls  # breaker open: Gemini not called again this run


def test_rate_limit_rotates_to_next_key(gemini, job_email):
    first, second = gemini(
        [_api_error(genai_errors.ClientError, 429, "RESOURCE_EXHAUSTED")],
        [GOOD_REPLY],
    )
    assert sc.classify_email_ai(job_email)["method"] == "gemini"
    assert (first.calls, second.calls) == (1, 1)


def test_invalid_key_disables_gemini_immediately(gemini, job_email):
    (client,) = gemini([_api_error(genai_errors.ClientError, 400, "INVALID_ARGUMENT", "API_KEY_INVALID")])
    assert sc.classify_email_ai(job_email)["method"] == "keyword"
    assert sc._gemini_failed is True


def test_bad_request_falls_back_without_tripping_breaker(gemini, job_email):
    (client,) = gemini([_api_error(genai_errors.ClientError, 400, "INVALID_ARGUMENT", "bad input")])
    assert sc.classify_email_ai(job_email)["method"] == "keyword"
    assert client.calls == 1
    assert sc._gemini_failed is False


def test_empty_reply_falls_back_for_this_email(gemini, job_email):
    (client,) = gemini([""])
    assert sc.classify_email_ai(job_email)["method"] == "keyword"
    assert sc._gemini_failed is False


@pytest.mark.parametrize("exc, kind", [
    (Exception("models/x is not supported for generateContent"), "per_email"),  # "rate" substring no longer matters
    (Exception("429 RESOURCE_EXHAUSTED"), "rate_limit"),
    (TimeoutError("The read operation timed out"), "transient"),
    (Exception("503 UNAVAILABLE"), "transient"),
    (Exception("400 API_KEY_INVALID"), "fatal"),
])
def test_error_classification(exc, kind):
    assert sc._gemini_error_kind(exc) == kind


def test_unconfigured_gemini_uses_keyword_tier(job_email):
    assert sc.classify_email_ai(job_email)["method"] == "keyword"


def test_overloaded_model_falls_back_to_lighter_model(gemini, job_email, monkeypatch):
    monkeypatch.setattr(sc, "GEMINI_FALLBACK_MODEL", "gemini-flash-lite-latest")
    (client,) = gemini([server_error(), GOOD_REPLY])
    assert sc.classify_email_ai(job_email)["method"] == "gemini"
    assert client.models_used == [sc.GEMINI_MODEL, "gemini-flash-lite-latest"]


def test_model_not_found_tries_fallback_model_before_giving_up(gemini, job_email, monkeypatch):
    # Regression: SDK 3.x on Render hit the v1 API, where "-latest" models 404, and Gemini
    # was disabled for every run.
    monkeypatch.setattr(sc, "GEMINI_FALLBACK_MODEL", "gemini-flash-lite-latest")
    (client,) = gemini([_api_error(genai_errors.ClientError, 404, "NOT_FOUND", "model not found"), GOOD_REPLY])
    assert sc.classify_email_ai(job_email)["method"] == "gemini"
    assert sc._gemini_failed is False


def test_clients_request_the_v1beta_api(monkeypatch):
    seen = {}

    class Client:
        def __init__(self, api_key, http_options):
            seen.update(http_options)

    import google.genai
    monkeypatch.setattr(google.genai, "Client", Client)
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(sc, "_gemini_clients", [])
    sc._init_gemini_clients()
    assert seen["api_version"] == "v1beta" and seen["timeout"] == sc.GEMINI_TIMEOUT_MS
