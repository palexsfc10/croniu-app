from __future__ import annotations

from datetime import date

from app.services.cycle_calc import (
    add_calendar_months,
    add_fixed_days,
    compose_financial,
    enumerate_lesson_dates,
)


def test_enumerate_aug_2026_tue_thu():
    # Spec example: 01/08/2026 → 01/09/2026 exclusive, Tue=1 Thu=3
    dates = enumerate_lesson_dates(
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 9, 1),
        weekdays=[1, 3],
    )
    assert dates == [
        date(2026, 8, 4),
        date(2026, 8, 6),
        date(2026, 8, 11),
        date(2026, 8, 13),
        date(2026, 8, 18),
        date(2026, 8, 20),
        date(2026, 8, 25),
        date(2026, 8, 27),
    ]
    money = compose_financial(lesson_count=len(dates), unit_price_cents=9000)
    assert money.subtotal_cents == 72000
    assert money.final_cents == 72000


def test_calendar_months_and_fixed_days_differ():
    start = date(2026, 8, 1)
    assert add_calendar_months(start, 1) == date(2026, 9, 1)
    assert add_fixed_days(start, 30) == date(2026, 8, 31)


def test_month_lengths_and_leap():
    assert add_calendar_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_calendar_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_calendar_months(date(2026, 8, 31), 1) == date(2026, 9, 30)
    feb = enumerate_lesson_dates(
        starts_on=date(2026, 2, 1),
        ends_on=add_calendar_months(date(2026, 2, 1), 1),
        weekdays=[0],  # Mondays
    )
    assert all(d.month == 2 for d in feb)
    assert len(feb) == 4  # 2,9,16,23


def test_year_boundary():
    dates = enumerate_lesson_dates(
        starts_on=date(2026, 12, 28),
        ends_on=date(2027, 1, 11),
        weekdays=[0, 2],
    )
    assert date(2026, 12, 28) in dates
    assert date(2026, 12, 30) in dates
    assert date(2027, 1, 4) in dates
    assert date(2027, 1, 6) in dates


def test_start_on_selected_weekday():
    dates = enumerate_lesson_dates(
        starts_on=date(2026, 8, 4),  # Tuesday
        ends_on=date(2026, 8, 11),
        weekdays=[1],
    )
    assert dates == [date(2026, 8, 4)]


def test_financial_discount_and_final_edit():
    base = compose_financial(lesson_count=9, unit_price_cents=9000, adjustment_cents=-6000)
    assert base.subtotal_cents == 81000
    assert base.final_cents == 75000
    edited = compose_financial(lesson_count=9, unit_price_cents=9000, final_cents=75000)
    assert edited.adjustment_cents == -6000
    assert edited.final_cents == 75000


def test_negative_final_rejected():
    import pytest

    with pytest.raises(ValueError):
        compose_financial(lesson_count=1, unit_price_cents=1000, adjustment_cents=-2000)
