"""Financial overview — real receivables of the professional's own clients.

Never contabilidade/DRE/projeção de lucro: every number here is a direct sum
over real `Receivable` rows, using the org's local calendar. Never mixes in
Croniu's own subscription billing (`app.billing.*`) — that stays in
Conta/Assinatura and has no relationship to `Receivable` at all.

A R$0,00 (free-cycle) receivable is never billable: the three cycle-creation
paths no longer create one going forward, but existing zero-value rows from
before that fix must still never count here — every query below filters
`amount_cents > 0` on top of `status == "pending"`, matching the same rule
already applied in `domain.build_home_summary` and the AI's payment tools.

`paid_at` is stored as a UTC instant. "Recebido no mês" means the org's local
calendar month, so rows are converted with `astimezone(tz)` in Python before
comparing dates — same idiom as `agenda_svc.org_local_today` — rather than a
SQL-side `date()` cast, which would silently use UTC and misclassify a
payment recorded near local midnight.
"""

from __future__ import annotations

import calendar
import uuid
from dataclasses import dataclass
from datetime import date
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.receivable import Receivable


def _month_bounds(today: date) -> tuple[date, date]:
    last_day = calendar.monthrange(today.year, today.month)[1]
    return today.replace(day=1), today.replace(day=last_day)


def _shift_month(today: date, delta: int) -> date:
    month_index = today.month - 1 + delta
    year = today.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


@dataclass
class FinancialSummary:
    received_month_cents: int
    forecast_month_cents: int
    overdue_cents: int
    overdue_count: int
    pending_count: int


@dataclass
class MonthlyReceived:
    month: str  # "YYYY-MM"
    received_cents: int


@dataclass
class FinancialOverview:
    summary: FinancialSummary
    monthly_trend: list[MonthlyReceived]


def build_overview(
    db: Session,
    *,
    organization_id: uuid.UUID,
    tz: ZoneInfo,
    today: date,
    trend_months: int = 6,
) -> FinancialOverview:
    month_start, month_end = _month_bounds(today)
    trend_start = _shift_month(today, -(trend_months - 1))

    received_rows = db.scalars(
        select(Receivable).where(
            Receivable.organization_id == organization_id,
            Receivable.status == "received",
            Receivable.paid_at.is_not(None),
        )
    ).all()
    # Local date of each payment, computed once — reused for both the
    # current-month total and the monthly trend below.
    received_local: list[tuple[date, int]] = [
        (row.paid_at.astimezone(tz).date(), row.amount_cents)
        for row in received_rows
        if row.paid_at is not None
    ]

    received_month_cents = sum(
        amount for local_date, amount in received_local if month_start <= local_date <= month_end
    )

    pending_rows = db.scalars(
        select(Receivable).where(
            Receivable.organization_id == organization_id,
            Receivable.status == "pending",
            Receivable.amount_cents > 0,
        )
    ).all()
    forecast_month_cents = sum(
        row.amount_cents for row in pending_rows if month_start <= row.due_on <= month_end
    )
    overdue_rows = [row for row in pending_rows if row.due_on < today]

    trend: list[MonthlyReceived] = []
    for offset in range(trend_months):
        m_start = _shift_month(trend_start, offset)
        _, m_end = _month_bounds(m_start)
        total = sum(
            amount for local_date, amount in received_local if m_start <= local_date <= m_end
        )
        trend.append(MonthlyReceived(month=m_start.strftime("%Y-%m"), received_cents=total))

    return FinancialOverview(
        summary=FinancialSummary(
            received_month_cents=received_month_cents,
            forecast_month_cents=forecast_month_cents,
            overdue_cents=sum(row.amount_cents for row in overdue_rows),
            overdue_count=len(overdue_rows),
            pending_count=len(pending_rows),
        ),
        monthly_trend=trend,
    )
