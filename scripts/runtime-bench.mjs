import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { compileRig, validateProject } from "../packages/compiler/dist/index.js";
import { RigInstance, RuntimeProfiler, evaluateRuntimeBudget, runtimePerformanceBudgets } from "../packages/runtime-pixi/dist/index.js";

const source = validateProject(JSON.parse(await readFile(new URL("../examples/shadow-hero/source.json", import.meta.url), "utf8")));
const compiled = compileRig(source);
assert.equal(compiled.rig.parts.some((part) => part.type === "svg"), false, "compiled benchmark rig must not contain SVG parts");

const qualities = ["low", "medium", "high"];
const heroCounts = [1, 10, 50];
const frames = 180;
const warmupFrames = 20;
const results = [];

for (const quality of qualities) {
  for (const heroCount of heroCounts) {
    const rigs = Array.from({ length: heroCount }, () => new RigInstance(compiled, { quality }));
    for (let frame = 0; frame < warmupFrames; frame += 1) {
      for (const rig of rigs) {
        rig.update(1 / 60, paramsForFrame(frame));
      }
    }

    const profiler = new RuntimeProfiler();
    for (let frame = 0; frame < frames; frame += 1) {
      const start = performance.now();
      for (const rig of rigs) {
        rig.update(1 / 60, paramsForFrame(frame));
      }
      profiler.record({ updateMs: performance.now() - start, renderMs: 0, allocations: 0 });
    }

    const stats = profiler.stats;
    const budgetKey = `hero${heroCount}`;
    const budget = runtimePerformanceBudgets[quality][budgetKey];
    const budgetResult = evaluateRuntimeBudget(stats, budget);
    results.push({
      quality,
      heroes: heroCount,
      frames,
      avgUpdateMs: Number(stats.avgUpdateMs.toFixed(3)),
      maxUpdateMs: Number(stats.maxUpdateMs.toFixed(3)),
      budget,
      ok: budgetResult.ok,
      issues: budgetResult.issues
    });
  }
}

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
assert.equal(failed.length, 0, failed.map((result) => `${result.quality}/${result.heroes}: ${result.issues.join("; ")}`).join("\n"));

function paramsForFrame(frame) {
  const cycle = (frame % 60) / 60;
  return {
    absSpeed: cycle < 0.5 ? 1 : 0.25,
    grounded: frame % 90 < 70,
    jumpPressed: frame % 90 === 70,
    landed: frame % 90 === 0,
    velocityY: cycle < 0.5 ? -2 : 3,
    moveX: cycle < 0.5 ? 1 : -0.4
  };
}
