# Editor workflow

## Цель
Editor покрывает цикл skeleton -> parts -> poses -> clips -> curves/events -> state machine -> production export.

## Happy path
1. `pnpm dev`
2. Открыть `http://localhost:3000/`.
3. Rig: создать/переименовать/родить кости.
4. Shape: добавить SVG/path part, привязать к bone, нажать Vectorize.
5. Pose/Timeline/Curve: собрать poses, keyframes and curves.
6. State Machine: собрать transitions and blend tree.
7. Preview: проверить idle/walk/run/jump/fall/land.
8. Export: получить `7 files ready`.

## JSON example
```json
{
  "animations": [{ "id": "walk", "tracks": [{ "target": { "kind": "bone", "id": "body" }, "property": "transform.y", "keyframes": [{ "time": 0, "value": -36 }] }] }]
}
```

## Проверка
```bash
pnpm --filter @bones/editor test
pnpm --filter @bones/editor typecheck
```

Browser: `pnpm smoke:editor-browser` или `docs/editor-browser-visual-smoke.ru.md`.

## Known limitations
- Editor - production vertical slice, не полный DCC replacement.
- Browser smoke требует запущенный dev server.

## Troubleshooting
- Export failed: смотреть Export Bundle errors/warnings.
- Preview blank: проверить console, compiled export and Pixi build.
