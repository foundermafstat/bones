#!/usr/bin/env python3
"""Slice Milo's fixed ImageGen sheets into trimmed RGBA slot assets."""

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "apps/editor/public/assets/mascots/milo-reporter"
SOURCE = BASE / "source-art"
OUTPUT = BASE / "parts"
COMPOSITE_OVERRIDES = {
    "head_shell": "milo-head-shell-rgba.png",
    "chest_upper_coat": "milo-torso-composite-rgba.png",
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

REPLACED_BODY_PARTS = {
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


def lock_mouth_nose(cells: list[Image.Image]) -> list[Image.Image]:
    width, height = cells[0].size
    box = (round(width * 0.36), round(height * 0.14), round(width * 0.72), round(height * 0.52))
    patch = cells[0].crop(box)
    soft_mask = Image.new("L", patch.size)
    ImageDraw.Draw(soft_mask).rounded_rectangle((5, 5, patch.width - 6, patch.height - 6), radius=max(9, patch.width // 7), fill=255)
    soft_mask = soft_mask.filter(ImageFilter.GaussianBlur(max(3, patch.width // 28)))
    soft_mask = ImageChops.multiply(soft_mask, patch.getchannel("A"))
    core_mask = Image.new("L", patch.size)
    ImageDraw.Draw(core_mask).rounded_rectangle((14, 12, patch.width - 15, patch.height - 14), radius=max(7, patch.width // 10), fill=255)
    core_mask = ImageChops.multiply(core_mask, patch.getchannel("A").point(lambda alpha: 255 if alpha > 8 else 0))
    locked: list[Image.Image] = []
    for cell in cells:
        normalized = cell.copy()
        normalized.paste(patch, box, soft_mask)
        normalized.paste(patch, box, core_mask)
        locked.append(normalized)
    return locked


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    written_names: set[str] = set()
    for filename, columns, rows, mode, names in SHEETS:
        image = Image.open(SOURCE / filename).convert("RGBA")
        cells = sheet_cells(image, columns, rows, len(names))
        if mode == "mouth":
            cells = [keep_largest_component(cell) for cell in cells]
            cells = common_crop(lock_mouth_nose(cells), margin=10)
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
    if len(written_names) != 51:
        raise RuntimeError(f"Expected 51 sprites, wrote {len(written_names)}")
    print(f"Wrote {len(written_names)} Milo RGBA assets to {OUTPUT}")


if __name__ == "__main__":
    main()
