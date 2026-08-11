"""HML smoke: prepare schedule → conflict → create 8 appts → idempotent."""
from __future__ import annotations

import os
import uuid
from datetime import date

from app.agent import cycle_prepare as prep
from app.agent.tools import ToolContext, execute_create_cycle, get_tool
from app.db import SessionLocal


def main() -> None:
    org = uuid.UUID(os.environ["CA_ORG"])
    user = uuid.UUID(os.environ["CA_USER"])
    cid = uuid.UUID(os.environ["CA_CID"])
    sid = uuid.UUID(os.environ["CA_SID"])
    tid = uuid.UUID(os.environ["CA_TID"])
    db = SessionLocal()
    try:
        r1 = prep.prepare_cycle_proposal(
            db,
            organization_id=org,
            client_id=cid,
            service_id=sid,
            starts_on=date(2026, 8, 7),
            weekly_frequency=2,
            today=date(2026, 8, 7),
        )
        assert r1.status == "need_input", r1
        assert "weekdays" in r1.payload["missing"], r1.payload
        print("ASK_SCHEDULE_OK", r1.payload["message"][:120])

        r2 = prep.prepare_cycle_proposal(
            db,
            organization_id=org,
            client_id=cid,
            service_id=sid,
            starts_on=date(2026, 8, 7),
            weekly_frequency=2,
            weekdays=[1, 3],
            today=date(2026, 8, 7),
        )
        assert r2.status == "need_input" and "starts_time" in r2.payload["missing"], r2.payload
        print("ASK_TIME_OK", r2.payload["message"][:120])

        r3 = prep.prepare_cycle_proposal(
            db,
            organization_id=org,
            client_id=cid,
            service_id=sid,
            starts_on=date(2026, 8, 7),
            weekly_frequency=2,
            weekdays=[1, 3],
            starts_time="19:00",
            today=date(2026, 8, 7),
        )
        assert r3.status == "schedule_conflict", r3
        assert r3.payload.get("suggestions"), r3.payload
        print("CONFLICT_OK", r3.payload["message"][:160])
        print("SUGGESTIONS", r3.payload["suggestions"][:3])

        alt = r3.payload["suggestions"][0].split("–")[0]
        r4 = prep.prepare_cycle_proposal(
            db,
            organization_id=org,
            client_id=cid,
            service_id=sid,
            starts_on=date(2026, 8, 7),
            weekly_frequency=2,
            weekdays=[1, 3],
            starts_time=alt,
            today=date(2026, 8, 7),
        )
        assert r4.status == "ready", r4
        draft = r4.payload["draft"]
        assert draft["creates_appointments"] is True
        assert draft["lesson_count"] == 8
        assert "Sem compromissos" not in draft["summary_lines"]["Agenda"]
        assert len(draft["occurrence_dates"]) == 8
        print("READY_OK", draft["summary_lines"]["Agenda"], draft["schedule_lines"])

        skip = {
            "client_name",
            "service_name",
            "template_name",
            "summary_lines",
            "planned_sessions",
        }
        args = {k: draft[k] for k in draft if k not in skip}
        args["cycle_template_id"] = str(tid)
        args["generate_appointments"] = True
        args["idempotency_key"] = f"smoke-ca-{os.environ['CA_CID'][:8]}"

        ctx = ToolContext(organization_id=org, user_id=user, db=db, today=date(2026, 8, 7))
        propose = get_tool("propose_create_cycle").handler(ctx, args)
        assert propose["needs_confirmation"] is True, propose
        assert "compromissos serão criados" in propose["summary_fields"]["Agenda"]
        print("PROPOSE_OK", propose["summary"])

        out = execute_create_cycle(ctx, propose["arguments"])
        assert out["creates_appointments"] is True
        assert out["appointment_count"] == 8
        print("CREATE_OK", out["id"], "appts", out["appointment_count"])

        out2 = execute_create_cycle(ctx, propose["arguments"])
        assert out2["id"] == out["id"]
        assert out2["appointment_count"] == 8
        print("IDEMPOTENT_OK", out2["id"])
        print("FIRST_OCC", draft["occurrence_dates"][0])
    finally:
        db.close()
    print("SMOKE_CYCLE_AGENDA_DONE")


if __name__ == "__main__":
    main()
