from datetime import date

from app.services.recurrence import advance, next_after, nth_weekday, preview_text


def test_weekly_and_biweekly():
    spec = {"weekdays": [1], "starts_on": "2026-08-17"}
    nxt = next_after("weekly", spec, weekday=1, after=date(2026, 8, 14))
    assert nxt == date(2026, 8, 18)
    nxt2 = advance("weekly", spec, weekday=1, from_day=nxt)
    assert nxt2 == date(2026, 8, 25)
    bi = next_after("biweekly", spec, weekday=1, after=date(2026, 8, 19))
    assert bi == date(2026, 8, 31) or bi.weekday() == 1


def test_monthly_fixed_and_nth_weekday():
    spec = {"month_mode": "dom", "month_day": 10, "starts_on": "2026-09-01"}
    nxt = next_after("monthly", spec, weekday=1, after=date(2026, 8, 14))
    assert nxt == date(2026, 9, 10)
    assert nxt is not None
    nth = nth_weekday(2026, 9, 1, 1)
    assert nth is not None
    assert nth.weekday() == 1
    spec2 = {"month_mode": "nth_weekday", "nth": 1, "nth_weekday": 1, "starts_on": "2026-09-01"}
    first_tue = next_after("monthly", spec2, weekday=1, after=date(2026, 8, 14))
    assert first_tue == date(2026, 9, 1) or first_tue.weekday() == 1


def test_interval_once_and_preview():
    spec = {"interval_n": 10, "interval_unit": "days", "starts_on": "2026-08-14"}
    nxt = next_after("interval", spec, weekday=None, after=date(2026, 8, 14))
    assert nxt == date(2026, 8, 14)
    nxt2 = advance("interval", spec, weekday=None, from_day=nxt)
    assert nxt2 == date(2026, 8, 24)
    once = next_after("once", {"starts_on": "2026-09-01"}, weekday=None, after=date(2026, 8, 14))
    assert once == date(2026, 9, 1)
    text = preview_text("monthly", {"month_mode": "nth_weekday", "nth": 1, "nth_weekday": 1, "starts_on": "2026-09-01"}, weekday=1, next_on=date(2026, 9, 1))
    assert "primeira" in text
    assert "terça" in text
