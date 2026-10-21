"""Rule-based scam detection (pure functions)."""
import pytest

from threat_detector import evaluate_threat


@pytest.mark.parametrize("company, sender, risk", [
    ("DataLearn Labs", "DataLearn HR <hr.datalearn@gmail.com>", "Low"),          # regression: "ea" substring
    ("Intelligent Retail", "Hiring <intelligentretail.hr@gmail.com>", "Low"),    # regression: "intel" substring
    ("Google", "Google HR <google.careers.hr@gmail.com>", "High"),                # brand impersonation
    ("Google India", "Recruiter <recruit.google@yahoo.com>", "High"),
    ("Acme Analytics", "Careers <careers@acmeanalytics.example>", "Low"),
])
def test_free_mail_impersonation(company, sender, risk):
    result = evaluate_threat(company_name=company, subject="Internship opportunity",
                             body="Please share your resume.", sender=sender)
    assert result["scam_risk"] == risk


def test_advance_fee_request_is_high_risk():
    result = evaluate_threat(company_name="Acme Analytics",
                             body="Please pay the registration fee of Rs 2000 to confirm your seat.",
                             sender="hr@acmeanalytics.example")
    assert (result["scam_risk"], result["threat_category"]) == ("High", "advance_fee")


def test_shortened_link_is_medium_risk():
    result = evaluate_threat(company_name="Acme Analytics", body="Apply here: https://bit.ly/abc",
                             sender="hr@acmeanalytics.example")
    assert result["scam_risk"] == "Medium"
