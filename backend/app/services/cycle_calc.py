"""Exact lesson date enumeration and financial composition for cycles."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta

DURATION_CALENDAR_MONTHS = "calendar_months"
DURATION_FIXED_DAYS = "fixed_days"


def add_calendar_months(starts_on: date, months: int) -> date:
    """Return exclusive renewal date = start + N calendar months (day clamped)."""
    if months < 1:
        raise ValueError("duration_value must be >= 1")
    year = starts_on.year + (starts_on.month - 1 + months) // 12
    month = (starts_on.month - 1 + months) % 12 + 1
    day = min(starts_on.day, monthrange(year, month)[1])
    return date(year, month, day)


def add_fixed_days(starts_on: date, days: int) -> date:
    """Return exclusive renewal date = start + N days."""
    if days < 1:
        raise ValueError("duration_value must be >= 1")
    return starts_on + timedelta(days=days)


def compute_renewal_on(
    *,
    starts_on: date,
    duration_type: str,
    duration_value: int,
) -> date:
    if duration_type == DURATION_CALENDAR_MONTHS:
        return add_calendar_months(starts_on, duration_value)
    if duration_type == DURATION_FIXED_DAYS:
        return add_fixed_days(starts_on, duration_value)
    raise ValueError(f"Unsupported duration_type: {duration_type}")


def enumerate_lesson_dates(
    *,
    starts_on: date,
    ends_on: date,
    weekdays: list[int],
) -> list[date]:
    """Inclusive start, exclusive end; weekdays use Python Monday=0 … Sunday=6."""
    if ends_on <= starts_on:
        return []
    allowed = sorted({int(d) for d in weekdays})
    if not allowed:
        return []
    if any(d < 0 or d > 6 for d in allowed):
        raise ValueError("weekdays must be integers 0–6 (Mon–Sun)")

    dates: list[date] = []
    current = starts_on
    while current < ends_on:
        if current.weekday() in allowed:
            dates.append(current)
        current += timedelta(days=1)
    return dates


@dataclass(frozen=True)
class FinancialComposition:
    lesson_count: int
    unit_price_cents: int
    subtotal_cents: int
    adjustment_cents: int
    final_cents: int


def compose_financial(
    *,
    lesson_count: int,
    unit_price_cents: int,
    adjustment_cents: int | None = None,
    final_cents: int | None = None,
) -> FinancialComposition:
    if lesson_count < 0:
        raise ValueError("lesson_count must be >= 0")
    if unit_price_cents < 0:
        raise ValueError("unit_price_cents must be >= 0")

    subtotal = lesson_count * unit_price_cents

    if final_cents is not None:
        if final_cents < 0:
            raise ValueError("final_cents must be >= 0")
        adjustment = final_cents - subtotal
        return FinancialComposition(
            lesson_count=lesson_count,
            unit_price_cents=unit_price_cents,
            subtotal_cents=subtotal,
            adjustment_cents=adjustment,
            final_cents=final_cents,
        )

    adjustment = adjustment_cents or 0
    final = subtotal + adjustment
    if final < 0:
        raise ValueError("final amount cannot be negative")
    return FinancialComposition(
        lesson_count=lesson_count,
        unit_price_cents=unit_price_cents,
        subtotal_cents=subtotal,
        adjustment_cents=adjustment,
        final_cents=final,
    )
