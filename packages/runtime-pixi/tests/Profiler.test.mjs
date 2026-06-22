import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeProfiler, evaluateRuntimeBudget, qualityPresets, runtimePerformanceBudgets } from "../dist/index.js";

test("tracks runtime profiler averages and max values", () => {
  const profiler = new RuntimeProfiler();
  profiler.record({ updateMs: 1, renderMs: 2, allocations: 0 });
  const stats = profiler.record({ updateMs: 3, renderMs: 4, allocations: 1 });

  assert.equal(stats.frames, 2);
  assert.equal(stats.avgUpdateMs, 2);
  assert.equal(stats.maxRenderMs, 4);
  assert.equal(stats.allocations, 1);
});

test("reuses profiler stats snapshot between records", () => {
  const profiler = new RuntimeProfiler();
  const first = profiler.record({ updateMs: 1, renderMs: 1, allocations: 0 });
  const second = profiler.record({ updateMs: 2, renderMs: 2, allocations: 0 });

  assert.equal(first, second);
  assert.equal(second.frames, 2);
});

test("exposes mobile quality presets", () => {
  assert.equal(qualityPresets.low.antialias, false);
  assert.equal(qualityPresets.low.resolution, 1);
  assert.equal(qualityPresets.medium.clothFps, 45);
  assert.equal(qualityPresets.high.enableSecondaryMotion, true);
});

test("evaluates runtime performance budgets", () => {
  const ok = evaluateRuntimeBudget({ frames: 120, avgUpdateMs: 0.5, avgRenderMs: 1, maxUpdateMs: 2, maxRenderMs: 2, allocations: 0 }, runtimePerformanceBudgets.low.hero1);
  const bad = evaluateRuntimeBudget({ frames: 120, avgUpdateMs: 3, avgRenderMs: 1, maxUpdateMs: 9, maxRenderMs: 2, allocations: 1 }, runtimePerformanceBudgets.low.hero1);

  assert.equal(ok.ok, true);
  assert.equal(bad.ok, false);
  assert.equal(bad.issues.length, 3);
});
