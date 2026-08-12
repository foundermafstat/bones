import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMiloReporterProject } from "../app/characterTemplates.ts";
import { createReplaceKeyframeRangeCommand, createSetKeyframeAtTimeCommand, createSetTimelineAutoKeyCommand } from "../app/editorState.ts";
import { fromSourceProject, toSourceProject } from "../app/editorSourceProject.ts";
import { createProjectExportBundle } from "../app/projectIo.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const base = resolve(root, "apps/editor/public/assets/mascots/milo-reporter");

test("Milo v3 has 31 bones, 71 active parts, independent eyes, and round-trips", () => {
  const project = createMiloReporterProject("Milo Reporter");
  assert.equal(project.characterKind, "cat");
  assert.equal(project.hierarchy.length, 31);
  assert.equal(Object.keys(project.parts).length, 71);
  assert.equal(Object.keys(project.animations).length, 10);
  assert.equal(project.visualSlots.eyes, undefined);
  assert.equal(Object.keys(project.parts).some((id) => /^eyes_/.test(id)), false);
  assert.deepEqual(project.visualSlots["eye.left.expression"].partIds, [
    "eyelid_left_neutral", "eyelid_left_blink", "eyelid_left_happy", "eyelid_left_sad", "eyelid_left_angry", "eyelid_left_surprised"
  ]);
  assert.deepEqual(project.visualSlots["eye.right.pupil"].partIds, ["pupil_right_slit", "pupil_right_medium", "pupil_right_round"]);
  assert.equal(project.visualSlots.mouth.partIds.length, 21);
  assert.deepEqual(project.visualSlots["slot.paw_closed_left_v3"].partIds, ["paw_closed_left_v3", "paw_open_left_v3"]);
  assert.deepEqual(project.visualSlots["slot.paw_closed_right_v3"].partIds, ["paw_closed_right_v3", "paw_open_right_v3"]);
  assert.deepEqual(project.facialRig?.expressionSlots, { left: "eye.left.expression", right: "eye.right.expression" });
  assert.deepEqual(project.facialRig?.pupilSlots, { left: "eye.left.pupil", right: "eye.right.pupil" });
  assert.deepEqual(project.facialRig?.eyeAimBones, { left: "eyeAimLeft", right: "eyeAimRight" });
  assert.deepEqual(project.facialRig?.irisParallaxParts, { left: "eye_iris_left", right: "eye_iris_right" });
  assert.deepEqual(project.facialRig?.irisOrigins, { left: [-40, -15], right: [40, -15] });
  assert.equal(project.facialRig?.irisParallax, 0.25);
  assert.deepEqual(project.facialRig?.gazeBounds, { x: [-6, 6], y: [-3.5, 3.5] });
  assert.deepEqual(Object.keys(project.facialRig?.gazeBoundsByExpression ?? {}).sort(), [
    "eyelid_left_angry", "eyelid_left_blink", "eyelid_left_happy", "eyelid_left_neutral", "eyelid_left_sad", "eyelid_left_surprised",
    "eyelid_right_angry", "eyelid_right_blink", "eyelid_right_happy", "eyelid_right_neutral", "eyelid_right_sad", "eyelid_right_surprised"
  ]);
  assert.equal(project.facialRig?.linkedByDefault, true);
  assert.equal(Object.values(project.parts).every((part) => part.aspectLocked === true && part.intrinsicSize?.every(Number.isFinite)), true);
  assert.equal(project.animations.talk_happy.tracks["slot:mouth.attachment"].every((key) => key.interpolation === "step"), true);
  assert.equal(project.animations.talk_happy.tracks["slot:mouth.attachment"].length >= 30, true);
  assert.equal(project.animations.idle_neutral.tracks["eyeAimLeft.x"].length > 2, true);
  assert.equal(project.animations.idle_neutral.tracks["eyeAimRight.x"].some((key, index) => key.value !== project.animations.idle_neutral.tracks["eyeAimLeft.x"][index]?.value), true);
  assert.equal(project.parts.eye_iris_left.boneId, "head");
  assert.equal(project.parts.eye_iris_right.boneId, "head");
  assert.equal(project.parts.eye_white_left.opacity, 0);
  assert.equal(project.parts.eye_white_right.opacity, 0);
  assert.equal(project.parts.pupil_left_medium.boneId, "eyeAimLeft");
  assert.equal(project.parts.pupil_right_medium.boneId, "eyeAimRight");
  assert.equal(project.animations.idle_neutral.tracks["eyeAimLeft.x"].every((key) => Math.abs(key.value) <= 6), true);
  assert.equal(project.animations.idle_neutral.tracks["eyeAimRight.y"].every((key) => Math.abs(key.value) <= 3.5), true);
  assert.equal(project.animations.idle_neutral.tracks["part:eye_iris_left.x"].every((key) => Math.abs(key.value + 40) <= 1.5), true);
  assert.equal(project.animations.idle_neutral.tracks["part:eye_iris_right.y"].every((key) => Math.abs(key.value + 15) <= 0.875), true);
  const idleLeftBlink = project.animations.idle_neutral.tracks["slot:eye.left.expression.attachment"].find((key) => key.value === "eyelid_left_blink");
  const idleRightBlink = project.animations.idle_neutral.tracks["slot:eye.right.expression.attachment"].find((key) => key.value === "eyelid_right_blink");
  assert.notEqual(idleLeftBlink.time, idleRightBlink.time);
  assert.equal(project.animations.greeting.tracks["slot:eye.left.expression.attachment"].some((key) => key.value === "eyelid_left_blink"), true);
  assert.equal(project.animations.greeting.tracks["slot:eye.right.expression.attachment"].some((key) => key.value === "eyelid_right_blink"), false);
  assert.equal(project.animations.surprise_reaction.tracks["slot:eye.left.pupil.attachment"].some((key) => key.value === "pupil_left_round"), true);
  assert.equal(project.animations.explain_point.tracks["slot:slot.paw_closed_right_v3.attachment"].some((key) => key.value === "paw_open_right_v3"), true);
  assert.equal(project.animations.explain_point.tracks["part:forearm_right_v3.deform"].some((key) => key.value.some((value) => value !== 0)), true);
  assert.equal(project.animations.discuss_two_hands.tracks["part:forearm_left_v3.deform"].length > 2, true);
  assert.equal(project.animations.surprise_reaction.tracks["pawLeft.scaleX"].some((key) => key.value === 1.25), true);
  assert.deepEqual(Object.keys(project.poses).sort(), ["arms_neutral", "reach_both", "reach_left", "reach_right"]);
  assert.equal(project.animations.greeting.events.some((event) => event.type === "reporter.complete"), true);

  const restored = fromSourceProject(toSourceProject(project));
  assert.equal(restored.characterKind, "cat");
  assert.deepEqual(restored.facialRig, project.facialRig);
  assert.deepEqual(restored.visualSlots.mouth.partIds, project.visualSlots.mouth.partIds);
  assert.deepEqual(restored.parts.forearm_left_v3.intrinsicSize, project.parts.forearm_left_v3.intrinsicSize);
  assert.equal(restored.parts.forearm_left_v3.aspectLocked, true);
  assert.deepEqual(restored.animations.talk_happy.tracks["slot:mouth.attachment"], project.animations.talk_happy.tracks["slot:mouth.attachment"]);
});

test("Milo eyes use per-expression safe-zones without an active head mask", () => {
  const source = JSON.parse(readFileSync(resolve(base, "milo-reporter.source.rig.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(base, "milo-reporter.manifest.json"), "utf8"));
  const rig = source.rigs[0];
  const bones = Object.fromEntries(rig.bones.map((bone) => [bone.id, bone]));
  const parts = Object.fromEntries(rig.parts.map((part) => [part.id, part]));
  const slots = Object.fromEntries(rig.visualSlots.map((slot) => [slot.id, slot]));
  const bases = { left: [-40, -15], right: [40, -15] };
  const expressions = ["neutral", "blink", "happy", "sad", "angry", "surprised"];
  const expectedEyelidIds = ["left", "right"].flatMap((side) => expressions.map((expression) => `eyelid_${side}_${expression}`)).sort();
  const facialRig = rig.editor.custom.facialRig;

  assert.equal(rig.parts.length, 71);
  assert.equal(parts.head_shell.drawOrder, 20);
  assert.equal(parts.head_shell.mesh.texture.endsWith("/head_shell_v5.png"), true);
  assert.equal(slots["slot.head_shell"].drawOrder, 20);
  assert.deepEqual(slots["slot.head_shell"].partIds, ["head_shell"]);
  assert.equal(rig.parts.some((part) => /(?:head.*safe.*mask|eye.*safe.*mask)/i.test(part.id)), false);
  assert.equal(manifest.activeAssetPaths.some((path) => /(?:head_shell_v6|safe[_-]?mask)/i.test(path)), false);

  assert.deepEqual(facialRig.gazeBounds, { x: [-6, 6], y: [-3.5, 3.5] });
  assert.equal(facialRig.irisParallax, 0.25);
  assert.deepEqual(Object.keys(facialRig.gazeBoundsByExpression).sort(), expectedEyelidIds);
  for (const eyelidId of expectedEyelidIds) {
    const bounds = facialRig.gazeBoundsByExpression[eyelidId];
    assert.ok(bounds, `${eyelidId}: missing gaze bounds`);
    for (const axis of ["x", "y"]) {
      assert.equal(Array.isArray(bounds[axis]) && bounds[axis].length === 2 && bounds[axis].every(Number.isFinite), true, `${eyelidId}: invalid ${axis} bounds`);
      assert.equal(bounds[axis][0] <= 0 && bounds[axis][1] >= 0, true, `${eyelidId}: ${axis} bounds must contain center`);
      assert.equal(bounds[axis][0] >= facialRig.gazeBounds[axis][0] && bounds[axis][1] <= facialRig.gazeBounds[axis][1], true, `${eyelidId}: ${axis} exceeds global safe-zone`);
    }
  }

  const contain = ([sourceWidth, sourceHeight], [maxWidth, maxHeight]) => {
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    return [sourceWidth * scale, sourceHeight * scale];
  };

  for (const side of ["left", "right"]) {
    const titleSide = side[0].toUpperCase() + side.slice(1);
    const aimBoneId = `eyeAim${titleSide}`;
    const irisId = `eye_iris_${side}`;
    const base = bases[side];
    assert.deepEqual([bones[aimBoneId].local.x, bones[aimBoneId].local.y], [0, 0]);
    assert.deepEqual([parts[irisId].local.x, parts[irisId].local.y], base);
    assert.equal(parts[irisId].boneId, "head");

    for (const shape of ["slit", "medium", "round"]) {
      const pupil = parts[`pupil_${side}_${shape}`];
      assert.equal(pupil.boneId, aimBoneId);
      assert.deepEqual([pupil.local.x, pupil.local.y], base);
      assert.equal(pupil.drawOrder < slots[`eye.${side}.expression`].drawOrder, true);
      const intrinsic = pupil.editor.custom.intrinsicSize;
      const xs = pupil.mesh.vertices.filter((_, index) => index % 2 === 0);
      const ys = pupil.mesh.vertices.filter((_, index) => index % 2 === 1);
      const actual = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
      const previous = contain(intrinsic, [16, 25]);
      const expected = contain(intrinsic, [19.2, 30]);
      assert.equal(actual.every((value, index) => Math.abs(value - expected[index]) < 1e-9), true, `${pupil.id}: expected 20% larger contain box`);
      assert.equal(actual.every((value, index) => Math.abs(value / previous[index] - 1.2) < 1e-9), true, `${pupil.id}: visual scale is not +20%`);
      assert.equal(Math.abs((actual[0] / actual[1]) / (intrinsic[0] / intrinsic[1]) - 1) <= 0.005, true, `${pupil.id}: aspect lock drifted`);
    }
    for (const expression of expressions) {
      const eyelid = parts[`eyelid_${side}_${expression}`];
      assert.equal(eyelid.boneId, "head");
      assert.deepEqual([eyelid.local.x, eyelid.local.y], base);
      assert.equal(parts[irisId].drawOrder < eyelid.drawOrder, true);
    }

    for (const clip of source.animations) {
      const findTrack = (kind, id, property) => clip.tracks.find((track) => track.target.kind === kind && track.target.id === id && track.property === property);
      const expressionTrack = findTrack("slot", `eye.${side}.expression`, "attachment");
      const aimX = findTrack("bone", aimBoneId, "transform.x");
      const aimY = findTrack("bone", aimBoneId, "transform.y");
      const irisX = findTrack("part", irisId, "transform.x");
      const irisY = findTrack("part", irisId, "transform.y");
      assert.ok(expressionTrack && aimX && aimY && irisX && irisY, `${clip.id}: missing ${side} eye track`);
      assert.equal(aimX.keyframes.every((keyframe) => Math.abs(keyframe.value) <= 6), true, `${clip.id}: ${side} gaze x escaped safe-zone`);
      assert.equal(aimY.keyframes.every((keyframe) => Math.abs(keyframe.value) <= 3.5), true, `${clip.id}: ${side} gaze y escaped safe-zone`);
      const activeExpressionAt = (time) => expressionTrack.keyframes.reduce((active, keyframe) => keyframe.time <= time ? keyframe.value : active, expressionTrack.keyframes[0].value);
      for (const [axis, aimTrack] of [["x", aimX], ["y", aimY]]) {
        for (const keyframe of aimTrack.keyframes) {
          const eyelidId = activeExpressionAt(keyframe.time);
          const bounds = facialRig.gazeBoundsByExpression[eyelidId][axis];
          assert.equal(keyframe.value >= bounds[0] && keyframe.value <= bounds[1], true, `${clip.id}: ${side} ${axis} escaped ${eyelidId} aperture`);
        }
      }
      for (const [aimTrack, irisTrack, baseValue] of [[aimX, irisX, base[0]], [aimY, irisY, base[1]]]) {
        assert.deepEqual(irisTrack.keyframes.map((keyframe) => keyframe.time), aimTrack.keyframes.map((keyframe) => keyframe.time));
        assert.equal(irisTrack.keyframes.every((keyframe, index) => Math.abs(keyframe.value - (baseValue + aimTrack.keyframes[index].value * 0.25)) < 1e-9), true, `${clip.id}: ${side} iris parallax lost its absolute base`);
      }
    }
  }
});

test("Milo v3 limbs use dense weighted meshes and bounded forward deformation", () => {
  const source = JSON.parse(readFileSync(resolve(base, "milo-reporter.source.rig.json"), "utf8"));
  const parts = Object.fromEntries(source.rigs[0].parts.map((part) => [part.id, part]));
  for (const side of ["left", "right"]) {
    for (const segment of ["upper_arm", "forearm"]) {
      const part = parts[`${segment}_${side}_v3`];
      assert.equal(part.mesh.vertices.length, 4 * 6 * 2);
      assert.equal(part.mesh.skin.length, 4 * 6);
      assert.equal(part.mesh.skin.every((vertex) => Math.abs(vertex.reduce((sum, influence) => sum + influence.weight, 0) - 1) < 1e-9), true);
    }
    for (const paw of ["paw_closed", "paw_open"]) {
      const part = parts[`${paw}_${side}_v3`];
      assert.equal(part.mesh.vertices.length, 4 * 4 * 2);
      assert.equal(part.mesh.skin.length, 4 * 4);
    }
  }

  const explain = source.animations.find((clip) => clip.id === "explain_point");
  for (const segment of ["upper_arm_right_v3", "forearm_right_v3"]) {
    const part = parts[segment];
    const ys = part.mesh.vertices.filter((_, index) => index % 2 === 1);
    const baseLength = Math.max(...ys) - Math.min(...ys);
    const deform = explain.tracks.find((track) => track.target.id === segment && track.property === "deform").keyframes[1].value;
    const deformedYs = ys.map((value, index) => value + deform[index * 2 + 1]);
    const retained = (Math.max(...deformedYs) - Math.min(...deformedYs)) / baseLength;
    assert.equal(retained >= 0.25 && retained <= 0.35, true, `${segment} retained ${retained}`);
    const baseBottomWidth = Math.abs(part.mesh.vertices.at(-4) - part.mesh.vertices.at(-2));
    const deformedBottomWidth = Math.abs((part.mesh.vertices.at(-4) + deform.at(-4)) - (part.mesh.vertices.at(-2) + deform.at(-2)));
    assert.equal(deformedBottomWidth / baseBottomWidth <= 1.2 + 1e-9, true);
  }
  const pawScaleX = explain.tracks.find((track) => track.target.id === "pawRight" && track.property === "transform.scaleX");
  const pawScaleY = explain.tracks.find((track) => track.target.id === "pawRight" && track.property === "transform.scaleY");
  assert.deepEqual(pawScaleX.keyframes.map((key) => key.value), pawScaleY.keyframes.map((key) => key.value));
  assert.equal(Math.max(...pawScaleX.keyframes.map((key) => key.value)) <= 1.25, true);
});

test("Milo streaming speech replaces a mouth range and undoes as one command", () => {
  const project = createMiloReporterProject("Milo Reporter");
  const before = project.animations.talk_neutral.tracks["slot:mouth.attachment"];
  const command = createReplaceKeyframeRangeCommand("talk_neutral", "slot:mouth.attachment", 0.5, 0.75, [
    { time: 0.5, value: "mouth_neutral_ai", interpolation: "step" },
    { time: 0.567, value: "mouth_neutral_e", interpolation: "step" },
    { time: 0.633, value: "mouth_neutral_ou", interpolation: "step" }
  ]);
  const changed = command.do(project);
  const stream = changed.animations.talk_neutral.tracks["slot:mouth.attachment"];
  assert.equal(stream.some((key) => key.value === "mouth_neutral_ou" && key.time >= 0.63 && key.time <= 0.64), true);
  assert.equal(stream.filter((key) => key.time >= 0.5 && key.time <= 0.75).every((key) => key.interpolation === "step"), true);
  assert.deepEqual(command.undo(changed).animations.talk_neutral.tracks["slot:mouth.attachment"], before);
});

test("Milo independent eye attachment keys support auto key and command undo", () => {
  const project = createMiloReporterProject("Milo Reporter");
  const autoKey = createSetTimelineAutoKeyCommand(false);
  const autoKeyed = autoKey.do(project);
  assert.equal(autoKeyed.timeline.autoKey, false);
  assert.equal(autoKey.undo(autoKeyed).timeline.autoKey, project.timeline.autoKey);

  const trackId = "slot:eye.left.expression.attachment";
  const before = project.animations.talk_happy.tracks[trackId];
  const command = createSetKeyframeAtTimeCommand("talk_happy", trackId, 0.117, "eyelid_left_blink", "step");
  const changed = command.do(project);
  assert.equal(changed.animations.talk_happy.tracks[trackId].some((key) => key.value === "eyelid_left_blink" && Math.abs(key.time - 7 / 60) < 0.0001), true);
  assert.deepEqual(command.undo(changed).animations.talk_happy.tracks[trackId], before);
});

test("Milo v3 generated source, compiled output, and 71 active RGBA assets are deterministic", () => {
  execFileSync(process.execPath, [resolve(root, "scripts/build-milo-reporter.mjs"), "--check"], { cwd: root });
  const source = JSON.parse(readFileSync(resolve(base, "milo-reporter.source.rig.json"), "utf8"));
  const compiled = JSON.parse(readFileSync(resolve(base, "milo-reporter.compiled.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(base, "milo-reporter.manifest.json"), "utf8"));
  assert.equal(source.schemaVersion, "1.2.0");
  assert.equal(compiled.compiledFormatVersion, "1.1.0");
  assert.equal(manifest.counts.bones, 31);
  assert.equal(manifest.counts.totalParts, 71);
  assert.equal(manifest.counts.eyeParts, 22);
  assert.equal(manifest.activeAssetPaths.length, 71);
  assert.equal(new Set(manifest.activeAssetPaths).size, 71);
  assert.equal(manifest.activeAssetPaths.every((path) => existsSync(resolve(root, "apps/editor/public", path.replace(/^\//, "")))), true);
  assert.equal(Object.values(manifest.bindings).every((binding) => binding.aspectLocked && binding.intrinsicSize.length === 2 && binding.baseAspectError <= 0.005), true);
  assert.equal(manifest.qa.finalLookLocked.face, true);
  assert.equal(manifest.qa.calibratedClosedPawToHeadWidth.role, "paw-size-only");
  const pupilTrack = compiled.animations
    .find((clip) => compiled.lookups.animations.surprise_reaction === clip.id)
    .tracks.find((track) => track.targetKind === "slot" && track.target === compiled.lookups.visualSlots["eye.left.pupil"]);
  assert.equal(pupilTrack.keyframes.every((key) => typeof key.value === "number" && key.interpolation === "step"), true);
});

test("Milo production export includes every v3 texture variant", async () => {
  const bundle = await createProjectExportBundle(createMiloReporterProject("Milo Reporter"));
  assert.equal(bundle.validation.ok, true, bundle.validation.errors.join("\n"));
  assert.equal(bundle.assetFiles.length, 71);
  assert.equal(bundle.assetFiles.some((asset) => asset.sourcePath.endsWith("mouth_surprised_round.png")), true);
  assert.equal(bundle.assetFiles.some((asset) => asset.sourcePath.endsWith("pupil_left_round.png")), true);
  assert.equal(bundle.assetFiles.some((asset) => asset.sourcePath.endsWith("paw_open_right_v3.png")), true);
  const visual = JSON.parse(bundle.files["hero.visual.compiled.json"]);
  assert.equal(visual.rig.visualSlots.find((slot) => slot.id === "mouth").partIds.length, 21);
  assert.equal(visual.rig.visualSlots.find((slot) => slot.id === "eye.left.expression").partIds.length, 6);
  const torsoSlotIndex = visual.lookups.visualSlots["slot.chest_upper_coat"];
  assert.equal(visual.rig.visualSlots[torsoSlotIndex].id, "slot.chest_upper_coat");
  assert.equal(visual.rig.skins[0].attachments.find((attachment) => attachment.slot === torsoSlotIndex).part, visual.lookups.parts.chest_upper_coat);
});
