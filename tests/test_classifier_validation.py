"""Validation layer and the prompt/validator status contract."""
import json
import re

import config
import status_classifier as sc


def _llm(**overrides) -> str:
    payload = {
        "is_job_application": True, "reasoning": "test", "confidence_score": 95,
        "company_name": "Acme Analytics", "role": "ML Intern",
        "status": "Interview Scheduled", "platform": "Direct Email",
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_prompt_and_validator_share_one_status_list():
    line = next(l for l in sc._SYSTEM_PROMPT.splitlines() if '"status": "One of:' in l)
    prompt_statuses = set(re.search(r'One of: ([^"]+)"', line).group(1).split(" | "))
    assert prompt_statuses == sc.VALID_STATUSES == set(config.STATUS_LABELS)


def test_job_opportunity_survives_validation():
    # Regression: this used to be rewritten to "Unknown".
    assert sc._parse_llm_response(_llm(status="Job Opportunity"))["status"] == "Job Opportunity"


def test_low_confidence_goes_to_needs_review():
    assert sc._parse_llm_response(_llm(status="Offer", confidence_score=60))["status"] == "Needs Review"


def test_low_confidence_job_digest_stays_an_opportunity():
    result = sc._parse_llm_response(_llm(status="Job Opportunity", confidence_score=50))
    assert result["status"] == "Job Opportunity"


def test_unknown_status_and_platform_are_rejected():
    result = sc._parse_llm_response(_llm(status="Hired!!", platform="Carrier pigeon"))
    assert (result["status"], result["platform"]) == ("Unknown", "Unknown")


def test_markdown_fenced_json_is_parsed():
    assert sc._parse_llm_response("```json\n" + _llm() + "\n```")["company"] == "Acme Analytics"


def test_non_json_reply_falls_back_to_safe_defaults():
    result = sc._parse_llm_response("Sure! Here is the JSON you asked for.")
    assert (result["status"], result["company"], result["confidence_score"]) == ("Unknown", "Unknown", 0)


def test_non_numeric_confidence_is_treated_as_zero():
    assert sc._parse_llm_response(_llm(confidence_score="very high"))["status"] == "Needs Review"


def test_keyword_tier_tags_its_results():
    result = sc._keyword_classify({"subject": "Thank you for applying", "body": "", "sender": "hr@acme.example"})
    assert result["method"] == "keyword"
