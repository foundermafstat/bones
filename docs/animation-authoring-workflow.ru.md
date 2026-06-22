# Animation authoring workflow

## Цель
Production workflow создания clips, curves and gameplay events.

## Happy path
1. Создать poses: idle, walk contacts, run contacts, jump anticipation, fall, land squash.
2. В Timeline создать clip and tracks `bone.property`.
3. Поставить keyframes with snapping.
4. В Curve выбрать bezier/anticipation/overshoot.
5. Добавить events: `footstep`, `liftoff`, `land`, `dust`.
6. Проверить Preview and Export.

## Event example
```json
{ "time": 0.12, "type": "liftoff", "category": "gameplay", "payload": { "impulse": 1 } }
```

## Проверка
```bash
pnpm --filter @bones/editor test
pnpm --filter @bones/runtime-pixi test
```

## Known limitations
- Timeline is dopesheet-oriented, not full DCC graph editor.
- Event payload schema typed by convention, not generated per game.

## Troubleshooting
- Mechanical motion: replace linear keys with bezier/spring/anticipation.
- Duplicate footstep: check loop boundary and crossfade dedupe tests.
- Bad event window: ensure `time + duration <= clip.duration`.
