from app.agent.providers.base import ToolSpec
from app.agent.providers.openai_responses import _tool_to_responses_schema


def test_strict_schema_empty_properties_has_required_array():
    spec = ToolSpec(
        name="get_today_summary",
        description="resumo",
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
    )
    out = _tool_to_responses_schema(spec)
    assert out["strict"] is True
    assert out["parameters"]["required"] == []
    assert out["parameters"]["additionalProperties"] is False


def test_strict_schema_optional_fields_become_nullable_and_required():
    spec = ToolSpec(
        name="list_upcoming_appointments",
        description="agenda",
        parameters={
            "type": "object",
            "properties": {
                "within_days": {"type": "integer", "minimum": 1, "maximum": 14},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
            "additionalProperties": False,
        },
    )
    out = _tool_to_responses_schema(spec)
    params = out["parameters"]
    assert set(params["required"]) == {"within_days", "limit"}
    assert params["properties"]["within_days"]["anyOf"][1] == {"type": "null"}
    assert params["properties"]["limit"]["anyOf"][1] == {"type": "null"}


def test_strict_schema_keeps_required_fields_non_null():
    spec = ToolSpec(
        name="get_cycle_details",
        description="ciclo",
        parameters={
            "type": "object",
            "properties": {"cycle_id": {"type": "string", "format": "uuid"}},
            "required": ["cycle_id"],
            "additionalProperties": False,
        },
    )
    out = _tool_to_responses_schema(spec)
    props = out["parameters"]["properties"]
    assert props["cycle_id"]["type"] == "string"
    assert "anyOf" not in props["cycle_id"]
