#!/usr/bin/env python3
"""Build light, dark, and checkerboard contact sheets for Milo RGBA assets."""

import json
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
    manifest = json.loads((BASE / "milo-reporter.manifest.json").read_text())
    paths = sorted(ROOT / "apps/editor/public" / path.removeprefix("/") for path in manifest["activeAssetPaths"])
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
    eye_parts = {path.stem: Image.open(path).convert("RGBA") for path in paths if path.stem.startswith(("eye_iris_", "eyelid_", "pupil_"))}
    if eye_parts:
        gaze_sheet = background("checker", (240 * 9, 180 * 2))
        draw = ImageDraw.Draw(gaze_sheet)
        directions = ((-1, -1, "up-left"), (0, -1, "up"), (1, -1, "up-right"), (-1, 0, "left"), (0, 0, "center"), (1, 0, "right"), (-1, 1, "down-left"), (0, 1, "down"), (1, 1, "down-right"))
        for column, (dx, dy, label) in enumerate(directions):
            for row, side in enumerate(("left", "right")):
                iris = eye_parts[f"eye_iris_{side}"].copy()
                pupil = eye_parts[f"pupil_{side}_medium"].copy()
                eyelid = eye_parts[f"eyelid_{side}_neutral"].copy()
                iris.thumbnail((100, 100), Image.Resampling.LANCZOS)
                pupil.thumbnail((38, 48), Image.Resampling.LANCZOS)
                eyelid.thumbnail((138, 112), Image.Resampling.LANCZOS)
                cx, cy = column * 240 + 120, row * 180 + 76
                gaze_sheet.alpha_composite(iris, (cx - iris.width // 2, cy - iris.height // 2))
                gaze_sheet.alpha_composite(pupil, (cx - pupil.width // 2 + dx * 7, cy - pupil.height // 2 + dy * 4))
                gaze_sheet.alpha_composite(eyelid, (cx - eyelid.width // 2, cy - eyelid.height // 2))
                if row == 1: draw.text((column * 240 + 8, 338), label, fill="#111111")
        gaze_sheet.convert("RGB").save(BASE / "qa/milo-gaze-contact-sheet.jpg", quality=92)
    print(f"Built three Milo contact sheets for {len(paths)} assets")


if __name__ == "__main__":
    main()
