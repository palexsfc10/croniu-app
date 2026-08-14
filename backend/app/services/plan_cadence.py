"""Deterministic plan milestones: reviews, ending, feedbacks.

Commercial cycles are never derived here.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

DURATION_UNITS = {"days", "weeks", "months"}
WEEKDAY_NAMES_PT = (
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
)


def add_duration(start: date, value: int, unit: str) -> date:
    if value <= 0:
        raise ValueError("duration_value must be > 0")
    if unit == "days":
        return start + timedelta(days=value)
    if unit == "weeks":
        return start + timedelta(weeks=value)
    if unit == "months":
        month_index = start.month - 1 + value
        year = start.year + month_index // 12
        month = month_index % 12 + 1
        day = min(start.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)
    raise ValueError("duration_unit inválida")


def compute_ends_on(
    *,
    starts_on: date,
    duration_value: int | None,
    duration_unit: str | None,
    ends_on: date | None,
) -> date | None:
    if ends_on is not None:
        return ends_on
    if duration_value and duration_unit:
        return add_duration(starts_on, duration_value, duration_unit)
    return None


@dataclass(frozen=True)
class Milestone:
    kind: str  # plan_review | plan_ending | feedback_due
    due_on: date
    index: int


def review_dates(
    *,
    starts_on: date,
    ends_on: date | None,
    interval_days: int | None,
) -> list[date]:
    if not interval_days or interval_days <= 0:
        return []
    dates: list[date] = []
    n = 1
    while True:
        due = starts_on + timedelta(days=interval_days * n)
        if ends_on is not None and due >= ends_on:
            break
        if ends_on is None and n > 24:
            break
        dates.append(due)
        n += 1
        if n > 200:
            break
    return dates


def feedback_dates(
    *,
    starts_on: date,
    ends_on: date | None,
    interval_days: int | None,
) -> list[date]:
    if not interval_days or interval_days <= 0:
        return []
    dates: list[date] = []
    n = 1
    while True:
        due = starts_on + timedelta(days=interval_days * n)
        if ends_on is not None and due > ends_on:
            break
        if ends_on is None and n > 24:
            break
        dates.append(due)
        n += 1
        if n > 400:
            break
    return dates


def plan_milestones(
    *,
    starts_on: date,
    duration_value: int | None = None,
    duration_unit: str | None = None,
    ends_on: date | None = None,
    review_interval_days: int | None = None,
    feedback_interval_days: int | None = None,
) -> list[Milestone]:
    end = compute_ends_on(
        starts_on=starts_on,
        duration_value=duration_value,
        duration_unit=duration_unit,
        ends_on=ends_on,
    )
    items: list[Milestone] = []
    for i, due in enumerate(
        review_dates(starts_on=starts_on, ends_on=end, interval_days=review_interval_days),
        start=1,
    ):
        items.append(Milestone(kind="plan_review", due_on=due, index=i))
    for i, due in enumerate(
        feedback_dates(starts_on=starts_on, ends_on=end, interval_days=feedback_interval_days),
        start=1,
    ):
        items.append(Milestone(kind="feedback_due", due_on=due, index=i))
    if end is not None:
        items.append(Milestone(kind="plan_ending", due_on=end, index=1))
    items.sort(key=lambda m: (m.due_on, m.kind, m.index))
    return items


def weekday_on_or_before(day: date, weekday: int) -> date:
    delta = (day.weekday() - weekday) % 7
    return day - timedelta(days=delta)


def operational_date(
    *,
    due_on: date,
    preferred_weekday: int | None,
    today: date,
    lead_days: int = 6,
) -> date:
    """Map technical due date onto the professional's operational weekday.

    Never mutates due_on. Overdue items surface immediately (today).
    """
    if preferred_weekday is None:
        return due_on if due_on >= today else today
    if due_on < today:
        return today
    op = weekday_on_or_before(due_on, preferred_weekday)
    window_start = due_on - timedelta(days=max(lead_days, 0))
    if op < window_start:
        op = weekday_on_or_before(due_on + timedelta(days=7), preferred_weekday)
        if op > due_on:
            op = weekday_on_or_before(due_on, preferred_weekday)
    if op < today <= due_on:
        return today
    return op


def weekday_label(weekday: int | None) -> str | None:
    if weekday is None or weekday < 0 or weekday > 6:
        return None
    return WEEKDAY_NAMES_PT[weekday]
