# State machine and blend tree authoring

## Цель
State machine управляет бесшовными переходами между clips и locomotion states.

## Happy path
1. Parameters: `absSpeed`, `velocityY`, `grounded`, `landed`, `jumpPressed`, `timeInState`.
2. States: `idle`, `walk`, `run`, `jump`, `fall`, `land`.
3. Transitions: idle->walk, walk->run, walk/run->jump, jump->fall, fall->land, land->idle.
4. Locomotion transitions use `syncMode: "phaseMatch"` where foot phase matters.
5. Проверить State Machine Graph and live preview.

## JSON example
```json
{
  "id": "walk.run",
  "fromStateId": "walk",
  "toStateId": "run",
  "duration": 0.12,
  "easing": "easeOut",
  "syncMode": "phaseMatch",
  "conditions": [{ "parameterId": "absSpeed", "operator": ">", "value": 110 }]
}
```

## Проверка
```bash
pnpm --filter @bones/runtime-pixi test
pnpm rc:smoke
```

## Known limitations
- Graph authoring functional, but not a full nested node editor.
- Transition validation requires declared parameters.

## Troubleshooting
- Transition never fires: проверить parameter id and runtime params.
- Snapping transition: increase duration, choose easing, set syncMode.
- Land interrupts early: use `canInterrupt: false` and `timeInState`.
