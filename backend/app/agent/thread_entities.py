"""Structured conversation entity references (tenant-scoped, never trusted from client)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.agent import AgentMessage


def make_entity_ref(
    *,
    entity_type: str,
    entity_id: UUID | str,
    display_name: str,
    operation: str,
) -> dict[str, str]:
    return {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "display_name": display_name[:200],
        "operation": operation,
        "timestamp": datetime.now(UTC).isoformat(),
    }


def extract_entities_from_tool_result(
    *, tool_name: str, result: dict[str, Any]
) -> list[dict[str, str]]:
    """Derive safe entity refs from tool outputs (no PII beyond display names already returned)."""
    refs: list[dict[str, str]] = []
    if not isinstance(result, dict):
        return refs

    if tool_name == "propose_create_client" and result.get("needs_confirmation"):
        # Pending only — real id comes after confirm; still note proposed name
        fields = result.get("summary_fields") or {}
        name = fields.get("Cliente") or fields.get("client_name")
        if name:
            refs.append(
                make_entity_ref(
                    entity_type="client_proposed",
                    entity_id="pending",
                    display_name=str(name),
                    operation="propose",
                )
            )

    if tool_name in {"find_clients", "find_client", "resolve_client"}:
        clients = result.get("clients") or []
        if result.get("client"):
            clients = [result["client"]]
        for c in clients[:5]:
            if c.get("id") and c.get("full_name"):
                refs.append(
                    make_entity_ref(
                        entity_type="client",
                        entity_id=c["id"],
                        display_name=c["full_name"],
                        operation="lookup",
                    )
                )

    if tool_name in {"find_services", "get_service_defaults"}:
        for key in ("service", "services"):
            items = result.get(key)
            if isinstance(items, dict):
                items = [items]
            if not isinstance(items, list):
                continue
            for s in items[:5]:
                if s.get("id") and s.get("name"):
                    refs.append(
                        make_entity_ref(
                            entity_type="service",
                            entity_id=s["id"],
                            display_name=s["name"],
                            operation="lookup",
                        )
                    )
        tmpl = result.get("template")
        if isinstance(tmpl, dict) and tmpl.get("id") and tmpl.get("name"):
            refs.append(
                make_entity_ref(
                    entity_type="cycle_template",
                    entity_id=tmpl["id"],
                    display_name=tmpl["name"],
                    operation="lookup",
                )
            )

    if tool_name == "prepare_cycle_proposal":
        draft = result.get("draft") or {}
        if draft.get("client_id") and draft.get("client_name"):
            refs.append(
                make_entity_ref(
                    entity_type="client",
                    entity_id=draft["client_id"],
                    display_name=draft["client_name"],
                    operation="prepare_cycle",
                )
            )
        if draft.get("service_id") and draft.get("service_name"):
            refs.append(
                make_entity_ref(
                    entity_type="service",
                    entity_id=draft["service_id"],
                    display_name=draft["service_name"],
                    operation="prepare_cycle",
                )
            )

    if tool_name.startswith("propose_") and result.get("needs_confirmation"):
        args = result.get("arguments") or {}
        fields = result.get("summary_fields") or {}
        if args.get("client_id"):
            refs.append(
                make_entity_ref(
                    entity_type="client",
                    entity_id=args["client_id"],
                    display_name=str(
                        fields.get("Cliente") or fields.get("client_name") or "cliente"
                    ),
                    operation=tool_name,
                )
            )

    return refs


def collect_thread_entity_refs(
    db: Session, *, thread_id: UUID, organization_id: UUID, limit: int = 30
) -> list[dict[str, str]]:
    from sqlalchemy import select

    rows = list(
        db.scalars(
            select(AgentMessage)
            .where(
                AgentMessage.thread_id == thread_id,
                AgentMessage.organization_id == organization_id,
            )
            .order_by(AgentMessage.created_at.desc())
            .limit(limit)
        ).all()
    )
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, str]] = []
    for row in reversed(rows):
        meta = row.metadata_safe or {}
        for ref in meta.get("entities") or []:
            if not isinstance(ref, dict):
                continue
            key = (str(ref.get("entity_type")), str(ref.get("entity_id")))
            if key in seen or not ref.get("entity_id") or ref.get("entity_id") == "pending":
                continue
            seen.add(key)
            out.append(ref)
    return out[-12:]


def format_entities_prompt_block(refs: list[dict[str, str]]) -> str:
    if not refs:
        return ""
    lines = [
        "## Referências estruturadas recentes desta conversa",
        "Use estes IDs apenas após validar no tenant via tools. "
        "Pronomes como “ele/ela/nesse cliente” referem-se ao último client listado, "
        "salvo ambiguidade — nesse caso, peça esclarecimento.",
    ]
    for ref in refs:
        lines.append(
            f"- {ref.get('entity_type')}: {ref.get('display_name')} "
            f"(id={ref.get('entity_id')}, op={ref.get('operation')})"
        )
    return "\n".join(lines)
