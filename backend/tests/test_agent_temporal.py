"""Deterministic temporal context for the Croniu assistant."""

from __future__ import annotations

from datetime import UTC, datetime

from app.agent.temporal import (
    build_temporal_context,
    format_human_datetime_range,
    resolve_org_timezone,
    resolve_relative_date_token,
)


def _freeze_sp(local_naive: str) -> datetime:
    """Parse 'YYYY-MM-DD HH:MM:SS' as America/Sao_Paulo and return UTC instant."""
    from zoneinfo import ZoneInfo

    local = datetime.fromisoformat(local_naive.replace(" ", "T")).replace(
        tzinfo=ZoneInfo("America/Sao_Paulo")
    )
    return local.astimezone(UTC)


def test_amanha_when_utc_already_next_day():
    # 2026-08-06 21:30 America/Sao_Paulo == 2026-08-07 00:30 UTC
    now = _freeze_sp("2026-08-06 21:30:00")
    ctx = build_temporal_context(org_timezone="America/Sao_Paulo", now=now)
    assert ctx.current_local_date.isoformat() == "2026-08-06"
    assert ctx.now_utc.date().isoformat() == "2026-08-07"
    assert resolve_relative_date_token("amanhã", ctx).isoformat() == "2026-08-07"
    assert resolve_relative_date_token("hoje", ctx).isoformat() == "2026-08-06"
    assert resolve_relative_date_token("depois de amanhã", ctx).isoformat() == "2026-08-08"


def test_month_and_year_rollover():
    now = _freeze_sp("2026-12-31 23:00:00")
    ctx = build_temporal_context(org_timezone="America/Sao_Paulo", now=now)
    assert resolve_relative_date_token("amanhã", ctx).isoformat() == "2027-01-01"


def test_leap_year_feb_29():
    now = _freeze_sp("2028-02-28 10:00:00")
    ctx = build_temporal_context(org_timezone="America/Sao_Paulo", now=now)
    assert resolve_relative_date_token("amanhã", ctx).isoformat() == "2028-02-29"


def test_weekday_resolution():
    # 2026-08-06 is Thursday
    now = _freeze_sp("2026-08-06 10:00:00")
    ctx = build_temporal_context(org_timezone="America/Sao_Paulo", now=now)
    assert resolve_relative_date_token("sexta-feira", ctx).isoformat() == "2026-08-07"
    assert resolve_relative_date_token("próxima sexta", ctx).isoformat() == "2026-08-07"
    assert resolve_relative_date_token("próxima segunda", ctx).isoformat() == "2026-08-10"


def test_invalid_timezone_falls_back_to_sao_paulo():
    assert resolve_org_timezone("Not/AZone") == "America/Sao_Paulo"
    assert resolve_org_timezone(None) == "America/Sao_Paulo"
    now = _freeze_sp("2026-08-06 21:30:00")
    ctx = build_temporal_context(org_timezone="Garbage/Zone", now=now)
    assert ctx.timezone == "America/Sao_Paulo"
    assert ctx.current_local_date.isoformat() == "2026-08-06"


def test_human_range_includes_weekday():
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("America/Sao_Paulo")
    start = datetime(2026, 8, 7, 8, 0, tzinfo=tz)
    end = datetime(2026, 8, 7, 9, 0, tzinfo=tz)
    label = format_human_datetime_range(start, end, timezone="America/Sao_Paulo")
    assert "sexta-feira" in label
    assert "7 de agosto" in label
    assert "08:00" in label
    assert "09:00" in label


def test_prompt_block_contains_authoritative_dates():
    from app.agent.prompts import get_system_prompt

    now = _freeze_sp("2026-08-06 21:30:00")
    ctx = build_temporal_context(org_timezone="America/Sao_Paulo", now=now)
    prompt = get_system_prompt(temporal=ctx)
    assert "2026-08-06" in prompt
    assert "2026-08-07" in prompt
    assert "Relógio autoritativo" in prompt
    assert "America/Sao_Paulo" in prompt
