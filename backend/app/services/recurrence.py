"""Human recurrence rules stored in RecurringClientTask.filter_json (no extra migration)."""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

WEEKDAY_LABELS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
NTH_LABELS = {1: "primeira", 2: "segunda", 3: "terceira", 4: "quarta", -1: "última"}

VALID_RECURRENCE = {
    "weekly",
    "biweekly",
    "monthly",
    "bimonthly",
    "quarterly",
    "interval",
    "once",
    "every_n_months",
}


def _spec(row_or_filter: Any) -> dict[str, Any]:
    if isinstance(row_or_filter, dict):
        return dict(row_or_filter or {})
    extra = getattr(row_or_filter, "filter_json", None) or {}
    return dict(extra)


def _weekdays(spec: dict[str, Any], fallback: int | None) -> list[int]:
    raw = spec.get("weekdays")
    if isinstance(raw, list) and raw:
        return [int(x) for x in raw if 0 <= int(x) <= 6]
    if fallback is not None:
        return [int(fallback)]
    return [0]


def _add_months(day: date, months: int, keep_day: int | None = None) -> date:
    target_day = keep_day if keep_day is not None else day.day
    month_index = day.year * 12 + (day.month - 1) + months
    year, month0 = divmod(month_index, 12)
    month = month0 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(target_day, last))


def nth_weekday(year: int, month: int, weekday: int, nth: int) -> date:
    """weekday: 0=Mon … 6=Sun. nth: 1–4 or -1 (last)."""
    cal = calendar.Calendar(firstweekday=0)
    days = [d for d in cal.itermonthdates(year, month) if d.month == month and d.weekday() == weekday]
    if not days:
        raise ValueError("no weekday in month")
    if nth == -1:
        return days[-1]
    idx = nth - 1
    if idx < 0 or idx >= len(days):
        return days[-1]
    return days[idx]


def next_after(recurrence: str, spec: dict[str, Any], *, weekday: int | None, after: date) -> date | None:
    kind = recurrence or "weekly"
    starts = spec.get("starts_on")
    start = date.fromisoformat(starts) if starts else after
    ends = spec.get("ends_on") if not spec.get("no_end", True) else None
    end = date.fromisoformat(ends) if ends else None

    def clamp(day: date | None) -> date | None:
        if day is None:
            return None
        if end and day > end:
            return None
        return day

    if kind == "once":
        day = start if start >= after else None
        return clamp(day)

    if kind == "weekly":
        days = _weekdays(spec, weekday)
        cursor = after if after >= start else start
        for i in range(0, 14):
            candidate = cursor + timedelta(days=i)
            if candidate.weekday() in days and candidate >= after and candidate >= start:
                return clamp(candidate)
        return clamp(cursor + timedelta(days=7))

    if kind == "biweekly":
        days = _weekdays(spec, weekday)
        cursor = start
        while cursor < after:
            cursor += timedelta(days=14)
        for i in range(0, 14):
            candidate = cursor + timedelta(days=i)
            if candidate.weekday() in days:
                return clamp(candidate if candidate >= after else candidate + timedelta(days=14))
        return clamp(cursor)

    if kind in {"monthly", "bimonthly", "quarterly", "every_n_months"}:
        months = {"monthly": 1, "bimonthly": 2, "quarterly": 3}.get(kind) or int(spec.get("every_months") or 1)
        mode = spec.get("month_mode") or "dom"
        cursor_month = date(start.year, start.month, 1)
        after_month = date(after.year, after.month, 1)
        while cursor_month < after_month:
            cursor_month = _add_months(cursor_month, months, 1)
        for _ in range(0, 24):
            y, m = cursor_month.year, cursor_month.month
            if mode == "nth_weekday":
                candidate = nth_weekday(y, m, int(spec.get("nth_weekday", weekday or 1)), int(spec.get("nth", 1)))
            else:
                keep = int(spec.get("month_day") or start.day)
                candidate = date(y, m, min(keep, calendar.monthrange(y, m)[1]))
            if candidate >= after and candidate >= start:
                return clamp(candidate)
            cursor_month = _add_months(cursor_month, months, 1)
        return None

    if kind == "interval":
        n = max(1, int(spec.get("interval_n") or 1))
        unit = spec.get("interval_unit") or "weeks"
        cursor = start
        while cursor < after:
            if unit == "days":
                cursor += timedelta(days=n)
            elif unit == "months":
                cursor = _add_months(cursor, n)
            else:
                cursor += timedelta(weeks=n)
        return clamp(cursor)

    return clamp(after + timedelta(days=7))


def advance(recurrence: str, spec: dict[str, Any], *, weekday: int | None, from_day: date) -> date | None:
    return next_after(recurrence, spec, weekday=weekday, after=from_day + timedelta(days=1))


def preview_text(recurrence: str, spec: dict[str, Any], *, weekday: int | None, next_on: date | None) -> str:
    kind = recurrence or "weekly"
    start = spec.get("starts_on")
    start_label = ""
    if start:
        y, m, d = start.split("-")
        months = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."]
        start_label = f", a partir de {int(d)} {months[int(m) - 1]}"
    days = _weekdays(spec, weekday)
    day_names = " e ".join(WEEKDAY_LABELS[i] for i in days)
    if kind == "weekly":
        body = f"Toda semana, {day_names}{start_label}."
    elif kind == "biweekly":
        body = f"A cada 2 semanas, {day_names}{start_label}."
    elif kind == "once":
        body = f"Uma única vez{start_label or ''}."
    elif kind in {"monthly", "bimonthly", "quarterly", "every_n_months"}:
        months = {"monthly": "todo mês", "bimonthly": "a cada 2 meses", "quarterly": "a cada 3 meses"}.get(
            kind, f"a cada {spec.get('every_months') or 1} meses"
        )
        if spec.get("month_mode") == "nth_weekday":
            nth = NTH_LABELS.get(int(spec.get("nth") or 1), "primeira")
            wd = WEEKDAY_LABELS[int(spec.get("nth_weekday", weekday or 1))]
            body = f"Toda {nth} {wd} do mês ({months}){start_label}."
        else:
            body = f"Todo dia {spec.get('month_day') or 1} ({months}){start_label}."
    elif kind == "interval":
        n = spec.get("interval_n") or 1
        unit = {"days": "dias", "weeks": "semanas", "months": "meses"}.get(spec.get("interval_unit") or "weeks", "semanas")
        body = f"A cada {n} {unit}{start_label}."
    else:
        body = f"Recorrente{start_label}."
    if next_on:
        return f"{body} Próxima: {next_on.isoformat()}."
    return body
