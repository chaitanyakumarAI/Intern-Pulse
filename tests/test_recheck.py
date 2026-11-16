"""Re-checking "Needs Review" rows: decisions, applying them, and the worker endpoint."""
import pytest

import cloud_state
import db_manager
import gmail_reader
import recheck
import status_classifier

ROW = {"id": "row-1", "company": "Backend Engineer", "company_slug": "backendengineer",
       "role": "Candidate / Intern", "status": "Needs Review", "last_gmail_id": "g-1"}
EMAIL = {"id": "g-1", "subject": "Backend Engineer at Globex and 5 more", "sender": "jobalerts-noreply@linkedin.com",
         "body": "", "date_iso": "2026-11-14T09:00:00.000Z"}


def result(status, company="Globex", method="gemini", role="Backend Engineer"):
    return {"status": status, "company": company, "role": role, "method": method}


@pytest.fixture
def fakes(monkeypatch):
    """Fake Gmail, Gemini answers and database writes; returns a log of what happened."""
    log = {"deleted": [], "updated": [], "upserted": [], "opportunities": [], "answer": None}
    monkeypatch.setattr(db_manager, "list_needs_review", lambda limit=50: [dict(ROW)])
    monkeypatch.setattr(gmail_reader, "get_gmail_service", lambda: object())
    monkeypatch.setattr(gmail_reader, "fetch_message", lambda service, msg_id: dict(EMAIL))
    monkeypatch.setattr(status_classifier, "classify_email_ai", lambda email: dict(log["answer"]))
    monkeypatch.setattr(db_manager, "delete_application", lambda row_id: log["deleted"].append(row_id) or True)
    monkeypatch.setattr(db_manager, "update_application_fields", lambda row_id, f: log["updated"].append((row_id, f)) or True)
    monkeypatch.setattr(db_manager, "upsert_application", lambda e, c: log["upserted"].append(c["company"]) or {"action": "created"})
    monkeypatch.setattr(cloud_state, "available", lambda: True)
    monkeypatch.setattr(cloud_state, "save_opportunity", lambda c: log["opportunities"].append(c["company"]) or True)
    return log


def test_preview_changes_nothing(fakes):
    fakes["answer"] = result("Job Opportunity")
    out = recheck.recheck_needs_review(apply=False)
    assert out["counts"] == {"move_to_radar": 1}
    assert fakes["deleted"] == fakes["opportunities"] == []


def test_job_alert_moves_to_radar(fakes):
    fakes["answer"] = result("Job Opportunity")
    recheck.recheck_needs_review(apply=True)
    assert fakes["opportunities"] == ["Globex"] and fakes["deleted"] == ["row-1"]


def test_non_job_email_is_removed(fakes):
    fakes["answer"] = result("Unknown", company="Unknown", method="skipped")
    assert recheck.recheck_needs_review(apply=True)["counts"] == {"delete": 1}
    assert fakes["deleted"] == ["row-1"]


def test_nothing_is_removed_without_gemini(fakes):
    fakes["answer"] = result("Unknown", company="Unknown", method="keyword")
    out = recheck.recheck_needs_review(apply=True)
    assert out["counts"] == {"keep": 1} and out["items"][0]["reason"] == "Gemini unavailable"
    assert fakes["deleted"] == [] and fakes["updated"] == []


def test_unsure_answer_keeps_the_row(fakes):
    fakes["answer"] = result("Needs Review")
    assert recheck.recheck_needs_review(apply=True)["counts"] == {"keep": 1}


def test_real_status_for_a_different_company_is_folded_into_that_company(fakes):
    fakes["answer"] = result("Applied", company="Globex")
    recheck.recheck_needs_review(apply=True)
    assert fakes["upserted"] == ["Globex"] and fakes["deleted"] == ["row-1"]


def test_real_status_for_the_same_company_updates_in_place(fakes, monkeypatch):
    monkeypatch.setattr(db_manager, "list_needs_review", lambda limit=50: [dict(ROW, company="Globex", company_slug="globex")])
    fakes["answer"] = result("Rejected", company="Globex")
    recheck.recheck_needs_review(apply=True)
    assert fakes["updated"][0][1]["status"] == "Rejected" and fakes["deleted"] == []


def test_failed_write_is_reported_as_kept(fakes, monkeypatch):
    monkeypatch.setattr(db_manager, "delete_application", lambda row_id: False)
    fakes["answer"] = result("Unknown", company="Unknown", method="skipped")
    out = recheck.recheck_needs_review(apply=True)
    assert out["items"][0]["action"] == "keep" and out["items"][0]["reason"] == "write failed"
