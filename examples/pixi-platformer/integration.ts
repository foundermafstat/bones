import { Application } from "pixi.js";
import { RigInstance, RuntimeProfiler, qualityPresets, type RuntimeCompiledRig } from "@bones/runtime-pixi";
import { parseLdtkLevel } from "@bones/ldtk-adapter";
import { createInitialControllerState, toAnimationParameters, updatePlatformerController } from "@bones/platformer-preview";

export async function mountShadowHeroPlatformer(
  host: HTMLElement,
  compiledHero: RuntimeCompiledRig,
  ldtkRoom: unknown,
  quality: keyof typeof qualityPresets = "medium"
) {
  const preset = qualityPresets[quality];
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundAlpha: preset.contextAlpha ? 0 : 1,
    antialias: preset.antialias,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, preset.resolution)
  });

  host.appendChild(app.canvas);

  const level = parseLdtkLevel(ldtkRoom as Parameters<typeof parseLdtkLevel>[0]);
  const spawn = level.spawnPoints.find((point) => point.id === "player") ?? level.spawnPoints[0] ?? { x: 0, y: 0 };
  let controller = createInitialControllerState(spawn.x, spawn.y);
  const hero = new RigInstance(compiledHero, { quality });
  const profiler = new RuntimeProfiler();

  hero.container.position.set(app.screen.width * 0.5, app.screen.height * 0.72);
  hero.container.scale.set(2);
  app.stage.addChild(hero.container);

  app.ticker.add((ticker: { deltaMS: number }) => {
    const dt = Math.min(1 / 30, ticker.deltaMS / 1000);
    const updateStart = performance.now();
    controller = updatePlatformerController(controller, readInput(), dt, level);
    hero.update(dt, toAnimationParameters(controller));
    profiler.record({ updateMs: performance.now() - updateStart, renderMs: ticker.deltaMS, allocations: 0 });
  });

  return {
    app,
    hero,
    level,
    getController: () => controller,
    getProfilerStats: () => profiler.stats,
    destroy: () => app.destroy(true, { children: true })
  };
}

function readInput() {
  return {
    moveX: 0,
    jumpPressed: false
  };
}
