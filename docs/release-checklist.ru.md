# Release checklist

## Цель
Единый gate перед передачей Bones artifact в game/runtime.

## Обязательные команды
```bash
pnpm --filter @bones/schema test
pnpm --filter @bones/compiler test
pnpm --filter @bones/runtime-pixi test
pnpm --filter @bones/editor test
pnpm --filter @bones/editor typecheck
pnpm export:sample
pnpm perf:runtime
pnpm rc:smoke
```

Browser gate:
```bash
pnpm dev
pnpm smoke:editor-browser
```

Если Playwright не установлен, выполнить `docs/editor-browser-visual-smoke.ru.md`.

## Artifact expectations
- Export UI: `7 files ready`.
- Release folder: `dist/export-shadow-hero/`.
- Required files: `hero.source.rig.json`, `hero.rig.json`, `hero.animations.json`, `hero.state-machine.json`, `hero.compiled.json`, `hero.compiled.json.gz`, `hero.release-manifest.json`, `hero.pixi-demo.html`.

## Character gate
- No cloak by default.
- Source and compiled export contain no SVG runtime parts.
- Clips: idle, walk, run, jump, fall, land.
- Events: footstep, liftoff, land, dust.
- State sequence: idle -> walk -> run -> jump -> fall -> land -> idle.

## Troubleshooting
- Missing Playwright: install/provide Playwright in CI or run manual fallback.
- Export hash changed: expected after source/fixture change; commit source and compiled fixture together.
- RC smoke animation count fails: update sample fixture tests and docs together.
