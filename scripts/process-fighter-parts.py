#!/usr/bin/env python3
"""Crop the approved imagegen alpha sheets into deterministic fighter parts."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


FIGHTERS = ("pulse", "glitch", "rumble", "zip")
BODY_PARTS = (
    "torso",
    "pelvis",
    "upper_arm_back",
    "forearm_back",
    "hand_back",
    "upper_arm_front",
    "forearm_front",
    "hand_front",
    "thigh_back",
    "shin_back",
    "foot_back",
    "thigh_front",
    "shin_front",
    "foot_front",
)
FACE_PARTS = (
    "head_base",
    "face_neutral",
    "face_attack",
    "face_hurt",
    "face_victory",
    "accessory_back",
    "accessory_front",
)


def component_boxes(image: Image.Image, minimum_area: int = 500) -> list[tuple[int, int, int, int]]:
    mask = image.getchannel("A").point(lambda value: 255 if value >= 32 else 0)
    components: list[tuple[tuple[int, int, int, int], int]] = []

    while bounds := mask.getbbox():
        left, top, right, bottom = bounds
        seed: tuple[int, int] | None = None
        for y in range(top, bottom):
            row = mask.crop((left, y, right, y + 1)).getbbox()
            if row:
                seed = (left + row[0], y)
                break
        if seed is None:
            break

        ImageDraw.floodfill(mask, seed, 128, thresh=0)
        component_mask = mask.point(lambda value: 255 if value == 128 else 0)
        component_bounds = component_mask.getbbox()
        if component_bounds:
            area = sum(1 for value in component_mask.crop(component_bounds).get_flattened_data() if value)
            if area >= minimum_area:
                components.append((component_bounds, area))
        ImageDraw.floodfill(mask, seed, 0, thresh=0)

    return [bounds for bounds, _area in components]


def order_body(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    by_y = sorted(boxes, key=lambda box: ((box[1] + box[3]) / 2, box[0]))
    rows = (by_y[:4], by_y[4:8], by_y[8:12], by_y[12:14])
    return [box for row in rows for box in sorted(row, key=lambda box: box[0])]


def order_face(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    by_y = sorted(boxes, key=lambda box: ((box[1] + box[3]) / 2, box[0]))
    rows = (by_y[:3], by_y[3:6], by_y[6:7])
    return [box for row in rows for box in sorted(row, key=lambda box: box[0])]


def crop_sheet(
    source: Path,
    destination: Path,
    names: tuple[str, ...],
    order,
    padding: int = 4,
) -> None:
    image = Image.open(source).convert("RGBA")
    boxes = component_boxes(image)
    if len(boxes) != len(names):
        raise ValueError(f"{source}: expected {len(names)} components, found {len(boxes)}")

    destination.mkdir(parents=True, exist_ok=True)
    for name, box in zip(names, order(boxes), strict=True):
        left, top, right, bottom = box
        crop = image.crop(
            (
                max(0, left - padding),
                max(0, top - padding),
                min(image.width, right + padding),
                min(image.height, bottom + padding),
            )
        )
        crop.save(destination / f"{name}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--alpha-root", type=Path, default=Path("tmp/imagegen/fighter-alpha"))
    parser.add_argument("--assets-root", type=Path, default=Path("apps/editor/public/assets/fighters"))
    parser.add_argument("--fighter", choices=FIGHTERS, default="pulse")
    parser.add_argument("--suffix", default="")
    args = parser.parse_args()

    for fighter in (args.fighter,):
        crop_sheet(
            args.alpha_root / f"{fighter}-body-parts-sheet{args.suffix}.png",
            args.assets_root / fighter / "parts",
            BODY_PARTS,
            order_body,
        )
        crop_sheet(
            args.alpha_root / f"{fighter}-face-accessory-sheet{args.suffix}.png",
            args.assets_root / fighter / "parts",
            FACE_PARTS,
            order_face,
        )


if __name__ == "__main__":
    main()
