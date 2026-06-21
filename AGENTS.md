# Bones Agent Instructions

## Canonical Source

`doc.md` is the source of truth and final development target for Bones.

Before implementing any task, read the smallest relevant section of `doc.md` and use it to enrich the task context. Prefer targeted lookup by feature name, package name, format name, API name, or milestone topic.

`implementation-milestones.md` defines the staged execution order. It does not replace `doc.md`; milestone prompts must be interpreted through the relevant `doc.md` sections.

## Task Protocol

1. Identify the current package or feature area.
2. Read only the relevant `doc.md` section before editing.
3. Carry forward product intent, constraints, formats, package boundaries, and explicit non-goals from that section.
4. Implement only the requested stage.
5. If the user request conflicts with `doc.md`, follow the latest explicit user instruction and mention the conflict briefly.

## Current Project Boundaries

- Editor app: `apps/editor`, React/Next.js only.
- Pixi runtime: `packages/runtime-pixi`, PixiJS 8 TypeScript library, no React/Next.js/DOM dependency.
- Source schema: `packages/schema`, editor/source JSON only until a task explicitly asks for compiled format.
- Compiler: `packages/compiler`, source-to-runtime pipeline only when requested.
- Vector primitives: `packages/vector-core`, runtime-neutral path/procedural shape logic.
- LDtk integration: `packages/ldtk-adapter`, kept outside runtime core.
- Platformer preview: `packages/platformer-preview`, preview/gameplay validation helpers.

## Economy Mode

Use targeted reads and targeted checks. Do not scan the full repository unless necessary. Do not add unrelated frameworks, refactors, or future-stage implementation.
