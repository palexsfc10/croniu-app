"""Derive favicon/PWA icons from the canonical Croniu mark (no redesign)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/web/public/brand/croniu-mark.png"


def _transparent_mark() -> Image.Image:
    mark = Image.open(SOURCE).convert("RGBA")
    pixels = mark.load()
    width, height = mark.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # Solid black tile behind the C → transparent for favicon/PWA.
            if r < 25 and g < 25 and b < 25:
                pixels[x, y] = (r, g, b, 0)
    return mark


def fit(mark: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = max(1, size // 12)
    inner = size - 2 * pad
    scaled = mark.copy()
    scaled.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    ox = (size - scaled.width) // 2
    oy = (size - scaled.height) // 2
    canvas.paste(scaled, (ox, oy), scaled)
    return canvas


def write_ico(path: Path, mark: Image.Image, sizes: tuple[int, ...] = (16, 32, 48)) -> None:
    # Pillow writes a multi-resolution ICO from the largest canvas + sizes=.
    largest = fit(mark, max(sizes))
    largest.save(path, format="ICO", sizes=[(s, s) for s in sizes])


def main() -> None:
    mark = _transparent_mark()
    web_app = ROOT / "apps/web/src/app"
    admin_app = ROOT / "apps/admin/src/app"
    icons_dir = ROOT / "apps/web/public/icons"
    icons_dir.mkdir(parents=True, exist_ok=True)

    fit(mark, 512).save(web_app / "icon.png", optimize=True)
    fit(mark, 180).save(web_app / "apple-icon.png", optimize=True)
    fit(mark, 192).save(icons_dir / "icon-192.png", optimize=True)
    fit(mark, 512).save(icons_dir / "icon-512.png", optimize=True)
    write_ico(web_app / "favicon.ico", mark)

    fit(mark, 512).save(admin_app / "icon.png", optimize=True)
    fit(mark, 180).save(admin_app / "apple-icon.png", optimize=True)
    write_ico(admin_app / "favicon.ico", mark)

    print(
        "ok",
        "web_favicon",
        (web_app / "favicon.ico").stat().st_size,
        "admin_favicon",
        (admin_app / "favicon.ico").stat().st_size,
        "source",
        SOURCE.as_posix(),
    )


if __name__ == "__main__":
    main()
