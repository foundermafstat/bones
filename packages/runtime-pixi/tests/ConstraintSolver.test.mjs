import assert from "node:assert/strict";
import test from "node:test";
import { ConstraintSolver } from "../dist/index.js";

const world = {
  raycastDown(x, y, distance) {
    return { hit: true, x, y: y + distance - 4, normalX: 0.5, normalY: 1 };
  }
};

test("corrects foot when grounded", () => {
  const solver = new ConstraintSolver(
    {
      feet: [{ footBone: 1, shinBone: 2, thighBone: 3, raycastOffsetX: 4, raycastHeight: 20, maxCorrection: 8, blend: 0.5 }]
    },
    world
  );

  const sample = solver.solve({ grounded: true, "bone.1.worldX": 10, "bone.1.worldY": 20 });
  assert.equal(sample.values.find((value) => value.target === 1 && value.property === "transform.y").value, 4);
  assert.equal(sample.values.find((value) => value.target === 2).value, 2);
  assert.equal(sample.values.find((value) => value.target === 3).value, 1);
});

test("disables correction in air", () => {
  const solver = new ConstraintSolver({ feet: [{ footBone: 1, raycastOffsetX: 0, raycastHeight: 20, maxCorrection: 8, blend: 1 }] }, world);
  assert.equal(solver.solve({ grounded: false }).values.length, 0);
});

test("uses surface normal for foot rotation", () => {
  const solver = new ConstraintSolver({ feet: [{ footBone: 1, raycastOffsetX: 0, raycastHeight: 20, maxCorrection: 8, blend: 1 }] }, world);
  const rotation = solver.solve({ grounded: true }).values.find((value) => value.property === "transform.rotation").value;
  assert.equal(rotation, Math.atan2(0.5, 1));
});
