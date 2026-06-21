# Bones Release Candidate Package

This package is the RC handoff for the current Bones vertical slice: editor source JSON -> compiler -> PixiJS runtime -> LDtk platformer preview helpers.

## Included Artifacts

- Source sample: `examples/shadow-hero/source.json`
- Compiled runtime fixture: `packages/runtime-pixi/fixtures/shadow-hero.compiled.json`
- LDtk room sample: `examples/ldtk/sample-room.ldtk.json`
- PixiJS platformer integration example: `examples/pixi-platformer/integration.ts`
- RC smoke command: `pnpm rc:smoke`
- Canonical product target: `doc.md`
- Execution plan: `docs/production-readiness-plan.md`

## JSON Formats

### Editor Source JSON

Owned by `@bones/schema`.

Required top-level fields:

- `schemaVersion: "1.0.0"`
- `runtimeTarget: "pixi-v8"`
- `id`, `name`
- `rigs[]` with `rootBoneId`, `bones[]`, optional `parts[]`
- optional `animations[]`, `stateMachines[]`, `proceduralPresets[]`, `preview`

Source JSON is editable and may contain editor metadata. It is the format to load, save, migrate, diff, and review.

### Runtime Compiled JSON

Owned by `@bones/compiler`, consumed by `@bones/runtime-pixi`.

Required top-level fields:

- `compiledFormatVersion`
- `schemaVersion`
- `runtimeTarget: "pixi-v8"`
- `sourceProjectId`
- numeric rig, bone, part, animation, and state machine ids
- `lookups` mapping source ids to runtime ids

Compiled JSON is deterministic and should be treated as a build artifact. Runtime loading normalizes transform arrays into typed buffers.

## Runtime API

```ts
import { RigInstance, sampleAnimationClip } from "@bones/runtime-pixi";

const hero = new RigInstance(compiledHero, { quality: "medium" });
stage.addChild(hero.container);

hero.update(dt, {
  absSpeed,
  velocityY,
  grounded,
  landed
});

const idle = compiledHero.animations[compiledHero.lookups.animations.idle];
hero.applySample(sampleAnimationClip(idle, elapsed));
```

Runtime responsibilities:

- Build a PixiJS `Container` hierarchy from compiled JSON.
- Render path/procedural/mesh parts without parsing SVG in gameplay.
- Sample keyframes, transitions, blend trees, procedural layers, mesh deforms, and Foot IK.
- Emit animation events through `RigInstance.on("animationEvent", listener)`.
- Expose quality presets and profiler measurements through `qualityPresets` and `RuntimeProfiler`.

## Editor Workflow

1. Start the editor with `pnpm dev`.
2. Use Rig mode for bone hierarchy and transforms.
3. Use Shape mode to vectorize/import/edit silhouette parts.
4. Use Pose, Timeline, Curve, State Machine, and Procedural modes to author animation behavior.
5. Use Project actions to save/load local draft, copy source JSON, import from clipboard, or export a project bundle.
6. Compile source JSON with `compileRig(sourceProject)` for game integration.
7. Run the PixiJS runtime with the compiled JSON and platformer parameters.

## Migration Guide

- Old editor-only state must be converted to source JSON before runtime use.
- SVG parts should be vectorized into path/procedural/mesh parts before shipping gameplay builds.
- Animation track targets must reference source ids; the compiler converts them to numeric runtime ids.
- State machine conditions must use declared parameters.
- Use `preview.ldtkPath`, `preview.spawnPointId`, and quality flags for editor/game preview parity.
- Treat compiled JSON as disposable output; preserve source JSON as the authored asset.

## Example PixiJS Platformer Integration

Use `examples/pixi-platformer/integration.ts` as the reference integration shape:

- Initialize PixiJS with `qualityPresets[quality]`.
- Parse LDtk room data with `parseLdtkLevel`.
- Update controller state with `updatePlatformerController`.
- Convert controller state to animation params with `toAnimationParameters`.
- Call `hero.update(dt, params)` every tick.
- Read `RuntimeProfiler.stats` for update/render telemetry.

## Sample LDtk Room

`examples/ldtk/sample-room.ldtk.json` includes:

- solid ground
- moving platform
- death zone
- wall jump surface
- player spawn
- light emitter
- camera zone
- animation trigger

The parser contract is intentionally small and game-facing: it produces colliders, spawn points, lights, camera zones, and animation triggers.

## Smoke And Regression Checks

Run the focused RC path:

```bash
pnpm rc:smoke
```

Run package regressions:

```bash
pnpm --filter @bones/schema test
pnpm --filter @bones/compiler test
pnpm --filter @bones/vector-core test
pnpm --filter @bones/runtime-pixi test
pnpm --filter @bones/ldtk-adapter test
pnpm --filter @bones/platformer-preview test
pnpm --filter @bones/editor test
pnpm --filter @bones/editor typecheck
```

Run browser smoke for the editor:

```bash
pnpm dev
```

Then verify:

- canvas renders one character
- Rig mode shows editable skeleton
- Preview quality selector changes low/medium/high
- Profiler frame count and update/render values change while playing
- Export Bundle copies source/compiled bundle data

## Character Quality Checklist

- Idle breathing: body/head scale and y-motion are visible without breaking silhouette.
- Walk/run weight transfer: front/back legs oppose each other and body y shifts on contact.
- Jump anticipation: body compresses before liftoff and stretches after takeoff.
- Fall reaction: cloak/hair lags upward/backward and body pose reads airborne.
- Land squash/dust event: land clip compresses body and emits a dust event at impact.
- Cloak/hair secondary motion: cloak mesh exists and secondary-motion preset targets it.
- Foot IK: front/back feet are declared with shin/thigh chains and grounded gating.
- Silhouette readability: black filled parts remain readable as a single character at mobile scale.
- Mobile quality: low preset disables expensive extras, medium is default, high is desktop preview.

## Known Limitations

- This RC is a focused silhouette platformer stack, not a general Spine replacement.
- Full body mesh skinning is out of scope; mesh deformation is part-level and lightweight.
- The editor is a production-oriented vertical slice, but not yet a polished DCC replacement.
- Server sync, marketplace, multi-format export, and remote asset libraries are out of scope.
- Browser visual QA is local-dev based; automated pixel baselines are not part of this RC.

## Release Readiness Gate

The RC is acceptable when:

- `pnpm rc:smoke` passes.
- Runtime and editor targeted checks pass.
- A new user can open the editor, load or paste the sample source, adjust rig/animation state, export/compile JSON, and run the compiled result through the PixiJS platformer integration.
