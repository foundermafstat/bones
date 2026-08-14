#!/usr/bin/env python3
"""Slice Milo's fixed ImageGen sheets into trimmed RGBA slot assets."""

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "apps/editor/public/assets/mascots/milo-reporter"
SOURCE = BASE / "source-art"
OUTPUT = BASE / "parts"
COMPOSITE_OVERRIDES = {
    "chest_upper_coat": "milo-torso-composite-v2-rgba.png",
}

SHEETS = (
    ("milo-body-parts-rgba.png", 5, 4, "trim", (
        "body_lower_coat", "chest_upper_coat", "neck_ruff", "head_shell", "jaw_chin",
        "ear_left", "ear_right", "whiskers_left", "whiskers_right", "upper_arm_left",
        "forearm_left", "paw_left", "upper_arm_right", "forearm_right", "paw_right",
        "collar_left", "collar_right", "scarf_center", "coat_flap_left", "coat_flap_right",
    )),
    ("milo-arms-v2-rgba.png", 5, 2, "arms", (
        "shoulder_left", "upper_arm_left", "forearm_left", "paw_left", "paw_open_left",
        "shoulder_right", "upper_arm_right", "forearm_right", "paw_right", "paw_open_right",
    )),
    ("milo-eyes-v2-rgba.png", 3, 2, "face", (
        "eyes_neutral", "eyes_blink", "eyes_happy", "eyes_sad", "eyes_angry", "eyes_surprised",
    )),
    ("milo-mouths-v2-rgba.png", 5, 5, "mouth", (
        "mouth_neutral_mbp", "mouth_neutral_ai", "mouth_neutral_e", "mouth_neutral_ou", "mouth_neutral_fv",
        "mouth_happy_mbp", "mouth_happy_ai", "mouth_happy_e", "mouth_happy_ou", "mouth_happy_fv",
        "mouth_sad_mbp", "mouth_sad_ai", "mouth_sad_e", "mouth_sad_ou", "mouth_sad_fv",
        "mouth_angry_mbp", "mouth_angry_ai", "mouth_angry_e", "mouth_angry_ou", "mouth_angry_fv",
        "mouth_surprised_round",
    )),
)

V3_ARM_NAMES = (
    "shoulder_left_v3", "upper_arm_left_v3", "forearm_left_v3", "paw_closed_left_v3", "paw_open_left_v3",
    "shoulder_right_v3", "upper_arm_right_v3", "forearm_right_v3", "paw_closed_right_v3", "paw_open_right_v3",
)
V3_PUPIL_NAMES = ("slit", "medium", "round")
V3_EYELID_NAMES = ("neutral", "blink", "happy", "sad", "angry", "surprised")

REPLACED_BODY_PARTS = {
    "jaw_chin",
    "upper_arm_left", "forearm_left", "paw_left",
    "upper_arm_right", "forearm_right", "paw_right",
}


def keep_largest_component(cell: Image.Image) -> Image.Image:
    alpha = list(cell.getchannel("A").getdata())
    width, height = cell.size
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
    keep = bytearray(width * height)
    for index in largest:
        keep[index] = 1
    cleaned = cell.copy()
    cleaned_alpha = Image.new("L", cell.size)
    cleaned_alpha.putdata([value if keep[index] else 0 for index, value in enumerate(alpha)])
    cleaned.putalpha(cleaned_alpha)
    return cleaned


def keep_center_component(cell: Image.Image) -> Image.Image:
    """Keep the pupil component nearest the cell center, ignoring connected sheet borders."""
    alpha = cell.getchannel("A")
    alpha_values = list(alpha.getdata())
    center_x, center_y = cell.width / 2, cell.height / 2
    best: tuple[float, tuple[int, int], list[int]] | None = None
    seen = bytearray(cell.width * cell.height)
    for start, value in enumerate(alpha_values):
        if value <= 8 or seen[start]:
            continue
        seen[start] = 1
        stack = [start]
        component: list[int] = []
        while stack:
            index = stack.pop()
            component.append(index)
            x, y = index % cell.width, index // cell.width
            for ny in range(max(0, y - 1), min(cell.height, y + 2)):
                for nx in range(max(0, x - 1), min(cell.width, x + 2)):
                    neighbor = ny * cell.width + nx
                    if not seen[neighbor] and alpha_values[neighbor] > 8:
                        seen[neighbor] = 1
                        stack.append(neighbor)
        xs = [index % cell.width for index in component]
        ys = [index // cell.width for index in component]
        centroid = (sum(xs) / len(xs), sum(ys) / len(ys))
        distance = (centroid[0] - center_x) ** 2 + (centroid[1] - center_y) ** 2
        candidate = (distance, (round(centroid[0]), round(centroid[1])), component)
        if best is None or candidate[0] < best[0]:
            best = candidate
    cleaned = cell.copy()
    kept = set(best[2] if best else [])
    cleaned.putalpha(Image.new("L", cell.size))
    out_alpha = cleaned.getchannel("A")
    source_alpha = alpha.load()
    out_pixels = out_alpha.load()
    for index in kept:
        out_pixels[index % cell.width, index // cell.width] = source_alpha[index % cell.width, index // cell.width]
    cleaned.putalpha(out_alpha)
    return cleaned


def clear_cell_border(cell: Image.Image, border: int = 4) -> Image.Image:
    """Remove ImageGen's opaque white grid separators before component cleanup."""
    cleaned = cell.copy()
    alpha = cleaned.getchannel("A")
    draw = ImageDraw.Draw(alpha)
    draw.rectangle((0, 0, cleaned.width - 1, border - 1), fill=0)
    draw.rectangle((0, cleaned.height - border, cleaned.width - 1, cleaned.height - 1), fill=0)
    draw.rectangle((0, 0, border - 1, cleaned.height - 1), fill=0)
    draw.rectangle((cleaned.width - border, 0, cleaned.width - 1, cleaned.height - 1), fill=0)
    cleaned.putalpha(alpha)
    return cleaned


def remove_green_chroma(image: Image.Image) -> Image.Image:
    """Remove the flat green sheet while retaining soft antialiased sprite edges."""
    cleaned = image.convert("RGBA")
    pixels = cleaned.load()
    for y in range(cleaned.height):
        for x in range(cleaned.width):
            red, green, blue, alpha = pixels[x, y]
            excess = green - max(red, blue)
            if excess <= 20:
                continue
            matte = max(0, min(255, round(255 * (80 - excess) / 60)))
            pixels[x, y] = (red, min(green, max(red, blue) + 8), blue, min(alpha, matte))
    return cleaned


def trim(cell: Image.Image, margin: int = 8) -> Image.Image:
    cell = keep_largest_component(cell)
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Sprite cell is empty")
    left, top, right, bottom = bbox
    return cell.crop((max(0, left - margin), max(0, top - margin), min(cell.width, right + margin), min(cell.height, bottom + margin)))


def remove_embedded_ears(sprite: Image.Image) -> Image.Image:
    alpha = sprite.getchannel("A")
    pixels = alpha.load()
    cutoff = int(sprite.height * 0.58)
    for y in range(cutoff):
        margin = int(sprite.width * 0.48 * (1 - y / cutoff))
        for x in range(margin): pixels[x, y] = 0
        for x in range(sprite.width - margin, sprite.width): pixels[x, y] = 0
    cleaned = sprite.copy()
    cleaned.putalpha(alpha)
    return trim(cleaned)


def sheet_cells(image: Image.Image, columns: int, rows: int, count: int) -> list[Image.Image]:
    width, height = round(image.width / columns), round(image.height / rows)
    cells: list[Image.Image] = []
    for index in range(count):
        row, column = divmod(index, columns)
        left = round(column * image.width / columns)
        top = round(row * image.height / rows)
        right = round((column + 1) * image.width / columns)
        bottom = round((row + 1) * image.height / rows)
        cells.append(image.crop((left, top, right, bottom)).resize((width, height), Image.Resampling.LANCZOS))
    return cells


def common_crop(cells: list[Image.Image], margin: int = 8) -> list[Image.Image]:
    union = Image.new("L", cells[0].size)
    for cell in cells:
        union = ImageChops.lighter(union, cell.getchannel("A"))
    bbox = union.getbbox()
    if bbox is None:
        raise ValueError("Sprite cells are empty")
    left, top, right, bottom = bbox
    bounds = (max(0, left - margin), max(0, top - margin), min(cells[0].width, right + margin), min(cells[0].height, bottom + margin))
    return [cell.crop(bounds) for cell in cells]


def common_centered_canvas(cells: list[Image.Image]) -> list[Image.Image]:
    width = max(cell.width for cell in cells)
    height = max(cell.height for cell in cells)
    aligned: list[Image.Image] = []
    for cell in cells:
        canvas = Image.new("RGBA", (width, height))
        canvas.alpha_composite(cell, ((width - cell.width) // 2, 0))
        aligned.append(canvas)
    return aligned


def joint_crop(sprite: Image.Image, top_fraction: float, margin: int = 6) -> Image.Image:
    """Reuse the accepted arm sheet material for seam-hiding joint overlays."""
    top = round(sprite.height * top_fraction)
    return trim(sprite.crop((0, top, sprite.width, sprite.height)), margin=margin)


def write_v3_arms(written_names: set[str]) -> None:
    image = Image.open(SOURCE / "milo-arms-v3-rgba.png").convert("RGBA")
    cells = sheet_cells(image, 5, 2, len(V3_ARM_NAMES))
    for row in range(2):
        start = row * 5
        cells[start + 3:start + 5] = common_crop(
            [keep_largest_component(cell) for cell in cells[start + 3:start + 5]],
            margin=10,
        )
    sprites = {name: trim(keep_largest_component(cell)) for name, cell in zip(V3_ARM_NAMES, cells)}
    sprites["upper_arm_left_v3"], sprites["upper_arm_right_v3"] = common_centered_canvas(
        [sprites["upper_arm_left_v3"], sprites["upper_arm_right_v3"]],
    )
    sprites["forearm_left_v3"], sprites["forearm_right_v3"] = common_centered_canvas(
        [sprites["forearm_left_v3"], sprites["forearm_right_v3"]],
    )
    for side in ("left", "right"):
        shoulder = sprites[f"shoulder_{side}_v3"]
        forearm = sprites[f"forearm_{side}_v3"]
        sprites[f"elbow_cover_{side}_v3"] = joint_crop(shoulder, 0.54)
        sprites[f"cuff_{side}_v3"] = joint_crop(forearm, 0.62)
    for name, sprite in sprites.items():
        sprite.save(OUTPUT / f"{name}.png", optimize=True)
        written_names.add(name)


def write_v5_arm_segments(written_names: set[str]) -> None:
    """Slice the approved 2x2 sheet: upper arms on top, cuffed forearms below."""
    image = Image.open(SOURCE / "milo-arms-v5-rgba.png").convert("RGBA")
    cells = [trim(keep_largest_component(cell), margin=10) for cell in sheet_cells(image, 2, 2, 4)]
    upper_arms = common_centered_canvas(cells[:2])
    forearms = common_centered_canvas(cells[2:])
    sprites = {
        "upper_arm_left_v3": upper_arms[0],
        "upper_arm_right_v3": upper_arms[1],
        "forearm_left_v3": forearms[0],
        "forearm_right_v3": forearms[1],
    }
    for name, sprite in sprites.items():
        sprite.save(OUTPUT / f"{name}.png", optimize=True)
        written_names.add(name)


def write_v3_eye_anatomy(written_names: set[str]) -> None:
    image = Image.open(SOURCE / "milo-eye-anatomy-v3-rgba.png").convert("RGBA")
    cells = sheet_cells(image, 5, 2, 10)
    for side_index, side in enumerate(("left", "right")):
        row = [clear_cell_border(cell) for cell in cells[side_index * 5:(side_index + 1) * 5]]
        named = {
            f"eye_white_{side}": trim(keep_largest_component(row[0]), margin=10),
            f"eye_iris_{side}": trim(keep_largest_component(row[1]), margin=8),
        }
        pupil_cells = []
        for cell in row[2:5]:
            width, height = cell.size
            centered = cell.crop((round(width * 0.15), round(height * 0.18), round(width * 0.85), round(height * 0.82)))
            pupil_cells.append(keep_center_component(centered))
        pupil_cells = common_crop(pupil_cells, margin=8)
        named.update({f"pupil_{side}_{shape}": sprite for shape, sprite in zip(V3_PUPIL_NAMES, pupil_cells)})
        for name, sprite in named.items():
            sprite.save(OUTPUT / f"{name}.png", optimize=True)
            written_names.add(name)


def write_authoritative_irises(written_names: set[str]) -> None:
    """Crop the solid circular irises approved by the user; eyelids provide the aperture."""
    image = Image.open(SOURCE / "milo-eye-bases-v4-chroma.png").convert("RGBA")
    cells = sheet_cells(image, 5, 2, 10)
    for side_index, side in enumerate(("left", "right")):
        cell = remove_green_chroma(cells[side_index * 5 + 1])
        width, height = cell.size
        centered = cell.crop((round(width * 0.08), round(height * 0.14), round(width * 0.92), round(height * 0.86)))
        sprite = trim(keep_largest_component(centered), margin=8)
        sprite.save(OUTPUT / f"eye_iris_{side}.png", optimize=True)
        written_names.add(f"eye_iris_{side}")


def write_v3_eyelids(written_names: set[str]) -> None:
    image = Image.open(SOURCE / "milo-eyelids-v3-rgba.png").convert("RGBA")
    cells = sheet_cells(image, 6, 2, 12)
    for side_index, side in enumerate(("left", "right")):
        row = [keep_largest_component(clear_cell_border(cell)) for cell in cells[side_index * 6:(side_index + 1) * 6]]
        row = common_crop(row, margin=10)
        for expression, sprite in zip(V3_EYELID_NAMES, row):
            name = f"eyelid_{side}_{expression}"
            sprite.save(OUTPUT / f"{name}.png", optimize=True)
            written_names.add(name)


def write_authoritative_head(written_names: set[str]) -> None:
    """Use the approved blank face foundation as-is; facial assets stay independent."""
    sprite = trim(Image.open(SOURCE / "milo-head-shell-v7-rgba.png").convert("RGBA"), margin=12)
    sprite.thumbnail((512, 512), Image.Resampling.LANCZOS)
    sprite.save(OUTPUT / "head_shell_v7.png", optimize=True)
    written_names.add("head_shell")


def mouth_nose_bounds(cell: Image.Image) -> tuple[int, int, int, int]:
    """Locate the dark nose in the upper-center muzzle zone, excluding the mouth."""
    pixels = cell.convert("RGBA").load()
    points: list[tuple[int, int]] = []
    for y in range(round(cell.height * 0.16), round(cell.height * 0.44)):
        for x in range(round(cell.width * 0.24), round(cell.width * 0.76)):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 80 and red < 125 and green < 100 and blue < 100:
                points.append((x, y))
    if not points:
        raise ValueError("Mouth cell has no detectable nose anchor")
    xs, ys = zip(*points)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def align_and_lock_mouth_noses(cells: list[Image.Image]) -> list[Image.Image]:
    """Align whole muzzles first, then reuse one compact nose patch without duplication."""
    target = mouth_nose_bounds(cells[0])
    target_center_x = (target[0] + target[2]) / 2
    target_top = target[1]
    aligned: list[Image.Image] = []
    for cell in cells:
        bounds = mouth_nose_bounds(cell)
        source_center_x = (bounds[0] + bounds[2]) / 2
        dx = round(target_center_x - source_center_x)
        dy = round(target_top - bounds[1])
        shifted = Image.new("RGBA", cell.size)
        shifted.alpha_composite(cell, (dx, dy))
        aligned.append(shifted)

    left = max(0, target[0] - 12)
    top = max(0, target[1] - 8)
    right = min(cells[0].width, target[2] + 12)
    bottom = min(cells[0].height, target[3] + 12)
    box = (left, top, right, bottom)
    master_patch = aligned[0].crop(box)
    master_pixels = master_patch.load()
    for y in range(master_patch.height):
        for x in range(master_patch.width):
            red, green, blue, alpha = master_pixels[x, y]
            if alpha > 0 and red < 190 and green < 150 and blue < 150 and red > green * 1.12:
                luminance = round(red * 0.48 + green * 0.34 + blue * 0.18)
                master_pixels[x, y] = (min(92, round(luminance * 0.78)), min(82, round(luminance * 0.7)), min(84, round(luminance * 0.72)), alpha)
    locked: list[Image.Image] = []
    for cell in aligned:
        normalized = cell.copy()
        normalized.paste(master_patch, (left, top))
        locked.append(keep_largest_component(normalized))
    return locked


def separate_fixed_nose(cells: list[Image.Image]) -> tuple[list[Image.Image], Image.Image]:
    """Extract one fixed nose and subtract precisely the same alpha region from every mouth."""
    bounds = mouth_nose_bounds(cells[0])
    nose_mask = Image.new("L", cells[0].size, 0)
    ImageDraw.Draw(nose_mask).ellipse((bounds[0] - 9, bounds[1] - 7, bounds[2] + 9, bounds[3] + 8), fill=255)
    fixed_nose = cells[0].copy()
    fixed_nose.putalpha(ImageChops.multiply(fixed_nose.getchannel("A"), nose_mask))
    cleaned: list[Image.Image] = []
    for cell in cells:
        mouth_only = cell.copy()
        mouth_only.putalpha(ImageChops.subtract(cell.getchannel("A"), nose_mask))
        cleaned.append(mouth_only)
    aligned = common_crop([*cleaned, fixed_nose], margin=10)
    return aligned[:-1], aligned[-1]


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    written_names: set[str] = set()
    fixed_nose: Image.Image | None = None
    for filename, columns, rows, mode, names in SHEETS:
        image = Image.open(SOURCE / filename).convert("RGBA")
        cells = sheet_cells(image, columns, rows, len(names))
        if mode == "mouth":
            cells = [keep_largest_component(clear_cell_border(cell, border=6)) for cell in cells]
            cells, fixed_nose = separate_fixed_nose(align_and_lock_mouth_noses(cells))
        elif mode == "face":
            cells = common_crop(cells, margin=10)
        elif mode == "arms":
            cells[3:5] = common_crop(cells[3:5], margin=10)
            cells[8:10] = common_crop(cells[8:10], margin=10)
        for index, name in enumerate(names):
            if filename == "milo-body-parts-rgba.png" and name in REPLACED_BODY_PARTS:
                continue
            sprite = cells[index] if mode in {"face", "mouth"} or (mode == "arms" and name.startswith("paw")) else trim(cells[index])
            if name == "head_shell":
                sprite = remove_embedded_ears(sprite)
            if name not in COMPOSITE_OVERRIDES:
                sprite.save(OUTPUT / f"{name}.png", optimize=True)
            written_names.add(name)
    for name, filename in COMPOSITE_OVERRIDES.items():
        sprite = trim(Image.open(SOURCE / filename).convert("RGBA"), margin=12)
        sprite.thumbnail((512, 512), Image.Resampling.LANCZOS)
        sprite.save(OUTPUT / f"{name}_v5.png", optimize=True)
        written_names.add(name)
    if fixed_nose is None:
        raise RuntimeError("Mouth sheet did not produce a fixed nose")
    fixed_nose.save(OUTPUT / "nose_fixed.png", optimize=True)
    written_names.add("nose_fixed")
    write_v3_arms(written_names)
    write_v5_arm_segments(written_names)
    write_v3_eye_anatomy(written_names)
    write_authoritative_irises(written_names)
    write_v3_eyelids(written_names)
    write_authoritative_head(written_names)
    if len(written_names) != 87:
        raise RuntimeError(f"Expected 87 sprites including retained legacy assets, wrote {len(written_names)}")
    print(f"Wrote {len(written_names)} Milo RGBA assets (71 active v3 + 16 retained legacy-only variants) to {OUTPUT}")


if __name__ == "__main__":
    main()
