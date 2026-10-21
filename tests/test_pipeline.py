"""main.run_once end to end with fake Gmail, classifier, research and Telegram."""
import pytest

import company_researcher
import config
import db_manager as db
import email_history
import gmail_reader
import main
import status_classifier
import sync_quota
import telegram_notifier


def make_email(msg_id, subject, date_iso, sender="Acme Careers <careers@acmeanalytics.example>"):
    return {"id": msg_id, "email_id": f"eid-{msg_id}", "subject": subject, "sender": sender,
            "body": "Regarding your application for the internship.", "date_iso": date_iso}


def classification(status, company="Acme Analytics", method="gemini", scam_risk="Low", risk_notes=""):
    return {"is_job_application": True, "company": company, "role": "Data Science Intern", "status": status,
            "platform": "Direct Email", "oa_link": None, "confidence_score": 95, "notes": "",
            "method": method, "scam_risk": scam_risk, "risk_notes": risk_notes}


@pytest.fixture
def pipeline(monkeypatch):
    """Wire run_once to fakes. Returns a dict for scripting inputs and inspecting alerts."""
    state = {"emails": [], "by_subject": {}, "alerts": [],
             "research": {"scam_risk": "Low", "risk_notes": "Established company.", "prep_sheet": ""}}
    monkeypatch.setattr(gmail_reader, "get_gmail_service", lambda: object())
    monkeypatch.setattr(gmail_reader, "fetch_messages", lambda service, max_results=None: list(state["emails"]))
    monkeypatch.setattr(status_classifier, "classify_email_ai", lambda email: dict(state["by_subject"][email["subject"]]))
    monkeypatch.setattr(company_researcher, "analyze_company", lambda company, role, status: dict(state["research"]))
    monkeypatch.setattr(telegram_notifier, "notify_status_change",
                        lambda email, cls, action="created": state["alerts"].append((action, cls["status"])))
    monkeypatch.setattr(telegram_notifier, "notify_summary", lambda stats: None)
    monkeypatch.setattr(main, "PIPELINE_STATUS_FILE", db.SQLITE_PATH.parent / "pipeline_status.json")
    return state


def test_emails_are_processed_oldest_first(pipeline):
    # Gmail returns newest first; the later rejection must win.
    pipeline["emails"] = [
        make_email("2", "Update on your application", "2026-10-05T09:00:00.000Z"),
        make_email("1", "Thank you for your application", "2026-10-01T09:00:00.000Z"),
    ]
    pipeline["by_subject"] = {
        "Update on your application": classification("Rejected"),
        "Thank you for your application": classification("Applied"),
    }
    main.run_once(force=True)
    assert db.find_application_by_slug("acmeanalytics")["status"] == "Rejected"
    assert email_history.get_processed_ids() == {"1", "2"}


def test_unresolved_keyword_email_is_retried_when_gemini_configured(pipeline, monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    pipeline["emails"] = [make_email("1", "Your application update", "2026-10-01T09:00:00.000Z",
                                     sender="noreply@internshala.com")]
    pipeline["by_subject"] = {"Your application update": classification("Interview Scheduled", company="Unknown", method="keyword")}
    main.run_once(force=True)
    assert "1" not in email_history.get_processed_ids()  # regression: used to be marked processed and lost
    assert db.get_all_applications() == []


def test_unresolved_email_is_marked_when_gemini_not_configured(pipeline):
    pipeline["emails"] = [make_email("1", "Your application update", "2026-10-01T09:00:00.000Z",
                                     sender="noreply@internshala.com")]
    pipeline["by_subject"] = {"Your application update": classification("Interview Scheduled", company="Unknown", method="keyword")}
    main.run_once(force=True)
    assert "1" in email_history.get_processed_ids()  # retrying can't help, so don't loop forever


def test_email_level_scam_warning_is_not_overwritten(pipeline):
    pipeline["emails"] = [make_email("1", "Offer letter for your application", "2026-10-01T09:00:00.000Z")]
    pipeline["by_subject"] = {"Offer letter for your application": classification(
        "Offer", scam_risk="High", risk_notes="Advance Fee Warning: email requests payment.")}
    main.run_once(force=True)
    row = db.find_application_by_slug("acmeanalytics")
    assert (row["scam_risk"], row["risk_notes"]) == ("High", "Advance Fee Warning: email requests payment.")


def test_company_research_can_raise_the_risk(pipeline):
    pipeline["research"] = {"scam_risk": "Medium", "risk_notes": "Mixed reviews.", "prep_sheet": ""}
    pipeline["emails"] = [make_email("1", "Thank you for your application", "2026-10-01T09:00:00.000Z")]
    pipeline["by_subject"] = {"Thank you for your application": classification("Applied", scam_risk="Low")}
    main.run_once(force=True)
    assert db.find_application_by_slug("acmeanalytics")["scam_risk"] == "Medium"


def test_rerun_sends_no_duplicate_alerts(pipeline):
    pipeline["emails"] = [make_email("1", "Thank you for your application", "2026-10-01T09:00:00.000Z")]
    pipeline["by_subject"] = {"Thank you for your application": classification("Applied")}
    main.run_once(force=True)
    email_history.clear_history()  # simulate a fresh CI runner that lost its processed set
    main.run_once(force=True)
    assert pipeline["alerts"] == [("created", "Applied")]
    assert len(db.get_all_applications()) == 1


def test_failed_gmail_auth_does_not_use_quota(pipeline, monkeypatch):
    def broken_auth():
        raise PermissionError("token expired")
    monkeypatch.setattr(gmail_reader, "get_gmail_service", broken_auth)
    main.run_once()
    assert sync_quota.get_quota()["syncs_today"] == 0
