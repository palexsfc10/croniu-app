"""Safety guards for HML application reset (no database required)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "reset_hml_application_data.py"


def _load():
    spec = importlib.util.spec_from_file_location("reset_hml_application_data", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_reset_script_aborts_outside_hml(monkeypatch):
    mod = _load()
    monkeypatch.setenv("CRONIU_ENV", "development")
    monkeypatch.setenv("RESET_HML_CONFIRM", "croniu-hml")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://croniu:x@localhost:5433/croniu")
    with pytest.raises(SystemExit) as exc:
        mod._guard_environment()
    assert exc.value.code == 2


def test_reset_script_aborts_without_confirm(monkeypatch):
    mod = _load()
    monkeypatch.setenv("CRONIU_ENV", "hml")
    monkeypatch.setenv("RESET_HML_CONFIRM", "yes")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://croniu:x@localhost:5433/croniu_hml")
    with pytest.raises(SystemExit) as exc:
        mod._guard_environment()
    assert exc.value.code == 2


def test_reset_script_aborts_prd_url(monkeypatch):
    mod = _load()
    monkeypatch.setenv("CRONIU_ENV", "hml")
    monkeypatch.setenv("RESET_HML_CONFIRM", "croniu-hml")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://croniu:x@prd-db:5432/croniu_prd")
    with pytest.raises(SystemExit) as exc:
        mod._guard_environment()
    assert exc.value.code == 2
