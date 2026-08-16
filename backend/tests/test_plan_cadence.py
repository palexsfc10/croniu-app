from datetime import date

from app.services.plan_cadence import operational_date, plan_milestones, weekday_on_or_before
from app.services.status_labels import journey_stage_label, next_action_label, protocol_status_label


def test_sixteen_week_plan_reviews_not_duplicated_on_ending():
    start = date(2026, 8, 18)
    items = plan_milestones(
        starts_on=start,
        duration_value=16,
        duration_unit="weeks",
        review_interval_days=28,
        feedback_interval_days=15,
    )
    reviews = [m for m in items if m.kind == "plan_review"]
    endings = [m for m in items if m.kind == "plan_ending"]
    feedbacks = [m for m in items if m.kind == "feedback_due"]
    assert [m.due_on for m in reviews] == [
        date(2026, 9, 15),
        date(2026, 10, 13),
        date(2026, 11, 10),
    ]
    assert len(endings) == 1
    assert endings[0].due_on == date(2026, 12, 8)
    assert all(m.due_on != endings[0].due_on for m in reviews)
    assert feedbacks[0].due_on == date(2026, 9, 2)
    assert all(m.due_on <= endings[0].due_on for m in feedbacks)


def test_custom_and_no_duration():
    start = date(2026, 1, 1)
    none = plan_milestones(starts_on=start, review_interval_days=28)
    assert not any(m.kind == "plan_ending" for m in none)
    assert len([m for m in none if m.kind == "plan_review"]) >= 1
    custom = plan_milestones(
        starts_on=start,
        duration_value=20,
        duration_unit="weeks",
        review_interval_days=42,
    )
    reviews = [m for m in custom if m.kind == "plan_review"]
    assert len(reviews) == 3
    weekly_fb = plan_milestones(
        starts_on=start,
        duration_value=4,
        duration_unit="weeks",
        feedback_interval_days=7,
    )
    assert len([m for m in weekly_fb if m.kind == "feedback_due"]) == 4


def test_operational_tuesday_for_friday_due():
    due = date(2026, 9, 18)  # Friday
    today = date(2026, 9, 10)
    op = operational_date(due_on=due, preferred_weekday=1, today=today, lead_days=6)
    assert op.weekday() == 1
    assert op == date(2026, 9, 15)
    overdue = operational_date(
        due_on=date(2026, 9, 1), preferred_weekday=1, today=today, lead_days=6
    )
    assert overdue == today


def test_weekday_on_or_before():
    assert weekday_on_or_before(date(2026, 9, 18), 1) == date(2026, 9, 15)


def test_status_labels_never_echo_raw_codes():
    assert journey_stage_label("continue_onboarding") == "Em acompanhamento"
    assert journey_stage_label("active") == "Em acompanhamento"
    assert journey_stage_label("ready_to_start") == "Pronto para iniciar"
    assert next_action_label("continue_onboarding") == "Preparar acompanhamento"
    assert next_action_label("draft") == "Próximo passo"
    assert protocol_status_label("draft") == "Rascunho"
    assert protocol_status_label("published") == "Publicado"
    assert "continue_onboarding" not in journey_stage_label("continue_onboarding")
