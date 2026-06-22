import assert from "node:assert/strict";
import test from "node:test";

import {
  createAddBoneCommand,
  createAddSvgPartCommand,
  applyTransactionCommand,
  beginProjectTransaction,
  commitProjectTransaction,
  createApplyPoseCommand,
  createApplyPoseBlendCommand,
  createBlendPoseCommand,
  createAddKeyframeCommand,
  createAddTimelineEventCommand,
  createAddTimelineMarkerCommand,
  createAddAnimationTrackCommand,
  createAnimationClipCommand,
  createApplyCurvePresetCommand,
  createApplyCurvePresetToSelectionCommand,
  createChangeCurveCommand,
  createCopyPoseCommand,
  createCopySelectedKeysCommand,
  createDeleteSelectedKeysCommand,
  createBindPartToBoneCommand,
  createDeleteBoneCommand,
  createEditPathPointCommand,
  createConvertLineToCubicCommand,
  createGroupedCommand,
  createMirrorBoneBranchCommand,
  createMirrorBoneTransformCommand,
  createMoveBoneCommand,
  createMoveKeyframeCommand,
  createNormalizeLoopCommand,
  createPasteKeysCommand,
  createPastePoseCommand,
  createPoseToKeyframesCommand,
  createRenameBoneCommand,
  createReverseClipCommand,
  createRotateBoneCommand,
  createReversePartPathCommand,
  createSetBlendTreeCommand,
  createSetInitialStateCommand,
  createSetPathClosedCommand,
  createSetCurvePreviewCommand,
  createSetKeyframeAtTimeCommand,
  createSetStateMachineParameterCommand,
  createSetStateMachinePreviewCommand,
  createSetTransitionConditionsCommand,
  createSetKeyframeTangentsCommand,
  createRetimeClipCommand,
  createScaleSelectedKeysCommand,
  createSelectTrackKeysCommand,
  createSetTimelineSelectionCommand,
  createSetParentCommand,
  createSimplifyPartPathCommand,
  createSmoothPartPathCommand,
  createRenameStateMachineStateCommand,
  createStateMachineStateCommand,
  createTransitionCommand,
  createUpdateStateMachineStateCommand,
  createUpdateTransitionCommand,
  createUpdateProceduralCommand,
  executeCommand,
  initialEditorProject,
  redo,
  rollbackProjectTransaction,
  undo
} from "../app/editorState.ts";
import { vectorizeSvgPart } from "../app/editorVectorImport.ts";

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

test("project transaction commit groups changes and rollback returns the base container", () => {
  const base = freshContainer();
  const transaction = applyTransactionCommand(applyTransactionCommand(beginProjectTransaction(base, "Move body twice"), createMoveBoneCommand("body", 4, 0)), createRotateBoneCommand("body", 0.2));

  assert.equal(transaction.current.project.bones.body.x, initialEditorProject.bones.body.x + 4);
  assert.equal(transaction.current.project.bones.body.rotation, 0.2);
  assert.equal(rollbackProjectTransaction(transaction), base);

  const committed = commitProjectTransaction(transaction);
  assert.equal(committed.history.past.length, 1);
  assert.equal(committed.project.bones.body.x, initialEditorProject.bones.body.x + 4);
  assert.equal(committed.project.bones.body.rotation, 0.2);

  const undone = undo(committed);
  assert.deepEqual(undone.project.bones.body, initialEditorProject.bones.body);
});

test("command validation hook receives source-compatible project after command", () => {
  let validationCount = 0;
  const container = executeCommand(freshContainer(), createMoveBoneCommand("body", 1, 0), {
    validate(project) {
      assert.equal(project.bones.body.x, initialEditorProject.bones.body.x + 1);
      validationCount += 1;
    }
  });

  assert.equal(validationCount, 1);
  assert.equal(container.project.bones.body.x, initialEditorProject.bones.body.x + 1);
});

test("set parent undo restores the original parent", () => {
  const container = executeCommand(freshContainer(), createSetParentCommand("head", "root"));
  assert.equal(container.project.parents.head, "root");

  const undone = undo(container);
  assert.equal(undone.project.parents.head, "body");
});

test("delete bone rebinds children and parts and removes animation pose procedural refs", () => {
  const project = structuredClone(initialEditorProject);
  project.procedural = {
    ...project.procedural,
    secondaryMotion: { ...project.procedural.secondaryMotion, target: "upperArmFront" },
    breathing: { ...project.procedural.breathing, affectedBones: ["upperArmFront"], affectedBoneTransforms: { upperArmFront: { rotation: 0.2 } } }
  };
  const deleted = executeCommand(freshContainer(project), createDeleteBoneCommand("upperArmFront"));

  assert.equal(deleted.project.bones.upperArmFront, undefined);
  assert.equal(deleted.project.parents.forearmFront, "body");
  assert.equal(deleted.project.parts.upperArmFrontShape.boneId, "body");
  assert.equal(deleted.project.animations.walk.tracks["upperArmFront.rotation"], undefined);
  assert.equal(deleted.project.poses.jump_start.boneTransforms.upperArmFront, undefined);
  assert.equal(deleted.project.procedural.secondaryMotion.target, "body");
  assert.deepEqual(deleted.project.procedural.breathing.affectedBones, ["body"]);

  const undone = undo(deleted);
  assert.ok(undone.project.bones.upperArmFront);
  assert.equal(undone.project.parents.forearmFront, "upperArmFront");
  assert.ok(undone.project.animations.walk.tracks["upperArmFront.rotation"]);
  assert.ok(undone.project.poses.jump_start.boneTransforms.upperArmFront);
});

test("mirror bone transform and branch copy mirrored transforms to opposite side", () => {
  const project = structuredClone(initialEditorProject);
  project.bones.upperArmFront = { x: 64, y: -40, rotation: 0.35, scaleX: 1.1, scaleY: 0.9 };
  project.bones.forearmFront = { x: 12, y: 42, rotation: -0.25, scaleX: 1, scaleY: 1.2 };

  const mirroredOne = executeCommand(freshContainer(project), createMirrorBoneTransformCommand("upperArmFront"));
  assert.deepEqual(mirroredOne.project.bones.upperArmBack, { x: -64, y: -40, rotation: -0.35, scaleX: 1.1, scaleY: 0.9 });

  const mirroredBranch = executeCommand(freshContainer(project), createMirrorBoneBranchCommand("upperArmFront"));
  assert.deepEqual(mirroredBranch.project.bones.upperArmBack, { x: -64, y: -40, rotation: -0.35, scaleX: 1.1, scaleY: 0.9 });
  assert.deepEqual(mirroredBranch.project.bones.forearmBack, { x: -12, y: 42, rotation: 0.25, scaleX: 1, scaleY: 1.2 });

  const undone = undo(mirroredBranch);
  assert.deepEqual(undone.project.bones.upperArmBack, project.bones.upperArmBack);
  assert.deepEqual(undone.project.bones.forearmBack, project.bones.forearmBack);
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

test("shape path commands close reverse smooth simplify and convert lines to cubic", () => {
  const project = structuredClone(initialEditorProject);
  project.parts.bodyShape = {
    ...project.parts.bodyShape,
    type: "path",
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ],
    pathCommands: [
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 10, y: 0 },
      { type: "L", x: 10, y: 10 },
      { type: "L", x: 0, y: 10 }
    ]
  };

  const closed = executeCommand(freshContainer(project), createSetPathClosedCommand("bodyShape", true));
  assert.equal(closed.project.parts.bodyShape.pathCommands.at(-1).type, "Z");

  const cubic = executeCommand(closed, createConvertLineToCubicCommand("bodyShape", 1));
  assert.equal(cubic.project.parts.bodyShape.pathCommands[1].type, "C");

  const reversed = executeCommand(cubic, createReversePartPathCommand("bodyShape"));
  assert.equal(reversed.project.parts.bodyShape.pathCommands[0].type, "M");

  const smoothed = executeCommand(reversed, createSmoothPartPathCommand("bodyShape", 0.18));
  assert.ok(smoothed.project.parts.bodyShape.pathCommands.length >= 4);

  const simplified = executeCommand(smoothed, createSimplifyPartPathCommand("bodyShape", 0.05));
  assert.ok(simplified.project.parts.bodyShape.points.length >= 3);

  const undone = undo(simplified);
  assert.deepEqual(undone.project.parts.bodyShape, smoothed.project.parts.bodyShape);
});

test("vectorize SVG part merges multiple path elements", async () => {
  const svg = `<svg viewBox="0 0 20 10"><path d="M 0 0 L 4 0 L 4 4 Z" /><path d="M 10 0 L 14 0 L 14 4 Z" /></svg>`;
  const part = {
    id: "multiSvg",
    boneId: "body",
    type: "svg",
    pivot: [0, 0],
    points: [],
    preset: undefined,
    assetPath: "/multi.svg"
  };
  const vectorized = await vectorizeSvgPart(part, async () => svg);

  assert.equal(vectorized.type, "path");
  assert.equal(vectorized.pathCommands.filter((command) => command.type === "M").length, 2);
  assert.deepEqual(vectorized.svgViewBox, [0, 0, 20, 10]);
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
  assert.equal(container.project.animations.idle.tracks["body.scaleY"], undefined);
  assert.ok(container.project.animations.idle.tracks["torso.scaleY"]);
  assert.equal(container.project.procedural.squashStretch.targetBone, "torso");
  assert.equal(container.project.dirtyParts.includes("body"), false);
  assert.equal(container.project.dirtyScopes.bones.includes("body"), false);

  const undone = undo(container);
  assert.ok(undone.project.bones.body);
  assert.equal(undone.project.parts.bodyShape.boneId, "body");
  assert.equal(undone.project.parents.head, "body");
  assert.ok(undone.project.animations.idle.tracks["body.scaleY"]);
});

test("rename bone updates pose transform keys", () => {
  const project = structuredClone(initialEditorProject);
  project.poses.test_pose = {
    id: "test_pose",
    name: "Test Pose",
    boneTransforms: { body: { ...project.bones.body, y: -260 } },
    tags: ["test"]
  };
  const container = executeCommand(freshContainer(project), createRenameBoneCommand("body", "torso"));

  assert.equal(container.project.poses.test_pose.boneTransforms.body, undefined);
  assert.ok(container.project.poses.test_pose.boneTransforms.torso);
});

test("svg parts can be added and rebound through commands", () => {
  const part = {
    id: "testSvgShape",
    boneId: "head",
    type: "svg",
    pivot: [0, 0],
    points: [],
    preset: undefined,
    assetPath: "/assets/shadow-hero-silhouette/part_01_rear_head_hair.svg",
    zIndex: 9
  };
  const added = executeCommand(freshContainer(), createAddSvgPartCommand(part));
  assert.equal(added.project.parts.testSvgShape.type, "svg");
  assert.equal(added.project.parts.testSvgShape.boneId, "head");
  assert.equal(added.project.parts.testSvgShape.assetPath, part.assetPath);

  const rebound = executeCommand(added, createBindPartToBoneCommand("testSvgShape", "body"));
  assert.equal(rebound.project.parts.testSvgShape.boneId, "body");
  assert.deepEqual(rebound.project.parts.testSvgShape.pivot, [0, 0]);

  const undone = undo(rebound);
  assert.equal(undone.project.parts.testSvgShape.boneId, "head");
});

test("pose apply restores bone transforms, deforms, and part properties", () => {
  const project = structuredClone(initialEditorProject);
  project.poses.test_pose = {
    id: "test_pose",
    name: "Test Pose",
    boneTransforms: { body: { ...project.bones.body, y: -270 } },
    deforms: { bodyShape: [[0, 0], [4, 0], [4, 8]] },
    partProperties: { bodyShape: { drawOrder: 12 } },
    tags: ["test"]
  };
  const container = executeCommand(freshContainer(project), createApplyPoseCommand("test_pose"));

  assert.equal(container.project.bones.body.y, -270);
  assert.deepEqual(container.project.parts.bodyShape.points, [[0, 0], [4, 0], [4, 8]]);
  assert.equal(container.project.parts.bodyShape.zIndex, 12);

  const undone = undo(container);
  assert.deepEqual(undone.project.bones.body, project.bones.body);
  assert.deepEqual(undone.project.parts.bodyShape, project.parts.bodyShape);
});

test("copy and paste pose create an undoable pose copy", () => {
  const copied = executeCommand(freshContainer(), createCopyPoseCommand("jump_peak"));
  assert.equal(copied.project.poseClipboard?.id, "jump_peak");

  const pasted = executeCommand(copied, createPastePoseCommand("jump_peak_pasted"));
  assert.equal(pasted.project.poses.jump_peak_pasted.name, "Jump peak Pasted");

  const undone = undo(pasted);
  assert.equal(undone.project.poses.jump_peak_pasted, undefined);
  assert.equal(undone.project.poseClipboard?.id, "jump_peak");
});

test("pose blend applies weighted transforms and creates reusable blended pose", () => {
  const project = structuredClone(initialEditorProject);
  project.poses.pose_a = {
    id: "pose_a",
    name: "Pose A",
    boneTransforms: { body: { x: 0, y: -250, rotation: 0, scaleX: 1, scaleY: 1 } },
    tags: ["a"]
  };
  project.poses.pose_b = {
    id: "pose_b",
    name: "Pose B",
    boneTransforms: { body: { x: 20, y: -230, rotation: 1, scaleX: 1.2, scaleY: 0.8 } },
    tags: ["b"]
  };

  const applied = executeCommand(freshContainer(project), createApplyPoseBlendCommand("pose_b", 0.5));
  assert.deepEqual(applied.project.bones.body, { x: 10, y: -240, rotation: 0.5, scaleX: 1.1, scaleY: 0.9 });

  const blended = executeCommand(freshContainer(project), createBlendPoseCommand("pose_a", "pose_b", "pose_ab", 0.25));
  assert.deepEqual(blended.project.poses.pose_ab.boneTransforms.body, { x: 5, y: -245, rotation: 0.25, scaleX: 1.05, scaleY: 0.95 });
  assert.deepEqual(blended.project.poses.pose_ab.tags, ["a", "b", "blend"]);
});

test("pose to keyframes writes transform tracks at current time", () => {
  const keyed = executeCommand(freshContainer(), createPoseToKeyframesCommand("jump_start", "jump", 0.1));

  assert.equal(keyed.project.animations.jump.tracks["body.x"].find((key) => key.time === 0.1)?.value, 0);
  assert.equal(keyed.project.animations.jump.tracks["body.y"].find((key) => key.time === 0.1)?.value, -244);
  assert.equal(keyed.project.animations.jump.tracks["body.rotation"].find((key) => key.time === 0.1)?.value, -0.06);
  assert.ok(keyed.project.timeline.selectedKeyIds.some((id) => id.includes("jump_start-body.rotation")));

  const undone = undo(keyed);
  assert.deepEqual(undone.project.animations.jump, initialEditorProject.animations.jump);
});

test("timeline creates clips and copies selected keys with snapping", () => {
  const created = executeCommand(freshContainer(), createAnimationClipCommand("test_clip", "Test Clip", 1, true));
  assert.equal(created.project.timeline.selectedClipId, "test_clip");
  assert.equal(created.project.animations.test_clip.frameRate, 60);

  const withKey = executeCommand(created, createAddBoneCommand("body", "timelineBone"));
  const selected = executeCommand(withKey, createSetTimelineSelectionCommand("idle", ["idle-body-1"]));
  const copied = executeCommand(selected, createCopySelectedKeysCommand());
  assert.equal(copied.project.timeline.keyClipboard.length, 1);

  const pasted = executeCommand(copied, createPasteKeysCommand("idle", 0.1));
  assert.equal(pasted.project.timeline.selectedKeyIds.length, 1);
  assert.ok(pasted.project.animations.idle.tracks["body.scaleY"].some((key) => key.id.startsWith("idle-body-1_paste")));
});

test("timeline can create clip, track, and authored keyframes", () => {
  const created = executeCommand(freshContainer(), createAnimationClipCommand("testWalk", "testWalk", 1, true));
  const withTrack = executeCommand(created, createAddAnimationTrackCommand("testWalk", "body.scaleY"));
  const key0 = executeCommand(withTrack, createAddKeyframeCommand("testWalk", "body.scaleY", { id: "testWalk-0", time: 0, value: 1, interpolation: "linear" }));
  const key1 = executeCommand(key0, createAddKeyframeCommand("testWalk", "body.scaleY", { id: "testWalk-05", time: 0.5, value: 1.1, interpolation: "linear" }));
  const key2 = executeCommand(key1, createAddKeyframeCommand("testWalk", "body.scaleY", { id: "testWalk-1", time: 1, value: 1, interpolation: "linear" }));

  assert.equal(key2.project.animations.testWalk.duration, 1);
  assert.equal(key2.project.animations.testWalk.loop, true);
  assert.deepEqual(key2.project.animations.testWalk.tracks["body.scaleY"].map((key) => key.value), [1, 1.1, 1]);
});

test("timeline can set a keyed value at the current time without duplicates", () => {
  const created = executeCommand(freshContainer(), createSetKeyframeAtTimeCommand("idle", "body.x", 0.25, 12));
  assert.equal(created.project.animations.idle.tracks["body.x"].length, 1);
  assert.equal(created.project.animations.idle.tracks["body.x"][0].value, 12);

  const updated = executeCommand(created, createSetKeyframeAtTimeCommand("idle", "body.x", 0.25, 18));
  assert.equal(updated.project.animations.idle.tracks["body.x"].length, 1);
  assert.equal(updated.project.animations.idle.tracks["body.x"][0].value, 18);

  const undone = undo(updated);
  assert.equal(undone.project.animations.idle.tracks["body.x"][0].value, 12);
});

test("timeline moves selected keys together with undo", () => {
  const selected = executeCommand(freshContainer(), createSetTimelineSelectionCommand("walk", ["walk-body-x-1", "walk-head-1"]));
  const moved = executeCommand(selected, createMoveKeyframeCommand("walk", "body.x", "walk-body-x-1", 0.5));

  assert.equal(moved.project.animations.walk.tracks["body.x"].find((key) => key.id === "walk-body-x-1")?.time, 0.5);
  assert.equal(moved.project.animations.walk.tracks["head.rotation"].find((key) => key.id === "walk-head-1")?.time, 0.5);

  const undone = undo(moved);
  assert.equal(undone.project.animations.walk.tracks["body.x"].find((key) => key.id === "walk-body-x-1")?.time, 0.42);
  assert.equal(undone.project.animations.walk.tracks["head.rotation"].find((key) => key.id === "walk-head-1")?.time, 0.42);
});

test("timeline can select track keys scale selected keys and delete selection", () => {
  const selectedTrack = executeCommand(freshContainer(), createSelectTrackKeysCommand("walk", "body.x"));
  const selectedIds = selectedTrack.project.animations.walk.tracks["body.x"].map((key) => key.id);
  assert.deepEqual(selectedTrack.project.timeline.selectedKeyIds, selectedIds);

  const scaled = executeCommand(selectedTrack, createScaleSelectedKeysCommand(1.25));
  assert.equal(scaled.project.animations.walk.tracks["body.x"][1].time, 0.5333333333333333);

  const deleted = executeCommand(scaled, createDeleteSelectedKeysCommand());
  assert.equal(deleted.project.animations.walk.tracks["body.x"], undefined);
  assert.deepEqual(deleted.project.timeline.selectedKeyIds, []);

  const undone = undo(deleted);
  assert.deepEqual(undone.project.animations.walk.tracks["body.x"], scaled.project.animations.walk.tracks["body.x"]);
});

test("timeline retime, reverse, normalize loop, events, and markers are undoable", () => {
  const retimed = executeCommand(freshContainer(), createRetimeClipCommand("walk", 1.44));
  assert.equal(retimed.project.animations.walk.duration, 1.44);
  assert.equal(retimed.project.animations.walk.events[0].time, 0.06857142857142857);

  const reversed = executeCommand(retimed, createReverseClipCommand("walk"));
  assert.ok(reversed.project.animations.walk.events[0].time < reversed.project.animations.walk.events[1].time);

  const normalized = executeCommand(reversed, createNormalizeLoopCommand("walk"));
  assert.ok(Object.values(normalized.project.animations.walk.tracks).every((keys) => keys.some((key) => Math.abs(key.time - normalized.project.animations.walk.duration) < 0.0001)));

  const marked = executeCommand(normalized, createAddTimelineMarkerCommand("walk", { id: "breakdown", time: 0.5, label: "Breakdown" }));
  const evented = executeCommand(marked, createAddTimelineEventCommand("walk", { id: "cue", time: 0.5, type: "cue" }));
  const footstep = executeCommand(evented, createAddTimelineEventCommand("walk", { id: "footstep", time: 0.25, type: "footstep", payload: { foot: "front" } }));
  assert.ok(evented.project.animations.walk.markers.some((marker) => marker.id === "breakdown"));
  assert.ok(evented.project.animations.walk.events.some((event) => event.id === "cue"));
  assert.deepEqual(footstep.project.animations.walk.events.find((event) => event.id === "footstep")?.payload, { foot: "front" });

  const undone = undo(footstep);
  assert.equal(undone.project.animations.walk.events.some((event) => event.id === "footstep"), false);
  const undoneCue = undo(undone);
  assert.equal(undoneCue.project.animations.walk.events.some((event) => event.id === "cue"), false);
});

test("curve presets, tangents, and preview state are undoable", () => {
  const preset = executeCommand(freshContainer(), createApplyCurvePresetCommand("jump", "body.y", "jump-body-y-0", "anticipation"));
  const key = preset.project.animations.jump.tracks["body.y"][0];
  assert.equal(key.interpolation, "bezier");
  assert.equal(key.curvePreset, "anticipation");
  assert.deepEqual(key.curve, [0.35, -0.35, 0.65, 1]);

  const bezier = executeCommand(preset, createApplyCurvePresetCommand("jump", "body.y", "jump-body-y-0", "bezier"));
  assert.equal(bezier.project.animations.jump.tracks["body.y"][0].curvePreset, "bezier");
  assert.deepEqual(bezier.project.animations.jump.tracks["body.y"][0].curve, [0.2, 0.8, 0.2, 1]);

  const changed = executeCommand(bezier, createChangeCurveCommand("jump", "body.y", "jump-body-y-0", "spring", [0.25, 1.35, 0.35, 1], "spring"));
  const restored = undo(changed);
  assert.equal(restored.project.animations.jump.tracks["body.y"][0].curvePreset, "bezier");
  assert.deepEqual(restored.project.animations.jump.tracks["body.y"][0].curve, [0.2, 0.8, 0.2, 1]);

  const tangent = executeCommand(preset, createSetKeyframeTangentsCommand("jump", "body.y", "jump-body-y-0", -0.2, 0.35));
  assert.equal(tangent.project.animations.jump.tracks["body.y"][0].tangentIn, -0.2);
  assert.equal(tangent.project.animations.jump.tracks["body.y"][0].tangentOut, 0.35);

  const preview = executeCommand(tangent, createSetCurvePreviewCommand("jump", "land", 0.8));
  assert.deepEqual(preview.project.timeline.curvePreview, { fromClipId: "jump", toClipId: "land", weight: 0.8 });
  assert.deepEqual(preview.project.dirtyScopes.preview, ["curvePreview"]);

  const undone = undo(preview);
  assert.deepEqual(undone.project.timeline.curvePreview, tangent.project.timeline.curvePreview);
});

test("curve preset can be applied to selected keys as a batch", () => {
  const selected = executeCommand(freshContainer(), createSetTimelineSelectionCommand("jump", ["jump-body-y-0", "jump-body-y-1"]));
  const batch = executeCommand(selected, createApplyCurvePresetToSelectionCommand("overshoot"));

  const keys = batch.project.animations.jump.tracks["body.y"];
  assert.equal(keys.find((key) => key.id === "jump-body-y-0")?.curvePreset, "overshoot");
  assert.equal(keys.find((key) => key.id === "jump-body-y-1")?.curvePreset, "overshoot");
  assert.deepEqual(keys.find((key) => key.id === "jump-body-y-0")?.curve, [0.2, 1.35, 0.35, 1]);

  const undone = undo(batch);
  assert.equal(undone.project.animations.jump.tracks["body.y"].find((key) => key.id === "jump-body-y-0")?.curvePreset, undefined);
});

test("state machine graph commands edit states, transitions, parameters, blend tree, and preview", () => {
  const withState = executeCommand(freshContainer(), createStateMachineStateCommand({ id: "run", clipId: "walk", tags: ["locomotion"] }));
  assert.ok(withState.project.stateMachine.states.some((state) => state.id === "run"));

  const clipped = executeCommand(withState, createUpdateStateMachineStateCommand("run", { clipId: "jump" }));
  assert.equal(clipped.project.stateMachine.states.find((state) => state.id === "run").clipId, "jump");

  const initial = executeCommand(clipped, createSetInitialStateCommand("run"));
  assert.equal(initial.project.stateMachine.initialStateId, "run");

  const renamed = executeCommand(initial, createRenameStateMachineStateCommand("run", "sprint"));
  assert.ok(renamed.project.stateMachine.states.some((state) => state.id === "sprint"));

  const eased = executeCommand(renamed, createUpdateTransitionCommand("idle-walk", { easing: "easeInOut", duration: 0.22 }));
  assert.equal(eased.project.stateMachine.transitions.find((transition) => transition.id === "idle-walk").easing, "easeInOut");

  const conditioned = executeCommand(eased, createSetTransitionConditionsCommand("idle-walk", [{ parameter: "absSpeed", op: ">", value: 10 }]));
  assert.deepEqual(conditioned.project.stateMachine.transitions.find((transition) => transition.id === "idle-walk").conditions, [{ parameter: "absSpeed", op: ">", value: 10 }]);

  const parameter = executeCommand(conditioned, createSetStateMachineParameterCommand("absSpeed", 96));
  assert.equal(parameter.project.stateMachine.parameters.absSpeed, 96);

  const blend = executeCommand(parameter, createSetBlendTreeCommand("locomotion", { type: "1d", parameter: "absSpeed", children: [{ threshold: 0, clipId: "idle" }, { threshold: 80, clipId: "walk" }, { threshold: 150, clipId: "walk" }] }));
  assert.equal(blend.project.stateMachine.states.find((state) => state.id === "locomotion").blendTree.children.length, 3);

  const preview = executeCommand(blend, createSetStateMachinePreviewCommand("idle", "walk", 0.9));
  assert.deepEqual(preview.project.stateMachine.preview, { fromStateId: "idle", toStateId: "walk", weight: 0.9 });
  assert.deepEqual(preview.project.dirtyScopes.preview, ["stateMachinePreview"]);

  const undone = undo(preview);
  assert.deepEqual(undone.project.stateMachine.preview, blend.project.stateMachine.preview);
});

test("undo and redo restore timeline selection and graph preview ui snapshots", () => {
  const selected = executeCommand(freshContainer(), createSetTimelineSelectionCommand("walk", ["walk-body-x-1", "walk-head-1"]));
  const previewed = executeCommand(selected, createSetStateMachinePreviewCommand("idle", "walk", 0.75));
  const moved = executeCommand(previewed, createAddBoneCommand("body", "snapshotBone"));

  assert.equal(moved.project.selectedBoneId, "snapshotBone");

  const undone = undo(moved);
  assert.equal(undone.project.selectedBoneId, initialEditorProject.selectedBoneId);
  assert.equal(undone.project.timeline.selectedClipId, "walk");
  assert.deepEqual(undone.project.timeline.selectedKeyIds, ["walk-body-x-1", "walk-head-1"]);
  assert.deepEqual(undone.project.stateMachine.preview, { fromStateId: "idle", toStateId: "walk", weight: 0.75 });

  const redone = redo(undone);
  assert.equal(redone.project.selectedBoneId, "snapshotBone");
  assert.deepEqual(redone.project.timeline.selectedKeyIds, ["walk-body-x-1", "walk-head-1"]);
  assert.deepEqual(redone.project.stateMachine.preview, { fromStateId: "idle", toStateId: "walk", weight: 0.75 });
});

test("state machine transition can be authored with conditions and timing", () => {
  const transition = {
    id: "idle-jump",
    fromStateId: "idle",
    toStateId: "jump",
    duration: 0.12,
    easing: "anticipation",
    priority: 10,
    canInterrupt: true,
    syncMode: "none",
    conditions: [{ parameter: "jumpPressed", op: "==", value: true }]
  };
  const authored = executeCommand(freshContainer(), createTransitionCommand(transition));
  assert.deepEqual(authored.project.stateMachine.transitions.find((item) => item.id === "idle-jump"), transition);
});

test("procedural command edits inputs, secondary motion, squash rules, and foot ik", () => {
  const updated = executeCommand(
    freshContainer(),
    createUpdateProceduralCommand({
      inputs: { ...initialEditorProject.procedural.inputs, velocityX: 120, wind: 0.4 },
      breathing: { ...initialEditorProject.procedural.breathing, enabled: true, amplitude: 1.5, affectedBones: ["body", "head"] },
      secondaryMotion: { ...initialEditorProject.procedural.secondaryMotion, gravityInfluence: 0.22, windInfluence: 0.18, maxOffset: 18 },
      squashStretch: { ...initialEditorProject.procedural.squashStretch, rules: [...initialEditorProject.procedural.squashStretch.rules, { condition: "damageHit", scaleX: 1.08, scaleY: 0.9, duration: 0.1 }] },
      footIk: { ...initialEditorProject.procedural.footIk, enabled: true, feet: ["footFront", "footBack"], maxCorrection: 10, blend: 0.85 }
    })
  );

  assert.equal(updated.project.procedural.inputs.velocityX, 120);
  assert.equal(updated.project.procedural.breathing.amplitude, 1.5);
  assert.equal(updated.project.procedural.secondaryMotion.maxOffset, 18);
  assert.ok(updated.project.procedural.squashStretch.rules.some((rule) => rule.condition === "damageHit"));
  assert.equal(updated.project.procedural.footIk.enabled, true);
  assert.deepEqual(updated.project.procedural.footIk.feet, ["footFront", "footBack"]);

  const undone = undo(updated);
  assert.deepEqual(undone.project.procedural, initialEditorProject.procedural);
});
