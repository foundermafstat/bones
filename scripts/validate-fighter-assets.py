#!/usr/bin/env python3
"""Targeted alpha, fringe, budget, and manifest checks for the Pulse pilot."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "apps/editor/public/assets/fighters/pulse"
PARTS = PACKAGE / "parts"


def main() -> None:
    manifest = json.loads((PACKAGE / "manifest.json").read_text())
    files = sorted(PARTS.glob("*.png"))
    if len(files) != 21 or len(manifest["visualParts"]) != 21:
        raise ValueError("Pulse must contain exactly 21 manifest-backed PNG parts.")

    total_bytes = 0
    for path in files:
        total_bytes += path.stat().st_size
        image = Image.open(path)
        if image.mode != "RGBA":
            raise ValueError(f"{path.name}: expected RGBA, received {image.mode}")
        alpha = image.getchannel("A")
        corners = ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))
        if any(alpha.getpixel(point) != 0 for point in corners):
            raise ValueError(f"{path.name}: transparent corner check failed")
        if alpha.getextrema()[1] == 0:
            raise ValueError(f"{path.name}: part is fully transparent")
        visible = fringe = 0
        for red, green, blue, opacity in image.get_flattened_data():
            if opacity == 0:
                continue
            visible += 1
            if green > 160 and green > red * 1.45 and green > blue * 1.45:
                fringe += 1
        if visible and fringe / visible > 0.002:
            raise ValueError(f"{path.name}: chroma fringe ratio {fringe / visible:.4%}")

    if total_bytes > 4 * 1024 * 1024:
        raise ValueError(f"Pulse PNG parts exceed 4 MiB: {total_bytes}")
    for qa_file in ("pulse-animation-contact-sheet.jpg", "pulse-hitbox-contact-sheet.png", "pulse-neutral-light.png", "pulse-neutral-dark.png"):
        if not (PACKAGE / "qa" / qa_file).exists():
            raise ValueError(f"Missing visual QA artifact: {qa_file}")
    print(f"Pulse assets OK: 21 RGBA parts, {total_bytes} bytes")


if __name__ == "__main__":
    main()
