"""Pure calculation tests for the smart-availability slot engine.

Numbered comments map to the 30 scenarios required by the sprint spec
(docs/sprints/SPRINT_SMART_AVAILABILITY.md §Testes). DB-backed scenarios
(tenant isolation, appointment status filtering, settings persistence,
range-limit/validation via the API) live in test_availability_api.py.
"""

from __future__ import annotations

from datetime import UTC, date, time, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.services import availability as av
from app.services.cycle_schedule import local_dt

TZ = ZoneInfo("America/Sao_Paulo")
DAY = date(2026, 8, 25)  # a Tuesday, far in the future — no clock freezing needed


def _journey(**overrides):
    defaults = dict(
        weekday=DAY.weekday(),
        is_active=True,
        starts_time=time(8, 0),
        ends_time=time(18, 0),
        break_starts_time=time(12, 0),
        break_ends_time=time(13, 0),
        default_duration_minutes=60,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _busy(start: time, end: time, *, day: date = DAY) -> av.BusyInterval:
    return av.BusyInterval(starts_at=local_dt(day, start, TZ), ends_at=local_dt(day, end, TZ))


def _labels(slots: list[av.Slot]) -> list[str]:
    return [s.starts_at.astimezone(TZ).strftime("%H:%M") for s in slots]


def _now(hour: int = 0, minute: int = 0, *, day: date = DAY):
    return local_dt(day, time(hour, minute), TZ).astimezone(UTC)


# 1. Dia inteiro livre dentro da jornada
def test_full_day_free_within_journey():
    journey = _journey(break_starts_time=None, break_ends_time=None)
    slots = av.compute_free_slots(
        day=DAY, journey=journey, busy=[], tz=TZ, duration_minutes=60, now_utc=_now(0)
    )
    assert _labels(slots) == [
        "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
    ]


# 2. Compromisso no início da jornada
def test_appointment_at_journey_start_removed():
    slots = av.compute_free_slots(
        day=DAY,
        journey=_journey(),
        busy=[_busy(time(8, 0), time(9, 0))],
        tz=TZ,
        duration_minutes=60,
        now_utc=_now(0),
    )
    assert "08:00" not in _labels(slots)


# 3. Compromisso no final da jornada
def test_appointment_at_journey_end_removed():
    slots = av.compute_free_slots(
        day=DAY,
        journey=_journey(),
        busy=[_busy(time(17, 0), time(18, 0))],
        tz=TZ,
        duration_minutes=60,
        now_utc=_now(0),
    )
    assert "17:00" not in _labels(slots)


# 4 & 5. Compromisso no meio + múltiplos compromissos — replica o exemplo da spec (§8)
def test_worked_example_from_spec():
    slots = av.compute_free_slots(
        day=DAY,
        journey=_journey(),
        busy=[
            _busy(time(9, 0), time(10, 0)),
            _busy(time(10, 0), time(11, 0)),
            _busy(time(14, 0), time(15, 0)),
            _busy(time(16, 0), time(17, 0)),
        ],
        tz=TZ,
        duration_minutes=60,
        now_utc=_now(0),
    )
    assert _labels(slots) == ["08:00", "11:00", "13:00", "15:00", "17:00"]


# Dia totalmente ocupado: cada slot possível da jornada tem um compromisso ativo
def test_fully_booked_day_returns_no_slots():
    journey = _journey(break_starts_time=None, break_ends_time=None)
    busy = [_busy(time(h, 0), time(h + 1, 0)) for h in range(8, 18)]
    slots = av.compute_free_slots(
        day=DAY, journey=journey, busy=busy, tz=TZ, duration_minutes=60, now_utc=_now(0)
    )
    assert slots == []


# 6. Intervalo de almoço nunca aparece como livre
def test_lunch_break_excluded():
    slots = av.compute_free_slots(
        day=DAY, journey=_journey(), busy=[], tz=TZ, duration_minutes=60, now_utc=_now(0)
    )
    assert "12:00" not in _labels(slots)


# 7. Dia sem atendimento
def test_day_off_returns_no_slots():
    slots = av.compute_free_slots(
        day=DAY,
        journey=_journey(is_active=False),
        busy=[],
        tz=TZ,
        duration_minutes=60,
        now_utc=_now(0),
    )
    assert slots == []


# 8. Jornada não configurada
def test_unconfigured_journey_returns_no_slots():
    slots = av.compute_free_slots(
        day=DAY, journey=None, busy=[], tz=TZ, duration_minutes=60, now_utc=_now(0)
    )
    assert slots == []


# 9, 10, 11. Durações de 30/45/60 minutos
@pytest.mark.parametrize("duration,expected_count", [(30, 20), (45, 13), (60, 10)])
def test_durations(duration, expected_count):
    journey = _journey(break_starts_time=None, break_ends_time=None)
    slots = av.compute_free_slots(
        day=DAY, journey=journey, busy=[], tz=TZ, duration_minutes=duration, now_utc=_now(0)
    )
    assert len(slots) == expected_count


# 12. Duração de 90 minutos — documenta a limitação do passo == duração (§8 da spec)
def test_duration_90_minutes_step_equals_duration_limitation():
    journey = _journey(starts_time=time(8, 0), ends_time=time(12, 0), break_starts_time=None, break_ends_time=None)
    slots = av.compute_free_slots(
        day=DAY,
        journey=journey,
        busy=[_busy(time(9, 0), time(10, 0))],
        tz=TZ,
        duration_minutes=90,
        now_utc=_now(0),
    )
    # 08:00–09:30 conflita, 09:30–11:00 conflita, 11:00–12:30 ultrapassa o fim da jornada.
    # Com passo=30min existiriam alternativas (10:00–11:30); documentado como limitação do MVP.
    assert slots == []


# 13. Compromisso adjacente sem conflito
def test_adjacent_appointment_no_conflict():
    journey = _journey(break_starts_time=None, break_ends_time=None)
    slots = av.compute_free_slots(
        day=DAY,
        journey=journey,
        busy=[_busy(time(9, 0), time(10, 0))],
        tz=TZ,
        duration_minutes=60,
        now_utc=_now(0),
    )
    assert "10:00" in _labels(slots)
    assert "08:00" in _labels(slots)


# 14. Sobreposição parcial em ambos os lados
def test_partial_overlap_rejects_both_sides():
    journey = _journey(break_starts_time=None, break_ends_time=None)
    slots = av.compute_free_slots(
        day=DAY,
        journey=journey,
        busy=[_busy(time(9, 30), time(10, 30))],
        tz=TZ,
        duration_minutes=60,
        now_utc=_now(0),
    )
    labels = _labels(slots)
    assert "09:00" not in labels
    assert "10:00" not in labels


# 15. Compromisso que começa antes da jornada
def test_appointment_starting_before_journey():
    slots = av.compute_free_slots(
        day=DAY,
        journey=_journey(),
        busy=[_busy(time(7, 0), time(8, 30))],
        tz=TZ,
        duration_minutes=60,
        now_utc=_now(0),
    )
    assert "08:00" not in _labels(slots)


# 16. Compromisso que termina depois da jornada
def test_appointment_ending_after_journey():
    slots = av.compute_free_slots(
        day=DAY,
        journey=_journey(),
        busy=[_busy(time(17, 30), time(19, 0))],
        tz=TZ,
        duration_minutes=60,
        now_utc=_now(0),
    )
    assert "17:00" not in _labels(slots)


# 17. Horários passados no dia atual não são sugeridos
def test_past_slots_excluded_same_day():
    journey = _journey(break_starts_time=None, break_ends_time=None)
    slots = av.compute_free_slots(
        day=DAY, journey=journey, busy=[], tz=TZ, duration_minutes=60, now_utc=_now(10, 30)
    )
    labels = _labels(slots)
    assert "08:00" not in labels
    assert "09:00" not in labels
    assert "10:00" not in labels  # started at 10:00, already in the past relative to 10:30
    assert "11:00" in labels


# 18. Datas futuras não sofrem filtro de "agora"
def test_future_dates_unaffected_by_now():
    journey = _journey(break_starts_time=None, break_ends_time=None)
    far_past_now = local_dt(DAY - timedelta(days=30), time(0, 0), TZ).astimezone(UTC)
    slots = av.compute_free_slots(
        day=DAY, journey=journey, busy=[], tz=TZ, duration_minutes=60, now_utc=far_past_now
    )
    assert "08:00" in _labels(slots)


# 19. Timezone correto (fuso não-UTC, offset fixo -03:00 no Brasil pós-2019)
def test_timezone_offset_applied():
    journey = _journey(break_starts_time=None, break_ends_time=None)
    slots = av.compute_free_slots(
        day=DAY, journey=journey, busy=[], tz=TZ, duration_minutes=60, now_utc=_now(0)
    )
    first = slots[0]
    assert first.starts_at.utcoffset() == timedelta(hours=-3)
    assert first.starts_at.astimezone(UTC).hour == 11  # 08:00 -03:00 == 11:00 UTC


# 23. Intervalo insuficiente para a duração solicitada
def test_journey_too_short_for_duration():
    journey = _journey(
        starts_time=time(8, 0),
        ends_time=time(8, 45),
        break_starts_time=None,
        break_ends_time=None,
    )
    slots = av.compute_free_slots(
        day=DAY, journey=journey, busy=[], tz=TZ, duration_minutes=60, now_utc=_now(0)
    )
    assert slots == []


# 24. Ordenação dos slots
def test_slots_are_ordered_ascending():
    slots = av.compute_free_slots(
        day=DAY, journey=_journey(), busy=[], tz=TZ, duration_minutes=60, now_utc=_now(0)
    )
    starts = [s.starts_at for s in slots]
    assert starts == sorted(starts)


# 26. Ausência de slots duplicados
def test_no_duplicate_slots():
    slots = av.compute_free_slots(
        day=DAY, journey=_journey(), busy=[], tz=TZ, duration_minutes=60, now_utc=_now(0)
    )
    starts = [s.starts_at for s in slots]
    assert len(starts) == len(set(starts))


# 28. Passo de geração == duração (estratégia documentada)
def test_step_equals_duration():
    journey = _journey(break_starts_time=None, break_ends_time=None)
    slots = av.compute_free_slots(
        day=DAY, journey=journey, busy=[], tz=TZ, duration_minutes=45, now_utc=_now(0)
    )
    for a, b in zip(slots, slots[1:]):
        assert b.starts_at - a.starts_at == timedelta(minutes=45)


# 30. Jornada atravessando meia-noite é rejeitada na validação do schema (não suportada)
def test_overnight_journey_rejected_by_schema():
    from pydantic import ValidationError

    from app.schemas.availability import DayScheduleIn

    with pytest.raises(ValidationError):
        DayScheduleIn(
            weekday=0, is_active=True, starts_time=time(22, 0), ends_time=time(2, 0)
        )
