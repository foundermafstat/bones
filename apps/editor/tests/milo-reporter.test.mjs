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

test("Milo v3 has 31 bones, 71 active composite parts, independent eyes, and round-trips", () => {
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
  assert.deepEqual(project.facialRig?.irisOrigins, { left: [-35.5, -21], right: [33.5, -21] });
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
  assert.equal(project.parts.head_reference_exact, undefined);
  assert.equal(project.parts.jaw_chin, undefined);
  assert.equal(project.parts.nose_fixed.boneId, "head");
  assert.equal(project.parts.eye_iris_left.boneId, "head");
  assert.equal(project.parts.eye_iris_right.boneId, "head");
  assert.equal(project.parts.eye_white_left.opacity, 0);
  assert.equal(project.parts.eye_white_right.opacity, 0);
  assert.equal(project.parts.pupil_left_medium.boneId, "eyeAimLeft");
  assert.equal(project.parts.pupil_right_medium.boneId, "eyeAimRight");
  assert.equal(project.animations.idle_neutral.tracks["eyeAimLeft.x"].every((key) => Math.abs(key.value) <= 6), true);
  assert.equal(project.animations.idle_neutral.tracks["eyeAimRight.y"].every((key) => Math.abs(key.value) <= 3.5), true);
  assert.equal(project.animations.idle_neutral.tracks["part:eye_iris_left.x"].every((key) => Math.abs(key.value + 35.5) <= 1.5), true);
  assert.equal(project.animations.idle_neutral.tracks["part:eye_iris_right.y"].every((key) => Math.abs(key.value + 21) <= 0.875), true);
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
  const compiled = JSON.parse(readFileSync(resolve(base, "milo-reporter.compiled.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(base, "milo-reporter.manifest.json"), "utf8"));
  const rig = source.rigs[0];
  const bones = Object.fromEntries(rig.bones.map((bone) => [bone.id, bone]));
  const parts = Object.fromEntries(rig.parts.map((part) => [part.id, part]));
  const slots = Object.fromEntries(rig.visualSlots.map((slot) => [slot.id, slot]));
  const bases = { left: [-35.5, -21], right: [33.5, -21] };
  const expressions = ["neutral", "blink", "happy", "sad", "angry", "surprised"];
  const expectedEyelidIds = ["left", "right"].flatMap((side) => expressions.map((expression) => `eyelid_${side}_${expression}`)).sort();
  const facialRig = rig.editor.custom.facialRig;

  for (const clip of source.animations) {
    for (const track of clip.tracks) {
      assert.equal(new Set(track.keyframes.map((keyframe) => keyframe.time)).size, track.keyframes.length, `${clip.id}/${track.id}: duplicate keyframe time`);
    }
  }

  assert.equal(rig.parts.length, 71);
  assert.equal(parts.head_shell.drawOrder, 20);
  assert.equal(parts.head_shell.mesh.texture.endsWith("/head_shell_v7.png"), true);
  assert.equal(slots["slot.head_shell"].drawOrder, 20);
  assert.deepEqual(slots["slot.head_shell"].partIds, ["head_shell"]);
  assert.equal(rig.parts.some((part) => /(?:head.*safe.*mask|eye.*safe.*mask)/i.test(part.id)), false);
  assert.equal(manifest.activeAssetPaths.some((path) => /(?:head_shell_v6|safe[_-]?mask)/i.test(path)), false);
  assert.deepEqual(manifest.qa.transformOnlyFacialAssets, {
    count: 49,
    sha256: "94035a5fc219e7eb68adbfb1e13848cb80665c797ae40e0e92dc0976b4f12cbf",
    noNewAssets: true
  });
  assert.deepEqual(manifest.qa.authoritativeReferenceLock.tolerancePx, { centers: 1, sizes: 2, earControlPoints: 2 });

  assert.deepEqual(facialRig.gazeBounds, { x: [-6, 6], y: [-3.5, 3.5] });
  assert.equal(facialRig.irisParallax, 0.25);
  assert.deepEqual(Object.keys(facialRig.gazeBoundsByExpression).sort(), expectedEyelidIds);
  assert.deepEqual(Object.keys(facialRig.aperturesByExpression).sort(), expectedEyelidIds);
  assert.equal(expectedEyelidIds.every((id) => id.endsWith("_blink")
    ? facialRig.aperturesByExpression[id].length === 0
    : facialRig.aperturesByExpression[id].length === 48), true);
  assert.equal(compiled.rig.facialApertures.length, 2);
  assert.equal(compiled.rig.facialApertures.every((aperture) => aperture.clippedParts.length === 4 && aperture.regions.length === 6), true);
  assert.deepEqual(manifest.qa.apertureMasksByExpression, { count: 12, padding: 1.25, blinkClosed: true, clipsIrisAndPupil: true });
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
      const expected = contain(intrinsic, [12, 21]);
      assert.equal(actual.every((value, index) => Math.abs(value - expected[index]) < 1e-9), true, `${pupil.id}: expected authoritative contain box`);
      assert.equal(Math.abs((actual[0] / actual[1]) / (intrinsic[0] / intrinsic[1]) - 1) <= 0.005, true, `${pupil.id}: aspect lock drifted`);
    }
    for (const expression of expressions) {
      const eyelid = parts[`eyelid_${side}_${expression}`];
      assert.equal(eyelid.boneId, "head");
      assert.deepEqual([eyelid.local.x, eyelid.local.y], [base[0], -24.5]);
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

test("Milo neutral face geometry is locked to the authoritative landmarks", () => {
  const source = JSON.parse(readFileSync(resolve(base, "milo-reporter.source.rig.json"), "utf8"));
  const rig = source.rigs[0];
  const bones = Object.fromEntries(rig.bones.map((bone) => [bone.id, bone]));
  const parts = Object.fromEntries(rig.parts.map((part) => [part.id, part]));
  const meshSize = (part) => {
    const xs = part.mesh.vertices.filter((_, index) => index % 2 === 0);
    const ys = part.mesh.vertices.filter((_, index) => index % 2 === 1);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  const containSize = ([sourceWidth, sourceHeight], [maxWidth, maxHeight]) => {
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    return [sourceWidth * scale, sourceHeight * scale];
  };
  const within = (actual, expected, tolerance, label) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((value, index) => assert.equal(Math.abs(value - expected[index]) <= tolerance, true, `${label}[${index}] ${value} != ${expected[index]} ± ${tolerance}`));
  };

  within([parts.head_shell.local.x, parts.head_shell.local.y], [0, -5], 1, "head center");
  within(meshSize(parts.head_shell), containSize(parts.head_shell.editor.custom.intrinsicSize, [198, 175]), 2, "head size");
  within([bones.earLeft.local.x, bones.earLeft.local.y], [-63, -86], 2, "left ear control");
  within([bones.earRight.local.x, bones.earRight.local.y], [58, -86], 2, "right ear control");
  within(meshSize(parts.ear_left), containSize(parts.ear_left.editor.custom.intrinsicSize, [58, 89]), 2, "left ear size");
  within(meshSize(parts.ear_right), containSize(parts.ear_right.editor.custom.intrinsicSize, [58, 90]), 2, "right ear size");
  within([parts.eye_iris_left.local.x, parts.eye_iris_left.local.y], [-35.5, -21], 1, "left eye center");
  within([parts.eye_iris_right.local.x, parts.eye_iris_right.local.y], [33.5, -21], 1, "right eye center");
  within(meshSize(parts.eyelid_left_neutral), containSize(parts.eyelid_left_neutral.editor.custom.intrinsicSize, [58, 48]), 2, "left eye size");
  within(meshSize(parts.eyelid_right_neutral), containSize(parts.eyelid_right_neutral.editor.custom.intrinsicSize, [59, 48]), 2, "right eye size");
  within([parts.nose_fixed.local.x, parts.nose_fixed.local.y], [0, 21], 1, "nose center");
  within([bones.jaw.local.x + parts.mouth_neutral_mbp.local.x, bones.jaw.local.y + parts.mouth_neutral_mbp.local.y], [0, 21], 1, "mouth center");
  within(meshSize(parts.mouth_neutral_mbp), containSize(parts.mouth_neutral_mbp.editor.custom.intrinsicSize, [68, 55]), 2, "mouth size");

  const mouthTransforms = rig.parts.filter((part) => part.id.startsWith("mouth_")).map((part) => ({
    intrinsicSize: part.editor.custom.intrinsicSize,
    local: part.local,
    meshSize: meshSize(part)
  }));
  assert.equal(mouthTransforms.length, 21);
  assert.equal(mouthTransforms.every((value) => JSON.stringify(value) === JSON.stringify(mouthTransforms[0])), true);
  assert.equal(parts.eye_white_left.opacity, 0);
  assert.equal(parts.eye_white_right.opacity, 0);
  assert.equal(parts.head_shell.drawOrder < parts.eye_iris_left.drawOrder, true);
  assert.equal(parts.eye_iris_left.drawOrder < parts.pupil_left_medium.drawOrder, true);
  assert.equal(parts.pupil_left_medium.drawOrder < parts.eyelid_left_neutral.drawOrder, true);
  assert.equal(parts.nose_fixed.drawOrder >= parts.mouth_neutral_mbp.drawOrder, true);
});

test("Milo v3 limbs use dense weighted meshes and bounded forward deformation", () => {
  const source = JSON.parse(readFileSync(resolve(base, "milo-reporter.source.rig.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(base, "milo-reporter.manifest.json"), "utf8"));
  const bones = Object.fromEntries(source.rigs[0].bones.map((bone) => [bone.id, bone]));
  const parts = Object.fromEntries(source.rigs[0].parts.map((part) => [part.id, part]));
  const meshSize = (part) => {
    const xs = part.mesh.vertices.filter((_, index) => index % 2 === 0);
    const ys = part.mesh.vertices.filter((_, index) => index % 2 === 1);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
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
    assert.equal(Math.abs(retained - 1) < 1e-9, true, `${segment} must keep its local length while the joint chain shortens`);
    const baseBottomWidth = Math.abs(part.mesh.vertices.at(-4) - part.mesh.vertices.at(-2));
    const deformedBottomWidth = Math.abs((part.mesh.vertices.at(-4) + deform.at(-4)) - (part.mesh.vertices.at(-2) + deform.at(-2)));
    assert.equal(deformedBottomWidth / baseBottomWidth <= 1.2 + 1e-9, true);
  }
  const explainElbow = explain.tracks.find((track) => track.target.id === "elbowRight" && track.property === "transform.y");
  const explainWrist = explain.tracks.find((track) => track.target.id === "wristRight" && track.property === "transform.y");
  assert.equal(explainElbow.keyframes.some((key) => Math.abs(key.value - bones.elbowRight.local.y * 0.3) < 1e-9), true);
  assert.equal(explainWrist.keyframes.some((key) => Math.abs(key.value - bones.wristRight.local.y * 0.28) < 1e-9), true);
  for (const side of ["left", "right"]) {
    const suffix = side === "left" ? "Left" : "Right";
    const direction = side === "left" ? -1 : 1;
    const shoulder = bones[`shoulder${suffix}`];
    const elbow = bones[`elbow${suffix}`];
    const wrist = bones[`wrist${suffix}`];
    const paw = bones[`paw${suffix}`];
    const restingElbowX = shoulder.local.x + Math.cos(shoulder.local.rotation) * elbow.local.x - Math.sin(shoulder.local.rotation) * elbow.local.y;
    const restingForearmRotation = shoulder.local.rotation + elbow.local.rotation;
    const restingWristX = restingElbowX - Math.sin(restingForearmRotation) * wrist.local.y;
    const restingPawX = restingWristX + Math.cos(restingForearmRotation) * paw.local.x - Math.sin(restingForearmRotation) * paw.local.y;
    assert.deepEqual([shoulder.local.x, shoulder.local.y, shoulder.local.rotation], [direction * 145, -18, -direction * 0.25]);
    assert.equal(elbow.local.y, 125, `${side} elbow must keep the established overlap while the seamless forearm hides the sleeve end`);
    assert.equal(elbow.local.x, -direction * 8, `${side} forearm root must align the source alpha centers at the visible joint`);
    assert.equal(elbow.local.rotation, direction * 0.75);
    assert.equal(paw.local.y, 32, `${side} paw must sit below the integrated cuff button`);
    assert.equal(paw.local.x, -direction * 20, `${side} paw must center beneath the integrated cuff opening`);
    assert.equal(Math.abs(restingElbowX) > Math.abs(shoulder.local.x), true, `${side} elbow must lean away from the torso`);
    assert.equal(Math.abs(restingWristX) < Math.abs(restingElbowX), true, `${side} forearm must return inward from the elbow`);
    assert.equal(Math.abs(restingPawX) <= 129, true, `${side} resting paw must stay near the torso`);
    for (const clip of source.animations) {
      const upperRotation = clip.tracks.find((track) => track.target.id === `upperArm${suffix}` && track.property === "transform.rotation");
      assert.equal(upperRotation.keyframes.every((key) => (shoulder.local.rotation + key.value) * -direction > 0), true, `${clip.id}/${side}: elbow drifted toward torso`);
    }
    const upper = parts[`upper_arm_${side}_v3`];
    const forearm = parts[`forearm_${side}_v3`];
    const cuff = parts[`cuff_${side}_v3`];
    const elbowCover = parts[`elbow_cover_${side}_v3`];
    const upperSize = meshSize(upper);
    const forearmSize = meshSize(forearm);
    const cuffSize = meshSize(cuff);
    assert.equal(elbowCover.opacity, 0, `${side} elbow cap must not create a wide visible bulge`);
    assert.equal(forearm.drawOrder > upper.drawOrder, true, `${side} seamless forearm must hide the old upper-sleeve end`);
    assert.equal(Math.abs(upperSize[0] - forearmSize[0]) <= 1, true, `${side} sleeve widths must join without a step`);
    assert.equal(upper.local.x, forearm.local.x, `${side} sleeve centers must meet at the elbow`);
    assert.equal(upperSize[0] >= 71 && upperSize[1] >= 158, true, `${side} upper sleeve must use the wider, longer calibration`);
    assert.equal(forearmSize[0] >= 71 && forearmSize[1] >= 106, true, `${side} approved forearm must keep its calibrated aspect-locked size`);
    assert.equal(cuff.opacity, 0, `${side} cuff must stay hidden so the rounded forearm end remains seamless`);
    assert.equal(cuffSize[0] <= forearmSize[0] + 1, true, `${side} retained legacy cuff must not exceed the forearm width`);
    const upperOverlapRatio = (upperSize[1] - bones[`elbow${side === "left" ? "Left" : "Right"}`].local.y) / upperSize[1];
    assert.equal(upperOverlapRatio >= 0.248 && upperOverlapRatio <= 0.255, true, `${side} restored upper sleeve must retain a deep elbow overlap`);
    assert.equal(forearmSize[1] - bones[`wrist${side === "left" ? "Left" : "Right"}`].local.y >= forearmSize[1] * 0.13, true);
  }
  assert.deepEqual(parts.upper_arm_left_v3.editor.custom.intrinsicSize, parts.upper_arm_right_v3.editor.custom.intrinsicSize, "rounded sleeve pair must keep identical canvases and pivots");
  assert.deepEqual(manifest.references.armSegments, {
    rgba: "source-art/milo-arms-v5-rgba.png",
    grid: [2, 2],
    upperArmCells: [0, 1],
    forearmCells: [2, 3],
    replaces: ["parts/upper_arm_left_v3.png", "parts/upper_arm_right_v3.png", "parts/forearm_left_v3.png", "parts/forearm_right_v3.png"]
  });
  assert.deepEqual(manifest.qa.armContinuity, {
    skinnedSegmentsFollowBoneHierarchy: true,
    elbowCoversVisible: false,
    forearmOccludesUpperSleeveEnd: true,
    forearmHasOpenEnd: false,
    separateCuffsVisible: false,
    integratedCuffButtonsVisible: true,
    oneSheetMaterialConsistency: true,
    roundedShoulderEntryByOutwardChain: true,
    roundedUpperSleeveAssets: true,
    approvedArmGrid: [2, 2],
    elbowJoinInsetX: 8,
    pawJoinInsetX: 20,
    alphaJointCentersAligned: true,
    elbowsBiasAwayFromTorso: true,
    symmetricElbowCenters: true,
    reachJointsFollowSegmentShortening: true
  });
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
