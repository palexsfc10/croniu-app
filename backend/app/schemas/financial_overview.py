from __future__ import annotations

from pydantic import BaseModel


class FinancialSummaryOut(BaseModel):
    received_month_cents: int
    forecast_month_cents: int
    overdue_cents: int
    overdue_count: int
    pending_count: int


class MonthlyReceivedOut(BaseModel):
    month: str
    received_cents: int


class FinancialOverviewOut(BaseModel):
    summary: FinancialSummaryOut
    monthly_trend: list[MonthlyReceivedOut]
