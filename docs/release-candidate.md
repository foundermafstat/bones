# Bones Release Candidate Notes

## JSON Formats

- Editor source JSON is owned by `@bones/schema` and remains human-readable.
- Runtime compiled JSON is owned by `@bones/compiler` and consumed by `@bones/runtime-pixi`.
- Compiled character fixtures should use `runtimeTarget: "pixi-v8"` and explicit `schemaVersion`.

## Runtime API

```ts
import { RigInstance, AnimationMixer, RuntimeStateMachineController } from "@bones/runtime-pixi";

const hero = new RigInstance(compiledHero);
world.addChild(hero.container);
hero.update(dt, animationParameters);
```

Runtime responsibilities:

- build PixiJS `Container` hierarchy;
- reuse static vector `GraphicsContext` instances;
- sample clips and blend layers;
- evaluate state machine parameters;
- apply procedural layers and Foot IK helpers.

## Editor Workflow

1. Open the editor shell.
2. Use Rig mode to change bones through commands.
3. Use Shape mode to bind or edit silhouette parts.
4. Use Pose, Timeline, Curve, State Machine, and Procedural controls to update project state.
5. Save/load the local editor draft or copy serialized JSON.
6. Export/compile through the compiler package when integrating into a PixiJS game.

## Example Assets

- Runtime fixture: `packages/runtime-pixi/fixtures/shadow-hero.compiled.json`
- LDtk parser helpers: `packages/ldtk-adapter`
- Platformer controller helpers: `packages/platformer-preview`

## Smoke Checks

```bash
pnpm --filter @bones/runtime-pixi test
pnpm --filter @bones/editor typecheck
pnpm --filter @bones/ldtk-adapter typecheck
pnpm --filter @bones/platformer-preview typecheck
```

## Character Quality Checklist

- Idle breathing is represented by clip/procedural controls.
- Walk has opposing front/back leg tracks.
- Jump, fall, and land clips exist in the compiled fixture.
- Cloak is represented as a mesh part and secondary motion target.
- Foot IK has an abstract raycast adapter and grounded gating.
- Silhouette parts render on the runtime fixture.

## Known Limitations

- Editor modes are functional shell controls, not full production canvases yet.
- Mesh support is simple geometry rendering, not full cloth simulation.
- Export UI serializes editor state; full source-to-compiled export flow remains package-level.
- Browser visual QA was limited to local HTTP render because no browser automation dependency is installed.
