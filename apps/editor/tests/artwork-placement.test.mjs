import assert from "node:assert/strict";
import test from "node:test";

import { compileRig } from "@bones/compiler";

import {
  createPlacementFrame,
  movePlacement,
  rotatePlacement,
  scalePlacement
} from "../app/artworkPlacement.ts";
import {
  createUpdatePartTransformCommand,
  executeCommand,
  initialEditorProject,
  undo
} from "../app/editorState.ts";
import { fromSourceProject, toSourceProject } from "../app/editorSourceProject.ts";

const identityBone = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const rectanglePart = {
  id: "test-part",
  boneId: "body",
  type: "mesh",
  pivot: [0, 0],
  points: [],
  preset: undefined,
  mesh: {
    vertices: [-10, -10, 10, -10, 10, 10, -10, 10],
    indices: [0, 1, 2, 0, 2, 3]
  },
  offset: [0, 0],
  rotation: 0,
  scale: [1, 1]
};

test("placement frame follows offset, rotation, scale, and pivot in bone space", () => {
  const part = { ...rectanglePart, offset: [5, 7], scale: [2, 3] };
  const frame = createPlacementFrame(part, { ...identityBone, x: 100, y: 50 });
  assert.ok(frame);
  assert.deepEqual(frame.corners.nw, [85, 27]);
  assert.deepEqual(frame.corners.se, [125, 87]);
  assert.deepEqual(frame.pivot, [105, 57]);
});

test("placement frame follows the current skinned vertices", () => {
  const part = {
    ...rectanglePart,
    mesh: {
      ...rectanglePart.mesh,
      skin: [
        [{ boneId: "body", weight: 1, x: 0, y: 0 }],
        [{ boneId: "arm", weight: 1, x: 0, y: 0 }],
        [{ boneId: "arm", weight: 1, x: 10, y: 10 }],
        [{ boneId: "body", weight: 1, x: 0, y: 10 }]
      ]
    }
  };
  const bones = {
    body: identityBone,
    arm: { ...identityBone, x: 20 }
  };
  const frame = createPlacementFrame(part, bones.body, bones);
  assert.ok(frame);
  assert.deepEqual(frame.corners.nw, [0, 0]);
  assert.deepEqual(frame.corners.se, [30, 10]);
});

test("moving artwork converts world drag into the selected bone local offset", () => {
  const moved = movePlacement(rectanglePart, { ...identityBone, rotation: Math.PI / 2, scaleX: 2 }, [0, 0], [0, 20]);
  assert.ok(Math.abs(moved.offset[0] - 10) < 0.000001);
  assert.ok(Math.abs(moved.offset[1]) < 0.000001);
});

test("free and aspect-locked scale keep the opposite handle anchored", () => {
  const free = scalePlacement(rectanglePart, identityBone, "e", [30, 0]);
  assert.deepEqual(free?.scale, [2, 1]);
  assert.deepEqual(free?.offset, [10, 0]);

  const locked = scalePlacement({ ...rectanglePart, aspectLocked: true }, identityBone, "se", [30, 30]);
  assert.deepEqual(locked?.scale, [2, 2]);
  assert.deepEqual(locked?.offset, [10, 10]);
});

test("scale dragging preserves mirrored signs and minimum magnitude", () => {
  const mirrored = scalePlacement({ ...rectanglePart, scale: [-1, 1] }, identityBone, "e", [20, 0]);
  assert.equal(mirrored?.scale[0], -0.02);
  assert.equal(mirrored?.scale[1], 1);
});

test("rotation handle applies the pointer angle around the artwork pivot", () => {
  const rotated = rotatePlacement(rectanglePart, identityBone, [10, 0], [0, 10]);
  assert.ok(Math.abs(rotated.rotation - Math.PI / 2) < 0.000001);
});

test("one placement command is one undo step and round-trips through save, reload, and compile", () => {
  const project = structuredClone(initialEditorProject);
  const partId = "bodyShape";
  const before = project.parts[partId];
  const container = { project, history: { past: [], future: [] } };
  const changed = executeCommand(container, createUpdatePartTransformCommand(partId, {
    offset: [12, -8],
    rotation: 0.35,
    scale: [1.4, 0.85]
  }));
  assert.equal(changed.history.past.length, 1);
  assert.deepEqual(changed.project.parts[partId].offset, [12, -8]);
  assert.deepEqual(changed.project.parts[partId].scale, [1.4, 0.85]);

  const reverted = undo(changed);
  assert.deepEqual(reverted.project.parts[partId], before);

  const restored = fromSourceProject(toSourceProject(changed.project));
  assert.deepEqual(restored.parts[partId].offset, [12, -8]);
  assert.equal(restored.parts[partId].rotation, 0.35);
  assert.deepEqual(restored.parts[partId].scale, [1.4, 0.85]);

  const compiled = compileRig(toSourceProject(restored));
  const compiledPartId = compiled.lookups.parts[partId];
  assert.deepEqual(compiled.rig.parts.find((part) => part.id === compiledPartId)?.local, [12, -8, 0.35, 1.4, 0.85, 0, 0]);
});
