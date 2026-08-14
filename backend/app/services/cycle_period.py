"""Canonical exclusive vigency for client cycles: [starts_on, ends_on)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Protocol

OPERATIONAL_STATUSES = frozenset({"active", "paused"})


class CycleLike(Protocol):
    status: str
    starts_on: date
    ends_on: date


def last_inclusive_on(ends_on: date) -> date:
    """Last calendar day with vigency (civil day before exclusive ends_on)."""
    return ends_on - timedelta(days=1)


def is_current(*, starts_on: date, ends_on: date, today: date) -> bool:
    return starts_on <= today < ends_on


def is_upcoming(*, starts_on: date, today: date) -> bool:
    return starts_on > today


def is_elapsed(*, ends_on: date, today: date) -> bool:
    return ends_on <= today


def pick_operational_cycle(rows: list, today: date):
    """Current exclusive window, else earliest upcoming. Never both."""
    operational = [c for c in rows if c.status in OPERATIONAL_STATUSES]
    current = [
        c
        for c in operational
        if is_current(starts_on=c.starts_on, ends_on=c.ends_on, today=today)
    ]
    if current:
        return sorted(current, key=lambda c: c.starts_on)[0]
    upcoming = [c for c in operational if is_upcoming(starts_on=c.starts_on, today=today)]
    if upcoming:
        return sorted(upcoming, key=lambda c: c.starts_on)[0]
    return None
