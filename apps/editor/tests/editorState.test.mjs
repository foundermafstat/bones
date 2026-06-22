import assert from "node:assert/strict";
import test from "node:test";

import {
  createAddBoneCommand,
  createAddSvgPartCommand,
  createApplyPoseCommand,
  createAddKeyframeCommand,
  createAddTimelineEventCommand,
  createAddTimelineMarkerCommand,
  createAddAnimationTrackCommand,
  createAnimationClipCommand,
  createApplyCurvePresetCommand,
  createChangeCurveCommand,
  createCopyPoseCommand,
  createCopySelectedKeysCommand,
  createBindPartToBoneCommand,
  createEditPathPointCommand,
  createGroupedCommand,
  createMoveBoneCommand,
  createNormalizeLoopCommand,
  createPasteKeysCommand,
  createPastePoseCommand,
  createRenameBoneCommand,
  createReverseClipCommand,
  createRotateBoneCommand,
  createSetBlendTreeCommand,
  createSetCurvePreviewCommand,
  createSetStateMachineParameterCommand,
  createSetStateMachinePreviewCommand,
  createSetTransitionConditionsCommand,
  createSetKeyframeTangentsCommand,
  createRetimeClipCommand,
  createSetTimelineSelectionCommand,
  createSetParentCommand,
  createStateMachineStateCommand,
  createUpdateTransitionCommand,
  createUpdateProceduralCommand,
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
  assert.ok(evented.project.animations.walk.markers.some((marker) => marker.id === "breakdown"));
  assert.ok(evented.project.animations.walk.events.some((event) => event.id === "cue"));

  const undone = undo(evented);
  assert.equal(undone.project.animations.walk.events.some((event) => event.id === "cue"), false);
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

  const undone = undo(preview);
  assert.deepEqual(undone.project.timeline.curvePreview, tangent.project.timeline.curvePreview);
});

test("state machine graph commands edit states, transitions, parameters, blend tree, and preview", () => {
  const withState = executeCommand(freshContainer(), createStateMachineStateCommand({ id: "run", clipId: "walk", tags: ["locomotion"] }));
  assert.ok(withState.project.stateMachine.states.some((state) => state.id === "run"));

  const eased = executeCommand(withState, createUpdateTransitionCommand("idle-walk", { easing: "easeInOut", duration: 0.22 }));
  assert.equal(eased.project.stateMachine.transitions.find((transition) => transition.id === "idle-walk").easing, "easeInOut");

  const conditioned = executeCommand(eased, createSetTransitionConditionsCommand("idle-walk", [{ parameter: "absSpeed", op: ">", value: 10 }]));
  assert.deepEqual(conditioned.project.stateMachine.transitions.find((transition) => transition.id === "idle-walk").conditions, [{ parameter: "absSpeed", op: ">", value: 10 }]);

  const parameter = executeCommand(conditioned, createSetStateMachineParameterCommand("absSpeed", 96));
  assert.equal(parameter.project.stateMachine.parameters.absSpeed, 96);

  const blend = executeCommand(parameter, createSetBlendTreeCommand("locomotion", { type: "1d", parameter: "absSpeed", children: [{ threshold: 0, clipId: "idle" }, { threshold: 80, clipId: "walk" }, { threshold: 150, clipId: "walk" }] }));
  assert.equal(blend.project.stateMachine.states.find((state) => state.id === "locomotion").blendTree.children.length, 3);

  const preview = executeCommand(blend, createSetStateMachinePreviewCommand("idle", "walk", 0.9));
  assert.deepEqual(preview.project.stateMachine.preview, { fromStateId: "idle", toStateId: "walk", weight: 0.9 });

  const undone = undo(preview);
  assert.deepEqual(undone.project.stateMachine.preview, blend.project.stateMachine.preview);
});

test("procedural command edits inputs, secondary motion, squash rules, and foot ik", () => {
  const updated = executeCommand(
    freshContainer(),
    createUpdateProceduralCommand({
      inputs: { ...initialEditorProject.procedural.inputs, velocityX: 120, wind: 0.4 },
      secondaryMotion: { ...initialEditorProject.procedural.secondaryMotion, gravityInfluence: 0.22, windInfluence: 0.18, maxOffset: 18 },
      squashStretch: { ...initialEditorProject.procedural.squashStretch, rules: [...initialEditorProject.procedural.squashStretch.rules, { condition: "damageHit", scaleX: 1.08, scaleY: 0.9, duration: 0.1 }] },
      footIk: { ...initialEditorProject.procedural.footIk, enabled: true, maxCorrection: 10, blend: 0.85 }
    })
  );

  assert.equal(updated.project.procedural.inputs.velocityX, 120);
  assert.equal(updated.project.procedural.secondaryMotion.maxOffset, 18);
  assert.ok(updated.project.procedural.squashStretch.rules.some((rule) => rule.condition === "damageHit"));
  assert.equal(updated.project.procedural.footIk.enabled, true);

  const undone = undo(updated);
  assert.deepEqual(undone.project.procedural, initialEditorProject.procedural);
});
