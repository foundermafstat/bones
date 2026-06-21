import assert from "node:assert/strict";
import test from "node:test";

import {
  createAddBoneCommand,
  createEditPathPointCommand,
  createGroupedCommand,
  createMoveBoneCommand,
  createRenameBoneCommand,
  createRotateBoneCommand,
  createSetParentCommand,
  executeCommand,
  initialEditorProject,
  redo,
  undo
} from "../app/editorState.ts";

function freshContainer(project = structuredClone(initialEditorProject)) {
  return { project, history: { past: [], future: [] } };
}

test("bone commands update dirty scopes and autosave state", () => {
  const beforeX = initialEditorProject.bones.body.x;
  const container = executeCommand(freshContainer(), createMoveBoneCommand("body", 4, 0));

  assert.equal(container.project.bones.body.x, beforeX + 4);
  assert.equal(container.project.dirty, true);
  assert.deepEqual(container.project.dirtyScopes.bones, ["body"]);
  assert.equal(container.project.autosave.status, "pending");
  assert.equal(container.project.autosave.revision, 1);
  assert.ok(container.project.autosave.nextSaveAt >= container.project.autosave.lastChangedAt);

  const undone = undo(container);
  assert.equal(undone.project.bones.body.x, beforeX);
  assert.equal(undone.history.future.length, 1);

  const redone = redo(undone);
  assert.equal(redone.project.bones.body.x, beforeX + 4);
  assert.equal(redone.history.past.length, 1);
});

test("undo restores selection around selection-changing commands", () => {
  const container = executeCommand(freshContainer(), createAddBoneCommand("body", "testBone"));
  assert.equal(container.project.selectedBoneId, "testBone");

  const undone = undo(container);
  assert.equal(undone.project.selectedBoneId, "body");
  assert.equal(undone.project.bones.testBone, undefined);

  const redone = redo(undone);
  assert.equal(redone.project.selectedBoneId, "testBone");
  assert.ok(redone.project.bones.testBone);
});

test("set parent undo restores the original parent", () => {
  const container = executeCommand(freshContainer(), createSetParentCommand("head", "root"));
  assert.equal(container.project.parents.head, "root");

  const undone = undo(container);
  assert.equal(undone.project.parents.head, "body");
});

test("grouped commands undo in reverse as one history entry", () => {
  const command = createGroupedCommand("Move and rotate", [createMoveBoneCommand("body", 2, 3), createRotateBoneCommand("body", 0.25)]);
  const container = executeCommand(freshContainer(), command);

  assert.equal(container.history.past.length, 1);
  assert.equal(container.project.bones.body.x, initialEditorProject.bones.body.x + 2);
  assert.equal(container.project.bones.body.y, initialEditorProject.bones.body.y + 3);
  assert.equal(container.project.bones.body.rotation, 0.25);

  const undone = undo(container);
  assert.deepEqual(undone.project.bones.body, initialEditorProject.bones.body);
});

test("path point command restores deleted points exactly", () => {
  const project = structuredClone(initialEditorProject);
  project.parts.bodyShape = {
    ...project.parts.bodyShape,
    type: "path",
    points: [
      [0, 0],
      [10, 0],
      [10, 10]
    ]
  };
  const container = executeCommand(freshContainer(project), createEditPathPointCommand("bodyShape", 1));
  assert.deepEqual(container.project.parts.bodyShape.points, [
    [0, 0],
    [10, 10]
  ]);

  const undone = undo(container);
  assert.deepEqual(undone.project.parts.bodyShape.points, [
    [0, 0],
    [10, 0],
    [10, 10]
  ]);
});

test("rename bone keeps metadata and bound parts connected", () => {
  const project = structuredClone(initialEditorProject);
  project.boneMetadata.body = { locked: true, mirrorGroup: "center" };
  const container = executeCommand(freshContainer(project), createRenameBoneCommand("body", "torso"));

  assert.equal(container.project.bones.body, undefined);
  assert.ok(container.project.bones.torso);
  assert.deepEqual(container.project.boneMetadata.torso, { locked: true, mirrorGroup: "center" });
  assert.equal(container.project.parts.bodyShape.boneId, "torso");
  assert.equal(container.project.parents.head, "torso");

  const undone = undo(container);
  assert.ok(undone.project.bones.body);
  assert.equal(undone.project.parts.bodyShape.boneId, "body");
  assert.equal(undone.project.parents.head, "body");
});
