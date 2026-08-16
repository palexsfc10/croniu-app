"""Build human-readable question snapshots from schema + answers."""

from __future__ import annotations

from typing import Any


SECTION_TITLES: dict[str, str] = {
    "A": "Objetivos",
    "B": "Histórico de atividade",
    "C": "Rotina e disponibilidade",
    "D": "Saúde declarada",
    "E": "Lesões, dores e limitações",
    "F": "Medicamentos e restrições",
    "G": "Outras condições",
    "H": "Hábitos e recuperação",
    "I": "Preferências",
    "J": "Consentimentos",
}


def _flatten_questions(schema: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not schema:
        return []
    out: list[dict[str, Any]] = []
    for section in schema.get("sections") or []:
        section_id = section.get("id") or section.get("key") or ""
        section_title = (
            section.get("title")
            or SECTION_TITLES.get(str(section_id), str(section_id) or "Geral")
        )
        for order, q in enumerate(section.get("questions") or []):
            item = dict(q)
            item["_section_id"] = section_id
            item["_section_title"] = section_title
            item["_order"] = order
            out.append(item)
    return out


def _format_answer(raw: Any, question: dict[str, Any]) -> tuple[Any, str | None]:
    """Return (normalized_answer, human_label). Never return only the question key."""
    if raw is None:
        return None, None
    options = {o.get("value"): o.get("label") for o in (question.get("options") or []) if o.get("value")}
    complement = None
    value = raw
    if isinstance(raw, dict):
        value = raw.get("value", raw.get("answer", raw))
        complement = raw.get("complement") or raw.get("detail") or raw.get("other")
    if isinstance(value, list):
        labels = [str(options.get(v, v)) for v in value]
        label = ", ".join(labels) if labels else None
        return value, label
    if value is None or value == "":
        return None, None
    label = options.get(value) if not isinstance(value, (dict, list)) else None
    if label is None:
        label = str(value)
    if complement:
        label = f"{label} — {complement}"
    return value, label


def build_questions_snapshot(
    *,
    answers: dict[str, Any],
    schema: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    questions = _flatten_questions(schema)
    by_id = {q.get("id"): q for q in questions if q.get("id")}
    snapshot: list[dict[str, Any]] = []
    # Preserve schema order first
    seen: set[str] = set()
    for q in questions:
        qid = q.get("id")
        if not qid:
            continue
        seen.add(str(qid))
        raw = answers.get(str(qid))
        answer, answer_label = _format_answer(raw, q)
        snapshot.append(
            {
                "id": str(qid),
                "label": q.get("label") or str(qid),
                "section": q.get("_section_id") or q.get("section"),
                "section_title": q.get("_section_title")
                or SECTION_TITLES.get(str(q.get("section") or ""), "Geral"),
                "type": q.get("type") or "text",
                "order": q.get("_order", 0),
                "answer": answer,
                "answer_label": answer_label,
                "attention": bool(q.get("attention")),
                "sensitive": bool(q.get("sensitive")),
                "help_text": q.get("help_text"),
            }
        )
    # Include orphan answers with schema reconstruction fallback (never expose key as title if we can avoid)
    for qid, raw in answers.items():
        if qid in seen:
            continue
        meta = by_id.get(qid) or {"id": qid, "label": qid, "type": "text"}
        answer, answer_label = _format_answer(raw, meta)
        # Prefer never showing technical key — if label equals key, use generic
        label = meta.get("label") or "Resposta"
        if label == qid:
            label = "Resposta adicional"
        snapshot.append(
            {
                "id": str(qid),
                "label": label,
                "section": meta.get("section") or "X",
                "section_title": "Outras respostas",
                "type": meta.get("type") or "text",
                "order": 999,
                "answer": answer,
                "answer_label": answer_label,
                "attention": bool(meta.get("attention")),
                "sensitive": bool(meta.get("sensitive")),
                "help_text": meta.get("help_text"),
            }
        )
    return snapshot


def summarize_snapshot(snapshot: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {q["id"]: q for q in snapshot}

    def _pick(*ids: str) -> str | None:
        for qid in ids:
            item = by_id.get(qid)
            if item and item.get("answer_label"):
                return str(item["answer_label"])
        return None

    attention_items = [
        q for q in snapshot if q.get("attention") and _is_attention_answer(q.get("answer"))
    ]
    return {
        "primary_goal": _pick("a_primary_goal"),
        "modalities": _pick("b_modalities"),
        "availability": _pick("c_available_days", "c_available_times"),
        "experience": _pick("a_prior_experience", "b_activity_level"),
        "attention_count": len(attention_items),
        "attention_labels": [q.get("label") for q in attention_items[:8]],
    }


def _is_attention_answer(answer: Any) -> bool:
    if answer is None:
        return False
    if isinstance(answer, list):
        return any(_is_attention_answer(a) for a in answer)
    value = str(answer).strip().lower()
    return value in {"sim", "yes", "prefiro_detalhar", "prefer_detail"}
