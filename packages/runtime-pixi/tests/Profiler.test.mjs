import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeProfiler, qualityPresets } from "../dist/index.js";

test("tracks runtime profiler averages and max values", () => {
  const profiler = new RuntimeProfiler();
  profiler.record({ updateMs: 1, renderMs: 2, allocations: 0 });
  const stats = profiler.record({ updateMs: 3, renderMs: 4, allocations: 1 });

  assert.equal(stats.frames, 2);
  assert.equal(stats.avgUpdateMs, 2);
  assert.equal(stats.maxRenderMs, 4);
  assert.equal(stats.allocations, 1);
});

test("exposes mobile quality presets", () => {
  assert.equal(qualityPresets.low.antialias, false);
  assert.equal(qualityPresets.high.enableSecondaryMotion, true);
});
