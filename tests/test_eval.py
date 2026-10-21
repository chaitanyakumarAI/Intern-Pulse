"""Accuracy-evaluation tooling: metric maths and an offline keyword-tier run."""
import csv
import importlib.util
import json
from pathlib import Path

import pytest

EVAL_DIR = Path(__file__).resolve().parent.parent / "eval"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, EVAL_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


metrics = _load("metrics")
evaluate = _load("evaluate_classifier")


def test_precision_recall_f1_worked_example():
    # 10 real rejections; 8 caught; 4 other emails wrongly called "Rejected"; 2 rejections missed.
    pairs = ([("Rejected", "Rejected")] * 8 + [("Applied", "Rejected")] * 4
             + [("Rejected", "Interview Scheduled")] * 2 + [("Applied", "Applied")] * 86)
    rejected = metrics.per_class_scores(pairs)["Rejected"]
    assert rejected["precision"] == pytest.approx(8 / 12)
    assert rejected["recall"] == pytest.approx(8 / 10)
    assert rejected["f1"] == pytest.approx(2 * (8 / 12) * 0.8 / ((8 / 12) + 0.8))
    assert rejected["support"] == 10


def test_coverage_and_accuracy():
    assert metrics.coverage(["Applied", "Needs Review", "Unknown", "Offer"]) == 0.5
    assert metrics.accuracy([("a", "a"), ("a", "b")]) == 0.5
    assert metrics.accuracy([]) == 0.0


@pytest.mark.parametrize("true, pred, ok", [
    ("Data Science Intern", "Data Science Internship", True),
    ("ML Intern", "Machine Learning Engineer", False),
    ("SDE Intern", "", False),
])
def test_role_matching(true, pred, ok):
    assert metrics.role_matches(true, pred) is ok


def test_keyword_tier_run_offline(tmp_path, monkeypatch):
    emails = [
        {"id": "1", "subject": "Thank you for applying to Acme Analytics", "sender": "careers@acmeanalytics.example",
         "body": "We have received your application for Data Science Intern.", "date_iso": "2026-10-01"},
        {"id": "2", "subject": "Update on your application", "sender": "careers@acmeanalytics.example",
         "body": "Unfortunately, you have not been selected for the next round.", "date_iso": "2026-10-05"},
        {"id": "3", "subject": "50% sale today", "sender": "promo@shop.example", "body": "Buy now", "date_iso": "2026-10-06"},
        {"id": "4", "subject": "Not labelled yet", "sender": "x@y.example", "body": "", "date_iso": "2026-10-07"},
    ]
    labels = [
        {"id": "1", "is_job": "yes", "status": "Applied", "company": "Acme Analytics", "role": "Data Science Intern"},
        {"id": "2", "is_job": "yes", "status": "Rejected", "company": "Acme Analytics", "role": ""},
        {"id": "3", "is_job": "no"},
        {"id": "4"},
    ]
    (tmp_path / "emails.jsonl").write_text("\n".join(json.dumps(e) for e in emails), encoding="utf-8")
    with open(tmp_path / "labels.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=evaluate.LABEL_FIELDS)
        writer.writeheader()
        writer.writerows(labels)
    monkeypatch.setattr(evaluate, "EMAILS_FILE", tmp_path / "emails.jsonl")
    monkeypatch.setattr(evaluate, "LABELS_FILE", tmp_path / "labels.csv")
    monkeypatch.setattr(evaluate, "RESULTS_DIR", tmp_path / "results")

    rows = evaluate.load_labelled()
    assert len(rows) == 3  # unlabelled row ignored
    result = evaluate.score(rows, [evaluate.predict("keyword", r["email"]) for r in rows])
    assert result["relevance_recall"] == 1.0
    # The keyword tier reads "not selected for the next round" as an interview: a known weakness.
    assert result["confusion"]["Rejected"]["Interview Scheduled"] == 1
    assert result["status_accuracy"] == 0.5

    evaluate.run("keyword")
    reports = list((tmp_path / "results").glob("report-*.md"))
    assert len(reports) == 1 and "Status macro-F1" in reports[0].read_text(encoding="utf-8")
