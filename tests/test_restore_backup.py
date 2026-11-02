"""scripts/restore_backup.py: cleaning and request shape (no network)."""
import importlib.util
import json
import types
from pathlib import Path

import db_manager

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "restore_backup.py"


def _load():
    spec = importlib.util.spec_from_file_location("restore_backup", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_prepare_cleans_notes_and_skips_platform_rows():
    restore = _load()
    rows, skipped = restore.prepare([
        {"company": "Acme Analytics", "status": "Applied", "notes": "[eid:abc123] (keyword fallback)\nCall recruiter Friday"},
        {"company": "Internshala", "status": "Needs Review", "notes": ""},
        {"company": "ACME analytics", "status": "OA Sent", "notes": "Conf: 95. digest"},
    ])
    assert skipped == ["Internshala"]
    assert len(rows) == 1  # same slug: later row wins
    assert rows[0]["status"] == "OA Sent" and rows[0]["company_slug"] == "acmeanalytics" and rows[0]["notes"] == ""
    assert restore.clean_notes("[eid:x] (keyword fallback)\nCall recruiter Friday") == "Call recruiter Friday"


def test_apply_upserts_on_company_slug(tmp_path, monkeypatch, capsys):
    restore = _load()
    (tmp_path / "canonical_applications.json").write_text(json.dumps([{"company": "Globex", "status": "Offer"}]), encoding="utf-8")
    monkeypatch.setattr(restore.config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db_manager, "_get_supabase_config", lambda: {"url": "https://x", "key": "k"})
    calls = []
    monkeypatch.setattr(db_manager, "rest", lambda method, path, json=None, prefer=None:
                        calls.append((method, path, json, prefer)) or types.SimpleNamespace(status_code=201, text=""))
    monkeypatch.setattr("sys.argv", ["restore_backup.py", "--apply"])
    restore.main()
    method, path, body, prefer = calls[0]
    assert (method, path) == ("POST", "applications?on_conflict=company_slug")
    assert body[0]["company_slug"] == "globex" and "merge-duplicates" in prefer
    assert "Restored 1" in capsys.readouterr().out
