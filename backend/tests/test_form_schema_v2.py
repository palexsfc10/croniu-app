from app.services.anamnesis_schema_v2 import build_schema_v2
from app.services.form_templates import build_class_questionnaire_schema, build_consulting_brief_schema


def _ids(schema: dict) -> set[str]:
    out: set[str] = set()
    for section in schema.get("sections") or []:
        for q in section.get("questions") or []:
            out.add(q["id"])
    return out


def test_v2_removes_equipment_and_commute_from_default():
    ids = _ids(build_schema_v2())
    assert "c_equipment" not in ids
    assert "c_commute" not in ids
    assert "b_weekly_frequency" in ids
    assert "c_available_days" in ids
    assert "c_available_periods" in ids


def test_v2_structured_types():
    by_id = {}
    for section in build_schema_v2()["sections"]:
        for q in section.get("questions") or []:
            by_id[q["id"]] = q
    assert by_id["b_weekly_frequency"]["type"] == "single_choice"
    assert by_id["b_time_inactive"]["type"] == "single_choice"
    assert by_id["c_available_days"]["type"] == "multi"
    assert by_id["e_prior_injury"]["type"] == "single_choice"
    assert by_id["e_prior_injury_detail"]["visible_if"]["question_id"] == "e_prior_injury"
    assert any("Ex.:" in (by_id["b_past_difficulties"].get("placeholder") or "") for _ in [0])


def test_class_and_consulting_have_no_workout_examples():
    class_schema = build_class_questionnaire_schema()
    consulting = build_consulting_brief_schema()
    blob = str(class_schema) + str(consulting)
    assert "peito" not in blob.lower()
    assert "bíceps" not in blob.lower() and "biceps" not in blob.lower()
    assert "musculação" not in blob.lower() and "musculacao" not in blob.lower()
