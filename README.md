# Bones

Bones is a production-ready visual rigging and animation system for building expressive vector silhouette characters for PixiJS 8 platformers. It combines a browser-based editor, a versioned JSON format, a compiler, and a lightweight PixiJS runtime so characters can be authored visually and shipped as clean runtime data.

The project is designed for atmospheric 2D web platformers that need fluid character motion without Spine, Rive, frame-by-frame sprites, or paid runtimes. Artists and developers can model a character from vector parts, edit organic shapes, author poses and animation clips, build state machines, preview movement in platformer scenes, and export deterministic JSON for the game runtime.

## What Bones Provides

- A React/Next.js visual editor for rigging, shape editing, poses, timelines, curves, state machines, procedural layers, and platformer preview.
- A PixiJS 8 runtime that loads compiled Bones JSON and plays characters through Pixi containers and graphics primitives.
- A source JSON format for editor projects and a compiled JSON format optimized for runtime playback.
- A TypeScript schema package for validation, migrations, and stable interchange.
- A compiler that strips editor metadata, flattens animation data, prepares lookups, and produces runtime-ready assets.
- A vector core for neutral path commands, procedural shapes, imported SVG sources, and conversion into PixiJS drawing commands.
- An LDtk adapter for testing character animation against real platformer levels.
- A platformer preview package for validating locomotion, jump/fall/land states, controller parameters, and gameplay helper tracks.

## Architecture

```txt
apps/editor
  Browser editor shell and future visual authoring UI.

packages/schema
  Versioned TypeScript types and JSON schema contracts.

packages/vector-core
  Runtime-neutral vector path and procedural shape primitives.

packages/compiler
  Source project to compiled runtime JSON pipeline.

packages/runtime-pixi
  PixiJS 8 runtime package with no React or Next.js dependency.

packages/ldtk-adapter
  LDtk JSON integration boundary for preview scenes.

packages/platformer-preview
  Platformer-focused preview support built on the runtime package.
```

## Runtime Model

Bones characters are built from a scene graph of bones and vector parts. Each part can be a neutral path, procedural shape, mesh-ready shape, imported SVG source, or compiled PixiJS graphics data. At runtime, Bones creates a PixiJS container hierarchy, applies sampled animation transforms, blends states, evaluates procedural layers, and updates only the data that changes.

Static vector geometry is prepared once and reused through PixiJS graphics primitives. Animation updates are focused on transforms, visibility, draw order, deformation channels, and runtime parameters instead of redrawing the full character every frame.

## Editor Workflow

```txt
Create or import a character
  -> build the rig hierarchy
  -> edit vector shapes and pivots
  -> author poses and animation clips
  -> tune curves, blending, and state transitions
  -> preview movement in a platformer scene
  -> export compiled JSON
  -> load it in a PixiJS 8 game
```

The editor is organized around focused modes: Rig, Shape, Pose, Timeline, Curve, State Machine, Procedural, and Preview. Editor state is separate from runtime state so authoring features such as undo/redo, selection, autosave, and metadata do not leak into shipped runtime assets.

## Runtime Features

- Hierarchical rig playback through PixiJS containers.
- Source and compiled JSON formats with explicit schema versions.
- Animation clips, tracks, keyframes, curves, blending, and state machines.
- Locomotion blend trees for idle, walk, run, jump, fall, and landing flows.
- Procedural layers for breathing, squash/stretch, secondary hair or cloak motion, and landing impact.
- Foot IK and collision adapter interfaces for platformer integration.
- Event tracks and gameplay helper tracks for audio, effects, hitboxes, and state callbacks.
- Mobile-web performance constraints, LOD strategy, and PixiJS 8 render-group awareness.

## Development

Bones is a pnpm TypeScript monorepo.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm dev:editor
```

Targeted package checks:

```bash
pnpm --filter @bones/runtime-pixi build
pnpm --filter @bones/editor typecheck
```

## Package Boundaries

`@bones/runtime-pixi` is a clean TypeScript library for PixiJS 8. It does not depend on React, Next.js, or browser DOM APIs.

`@bones/editor` is the only package that owns the React/Next.js application shell.

Shared schema, compiler, vector, LDtk, and preview logic lives in standalone packages so game integrations can depend only on the pieces they need.
