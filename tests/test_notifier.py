"""Telegram message building: escaping and quiet summaries (no network)."""
import telegram_notifier


def test_untrusted_text_is_html_escaped(monkeypatch):
    sent = []
    monkeypatch.setattr(telegram_notifier, "send_message", lambda text: sent.append(text) or True)
    telegram_notifier.notify_status_change(
        {"subject": "Offer <urgent> & details", "date_iso": "2026-10-01T09:00:00.000Z"},
        {"status": "Offer", "company": "AT&T", "role": "R&D <Intern>", "scam_risk": "Low", "risk_notes": "a < b"},
    )
    text = sent[0]
    assert "AT&amp;T" in text and "R&amp;D &lt;Intern&gt;" in text and "&lt;urgent&gt;" in text
    assert "<urgent>" not in text


def test_summary_is_silent_when_nothing_changed(monkeypatch):
    sent = []
    monkeypatch.setattr(telegram_notifier, "send_message", lambda text: sent.append(text) or True)
    assert telegram_notifier.notify_summary({"processed": 5, "created": 0, "updated": 0, "errors": 0}) is False
    assert telegram_notifier.notify_summary({"processed": 5, "created": 1}) is True
    assert len(sent) == 1
