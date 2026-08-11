import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { sampleAnimationClip } from "../dist/AnimationSampler.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const compiled = JSON.parse(readFileSync(resolve(root, "apps/editor/public/assets/fighters/pulse/pulse.compiled.json"), "utf8"));

test("loads and samples every Pulse clip at representative and event boundaries", () => {
  const rig = compiled;
  assert.equal(rig.rig.bones.length, 38);
  assert.equal(rig.rig.parts.length, 21);
  assert.equal(rig.animations.length, 50);

  for (const clip of rig.animations) {
    const sampleTimes = new Set([0, clip.duration / 2, clip.duration, ...(clip.events ?? []).map((event) => event.time)]);
    for (const time of sampleTimes) {
      const sample = sampleAnimationClip(clip, time);
      assert.equal(Number.isFinite(sample.localTime), true);
      for (const value of sample.values) assertFiniteValue(value.value);
    }
  }
});

function assertFiniteValue(value) {
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true);
    return;
  }
  if (Array.isArray(value)) value.forEach(assertFiniteValue);
}
