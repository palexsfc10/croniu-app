"""Derive favicon/PWA icons from the official Croniu C tile (no redesign).

Source of truth (do not replace):
  assets/brand/croniu-c-official.png

UI cutout mark (unchanged by this script):
  apps/web/public/brand/croniu-mark.png
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/brand/croniu-c-official.png"
# Versioned public names — bump ICON_VERSION to bust PWA/OS caches.
ICON_VERSION = "v3"
MANIFEST_ICON_DIR = ROOT / "apps/web/public/icons"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_official_tile() -> Image.Image:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Official Croniu C missing: {SOURCE}")
    img = Image.open(SOURCE).convert("RGBA")
    # Source is an opaque navy tile; keep as-is (no recolor / no redraw).
    return img


def sample_background(tile: Image.Image) -> tuple[int, int, int, int]:
    px = tile.convert("RGBA")
    # Corners of the official tile define the identity background.
    return px.getpixel((2, 2))


def fit_any(tile: Image.Image, size: int) -> Image.Image:
    """Full-bleed resize for purpose=any (preserve official tile)."""
    return tile.resize((size, size), Image.Resampling.LANCZOS)


def fit_maskable(tile: Image.Image, size: int, content_ratio: float = 0.72) -> Image.Image:
    """Maskable: same navy bg, glyph inset so Android circular crop keeps the C."""
    bg = sample_background(tile)
    canvas = Image.new("RGBA", (size, size), bg)
    inner = max(1, int(round(size * content_ratio)))
    scaled = tile.resize((inner, inner), Image.Resampling.LANCZOS)
    ox = (size - inner) // 2
    oy = (size - inner) // 2
    canvas.alpha_composite(scaled, (ox, oy))
    return canvas


def write_ico(path: Path, tile: Image.Image, sizes: tuple[int, ...] = (16, 32, 48)) -> None:
    largest = fit_any(tile, max(sizes))
    largest.save(path, format="ICO", sizes=[(s, s) for s in sizes])


def main() -> None:
    tile = load_official_tile()
    web_app = ROOT / "apps/web/src/app"
    admin_app = ROOT / "apps/admin/src/app"
    MANIFEST_ICON_DIR.mkdir(parents=True, exist_ok=True)

    outputs: dict[str, Path] = {
        f"icon-192-{ICON_VERSION}.png": MANIFEST_ICON_DIR / f"icon-192-{ICON_VERSION}.png",
        f"icon-512-{ICON_VERSION}.png": MANIFEST_ICON_DIR / f"icon-512-{ICON_VERSION}.png",
        f"icon-512-maskable-{ICON_VERSION}.png": MANIFEST_ICON_DIR
        / f"icon-512-maskable-{ICON_VERSION}.png",
        "web/icon.png": web_app / "icon.png",
        "web/apple-icon.png": web_app / "apple-icon.png",
        "web/favicon.ico": web_app / "favicon.ico",
        "admin/icon.png": admin_app / "icon.png",
        "admin/apple-icon.png": admin_app / "apple-icon.png",
        "admin/favicon.ico": admin_app / "favicon.ico",
    }

    fit_any(tile, 192).save(outputs[f"icon-192-{ICON_VERSION}.png"], optimize=True)
    fit_any(tile, 512).save(outputs[f"icon-512-{ICON_VERSION}.png"], optimize=True)
    fit_maskable(tile, 512).save(
        outputs[f"icon-512-maskable-{ICON_VERSION}.png"], optimize=True
    )

    fit_any(tile, 512).save(outputs["web/icon.png"], optimize=True)
    fit_any(tile, 180).save(outputs["web/apple-icon.png"], optimize=True)
    write_ico(outputs["web/favicon.ico"], tile)

    fit_any(tile, 512).save(outputs["admin/icon.png"], optimize=True)
    fit_any(tile, 180).save(outputs["admin/apple-icon.png"], optimize=True)
    write_ico(outputs["admin/favicon.ico"], tile)

    # Remove legacy unversioned PWA names so the contract cannot drift.
    for legacy in ("icon-192.png", "icon-512.png"):
        legacy_path = MANIFEST_ICON_DIR / legacy
        if legacy_path.exists():
            legacy_path.unlink()

    report = {
        "source": SOURCE.as_posix().replace("\\", "/"),
        "source_sha256": _sha256(SOURCE),
        "icon_version": ICON_VERSION,
        "derivatives": {
            key: {"path": path.as_posix().replace("\\", "/"), "sha256": _sha256(path), "bytes": path.stat().st_size}
            for key, path in outputs.items()
        },
    }
    report_path = MANIFEST_ICON_DIR / f"ICON_MANIFEST_{ICON_VERSION}.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "report": report_path.as_posix(), **report}, indent=2))


if __name__ == "__main__":
    main()
