#!/usr/bin/env python3
"""Targeted structural and alpha validation for the Glitch rig asset package."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "apps/editor/public/assets/fighters/glitch"
PARTS = PACKAGE / "parts"
MANIFEST = PACKAGE / "manifest.json"

REQUIRED_PARTS = {
    "head_base",
    "hair_front",
    "hair_back",
    "neck",
    "chest",
    "abdomen",
    "pelvis",
    "upper_arm_l",
    "upper_arm_r",
    "forearm_l",
    "forearm_r",
    "hand_l_open",
    "hand_l_fist",
    "hand_r_open",
    "hand_r_fist",
    "thigh_l",
    "thigh_r",
    "shin_l",
    "shin_r",
    "foot_l",
    "foot_r",
}


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    parts = manifest["parts"]
    if len(parts) != 36:
        raise ValueError(f"Expected 36 manifest parts, found {len(parts)}")

    ids = [part["id"] for part in parts]
    if len(ids) != len(set(ids)):
        raise ValueError("Part ids must be unique")
    if missing := REQUIRED_PARTS - set(ids):
        raise ValueError(f"Missing required rig parts: {sorted(missing)}")

    bones = {bone["id"] for bone in manifest["boneHierarchy"]}
    for part in parts:
        if part["bone"] not in bones or part["parentBone"] not in bones:
            raise ValueError(f"{part['id']}: unknown bone binding")
        x, y = part["pivotNormalized"]
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise ValueError(f"{part['id']}: pivot must be normalized")

    manifest_files = {PACKAGE / part["file"] for part in parts}
    actual_files = set(PARTS.glob("*.png"))
    if manifest_files != actual_files:
        raise ValueError(
            f"Manifest/file mismatch: missing={sorted(str(path) for path in manifest_files - actual_files)}, "
            f"extra={sorted(str(path) for path in actual_files - manifest_files)}"
        )

    total_bytes = 0
    for path in sorted(actual_files):
        total_bytes += path.stat().st_size
        image = Image.open(path)
        if image.mode != "RGBA":
            raise ValueError(f"{path.name}: expected RGBA, got {image.mode}")
        if image.width < 32 or image.height < 32 or image.width > 1024 or image.height > 1024:
            raise ValueError(f"{path.name}: implausible sprite size {image.size}")
        alpha = image.getchannel("A")
        if alpha.getextrema()[1] == 0:
            raise ValueError(f"{path.name}: sprite is fully transparent")
        corners = ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))
        if any(alpha.getpixel(point) != 0 for point in corners):
            raise ValueError(f"{path.name}: transparent corner check failed")

        visible = fringe = 0
        for red, green, blue, opacity in image.get_flattened_data():
            if opacity <= 8:
                continue
            visible += 1
            if green > 150 and green > red * 1.35 and green > blue * 1.35 and green - max(red, blue) > 30:
                fringe += 1
        if visible and fringe / visible > 0.001:
            raise ValueError(f"{path.name}: chroma fringe ratio {fringe / visible:.4%}")

    for slot in ("hand_l", "hand_r"):
        variants = [part for part in parts if part.get("slot") == slot]
        if len(variants) != 2 or sum(bool(part["defaultVisible"]) for part in variants) != 1:
            raise ValueError(f"{slot}: expected two variants with one default attachment")

    for joint, minimum in manifest["technical"]["jointOverlapFraction"].items():
        if minimum < 0.2:
            raise ValueError(f"{joint}: overlap recommendation must be at least 20%")

    required_files = (
        "reference/glitch-concept.png",
        "reference/glitch-neutral-rig-pose.png",
        "reference/glitch-turnaround.png",
        "qa/glitch-parts-contact-sheet.png",
        "qa/glitch-pivot-guide.png",
        "qa/glitch-neutral-light.png",
        "qa/glitch-neutral-dark.png",
        "asset-list.md",
        "rigging-guide.md",
        "generation-prompts.md",
    )
    for relative in required_files:
        if not (PACKAGE / relative).exists():
            raise ValueError(f"Missing package deliverable: {relative}")

    neutral = Image.open(PACKAGE / "reference/glitch-neutral-rig-pose.png")
    if neutral.mode != "RGBA" or neutral.getchannel("A").getextrema()[0] != 0:
        raise ValueError("Neutral rig pose must have real transparency")

    if total_bytes > 8 * 1024 * 1024:
        raise ValueError(f"Rig PNG parts exceed 8 MiB: {total_bytes}")

    print(f"Glitch assets OK: {len(parts)} RGBA parts, {total_bytes} bytes, pivots/parents/draw order present")


if __name__ == "__main__":
    main()
