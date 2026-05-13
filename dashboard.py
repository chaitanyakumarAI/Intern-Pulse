"""
dashboard.py — CLI dashboard for AI Internship Tracker.

Queries your Notion database and displays:
  - Status summary (applied / interviews / offers / rejections)
  - Platform breakdown
  - Company list
  - Recent activity
  - Success rate metrics

Usage:
    python dashboard.py            # full dashboard
    python dashboard.py --compact  # one-liner summary
    python dashboard.py --json     # machine-readable JSON output
"""
import sys
import json
import argparse
import logging
from collections import Counter
from datetime import datetime, timezone

# Fix Windows console encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import config
from config import setup_logging

logger = setup_logging("dashboard")

# ── Colour helpers (no extra deps) ───────────────────────────────────────────

try:
    from colorama import init as _colorama_init, Fore, Style
    _colorama_init(autoreset=True)
    _COLOR = True
except ImportError:
    _COLOR = False

def _c(text: str, color: str = "") -> str:
    if not _COLOR or not color:
        return text
    colors = {
        "green":  Fore.GREEN,
        "red":    Fore.RED,
        "yellow": Fore.YELLOW,
        "cyan":   Fore.CYAN,
        "blue":   Fore.LIGHTBLUE_EX,
        "white":  Fore.WHITE,
        "bold":   Style.BRIGHT,
        "dim":    Style.DIM,
        "reset":  Style.RESET_ALL,
    }
    return f"{colors.get(color, '')}{text}{Style.RESET_ALL}"

# ── Status emoji + colour map ─────────────────────────────────────────────────

_STATUS_CONFIG = {
    "Applied":             {"emoji": "📝", "color": "blue"},
    "Under Review":        {"emoji": "🔍", "color": "yellow"},
    "OA Sent":             {"emoji": "💻", "color": "cyan"},
    "Interview Scheduled": {"emoji": "🎯", "color": "cyan"},
    "Rejected":            {"emoji": "❌", "color": "red"},
    "Offer":               {"emoji": "🎉", "color": "green"},
    "Ghosted":             {"emoji": "👻", "color": "dim"},
    "Unknown":             {"emoji": "❓", "color": "dim"},
}


# ── Data fetching ─────────────────────────────────────────────────────────────

def fetch_all_rows() -> list[dict]:
    """Pull every row from Notion via data_sources.query with pagination."""
    from notion_client import Client
    client = Client(auth=config.NOTION_API_KEY)
    db_id  = config.NOTION_DATABASE_ID
    results = []
    cursor  = None

    while True:
        kwargs = {}
        if cursor:
            kwargs["start_cursor"] = cursor
        try:
            resp = client.data_sources.query(db_id, **kwargs)
        except Exception as exc:
            logger.error("Notion query failed: %s", exc)
            break
        results.extend(resp.get("results", []))
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")

    return results


def _get_prop(row: dict, name: str, prop_type: str) -> str:
    """Safely extract a property value from a Notion page dict."""
    try:
        prop = row["properties"][name]
        if prop_type == "title":
            parts = prop.get("title", [])
            return parts[0]["text"]["content"] if parts else ""
        if prop_type == "rich_text":
            parts = prop.get("rich_text", [])
            return parts[0]["text"]["content"] if parts else ""
        if prop_type == "select":
            sel = prop.get("select")
            return sel["name"] if sel else ""
        if prop_type == "date":
            d = prop.get("date")
            return d["start"] if d else ""
        if prop_type == "url":
            return prop.get("url") or ""
    except (KeyError, IndexError, TypeError):
        pass
    return ""


def parse_rows(rows: list[dict]) -> list[dict]:
    """Convert raw Notion rows to clean dicts."""
    apps = []
    for row in rows:
        apps.append({
            "id":            row.get("id", ""),
            "company":       _get_prop(row, "Company", "title"),
            "role":          _get_prop(row, "Role", "rich_text"),
            "status":        _get_prop(row, "Status", "select"),
            "platform":      _get_prop(row, "Platform", "select"),
            "applied_date":  _get_prop(row, "Applied Date", "date"),
            "last_checked":  _get_prop(row, "Last Checked", "date"),
            "app_link":      _get_prop(row, "Application Link", "url"),
            "notes":         _get_prop(row, "Notes", "rich_text"),
        })
    return apps


# ── Dashboard rendering ───────────────────────────────────────────────────────

def _bar(value: int, total: int, width: int = 20, char: str = "█") -> str:
    if total == 0:
        return " " * width
    filled = int(round(value / total * width))
    return char * filled + "░" * (width - filled)


def _pct(value: int, total: int) -> str:
    if total == 0:
        return "  0.0%"
    return f"{value/total*100:5.1f}%"


def print_full_dashboard(apps: list[dict]) -> None:
    total = len(apps)
    if total == 0:
        print(_c("\n  No applications found in Notion database.\n", "yellow"))
        return

    status_counts   = Counter(a["status"] for a in apps)
    platform_counts = Counter(a["platform"] or "Unknown" for a in apps)
    company_counts  = Counter(a["company"] or "Unknown" for a in apps)

    # Stats
    offers      = status_counts.get("Offer", 0)
    interviews  = status_counts.get("Interview Scheduled", 0)
    oas         = status_counts.get("OA Sent", 0)
    rejections  = status_counts.get("Rejected", 0)
    applied     = status_counts.get("Applied", 0)
    under_review = status_counts.get("Under Review", 0)
    ghosted     = status_counts.get("Ghosted", 0)

    # Active pipeline: anything not rejected/ghosted/unknown
    active = total - rejections - ghosted - status_counts.get("Unknown", 0)

    # Success rate = (Interview + OA + Offer) / total
    positive = interviews + oas + offers
    success_rate = positive / total * 100 if total else 0

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # ── Header ───────────────────────────────────────────────────────────────
    width = 62
    print()
    print(_c("=" * width, "bold"))
    print(_c("   AI INTERNSHIP TRACKER — LIVE DASHBOARD", "bold"))
    print(_c(f"   Generated: {now}", "dim"))
    print(_c("=" * width, "bold"))

    # ── Key Metrics ──────────────────────────────────────────────────────────
    print()
    print(_c("  KEY METRICS", "cyan"))
    print(_c("  " + "-" * (width - 2), "dim"))
    metrics = [
        ("Total Applications", total,        "white"),
        ("Active Pipeline",    active,        "blue"),
        ("Interviews",         interviews,    "cyan"),
        ("OA Received",        oas,           "cyan"),
        ("Offers",             offers,        "green"),
        ("Rejections",         rejections,    "red"),
        ("Ghosted",            ghosted,       "dim"),
    ]
    for label, value, color in metrics:
        bar = _bar(value, total)
        pct = _pct(value, total)
        print(f"  {label:<22} {_c(str(value).rjust(4), color)}  {_c(bar, color)}  {pct}")

    print()
    print(f"  {'Success Rate':<22} {_c(f'{success_rate:.1f}%', 'green' if success_rate > 15 else 'yellow')}")
    print(_c("  " + "-" * (width - 2), "dim"))

    # ── Status Breakdown ─────────────────────────────────────────────────────
    print()
    print(_c("  STATUS BREAKDOWN", "cyan"))
    print(_c("  " + "-" * (width - 2), "dim"))
    for status in config.STATUS_LABELS:
        count = status_counts.get(status, 0)
        if count == 0:
            continue
        cfg   = _STATUS_CONFIG.get(status, {"emoji": "·", "color": "white"})
        emoji = cfg["emoji"]
        color = cfg["color"]
        bar   = _bar(count, total, width=16)
        print(f"  {emoji} {_c(status, color):<28} {_c(str(count).rjust(3), color)}  {_c(bar, color)}")

    # ── Platform Breakdown ───────────────────────────────────────────────────
    print()
    print(_c("  PLATFORM BREAKDOWN", "cyan"))
    print(_c("  " + "-" * (width - 2), "dim"))
    for platform, count in platform_counts.most_common():
        bar = _bar(count, total, width=16)
        print(f"  {'🖥' if platform == 'Email' else '🔗'} {platform:<28} {str(count).rjust(3)}  {bar}")

    # ── Top Companies ────────────────────────────────────────────────────────
    print()
    print(_c("  TOP COMPANIES", "cyan"))
    print(_c("  " + "-" * (width - 2), "dim"))
    for company, count in company_counts.most_common(10):
        company_apps = [a for a in apps if a["company"] == company]
        statuses = set(a["status"] for a in company_apps)
        status_str = " | ".join(sorted(statuses))
        print(f"  🏢 {company:<28} {str(count).rjust(3)}  [{status_str}]")

    # ── Recent Activity (last 5) ──────────────────────────────────────────────
    dated = [a for a in apps if a["applied_date"]]
    dated.sort(key=lambda x: x["applied_date"], reverse=True)
    recent = dated[:5]

    if recent:
        print()
        print(_c("  RECENT ACTIVITY (Last 5)", "cyan"))
        print(_c("  " + "-" * (width - 2), "dim"))
        for a in recent:
            date    = a["applied_date"][:10] if a["applied_date"] else "Unknown"
            status  = a["status"]
            cfg     = _STATUS_CONFIG.get(status, {"emoji": "·", "color": "white"})
            emoji   = cfg["emoji"]
            color   = cfg["color"]
            company = (a["company"] or "?")[:20]
            role    = (a["role"] or "?")[:25]
            print(f"  {date}  {emoji} {_c(status, color):<28}  {company} — {role}")

    # ── Pipeline Health ───────────────────────────────────────────────────────
    print()
    print(_c("  PIPELINE HEALTH", "cyan"))
    print(_c("  " + "-" * (width - 2), "dim"))
    if offers > 0:
        print(_c(f"  🎉 You have {offers} OFFER(s)! Congratulations!", "green"))
    if interviews > 0:
        print(_c(f"  🎯 {interviews} interview(s) in pipeline.", "cyan"))
    if ghosted > active and total > 0:
        print(_c("  👻 High ghost rate — consider follow-ups.", "yellow"))
    if rejections / total > 0.5 if total else False:
        print(_c("  💡 >50% rejection rate — consider tuning applications.", "yellow"))

    # ── Footer ───────────────────────────────────────────────────────────────
    print()
    print(_c("=" * width, "bold"))
    print(_c("  Run `python main.py` to sync latest emails.", "dim"))
    print(_c("=" * width, "bold"))
    print()


def print_compact_summary(apps: list[dict]) -> None:
    total  = len(apps)
    counts = Counter(a["status"] for a in apps)
    print(
        f"Total: {total} | "
        f"Offer: {counts.get('Offer',0)} | "
        f"Interview: {counts.get('Interview Scheduled',0)} | "
        f"OA: {counts.get('OA Sent',0)} | "
        f"Rejected: {counts.get('Rejected',0)} | "
        f"Applied: {counts.get('Applied',0)}"
    )


def print_json_output(apps: list[dict]) -> None:
    counts = Counter(a["status"] for a in apps)
    platform_counts = Counter(a["platform"] or "Unknown" for a in apps)
    out = {
        "total": len(apps),
        "by_status": dict(counts),
        "by_platform": dict(platform_counts),
        "applications": apps,
    }
    print(json.dumps(out, indent=2, default=str))


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="AI Internship Tracker Dashboard")
    parser.add_argument("--compact", action="store_true", help="One-line summary")
    parser.add_argument("--json",    action="store_true", help="JSON output")
    args = parser.parse_args()

    if not config.NOTION_API_KEY or config.NOTION_API_KEY.startswith("your_"):
        print("ERROR: NOTION_API_KEY not set in .env")
        sys.exit(1)

    print(_c("Fetching data from Notion...", "dim"), end="\r")
    try:
        rows = fetch_all_rows()
    except Exception as exc:
        print(f"ERROR: Could not connect to Notion: {exc}")
        sys.exit(1)

    apps = parse_rows(rows)

    if args.json:
        print_json_output(apps)
    elif args.compact:
        print_compact_summary(apps)
    else:
        print_full_dashboard(apps)


if __name__ == "__main__":
    main()
