"""ICON_MANIFEST_v3.json must be OS-reproducible (repo-relative paths only)."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "apps/web/public/icons/ICON_MANIFEST_v3.json"

ABSOLUTE_MARKERS = re.compile(
    r"(^|[\"'\s])([A-Za-z]:[\\/]|/home/|/Users/|\\\\)",
    re.MULTILINE,
)


def test_icon_manifest_has_no_absolute_machine_paths():
    raw = MANIFEST.read_text(encoding="utf-8")
    assert ABSOLUTE_MARKERS.search(raw) is None
    assert "C:/" not in raw
    assert "C:\\" not in raw
    body = json.loads(raw)
    assert body["source"] == "assets/brand/croniu-c-official.png"
    assert not Path(body["source"]).is_absolute()
    for entry in body["derivatives"].values():
        rel = entry["path"]
        assert not Path(rel).is_absolute()
        assert "\\" not in rel
        assert (ROOT / rel).is_file()
        assert len(entry["sha256"]) == 64
        assert entry["bytes"] == (ROOT / rel).stat().st_size
