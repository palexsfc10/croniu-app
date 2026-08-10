from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
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


@router.get("/health/live")
def liveness() -> dict[str, str]:
    """Report that the API process can serve requests."""
    return {"status": "ok"}


@router.get("/health/ready")
def readiness() -> dict[str, str | bool]:
    """Report readiness only after the database is reachable."""
    try:
        db_ok = check_database()
    except Exception:
        db_ok = False
    if not db_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "unavailable", "database": False},
        )
    return {"status": "ok", "database": True}


@router.get("/version")
def version() -> dict[str, str]:
    """Expose non-sensitive build metadata for operational diagnostics."""
    settings = get_settings()
    return {
        "environment": settings.croniu_env,
        "version": settings.app_version,
        "git_sha": settings.git_sha,
        "build_time": settings.build_time,
        "status": "ok",
    }
