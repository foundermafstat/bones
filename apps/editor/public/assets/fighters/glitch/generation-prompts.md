# Glitch generation prompt set

Mode: built-in `image_gen`. References were passed as local identity/turnaround images. Final PNGs were copied into this package and chroma-keyed locally.

## Identity anchor

One adult athletic female martial artist named Glitch, full body, facing screen-right in a neutral classic 2D fighter pose. Grounded charcoal-black jacket and trousers, muted oxblood wraps, compact gunmetal shoulder/forearm/shin guards, fingerless gloves, split waist cloth, martial-arts boots, angular bob and short tied ponytail, lower-face mask. Clean game-ready shapes, readable silhouette, restrained local cel shading, no weapon, effects, text, action pose, crossing limbs, or dramatic perspective.

## Neutral pose and turnaround

Preserve the exact identity, costume, palette, proportions, hair, mask, and materials from the identity anchor. Produce a right-facing side-view neutral rig pose, plus a three-view front/profile/back orthographic sheet with aligned head, shoulder, pelvis, knee, and foot baselines. No foreshortening or alternate costume.

## Modular source sheets

Render isolated production cutout components on flat `#00FF00`, with large gaps, no labels, shadows, shared lighting, or assembled character. Preserve the reference scale and style. Use smooth rounded joint caps and hidden overlap: 25% at neck/shoulders/hips and 20% at elbows/wrists/knees/ankles.

- Core: `hair_back`, `head_base`, `hair_front`, `face_mask`, `neck`, `chest`, `abdomen`, `pelvis`, `belt`.
- Limbs: left/right `upper_arm`, `forearm`, `thigh`, `shin`, `foot`.
- Hands/armor: left/right open and fist hands, shoulder guards, wrist guards, shin guards.
- Secondary: `ponytail`, `hair_tie`, front/back waist cloth, front/back collar, belt buckle.

## Corrective prompts

- Neck: one isolated warm-skin anatomical neck only, side profile, no head, hair, mask, collar, clothing, or armor; rounded upper cap and broad lower overlap.
- Hands: four hand-only attachments in a 2×2 grid; open/fist variants per side; compact fingerless gloves only, identical wrist width/pivot, no wrist guard, forearm armor, sleeve, or metal plate.
