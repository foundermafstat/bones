#!/usr/bin/env python3
"""Build light, dark, and checkerboard contact sheets for Milo RGBA assets."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "apps/editor/public/assets/mascots/milo-reporter"
PARTS = BASE / "parts"


def background(mode: str, size: tuple[int, int]) -> Image.Image:
    if mode == "light": return Image.new("RGBA", size, "#f4f4f0")
    if mode == "dark": return Image.new("RGBA", size, "#16181d")
    image = Image.new("RGBA", size, "#d9dde5")
    draw = ImageDraw.Draw(image)
    tile = 24
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2: draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#aeb4bf")
    return image


def main() -> None:
    paths = sorted(PARTS.glob("*.png"))
    cell_w, cell_h, columns = 240, 220, 6
    rows = (len(paths) + columns - 1) // columns
    for mode in ("light", "dark", "checker"):
        sheet = background(mode, (cell_w * columns, cell_h * rows))
        draw = ImageDraw.Draw(sheet)
        for index, path in enumerate(paths):
            sprite = Image.open(path).convert("RGBA")
            sprite.thumbnail((cell_w - 24, cell_h - 44), Image.Resampling.LANCZOS)
            x = (index % columns) * cell_w + (cell_w - sprite.width) // 2
            y = (index // columns) * cell_h + 8
            sheet.alpha_composite(sprite, (x, y))
            draw.text(((index % columns) * cell_w + 8, (index // columns + 1) * cell_h - 28), path.stem, fill="#ffffff" if mode == "dark" else "#111111")
        sheet.convert("RGB").save(BASE / f"qa/milo-parts-{mode}.jpg", quality=90)
    clip_paths = [BASE / "qa/clips" / f"{name}.png" for name in (
        "idle_neutral", "talk_neutral", "talk_happy", "talk_sad", "talk_angry",
        "explain_point", "discuss_two_hands", "greeting", "surprise_reaction", "farewell",
    )]
    if all(path.exists() for path in clip_paths):
        clip_sheet = Image.new("RGB", (480 * 5, 300 * 2), "#181a1f")
        draw = ImageDraw.Draw(clip_sheet)
        for index, path in enumerate(clip_paths):
            frame = Image.open(path).convert("RGB")
            frame.thumbnail((472, 268), Image.Resampling.LANCZOS)
            x = (index % 5) * 480 + (480 - frame.width) // 2
            y = (index // 5) * 300
            clip_sheet.paste(frame, (x, y))
            draw.text(((index % 5) * 480 + 8, y + 276), path.stem, fill="#ffffff")
        clip_sheet.save(BASE / "qa/milo-clips-contact-sheet.jpg", quality=90)
    print(f"Built three Milo contact sheets for {len(paths)} assets")


if __name__ == "__main__":
    main()
