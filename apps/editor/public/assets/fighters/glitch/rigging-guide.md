# Glitch 2D cutout rigging guide

## Character concept

Glitch is a grounded assassin-archetype martial artist built for a right-facing side-view fighter. Her silhouette is carried by the angular bob and ponytail, layered shoulder armor, tapered forearm and shin guards, and two short waist-cloth masses. The palette is charcoal, muted oxblood, gunmetal, and warm skin; there are no weapons, glow, particles, or special-move elements in this base set.

Use `reference/glitch-concept.png` for identity, `reference/glitch-neutral-rig-pose.png` for the default assembly pose, and `reference/glitch-turnaround.png` for front/profile/back proportion checks.

## Asset naming and sides

- Files use `parts/<part>[_l|_r][_open|_fist].png`.
- `l` and `r` are anatomical sides. In the default right-facing view, `l` is the near/front chain and `r` is the far/back chain.
- Open and fist hands are mutually exclusive attachments in the same hand slot.
- All production parts are cropped RGBA PNGs in sRGB. Chroma sheets remain only as reproducible source art.

## Skeleton and parenting

```text
root
└── pelvis
    ├── spine_lower
    │   └── chest
    │       ├── neck
    │       │   └── head
    │       │       └── hair_root
    │       │           └── hair_tip
    │       ├── upper_arm_l → forearm_l → hand_l
    │       └── upper_arm_r → forearm_r → hand_r
    ├── thigh_l → shin_l → foot_l
    ├── thigh_r → shin_r → foot_r
    ├── cloth_front_root → cloth_front_tip
    └── cloth_back_root → cloth_back_tip
```

- Bind shoulder guards to their upper-arm bones so they cover the chest/arm seam while following punches.
- Bind wrist guards to forearm bones and shin guards to shin bones.
- Bind belt and buckle to `pelvis`; collar halves to `chest`; mask and both main hair layers to `head`.
- Bind the ponytail to `hair_tip`. Keep its root under `hair_tie` and use low-amplitude secondary motion.
- Bind waist cloth to the cloth root bones. The tip bones may use damped secondary rotation; do not simulate full cloth.

## Pivots and overlap

`manifest.json` contains the recommended normalized pivot for every PNG. Convert it to pixels with:

```text
pivotX = imageWidth × pivotNormalized[0]
pivotY = imageHeight × pivotNormalized[1]
```

Joint rules:

- neck, shoulders, and hips: keep at least 25% of the proximal part hidden under its cover;
- elbows, wrists, knees, and ankles: keep at least 20% hidden overlap;
- never place a pivot on the visible cut edge—place it at the anatomical rotation center inside the overlap;
- keep identical hand-slot pivots for open/fist variants;
- use the same transform for left/right counterparts before pose offsets.

The supplied rounded caps are intended for rigid cutout rotation. Use mesh deformation only for chest breathing, abdomen compression, and subtle cloth/hair flex.

## Recommended draw order

The authoritative numeric order is in `manifest.json`, from low/back to high/front. In summary:

```text
ponytail → hair_back → back cloth → right/far limbs → pelvis/torso
→ neck/head/mask/hair_front → left/near legs → front cloth
→ left/near arms → belt buckle
```

Swap hand/forearm order only for intentional cross-body attacks or guard poses. Do not permanently move the far limb above the torso, or the side-view depth will invert.

## Rig setup notes

- Spine: use attachment slots for open/fist hands and separate slots for armor overlays. Keep the pivot coordinates as attachment origins.
- Unity 2D: one SpriteRenderer per part, SortingGroup on the character root, and bone-weight only chest/abdomen/cloth pieces that need deformation.
- Godot Skeleton2D: one `Bone2D` per hierarchy entry and one child `Sprite2D` per visible part; use `z_index` values from the manifest.
- Mirror the full rig for left-facing gameplay. Do not independently mirror individual asymmetric layers.
- The belt buckle and short cloth panels may need temporary draw-order keys when hands cross the hips.

## Required base animations

| Group | Required clips |
| --- | --- |
| Neutral | `idle` |
| Locomotion | `walk_forward`, `walk_backward` |
| Crouch | `crouch_enter`, `crouch_idle`, `crouch_exit` |
| Jump | `jump_start`, `jump_rise`, `jump_apex`, `jump_fall`, `jump_land` |
| Block | `block_high`, `block_low`, `block_air` |
| Punches | `punch_light`, `punch_medium`, `punch_heavy`, `punch_hook`, `punch_uppercut` |
| Kicks | `kick_light`, `kick_medium`, `kick_heavy`, `kick_low`, `kick_sweep` |
| Hit reactions | `hit_head`, `hit_body`, `hit_low`, `hit_air` |
| Knockdown | `knockdown_launch`, `knockdown_fall`, `knockdown_ground`, `getup` |

Keep the idle and walk clips loopable. Attack, hit, and knockdown clips should have explicit anticipation, active/contact, recovery, and return-to-guard sections. Special moves and visual effects are intentionally outside this package.
