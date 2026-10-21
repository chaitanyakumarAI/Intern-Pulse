"""
eval/evaluate_classifier.py — Measure how well InternPulse classifies emails.

Workflow
  1. Export a sample of your emails (reads Gmail, no AI calls):
       python eval/evaluate_classifier.py export --count 100 --days 180
     -> eval/data/emails.jsonl   (email content, stays local, git-ignored)
     -> eval/data/labels.csv     (one row per email for you to fill in)

  2. Label eval/data/labels.csv by hand (Excel / Google Sheets / any editor):
       is_job   yes / no
       status   one of config.STATUS_LABELS (e.g. Applied, Rejected, Interview Scheduled)
       company  the real hiring company
       role     the role title
     Rows with an empty is_job are ignored.

  3. Score the tiers on the same labelled emails:
       python eval/evaluate_classifier.py run                 # keyword tier only (offline, free)
       python eval/evaluate_classifier.py run --tier both     # + Gemini (one API call per email)
     -> eval/results/report-<timestamp>.md

Metrics: relevance precision/recall, status accuracy, per-class precision/recall/F1,
macro-F1, coverage (share not sent to Needs Review), company/role accuracy, and
end-to-end record accuracy (status + company + role all correct).
"""
import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL_DIR.parent))
sys.path.insert(0, str(EVAL_DIR))

import metrics  # noqa: E402

DATA_DIR = EVAL_DIR / "data"
RESULTS_DIR = EVAL_DIR / "results"
EMAILS_FILE = DATA_DIR / "emails.jsonl"
LABELS_FILE = DATA_DIR / "labels.csv"
LABEL_FIELDS = ["id", "date", "sender", "subject", "is_job", "status", "company", "role"]


# ── Export ────────────────────────────────────────────────────────────────────

def export(count: int, days: int | None) -> None:
    import config
    from gmail_reader import get_gmail_service, fetch_messages

    query = config._base_query + (f" newer_than:{days}d" if days else "")
    emails = fetch_messages(get_gmail_service(), max_results=count, query=query)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(EMAILS_FILE, "w", encoding="utf-8") as f:
        for e in emails:
            f.write(json.dumps({k: e.get(k, "") for k in ("id", "subject", "sender", "body", "date_iso")}) + "\n")

    if LABELS_FILE.exists():
        print(f"{LABELS_FILE} already exists; not overwriting your labels.")
    else:
        with open(LABELS_FILE, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=LABEL_FIELDS)
            writer.writeheader()
            for e in emails:
                writer.writerow({"id": e["id"], "date": (e.get("date_iso") or "")[:10],
                                 "sender": e.get("sender", ""), "subject": e.get("subject", "")})
    print(f"Exported {len(emails)} emails -> {EMAILS_FILE}\nLabel them in {LABELS_FILE}")


# ── Scoring ───────────────────────────────────────────────────────────────────

def load_labelled() -> list[dict]:
    emails = {}
    with open(EMAILS_FILE, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                e = json.loads(line)
                emails[e["id"]] = e
    rows = []
    with open(LABELS_FILE, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            is_job = (row.get("is_job") or "").strip().lower()
            if is_job not in ("yes", "no", "y", "n", "true", "false", "1", "0"):
                continue
            if row["id"] not in emails:
                print(f"warning: labelled id {row['id']} not found in {EMAILS_FILE.name}; skipped")
                continue
            rows.append({"email": emails[row["id"]], "is_job": is_job in ("yes", "y", "true", "1"),
                         "status": (row.get("status") or "").strip(),
                         "company": (row.get("company") or "").strip(),
                         "role": (row.get("role") or "").strip()})
    return rows


def predict(tier: str, email: dict) -> dict:
    import status_classifier as sc
    from utils import is_job_related

    if tier == "keyword":
        if not is_job_related(email["subject"], email["body"], email["sender"]):
            return {"is_job": False, "status": "Unknown", "company": "Unknown", "role": "", "fell_back": False}
        r = sc._keyword_classify(email)
    else:
        r = sc.classify_email_ai(email)
    return {"is_job": r.get("method") != "skipped", "status": r.get("status", "Unknown"),
            "company": r.get("company", "Unknown"), "role": r.get("role", ""),
            "fell_back": tier == "gemini" and r.get("method") == "keyword"}


def score(rows: list[dict], preds: list[dict]) -> dict:
    from db_manager import normalize_slug

    rel_pairs = [(r["is_job"], p["is_job"]) for r, p in zip(rows, preds)]
    tp = sum(t and p for t, p in rel_pairs)
    rel_precision = tp / sum(p for _, p in rel_pairs) if any(p for _, p in rel_pairs) else 0.0
    rel_recall = tp / sum(t for t, _ in rel_pairs) if any(t for t, _ in rel_pairs) else 0.0

    jobs = [(r, p) for r, p in zip(rows, preds) if r["is_job"] and r["status"]]
    status_pairs = [(r["status"], p["status"] if p["is_job"] else "Missed (filtered out)") for r, p in jobs]
    per_class = metrics.per_class_scores(status_pairs)
    company_ok = [normalize_slug(r["company"]) == normalize_slug(p["company"]) for r, p in jobs if r["company"]]
    role_ok = [metrics.role_matches(r["role"], p["role"]) for r, p in jobs if r["role"]]
    record_ok = [r["status"] == p["status"]
                 and normalize_slug(r["company"]) == normalize_slug(p["company"])
                 and (not r["role"] or metrics.role_matches(r["role"], p["role"]))
                 for r, p in jobs if r["company"]]
    answered = [(t, p) for t, p in status_pairs if p not in metrics.ABSTAIN_LABELS]

    return {
        "emails": len(rows),
        "job_emails": len(jobs),
        "relevance_precision": rel_precision,
        "relevance_recall": rel_recall,
        "status_accuracy": metrics.accuracy(status_pairs),
        "status_accuracy_when_answered": metrics.accuracy(answered),
        "coverage": metrics.coverage([p for _, p in status_pairs]),
        "macro_f1": metrics.macro_f1(per_class),
        "company_accuracy": sum(company_ok) / len(company_ok) if company_ok else 0.0,
        "role_accuracy": sum(role_ok) / len(role_ok) if role_ok else 0.0,
        "record_accuracy": sum(record_ok) / len(record_ok) if record_ok else 0.0,
        "gemini_fallbacks": sum(p["fell_back"] for p in preds),
        "per_class": per_class,
        "confusion": metrics.confusion_matrix(status_pairs),
    }


def render_report(results: dict[str, dict]) -> str:
    pct = lambda x: f"{x * 100:.1f}%"
    tiers = list(results)
    first = results[tiers[0]]
    lines = [f"# Classifier evaluation — {datetime.now():%Y-%m-%d %H:%M}", "",
             f"{first['emails']} labelled emails, {first['job_emails']} of them job emails with a status label.", "",
             "| Metric | " + " | ".join(tiers) + " |", "|---|" + "---|" * len(tiers)]
    for key, label in [("relevance_precision", "Relevance precision"), ("relevance_recall", "Relevance recall"),
                       ("status_accuracy", "Status accuracy"),
                       ("status_accuracy_when_answered", "Status accuracy (answered only)"),
                       ("coverage", "Coverage (not Needs Review/Unknown)"), ("macro_f1", "Status macro-F1"),
                       ("company_accuracy", "Company accuracy"), ("role_accuracy", "Role accuracy"),
                       ("record_accuracy", "Record accuracy (status+company+role)")]:
        lines.append(f"| {label} | " + " | ".join(pct(results[t][key]) for t in tiers) + " |")
    if "gemini" in results:
        lines += ["", f"Gemini fell back to keywords on {results['gemini']['gemini_fallbacks']} email(s)."]
    for tier in tiers:
        lines += ["", f"## {tier}: per-status scores", "", "| Status | Precision | Recall | F1 | Support |",
                  "|---|---|---|---|---|"]
        for label, s in results[tier]["per_class"].items():
            lines.append(f"| {label} | {pct(s['precision'])} | {pct(s['recall'])} | {pct(s['f1'])} | {s['support']} |")
        lines += ["", f"## {tier}: confusion (true → predicted)", ""]
        for true, preds in sorted(results[tier]["confusion"].items()):
            lines.append(f"- **{true}** → " + ", ".join(f"{p}: {n}" for p, n in preds.most_common()))
    return "\n".join(lines) + "\n"


def run(tier_arg: str) -> None:
    rows = load_labelled()
    if not rows:
        sys.exit(f"No labelled rows found. Fill in is_job/status/company/role in {LABELS_FILE}.")
    tiers = ["keyword", "gemini"] if tier_arg == "both" else [tier_arg]
    if "gemini" in tiers:
        print(f"Gemini tier: about {len(rows)} API calls (paced at ~13/min).")

    results = {}
    for tier in tiers:
        if tier == "gemini":
            import status_classifier as sc
            sc.reset_gemini_session()
        results[tier] = score(rows, [predict(tier, r["email"]) for r in rows])

    report = render_report(results)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / f"report-{datetime.now():%Y%m%d-%H%M%S}.md"
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"Saved -> {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate InternPulse email classification")
    sub = parser.add_subparsers(dest="command", required=True)
    p_export = sub.add_parser("export", help="Export emails from Gmail for labelling")
    p_export.add_argument("--count", type=int, default=100)
    p_export.add_argument("--days", type=int, default=None, help="Only emails newer than N days")
    p_run = sub.add_parser("run", help="Score classifier tiers against your labels")
    p_run.add_argument("--tier", choices=["keyword", "gemini", "both"], default="keyword")
    args = parser.parse_args()
    if args.command == "export":
        export(args.count, args.days)
    else:
        run(args.tier)


if __name__ == "__main__":
    main()
