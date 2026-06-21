import assert from "node:assert/strict";
import test from "node:test";
import { ProceduralLayerStack } from "../dist/index.js";

test("generates breathing offsets", () => {
  const stack = new ProceduralLayerStack([
    {
      type: "breathing",
      enabled: true,
      frequency: 0.25,
      amplitude: 1,
      affectedBones: {
        1: { "transform.y": -0.8, "transform.scaleY": 0.025 }
      }
    }
  ]);

  const sample = stack.update(1, {});
  assert.equal(sample.values.length, 2);
  assert.equal(sample.values[0].target, 1);
  assert.ok(sample.values[0].value < -0.79);
});

test("applies landing squash then decays", () => {
  const stack = new ProceduralLayerStack([
    {
      type: "squashStretch",
      rules: [{ condition: "landHeavy", targetBone: 0, scaleX: 1.14, scaleY: 0.82, duration: 0.1 }]
    }
  ]);

  const start = stack.update(0.01, { landHeavy: true });
  assert.ok(start.values.find((value) => value.property === "transform.scaleX").value > 0);

  const end = stack.update(0.2, { landHeavy: false });
  assert.equal(end.values.length, 0);
});

test("adds secondary motion opposite velocity with max offset", () => {
  const stack = new ProceduralLayerStack([
    {
      type: "secondaryMotion",
      targetKind: "part",
      target: 4,
      stiffness: 1,
      damping: 1,
      velocityInfluence: 1,
      gravityInfluence: 0,
      maxOffset: 5
    }
  ]);

  const sample = stack.update(1 / 60, { velocityX: 100 });
  const x = sample.values.find((value) => value.property === "transform.x");
  assert.equal(x.targetKind, "part");
  assert.equal(x.target, 4);
  assert.equal(x.value, -5);
});
