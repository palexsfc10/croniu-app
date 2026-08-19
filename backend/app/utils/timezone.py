"""Organization-timezone display helpers.

No date-math (adding days, computing "end of day") happens against an org's
local timezone — that's computed in UTC to stay DST-proof. These helpers are
display-only: converting an already-computed UTC instant into a string the
platform admin can read in the organization's local time.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "America/Sao_Paulo"


def safe_zoneinfo(timezone_name: str | None) -> ZoneInfo:
    """Organization.timezone is a free string with no DB-level validation.

    Fall back to the platform default instead of letting a bad/legacy value
    (empty string, typo, retired IANA id) crash an admin request.
    """
    name = (timezone_name or "").strip() or DEFAULT_TIMEZONE
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TIMEZONE)


def format_in_timezone(value: datetime | None, timezone_name: str | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(safe_zoneinfo(timezone_name)).isoformat()
