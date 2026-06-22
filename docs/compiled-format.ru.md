# Compiled JSON format

## Цель
Compiled JSON - runtime artifact для PixiJS. Он создается compiler-ом из source JSON и не редактируется вручную.

## Happy path
```bash
pnpm export:sample
```

Результат: `hero.compiled.json`, `hero.compiled.json.gz`, `hero.release-manifest.json`.

## JSON example
```json
{
  "compiledFormatVersion": "1.0.0",
  "runtimeTarget": "pixi-v8",
  "sourceProjectId": "shadow-hero-source",
  "rig": { "bones": [], "parts": [] },
  "animations": [],
  "stateMachines": [],
  "lookups": { "bones": {}, "animations": {}, "stateMachines": {} }
}
```

## Проверка
```bash
pnpm --filter @bones/compiler test
pnpm --filter @bones/runtime-pixi test
```

## Known limitations
- `.json.gz` - packaging artifact; compact runtime JSON и gzip не одно и то же.
- Compiled format version должен проверяться loader/migration.

## Troubleshooting
- `Unsupported compiledFormatVersion`: пересобрать artifact текущим compiler.
- Empty lookups: проверить source ids и compiler validation.
- Blank render: проверить `rig.parts`, draw order and part data.
