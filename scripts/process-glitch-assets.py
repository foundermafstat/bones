#!/usr/bin/env python3
"""Convert the approved Glitch chroma sheets into trimmed RGBA rig parts."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "apps/editor/public/assets/fighters/glitch"
SOURCE = PACKAGE / "source-art"
PARTS = PACKAGE / "parts"
REFERENCE = PACKAGE / "reference"

SHEETS = (
    (
        "glitch-core-parts-chroma.png",
        "glitch-core-parts-rgba.png",
        3,
        3,
        (
            "hair_back",
            "head_base",
            "hair_front",
            "face_mask",
            "neck",
            "chest",
            "abdomen",
            "pelvis",
            "belt",
        ),
    ),
    (
        "glitch-limb-parts-chroma.png",
        "glitch-limb-parts-rgba.png",
        5,
        2,
        (
            "upper_arm_l",
            "forearm_l",
            "thigh_l",
            "shin_l",
            "foot_l",
            "upper_arm_r",
            "forearm_r",
            "thigh_r",
            "shin_r",
            "foot_r",
        ),
    ),
    (
        "glitch-hand-armor-parts-chroma.png",
        "glitch-hand-armor-parts-rgba.png",
        5,
        2,
        (
            "hand_l_open",
            "hand_l_fist",
            "hand_r_open",
            "hand_r_fist",
            "shoulder_guard_l",
            "shoulder_guard_r",
            "wrist_guard_l",
            "wrist_guard_r",
            "shin_guard_l",
            "shin_guard_r",
        ),
    ),
    (
        "glitch-secondary-parts-chroma.png",
        "glitch-secondary-parts-rgba.png",
        4,
        2,
        (
            "ponytail",
            "hair_tie",
            "waist_cloth_front",
            "waist_cloth_back",
            "collar_front",
            "collar_back",
            "belt_buckle",
        ),
    ),
)


def remove_green_chroma(image: Image.Image) -> Image.Image:
    cleaned = image.convert("RGBA")
    pixels = cleaned.load()
    for y in range(cleaned.height):
        for x in range(cleaned.width):
            red, green, blue, alpha = pixels[x, y]
            excess = green - max(red, blue)
            if excess <= 18:
                continue
            matte = max(0, min(255, round(255 * (76 - excess) / 58)))
            pixels[x, y] = (red, min(green, max(red, blue) + 6), blue, min(alpha, matte))
    return cleaned


def keep_largest_component(image: Image.Image) -> Image.Image:
    alpha = list(image.getchannel("A").get_flattened_data())
    width, height = image.size
    seen = bytearray(width * height)
    largest: list[int] = []
    for start, value in enumerate(alpha):
        if value <= 8 or seen[start]:
            continue
        seen[start] = 1
        stack = [start]
        component: list[int] = []
        while stack:
            index = stack.pop()
            component.append(index)
            x, y = index % width, index // width
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = ny * width + nx
                    if not seen[neighbor] and alpha[neighbor] > 8:
                        seen[neighbor] = 1
                        stack.append(neighbor)
        if len(component) > len(largest):
            largest = component

    kept = bytearray(width * height)
    for index in largest:
        kept[index] = 1
    cleaned = image.copy()
    cleaned_alpha = Image.new("L", image.size)
    cleaned_alpha.putdata([value if kept[index] else 0 for index, value in enumerate(alpha)])
    cleaned.putalpha(cleaned_alpha)
    return cleaned


def trim(image: Image.Image, margin: int = 12) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("Generated sprite cell is empty")
    left, top, right, bottom = bbox
    return image.crop(
        (
            max(0, left - margin),
            max(0, top - margin),
            min(image.width, right + margin),
            min(image.height, bottom + margin),
        )
    )


def split_sheet(
    source_name: str,
    rgba_name: str,
    columns: int,
    rows: int,
    names: tuple[str, ...],
) -> None:
    source = Image.open(SOURCE / source_name).convert("RGBA")
    rgba = remove_green_chroma(source)
    rgba.save(SOURCE / rgba_name, optimize=True)

    PARTS.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(names):
        column = index % columns
        row = index // columns
        left = round(column * source.width / columns)
        right = round((column + 1) * source.width / columns)
        top = round(row * source.height / rows)
        bottom = round((row + 1) * source.height / rows)
        part = trim(keep_largest_component(rgba.crop((left, top, right, bottom))))
        part.save(PARTS / f"{name}.png", optimize=True)


def transparent_neutral_pose() -> None:
    source = Image.open(REFERENCE / "glitch-neutral-rig-pose-source.png").convert("RGBA")
    width, height = source.size
    background = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_background(x: int, y: int) -> bool:
        red, green, blue, _ = source.getpixel((x, y))
        return min(red, green, blue) >= 232 and max(red, green, blue) - min(red, green, blue) <= 10

    for x in range(width):
        for y in (0, height - 1):
            if is_background(x, y):
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if is_background(x, y):
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        offset = y * width + x
        if background[offset] or not is_background(x, y):
            continue
        background[offset] = 1
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    pixels = source.load()
    for y in range(height):
        for x in range(width):
            if background[y * width + x]:
                red, green, blue, _ = pixels[x, y]
                pixels[x, y] = (red, green, blue, 0)

    trim(source, margin=24).save(REFERENCE / "glitch-neutral-rig-pose.png", optimize=True)


def render_contact_sheets() -> None:
    manifest = json.loads((PACKAGE / "manifest.json").read_text())
    parts = manifest["parts"]
    columns, cell_width, cell_height = 6, 260, 300
    rows = (len(parts) + columns - 1) // columns

    for show_pivots, filename in (
        (False, "glitch-parts-contact-sheet.png"),
        (True, "glitch-pivot-guide.png"),
    ):
        sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), (232, 235, 240))
        draw = ImageDraw.Draw(sheet)
        for index, part in enumerate(parts):
            image = Image.open(PACKAGE / part["file"]).convert("RGBA")
            scale = min(220 / image.width, 235 / image.height, 1)
            image = image.resize(
                (round(image.width * scale), round(image.height * scale)),
                Image.Resampling.LANCZOS,
            )
            cell_x = (index % columns) * cell_width
            cell_y = (index // columns) * cell_height
            x = cell_x + (cell_width - image.width) // 2
            y = cell_y + 30 + (235 - image.height) // 2
            sheet.paste(image, (x, y), image)
            draw.text((cell_x + 8, cell_y + 8), part["id"], fill=(15, 20, 30))
            if show_pivots:
                pivot_x = round(x + image.width * part["pivotNormalized"][0])
                pivot_y = round(y + image.height * part["pivotNormalized"][1])
                draw.ellipse((pivot_x - 6, pivot_y - 6, pivot_x + 6, pivot_y + 6), outline=(230, 45, 45), width=3)
                draw.line((pivot_x - 10, pivot_y, pivot_x + 10, pivot_y), fill=(230, 45, 45), width=2)
                draw.line((pivot_x, pivot_y - 10, pivot_x, pivot_y + 10), fill=(230, 45, 45), width=2)

        (PACKAGE / "qa").mkdir(parents=True, exist_ok=True)
        sheet.save(PACKAGE / "qa" / filename, optimize=True)


def render_neutral_qa() -> None:
    neutral = Image.open(REFERENCE / "glitch-neutral-rig-pose.png").convert("RGBA")
    scale = min(500 / neutral.width, 720 / neutral.height, 1)
    neutral = neutral.resize(
        (round(neutral.width * scale), round(neutral.height * scale)),
        Image.Resampling.LANCZOS,
    )
    for filename, color in (
        ("glitch-neutral-light.png", (238, 241, 246)),
        ("glitch-neutral-dark.png", (27, 30, 37)),
    ):
        canvas = Image.new("RGB", (600, 800), color)
        x = (canvas.width - neutral.width) // 2
        y = canvas.height - neutral.height - 36
        canvas.paste(neutral, (x, y), neutral)
        draw = ImageDraw.Draw(canvas)
        draw.line((40, canvas.height - 36, canvas.width - 40, canvas.height - 36), fill=(116, 125, 143), width=2)
        canvas.save(PACKAGE / "qa" / filename, optimize=True)


def process_overrides() -> None:
    neck = remove_green_chroma(Image.open(SOURCE / "glitch-neck-chroma.png"))
    neck.save(SOURCE / "glitch-neck-rgba.png", optimize=True)
    neck_part = trim(keep_largest_component(neck))
    neck_part = neck_part.resize(
        (round(neck_part.width * 0.22), round(neck_part.height * 0.22)),
        Image.Resampling.LANCZOS,
    )
    neck_part.save(PARTS / "neck.png", optimize=True)

    split_sheet(
        "glitch-hand-variants-chroma.png",
        "glitch-hand-variants-rgba.png",
        2,
        2,
        ("hand_l_open", "hand_l_fist", "hand_r_open", "hand_r_fist"),
    )
    for side in ("l", "r"):
        for pose in ("open", "fist"):
            path = PARTS / f"hand_{side}_{pose}.png"
            hand = Image.open(path).convert("RGBA")
            hand = hand.rotate(-90 if side == "l" else 90, expand=True, resample=Image.Resampling.BICUBIC)
            hand = hand.resize(
                (round(hand.width * 0.42), round(hand.height * 0.42)),
                Image.Resampling.LANCZOS,
            )
            trim(hand, margin=8).save(path, optimize=True)


def main() -> None:
    for sheet in SHEETS:
        split_sheet(*sheet)
    process_overrides()
    transparent_neutral_pose()
    render_contact_sheets()
    render_neutral_qa()
    print(f"Glitch assets processed: {sum(len(sheet[-1]) for sheet in SHEETS)} RGBA parts")


if __name__ == "__main__":
    main()
