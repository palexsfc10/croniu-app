"""Sanitize and normalize cycle propose/execute arguments."""

from __future__ import annotations

from datetime import date
from typing import Any

from app.agent import cycle_prepare as cycle_prep


def sanitize_cycle_propose_args(args: dict[str, Any]) -> dict[str, Any]:
    """Normalize prepare-draft keys so propose/execute accept the ready payload.

    Computes ``ends_on`` from duration when the draft omits an explicit end date,
    matching the assistant prepare → confirm contract used in HML.
    """
    raw = dict(args)
    if "generate_appointments" not in raw and raw.get("creates_appointments") is True:
        raw["generate_appointments"] = True
    if raw.get("value_cents") is None and raw.get("final_cents") is not None:
        raw["value_cents"] = raw["final_cents"]
    for key in (
        "creates_appointments",
        "final_cents",
        "planned_sessions",
        "client_name",
        "service_name",
        "template_name",
        "summary_lines",
    ):
        raw.pop(key, None)

    if raw.get("ends_on") is None and raw.get("starts_on") is not None:
        duration_type = raw.get("duration_type")
        duration_value = raw.get("duration_value")
        if duration_type and duration_value is not None:
            starts_raw = raw["starts_on"]
            starts_on = (
                starts_raw
                if isinstance(starts_raw, date)
                else date.fromisoformat(str(starts_raw)[:10])
            )
            raw["ends_on"] = cycle_prep.compute_ends_on(
                starts_on=starts_on,
                duration_type=str(duration_type),
                duration_value=int(duration_value),
            ).isoformat()
    return raw
