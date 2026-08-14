#!/usr/bin/env python3
"""Build deterministic overlays against Milo's checked-in absolute reference."""

import argparse
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "apps/editor/public/assets/mascots/milo-reporter"
REFERENCE = BASE / "source-art/milo-final-look-v3-rgba.png"
DEFAULT_CURRENT = BASE / "qa/chrome-authoritative-face-v7.png"
DEFAULT_OUTPUT = BASE / "qa/milo-reference-overlay.png"

# Stable coat silhouettes and approved landmark rectangles, measured once in source pixels.
REFERENCE_COAT = (177, 385, 1070, 1239)
# Chrome's 1440 x 778 render is aligned against the absolute by the body and
# coat/collar, never by a face replacement. These values are part of the lock.
CURRENT_COAT = (220, 188, 562, 516)
REFERENCE_LANDMARKS = {
    "left_eye": (498, 313, 584, 373),
    "right_eye": (669, 313, 757, 374),
    "nose_mouth": (597, 413, 655, 453),
    "left_ear": (405, 48, 497, 273),
    "right_ear": (758, 48, 840, 273),
}


BACKGROUNDS = {
    "light": (236, 236, 236),
    "dark": (57, 58, 60),
    "checker": None,
}


def checker(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    cell = 16
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            shade = 226 if (x // cell + y // cell) % 2 == 0 else 184
            draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(shade, shade, shade))
    return image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", type=Path, default=DEFAULT_CURRENT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.current.exists():
        raise SystemExit(f"Missing Chrome lock render: {args.current}")
    reference = Image.open(REFERENCE).convert("RGBA")
    current = Image.open(args.current).convert("RGB")
    scale = (CURRENT_COAT[2] - CURRENT_COAT[0]) / (REFERENCE_COAT[2] - REFERENCE_COAT[0])
    offset_x = CURRENT_COAT[0] - REFERENCE_COAT[0] * scale
    offset_y = CURRENT_COAT[1] - REFERENCE_COAT[1] * scale
    resized = reference.resize((round(reference.width * scale), round(reference.height * scale)), Image.Resampling.LANCZOS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for name, color in BACKGROUNDS.items():
        aligned = checker(current.size) if color is None else Image.new("RGB", current.size, color)
        aligned.paste(resized.convert("RGB"), (round(offset_x), round(offset_y)), resized.getchannel("A"))
        overlay = Image.blend(current, aligned, 0.5)
        draw = ImageDraw.Draw(overlay)
        for landmark, box in REFERENCE_LANDMARKS.items():
            mapped = tuple(round(value * scale + (offset_x if index % 2 == 0 else offset_y)) for index, value in enumerate(box))
            draw.rectangle(mapped, outline=(0, 255, 255), width=1)
            draw.text((mapped[0], mapped[1] - 10), landmark, fill=(0, 255, 255))
        destination = args.output if name == "dark" else args.output.with_name(f"{args.output.stem}-{name}{args.output.suffix}")
        overlay.save(destination)
    print(f"Reference lock scale={scale:.6f}, offset=({offset_x:.3f}, {offset_y:.3f}); light/dark/checker overlays written")


if __name__ == "__main__":
    main()
