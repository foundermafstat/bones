#!/usr/bin/env python3
"""Fail on missing alpha, opaque corners, empty sprites, or visible green fringe."""

import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "apps/editor/public/assets/mascots/milo-reporter"


def main() -> None:
    paths = sorted((BASE / "parts").glob("*.png"))
    failures: list[str] = []
    report: dict[str, object] = {"expectedParts": 51, "actualParts": len(paths), "files": []}
    if len(paths) != 51:
        failures.append(f"expected 51 parts, found {len(paths)}")
    for path in paths:
        image = Image.open(path).convert("RGBA")
        pixels = list(image.getdata())
        corners = [image.getpixel((0, 0))[3], image.getpixel((image.width - 1, 0))[3], image.getpixel((0, image.height - 1))[3], image.getpixel((image.width - 1, image.height - 1))[3]]
        fringe = sum(1 for red, green, blue, alpha in pixels if alpha > 32 and green > red * 1.45 and green > blue * 1.45 and green - max(red, blue) > 35)
        visible = sum(1 for *_, alpha in pixels if alpha > 0)
        if any(corners): failures.append(f"{path.name}: opaque corner")
        if visible == 0: failures.append(f"{path.name}: empty alpha")
        if fringe > max(4, visible // 500): failures.append(f"{path.name}: {fringe} green-fringe pixels")
        report["files"].append({"file": path.name, "size": [image.width, image.height], "visiblePixels": visible, "greenFringePixels": fringe, "transparentCorners": not any(corners)})
    mouth_paths = sorted((BASE / "parts").glob("mouth_*.png"))
    mouth_images = [Image.open(path).convert("RGBA") for path in mouth_paths]
    if len({image.size for image in mouth_images}) != 1:
        failures.append("mouth assets do not share one fixed canvas")
    elif mouth_images:
        width, height = mouth_images[0].size
        nose_box = (round(width * 0.48), round(height * 0.32), round(width * 0.65), round(height * 0.42))
        nose_anchor = mouth_images[0].crop(nose_box)
        if any(ImageChops.difference(nose_anchor, image.crop(nose_box)).getbbox() is not None for image in mouth_images[1:]):
            failures.append("mouth nose anchor differs between attachments")
    for side in ("left", "right"):
        closed = Image.open(BASE / f"parts/paw_{side}.png")
        opened = Image.open(BASE / f"parts/paw_open_{side}.png")
        if closed.size != opened.size:
            failures.append(f"{side} paw variants do not share one fixed canvas")
    report["facialAlignment"] = {"mouthCanvasEqual": len({image.size for image in mouth_images}) == 1, "noseAnchorEqual": not any("nose anchor" in failure for failure in failures)}
    report["ok"] = not failures
    report["failures"] = failures
    out = BASE / "qa/milo-alpha-report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"Milo alpha QA passed for {len(paths)} parts")


if __name__ == "__main__":
    main()
