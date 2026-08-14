"""Profession nomenclature and multi-link / snapshot helpers."""

from __future__ import annotations

from app.services import anamnesis_snapshot as snap_svc
from app.services import profession as profession_svc


def test_nomenclature_personal_vs_consultant():
    personal = profession_svc.nomenclature_for("personal_trainer")
    consultant = profession_svc.nomenclature_for("consultant")
    generic = profession_svc.nomenclature_for(None)
    assert personal["client"] == "aluno"
    assert personal["plan"] == "plano de acompanhamento"
    assert consultant["plan"] == "plano de ação"
    assert generic["client"] == "cliente"


def test_recommended_form_kind():
    assert profession_svc.recommended_form_kind("sports_teacher") == "sports_questionnaire"
    assert (
        profession_svc.recommended_form_kind("sports_teacher", "musculacao")
        == "physical_anamnesis"
    )
    assert profession_svc.recommended_form_kind("personal_trainer") == "physical_anamnesis"
    assert profession_svc.recommended_form_kind("private_tutor") == "class_questionnaire"
    assert profession_svc.recommended_form_kind("consultant") == "consulting_brief"
    assert profession_svc.recommended_form_kind(None) == "simple_registration"


def test_validate_other_requires_description():
    try:
        profession_svc.validate_profession_payload(profession_code="other")
        assert False, "expected error"
    except ValueError:
        pass
    cleaned = profession_svc.validate_profession_payload(
        profession_code="other", profession_other="Educador físico"
    )
    assert cleaned["profession_other"] == "Educador físico"


def test_questions_snapshot_uses_labels_not_keys():
    schema = {
        "sections": [
            {
                "id": "H",
                "title": "Hábitos",
                "questions": [
                    {
                        "id": "h_alcohol",
                        "label": "Consome álcool?",
                        "type": "single",
                        "options": [
                            {"value": "nao", "label": "Não"},
                            {"value": "sim", "label": "Sim"},
                        ],
                        "attention": False,
                    }
                ],
            }
        ]
    }
    snapshot = snap_svc.build_questions_snapshot(
        answers={"h_alcohol": "sim"}, schema=schema
    )
    assert snapshot[0]["label"] == "Consome álcool?"
    assert snapshot[0]["answer_label"] == "Sim"
    assert "h_alcohol" != snapshot[0]["label"]
