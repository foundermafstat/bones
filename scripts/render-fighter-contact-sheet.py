#!/usr/bin/env python3
"""Render a lightweight visual QA sheet for single-bone skinned fighter parts."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "apps/editor/public/assets/fighters/pulse"
PROJECT = json.loads((PACKAGE / "pulse.source.rig.json").read_text())
COMBAT = json.loads((PACKAGE / "pulse.combat.json").read_text())
RIG = PROJECT["rigs"][0]
ANIMATIONS = {clip["id"]: clip for clip in PROJECT["animations"]}
MOVES = {move["clipId"]: move for move in COMBAT["moves"]}
PART_FILES = {part["id"]: PACKAGE / "parts" / f"{part['id']}.png" for part in RIG["parts"]}

CONTACT_CLIPS = (
    "idle",
    "crouch",
    "jump_start",
    "standing_lp",
    "standing_hp",
    "standing_hk",
    "hurt_heavy",
    "throw_forward",
    "drive_palm",
    "vanguard_rush",
    "victory",
)


def identity() -> dict[str, float]:
    return {"x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1, "skewX": 0, "skewY": 0}


def sample_value(track: dict, time: float):
    keys = track["keyframes"]
    if len(keys) == 1 or time <= keys[0]["time"]:
        return keys[0]["value"]
    if time >= keys[-1]["time"]:
        return keys[-1]["value"]
    for start, end in zip(keys, keys[1:]):
        if start["time"] <= time <= end["time"]:
            if start.get("interpolation") in ("step", "hold") or end["time"] == start["time"]:
                return start["value"]
            weight = (time - start["time"]) / (end["time"] - start["time"])
            return start["value"] + (end["value"] - start["value"]) * weight
    return keys[-1]["value"]


def sampled_pose(clip_id: str) -> tuple[dict[str, dict[str, float]], dict[str, bool]]:
    clip = ANIMATIONS[clip_id]
    move = MOVES.get(clip_id)
    if move:
        start, end = move["activeWindows"][0]
        time = ((start + end) / 2) / 60
    else:
        time = clip["duration"] * 0.55
    transforms = {bone["id"]: {**identity(), **bone.get("local", bone.get("transform", {}))} for bone in RIG["bones"]}
    visibility = {part["id"]: part.get("visible", True) for part in RIG["parts"]}
    for track in clip["tracks"]:
        target = track["target"]
        value = sample_value(track, time)
        if target["kind"] == "bone" and track["property"].startswith("transform."):
            transforms[target["id"]][track["property"].split(".", 1)[1]] = value
        elif target["kind"] == "part" and track["property"] == "visible":
            visibility[target["id"]] = bool(value)
    return transforms, visibility


def local_matrix(transform: dict[str, float]) -> tuple[float, float, float, float, float, float]:
    rotation = transform["rotation"]
    scale_x = transform["scaleX"]
    scale_y = transform["scaleY"]
    return (
        math.cos(rotation) * scale_x,
        math.sin(rotation) * scale_x,
        -math.sin(rotation) * scale_y,
        math.cos(rotation) * scale_y,
        transform["x"],
        transform["y"],
    )


def multiply(left, right):
    la, lb, lc, ld, ltx, lty = left
    ra, rb, rc, rd, rtx, rty = right
    return (
        la * ra + lc * rb,
        lb * ra + ld * rb,
        la * rc + lc * rd,
        lb * rc + ld * rd,
        la * rtx + lc * rty + ltx,
        lb * rtx + ld * rty + lty,
    )


def world_matrices(transforms: dict[str, dict[str, float]]):
    matrices = {}
    for bone in RIG["bones"]:
        local = local_matrix(transforms[bone["id"]])
        matrices[bone["id"]] = multiply(matrices[bone["parentId"]], local) if bone.get("parentId") else local
    return matrices


def render_clip(clip_id: str, size=(420, 520), background=(14, 20, 40, 255), show_boxes=False) -> Image.Image:
    canvas = Image.new("RGBA", size, background)
    draw = ImageDraw.Draw(canvas)
    ground_y = size[1] - 48
    draw.line((20, ground_y, size[0] - 20, ground_y), fill=(67, 98, 150, 255), width=2)
    transforms, visibility = sampled_pose(clip_id)
    matrices = world_matrices(transforms)
    scale = 0.62
    origin = (size[0] / 2 + 20, ground_y)

    for part in sorted(RIG["parts"], key=lambda value: value.get("drawOrder", 0)):
        if not visibility.get(part["id"], True):
            continue
        custom = part.get("editor", {}).get("custom", {})
        binding = custom.get("boneBinding")
        if not binding or binding not in matrices:
            continue
        source = Image.open(PART_FILES[part["id"]]).convert("RGBA")
        vertices = part["mesh"]["vertices"]
        offset_x = min(vertices[0::2])
        offset_y = (min(vertices[1::2]) + max(vertices[1::2])) / 2
        length = max(vertices[0::2]) - min(vertices[0::2])
        width = max(vertices[1::2]) - min(vertices[1::2])
        vertical = part["mesh"]["uvs"][:4] == [0, 1, 0, 0]
        bone = matrices[binding]
        forward = texture_to_screen(source.size, bone, origin, scale, offset_x, offset_y, length, width, vertical)
        inverse = invert_affine(forward)
        layer = source.transform(size, Image.Transform.AFFINE, inverse, resample=Image.Resampling.BICUBIC)
        canvas.alpha_composite(layer)

    if show_boxes and clip_id in MOVES:
        draw = ImageDraw.Draw(canvas)
        for box in MOVES[clip_id]["boxes"]:
            matrix = matrices[box["boneId"]]
            rect = box["rect"]
            corners = (
                (rect["x"], rect["y"]),
                (rect["x"] + rect["width"], rect["y"]),
                (rect["x"] + rect["width"], rect["y"] + rect["height"]),
                (rect["x"], rect["y"] + rect["height"]),
            )
            points = [world_point(matrix, point, origin, scale) for point in corners]
            color = (255, 72, 72, 255) if box["kind"] in ("hit", "throw") else (70, 225, 130, 220)
            draw.line((*points, points[0]), fill=color, width=3, joint="curve")

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((12, 12, 190, 42), radius=8, fill=(0, 0, 0, 180))
    draw.text((24, 20), clip_id.replace("_", " ").upper(), fill=(255, 255, 255, 255))
    return canvas


def world_point(matrix, point, origin, scale):
    a, b, c, d, tx, ty = matrix
    x, y = point
    return (origin[0] + (a * x + c * y + tx) * scale, origin[1] + (b * x + d * y + ty) * scale)


def texture_to_screen(source_size, bone, origin, scale, offset_x, offset_y, length, width, vertical):
    source_width, source_height = source_size
    if vertical:
        local = (0, width / source_width, -length / source_height, 0, offset_x + length, offset_y - width / 2)
    else:
        local = (length / source_width, 0, 0, width / source_height, offset_x, offset_y - width / 2)
    world = multiply(bone, local)
    a, b, c, d, tx, ty = world
    return (a * scale, b * scale, c * scale, d * scale, origin[0] + tx * scale, origin[1] + ty * scale)


def invert_affine(matrix):
    a, b, c, d, tx, ty = matrix
    determinant = a * d - b * c
    if abs(determinant) < 1e-8:
        raise ValueError("Degenerate part transform")
    return (
        d / determinant,
        -c / determinant,
        (c * ty - d * tx) / determinant,
        -b / determinant,
        a / determinant,
        (b * tx - a * ty) / determinant,
    )


def contact_sheet() -> Image.Image:
    panel_size = (420, 520)
    columns = 4
    rows = math.ceil(len(CONTACT_CLIPS) / columns)
    sheet = Image.new("RGBA", (panel_size[0] * columns, panel_size[1] * rows), (7, 11, 24, 255))
    for index, clip_id in enumerate(CONTACT_CLIPS):
        panel = render_clip(clip_id, panel_size, (12, 20, 42, 255) if index % 2 == 0 else (235, 241, 248, 255))
        sheet.alpha_composite(panel, ((index % columns) * panel_size[0], (index // columns) * panel_size[1]))
    return sheet


def hitbox_sheet() -> Image.Image:
    clips = ("standing_lp", "standing_hp", "standing_hk", "throw_forward", "drive_palm", "vanguard_rush")
    panel_size = (420, 520)
    sheet = Image.new("RGBA", (panel_size[0] * 3, panel_size[1] * 2), (7, 11, 24, 255))
    for index, clip_id in enumerate(clips):
        panel = render_clip(clip_id, panel_size, (12, 20, 42, 255), show_boxes=True)
        sheet.alpha_composite(panel, ((index % 3) * panel_size[0], (index // 3) * panel_size[1]))
    return sheet


def main() -> None:
    qa = PACKAGE / "qa"
    qa.mkdir(exist_ok=True)
    contact_sheet().convert("RGB").save(qa / "pulse-animation-contact-sheet.jpg", quality=92, optimize=True)
    hitbox_sheet().save(qa / "pulse-hitbox-contact-sheet.png", optimize=True)
    render_clip("idle", background=(244, 247, 252, 255)).save(qa / "pulse-neutral-light.png", optimize=True)
    render_clip("idle", background=(8, 13, 28, 255)).save(qa / "pulse-neutral-dark.png", optimize=True)
    print(qa / "pulse-animation-contact-sheet.jpg")


if __name__ == "__main__":
    main()
