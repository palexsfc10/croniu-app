"""Validate maskable safe-zone for Croniu PWA icon v3."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MASKABLE = ROOT / "apps/web/public/icons/icon-512-maskable-v3.png"
ANY_512 = ROOT / "apps/web/public/icons/icon-512-v3.png"
SOURCE = ROOT / "assets/brand/croniu-c-official.png"
# Observed RC2.7 transparent icon sha prefix (must not match).
BAD_PREFIX = "034ff9fedd77e4ce"


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_source_and_derivatives_exist():
    assert SOURCE.is_file()
    assert MASKABLE.is_file()
    assert ANY_512.is_file()
    assert not (ROOT / "apps/web/public/icons/icon-192.png").exists()
    assert not _sha(ANY_512).startswith(BAD_PREFIX)


def test_maskable_safe_zone_keeps_outer_ring_navy():
    im = Image.open(MASKABLE).convert("RGBA")
    assert im.size == (512, 512)
    bg = im.getpixel((2, 2))
    # Outer 8% ring should stay near the official navy (no glyph clipping).
    margin = int(512 * 0.08)
    samples = [
        im.getpixel((margin // 2, 256)),
        im.getpixel((512 - margin // 2, 256)),
        im.getpixel((256, margin // 2)),
        im.getpixel((256, 512 - margin // 2)),
    ]
    for sample in samples:
        assert sample[3] == 255
        assert abs(sample[0] - bg[0]) <= 8
        assert abs(sample[1] - bg[1]) <= 8
        assert abs(sample[2] - bg[2]) <= 8


def test_any_icon_is_opaque_navy_tile():
    im = Image.open(ANY_512).convert("RGBA")
    corner = im.getpixel((0, 0))
    assert corner[3] == 255
    assert corner[2] > corner[0]  # blue-ish navy
    assert corner[0] < 20
