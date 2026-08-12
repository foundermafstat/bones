# Bones compact workspace design QA

final result: passed

## Evidence

- Approved source: `/Users/irine/Desktop/exec-fa877a46-783b-4527-bccc-d9cb3f27404e.png`
- Implementation: `apps/editor/app/StudioEditor.tsx`, `apps/editor/app/PixiPreview.tsx`, `apps/editor/app/page.tsx`, `apps/editor/app/globals.css`
- Final captures: `/tmp/bones-verified-grouped-1584x992.png`, `/tmp/bones-verified-grouped-1280x720.png`, `/tmp/bones-advanced-final-1584x992.png`
- Browser: Codex in-app Browser, `http://localhost:3001/`
- Viewports: `1584 × 992` and `1280 × 720`

## Visual comparison

| Area | Result |
|---|---|
| Shell and navigation | Dark 52px topbar, compact rail, four top sections, and blue active states follow the approved concept. Rail workspaces synchronize with Build/Animate/Test. |
| Density | 12px body copy, 14–16px icons, 36px controls, compact layer rows, inspector fields, and timeline keys remain readable without oversized chrome. |
| Canvas and inspector | Three-column authoring layout remains stable at both target viewports. Inspector sections are independently collapsible and retain per-workspace state. |
| Timeline | Bone groups expand into individual bone rows and X/Y/animation channels. Sticky ruler/labels, row virtualization, vertical overflow, zoom, Fit, horizontal scroll, scrub, and key drag were verified. |
| Advanced | Technical Rig/Shape/Pose/Timeline/Curve/State Machine/Procedural/Preview tools remain inside the same dark topbar and rail; no light shell is reachable. |
| Assets and icons | Existing Dark Assassin artwork and Lucide icons are retained; final browser load reported zero broken images. |

The shipped Dark Assassin art intentionally differs from the concept character illustration. Product chrome and layout, rather than character asset style, were the fidelity target.

## Functional browser QA

- Workspace sync: Skeleton → Build, Artwork → Build, Pose → Animate with timeline, Preview → Test without timeline.
- Timeline Fit at both viewports: `scrollWidth === clientWidth`; zoom expanded the timeline to 4406px and both axes scrolled independently.
- Sticky state after scrolling: ruler stayed at the viewport top and track labels/corner stayed at the left edge.
- Zoomed scrub landed on expected frame 50; a key drag moved `0.9667 → 1.05`, and Undo restored it.
- Rear arm group collapsed/expanded; selecting Bone15 selected one bone row and exposed its Position fields in the inspector.
- Adding an empty Bone15 X key created one key; Undo removed it as one command.
- Auto timeline height resolved to `40dvh` (396.8px at 1584×992, 288px at 1280×720); manual height persisted across workspace switches.
- Browser console contained no warnings or errors; only the React DevTools development info message.

## Comparison history

1. Initial pass: compact dark workspace shell, rail navigation, collapsible inspector, and scalable timeline established.
2. Interaction pass: corrected the scroll callback, Fit end gutter, persistent manual height, and responsive auto-height.
3. Final pass: introduced semantic limb/layer bone groups, per-bone X/Y channels and selection, then repeated responsive and interaction QA.
