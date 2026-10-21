"""Deduplication, status resolution and company canonicalisation (temporary SQLite DB)."""
import pytest

import db_manager as db
import status_classifier as sc

EMAIL = {"email_id": "eid-1", "date_iso": "2026-10-01T09:00:00.000Z"}


def upsert(status, company="Acme Analytics", role="Data Science Intern", **extra):
    return db.upsert_application(EMAIL, {"company": company, "role": role, "status": status, **extra})


def stored(company="Acme Analytics"):
    return db.find_application_by_slug(db.normalize_slug(company))


@pytest.mark.parametrize("old, new, expected", [
    ("Applied", "Interview Scheduled", "Interview Scheduled"),   # progress
    ("Interview Scheduled", "Applied", "Interview Scheduled"),   # stale confirmation can't regress
    ("Applied", "Rejected", "Rejected"),                         # regression fixed: rejection now sticks
    ("Interview Scheduled", "Rejected", "Rejected"),
    ("Needs Review", "Rejected", "Rejected"),
    ("Rejected", "Applied", "Applied"),                          # re-applied later: new cycle
    ("Rejected", "Needs Review", "Rejected"),                    # uncertain email can't reopen
    ("Offer", "Rejected", "Offer"),                              # never lose an offer automatically
    ("Rejected", "Offer", "Offer"),
    ("Offer", "Applied", "Offer"),
    ("Applied", "Unknown", "Applied"),
])
def test_resolve_status(old, new, expected):
    assert db.resolve_status(old, new) == expected


def test_rerun_is_idempotent():
    assert upsert("Applied", notes="Conf: 95.")["action"] == "created"
    again = upsert("Applied", notes="Conf: 95.")
    assert (again["action"], again["status_changed"]) == ("updated", False)
    assert len(db.get_all_applications()) == 1


def test_later_rejection_overrides_and_alerts():
    upsert("Applied")
    result = upsert("Rejected", role="Candidate / Intern")
    assert result["status_changed"] is True
    assert stored()["status"] == "Rejected"
    assert stored()["role"] == "Data Science Intern"  # generic role never overwrites a specific one


def test_name_variants_share_one_row():
    upsert("Applied", company="Acme Analytics")
    upsert("OA Sent", company="ACME analytics")
    upsert("Interview Scheduled", company="Acmeanalytics")  # keyword tier's domain-derived name
    rows = db.get_all_applications()
    assert len(rows) == 1 and rows[0]["status"] == "Interview Scheduled"


@pytest.mark.parametrize("name, slug", [
    ("Gracenote", "gracenote"),
    ("Kamath Analytics", "kamathanalytics"),
    ("OnTarget Labs", "ontargetlabs"),
    ("Floral Designs", "floraldesigns"),
    ("Cskarts Studio", "cskartsstudio"),
    # canonical aliases still work
    ("Applied Materials", "appliedmaterials"),
    ("AMAT", "appliedmaterials"),
    ("Target", "target"),
    ("Grace", "jobrapido"),
    ("CSK Technologies", "csktechnologies"),
    ("L'Oréal", "loreal"),
    ("General Electric", "geaerospace"),
])
def test_normalize_slug_aliases(name, slug):
    assert db.normalize_slug(name) == slug


@pytest.mark.parametrize("name, display", [
    ("Gracenote", "Gracenote"),
    ("Kamath Analytics", "Kamath Analytics"),
    ("OnTarget Labs", "OnTarget Labs"),
    ("Target India", "Target"),
    ("AMAT", "Applied Materials"),
    ("Grace", "Jobrapido"),
])
def test_clean_company_name_aliases(name, display):
    assert sc.clean_company_name(name) == display
