"""Exact lesson date enumeration and financial composition for cycles."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta

DURATION_CALENDAR_MONTHS = "calendar_months"
DURATION_FIXED_DAYS = "fixed_days"

PRICING_PER_LESSON = "per_lesson"
PRICING_FIXED_PERIOD = "fixed_period"
PRICING_MODES = (PRICING_PER_LESSON, PRICING_FIXED_PERIOD)


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
    pricing_mode: str
    unit_price_cents: int | None
    subtotal_cents: int
    adjustment_cents: int
    final_cents: int


def compose_financial(
    *,
    lesson_count: int,
    pricing_mode: str = PRICING_PER_LESSON,
    unit_price_cents: int | None = None,
    fixed_price_cents: int | None = None,
    adjustment_cents: int | None = None,
    final_cents: int | None = None,
) -> FinancialComposition:
    """Single source of truth for a cycle's money math — never duplicate this formula
    in the frontend or in the AI agent (AI-002 pattern).

    `per_lesson` (default, unchanged behavior): subtotal = lesson_count * unit_price_cents.
    `fixed_period`: subtotal = fixed_price_cents, independent of lesson_count — the number
    of lessons keeps existing for agenda/progress, but never multiplies the price.
    In both modes, `final_cents` (an explicit total) still wins when provided, and
    `adjustment_cents` is derived to reconcile it — same override mechanics as before.
    """
    if lesson_count < 0:
        raise ValueError("lesson_count must be >= 0")
    if pricing_mode not in PRICING_MODES:
        raise ValueError(f"Unsupported pricing_mode: {pricing_mode}")

    if pricing_mode == PRICING_FIXED_PERIOD:
        if fixed_price_cents is None or fixed_price_cents < 0:
            raise ValueError("fixed_price_cents must be >= 0 for fixed_period pricing")
        subtotal = fixed_price_cents
        resolved_unit_price: int | None = None
    else:
        if unit_price_cents is None or unit_price_cents < 0:
            raise ValueError("unit_price_cents must be >= 0 for per_lesson pricing")
        subtotal = lesson_count * unit_price_cents
        resolved_unit_price = unit_price_cents

    if final_cents is not None:
        if final_cents < 0:
            raise ValueError("final_cents must be >= 0")
        adjustment = final_cents - subtotal
        final = final_cents
    else:
        adjustment = adjustment_cents or 0
        final = subtotal + adjustment
        if final < 0:
            raise ValueError("final amount cannot be negative")

    return FinancialComposition(
        lesson_count=lesson_count,
        pricing_mode=pricing_mode,
        unit_price_cents=resolved_unit_price,
        subtotal_cents=subtotal,
        adjustment_cents=adjustment,
        final_cents=final,
    )
