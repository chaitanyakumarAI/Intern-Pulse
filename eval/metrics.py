"""
eval/metrics.py — Pure metric helpers for the classifier evaluation (no I/O).
"""
import re
from collections import Counter, defaultdict
from typing import Dict, Iterable, List, Tuple

ABSTAIN_LABELS = {"Needs Review", "Unknown"}


def confusion_matrix(pairs: Iterable[Tuple[str, str]]) -> Dict[str, Counter]:
    """pairs of (true, predicted) -> {true_label: Counter(predicted_label -> n)}"""
    matrix: Dict[str, Counter] = defaultdict(Counter)
    for true, pred in pairs:
        matrix[true][pred] += 1
    return matrix


def per_class_scores(pairs: List[Tuple[str, str]]) -> Dict[str, Dict[str, float]]:
    """Precision, recall, F1 and support for every label that appears as truth."""
    tp, fp, fn = Counter(), Counter(), Counter()
    for true, pred in pairs:
        if true == pred:
            tp[true] += 1
        else:
            fp[pred] += 1
            fn[true] += 1
    scores = {}
    for label in sorted({t for t, _ in pairs}):
        p_den, r_den = tp[label] + fp[label], tp[label] + fn[label]
        precision = tp[label] / p_den if p_den else 0.0
        recall = tp[label] / r_den if r_den else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        scores[label] = {"precision": precision, "recall": recall, "f1": f1, "support": r_den}
    return scores


def macro_f1(scores: Dict[str, Dict[str, float]]) -> float:
    return sum(s["f1"] for s in scores.values()) / len(scores) if scores else 0.0


def accuracy(pairs: List[Tuple[str, str]]) -> float:
    return sum(t == p for t, p in pairs) / len(pairs) if pairs else 0.0


def coverage(predictions: List[str]) -> float:
    """Share of emails the classifier answered instead of abstaining (Needs Review / Unknown)."""
    return sum(p not in ABSTAIN_LABELS for p in predictions) / len(predictions) if predictions else 0.0


def normalise_role(role: str) -> str:
    role = (role or "").lower()
    role = re.sub(r"\binternship\b", "intern", role)
    return re.sub(r"[^a-z0-9]", "", role)


def role_matches(true_role: str, predicted_role: str) -> bool:
    """Lenient match: equal after normalising, or one contains the other."""
    t, p = normalise_role(true_role), normalise_role(predicted_role)
    return bool(t) and bool(p) and (t == p or t in p or p in t)
