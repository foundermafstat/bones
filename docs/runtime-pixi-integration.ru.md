# Pixi runtime integration

## Цель
Подключить compiled Bones artifact к PixiJS runtime без editor dependencies.

## Happy path
```ts
import { RigInstance } from "@bones/runtime-pixi";

const compiled = await fetch("/hero.compiled.json").then((response) => response.json());
const hero = new RigInstance(compiled, { quality: "medium" });
app.stage.addChild(hero.container);
app.ticker.add((ticker) => hero.update(ticker.deltaMS / 1000, { absSpeed, velocityY, grounded, landed, timeInState }));
```

## Events
```ts
hero.on("animationEvent", (event) => {
  if (event.type === "footstep") playFootstep(event.payload);
  if (event.type === "dust") spawnDust(event.payload);
});
```

## Проверка
```bash
pnpm rc:smoke
pnpm perf:runtime
pnpm export:sample
```

## Known limitations
- Runtime consumes compiled JSON only.
- Runtime has no React/Next.js dependency.
- Full mesh skinning is not the current target.

## Troubleshooting
- Blank render: verify `compiled.rig.parts.length`, stage, scale and position.
- Bad transitions: inspect params passed into `hero.update`.
- Performance spikes: run `pnpm perf:runtime` and lower quality preset.
