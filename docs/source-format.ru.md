# Source JSON format

## Цель
Source JSON - главный авторский формат Bones: его сохраняет editor, его ревьюят в git и передают в compiler.

## Happy path
1. Создать rig, parts, animations, state machine в editor.
2. Vectorize SVG перед production export.
3. Получить `hero.source.rig.json` через Export Bundle или использовать `examples/shadow-hero/source.json`.
4. Проверить через `pnpm --filter @bones/compiler test`.

## JSON example
```json
{
  "schemaVersion": "1.0.0",
  "runtimeTarget": "pixi-v8",
  "id": "hero-source",
  "name": "Hero",
  "rigs": [{ "id": "hero", "name": "Hero", "rootBoneId": "root", "bones": [{ "id": "root", "name": "Root", "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 }, "length": 0 }] }],
  "animations": [],
  "stateMachines": []
}
```

## Проверка
```bash
pnpm rc:smoke
pnpm export:sample
```

## Known limitations
- Source JSON может содержать editor metadata.
- Runtime не должен грузить source JSON напрямую.
- SVG importer ограничен path-oriented SVG.

## Troubleshooting
- `Condition parameter ... does not exist`: добавить parameter в `stateMachines[].parameters`.
- `Production export still contains SVG parts`: запустить Vectorize или production export.
- Missing ref errors: проверить ids после rename/delete.
