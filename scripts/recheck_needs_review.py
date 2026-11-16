"""
Re-check "Needs Review" applications with Gemini (see recheck.py).

    python scripts/recheck_needs_review.py            # preview: shows what would change
    python scripts/recheck_needs_review.py --apply    # make the changes

Reads Gmail and calls Gemini; with --apply it updates, moves or removes rows.
"""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import recheck  # noqa: E402

LABELS = {"keep": "keep", "delete": "remove (not a job email)", "move_to_radar": "move to Radar (job alert)", "update": "update"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Re-check 'Needs Review' applications with Gemini")
    parser.add_argument("--apply", action="store_true", help="Make the changes (default: preview only)")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)

    result = recheck.recheck_needs_review(apply=args.apply, limit=args.limit)
    for item in result["items"]:
        detail = f" -> {item['new_status']} @ {item['new_company']}" if item["action"] == "update" else ""
        print(f"  {item['company'][:32]:32s} {LABELS[item['action']]}{detail}  ({item['reason']})")
    print(f"\n{result['checked']} checked: {result['counts']}")
    if not args.apply:
        print("Preview only. Run with --apply to make these changes.")


if __name__ == "__main__":
    main()
