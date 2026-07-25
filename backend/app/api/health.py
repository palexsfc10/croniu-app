from __future__ import annotations

from fastapi import APIRouter

from app.db import check_database

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str | bool]:
    db_ok = False
    try:
        db_ok = check_database()
    except Exception:
        db_ok = False
    status_value = "ok" if db_ok else "degraded"
    return {"status": status_value, "database": db_ok}
