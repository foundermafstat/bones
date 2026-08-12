#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileRig } from "../packages/compiler/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const base = resolve(root, "apps/editor/public/assets/mascots/milo-reporter");
const partsDir = resolve(base, "parts");
const publicBase = "/assets/mascots/milo-reporter/parts";
const transform = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });

function pngSize(fileName) {
  const path = resolve(partsDir, fileName);
  if (!existsSync(path)) throw new Error(`Missing Milo v3 asset: ${path}`);
  const bytes = readFileSync(path);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function containSize([sourceWidth, sourceHeight], [maxWidth, maxHeight]) {
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  return [sourceWidth * scale, sourceHeight * scale];
}

function quadMesh(width, height, texture, anchor = "center") {
  const left = -width / 2;
  const top = anchor === "top" ? 0 : -height / 2;
  return {
    vertices: [left, top, -left, top, -left, top + height, left, top + height],
    indices: [0, 1, 2, 0, 2, 3],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    texture
  };
}

function gridGeometry(width, height, columns, rows, anchor = "top") {
  const vertices = [];
  const uvs = [];
  const indices = [];
  const left = -width / 2;
  const top = anchor === "top" ? 0 : -height / 2;
  for (let row = 0; row < rows; row += 1) {
    const v = row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const u = column / (columns - 1);
      vertices.push(left + width * u, top + height * v);
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return { vertices, indices, uvs };
}

function skinnedGridMesh(width, height, texture, columns, rows, proximalBoneId, distalBoneId, distalOffsetY, anchor = "top") {
  const geometry = gridGeometry(width, height, columns, rows, anchor);
  const skin = [];
  const top = anchor === "top" ? 0 : -height / 2;
  for (let row = 0; row < rows; row += 1) {
    const t = row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const x = geometry.vertices[(row * columns + column) * 2];
      const y = geometry.vertices[(row * columns + column) * 2 + 1];
      skin.push([
        { boneId: proximalBoneId, x, y, weight: 1 - t },
        { boneId: distalBoneId, x, y: y - distalOffsetY, weight: t }
      ]);
    }
  }
  return { ...geometry, texture, skin };
}

function oneBoneGridMesh(width, height, texture, columns, rows, boneId, anchor = "center", originX = 0, originY = 0) {
  const geometry = gridGeometry(width, height, columns, rows, anchor);
  return {
    ...geometry,
    texture,
    skin: Array.from({ length: columns * rows }, (_, index) => [{
      boneId,
      x: geometry.vertices[index * 2] + originX,
      y: geometry.vertices[index * 2 + 1] + originY,
      weight: 1
    }])
  };
}

const bodySpecs = [
  { id: "body_lower_coat", boneId: "coatLower", file: "body_lower_coat.png", box: [220, 216], drawOrder: 1 },
  { id: "chest_upper_coat", boneId: "chest", file: "chest_upper_coat_v5.png", box: [340, 430], drawOrder: 4, offset: [0, 60] },
  { id: "neck_ruff", boneId: "neckRuff", file: "neck_ruff.png", box: [150, 150], drawOrder: 9, offset: [0, 78] },
  { id: "head_shell", boneId: "head", file: "head_shell_v5.png", box: [205, 205], drawOrder: 20 },
  { id: "jaw_chin", boneId: "jaw", file: "jaw_chin.png", box: [120, 74], drawOrder: 21 },
  { id: "ear_left", boneId: "earLeft", file: "ear_left.png", box: [70, 107], drawOrder: 22 },
  { id: "ear_right", boneId: "earRight", file: "ear_right.png", box: [70, 107], drawOrder: 22 },
  { id: "whiskers_left", boneId: "whiskerLeft", file: "whiskers_left.png", box: [38, 47], drawOrder: 23 },
  { id: "whiskers_right", boneId: "whiskerRight", file: "whiskers_right.png", box: [38, 47], drawOrder: 23 },
  { id: "collar_left", boneId: "collarLeft", file: "collar_left.png", box: [82, 127], drawOrder: 7 },
  { id: "collar_right", boneId: "collarRight", file: "collar_right.png", box: [82, 127], drawOrder: 7 },
  { id: "scarf_center", boneId: "torso", file: "scarf_center.png", box: [260, 340], drawOrder: 6, offset: [0, 20] },
  { id: "coat_flap_left", boneId: "coatFlapLeft", file: "coat_flap_left.png", box: [75, 129], drawOrder: 2 },
  { id: "coat_flap_right", boneId: "coatFlapRight", file: "coat_flap_right.png", box: [75, 129], drawOrder: 3 }
];

const armSpecs = ["left", "right"].flatMap((side) => [
  { id: `shoulder_${side}_v3`, boneId: `shoulder${side === "left" ? "Left" : "Right"}`, file: `shoulder_${side}_v3.png`, box: [108, 124], drawOrder: 10 },
  { id: `upper_arm_${side}_v3`, boneId: `upperArm${side === "left" ? "Left" : "Right"}`, file: `upper_arm_${side}_v3.png`, box: [94, 142], drawOrder: 11, grid: [4, 6], distalBoneId: `elbow${side === "left" ? "Left" : "Right"}`, distalOffsetY: 112 },
  { id: `elbow_cover_${side}_v3`, boneId: `elbow${side === "left" ? "Left" : "Right"}`, file: `elbow_cover_${side}_v3.png`, box: [98, 72], drawOrder: 13 },
  { id: `forearm_${side}_v3`, boneId: `forearm${side === "left" ? "Left" : "Right"}`, file: `forearm_${side}_v3.png`, box: [92, 126], drawOrder: 12, grid: [4, 6], distalBoneId: `wrist${side === "left" ? "Left" : "Right"}`, distalOffsetY: 96 },
  { id: `cuff_${side}_v3`, boneId: `wrist${side === "left" ? "Left" : "Right"}`, file: `cuff_${side}_v3.png`, box: [94, 54], drawOrder: 14 },
  { id: `paw_closed_${side}_v3`, boneId: `paw${side === "left" ? "Left" : "Right"}`, file: `paw_closed_${side}_v3.png`, box: [63, 72], drawOrder: 16, grid: [4, 4] },
  { id: `paw_open_${side}_v3`, boneId: `paw${side === "left" ? "Left" : "Right"}`, file: `paw_open_${side}_v3.png`, box: [72, 80], drawOrder: 16, grid: [4, 4] }
]);

const eyeExpressions = ["neutral", "blink", "happy", "sad", "angry", "surprised"];
const pupilShapes = ["slit", "medium", "round"];
const gazeBoundsByExpression = Object.fromEntries([
  ["left", {
    neutral: { x: [-5.5, 6], y: [-3, 3.25] }, blink: { x: [0, 0], y: [0, 0] }, happy: { x: [-4.2, 4.6], y: [-1.8, 1.8] },
    sad: { x: [-3.8, 4.2], y: [-2, 2.6] }, angry: { x: [-4.4, 4.8], y: [-1.6, 1.7] }, surprised: { x: [-6, 5.7], y: [-3.5, 3.3] }
  }],
  ["right", {
    neutral: { x: [-6, 5.5], y: [-3.2, 3.5] }, blink: { x: [0, 0], y: [0, 0] }, happy: { x: [-4.5, 4.1], y: [-1.7, 1.9] },
    sad: { x: [-4.1, 3.8], y: [-2.1, 2.75] }, angry: { x: [-4.8, 4.4], y: [-1.7, 1.6] }, surprised: { x: [-5.7, 6], y: [-3.3, 3.5] }
  }]
].flatMap(([side, expressions]) => Object.entries(expressions).map(([expression, bounds]) => [`eyelid_${side}_${expression}`, bounds])));
const eyeStaticSpecs = ["left", "right"].flatMap((side) => {
  return [
    { id: `eye_white_${side}`, boneId: "head", file: `eye_white_${side}.png`, box: [77, 63], drawOrder: 24, offset: [side === "left" ? -40 : 40, -15], opacity: 0 },
    { id: `eye_iris_${side}`, boneId: "head", file: `eye_iris_${side}.png`, box: [42, 27], drawOrder: 25, offset: [side === "left" ? -40 : 40, -15] }
  ];
});
const pupilSpecs = ["left", "right"].flatMap((side) => pupilShapes.map((shape) => ({
  id: `pupil_${side}_${shape}`,
  boneId: `eyeAim${side === "left" ? "Left" : "Right"}`,
  file: `pupil_${side}_${shape}.png`,
  box: [19.2, 30],
  drawOrder: 26,
  offset: [side === "left" ? -40 : 40, -15]
})));
const eyelidSpecs = ["left", "right"].flatMap((side) => eyeExpressions.map((expression) => ({
  id: `eyelid_${side}_${expression}`,
  boneId: "head",
  file: `eyelid_${side}_${expression}.png`,
  box: [77, 63],
  drawOrder: 30,
  offset: [side === "left" ? -40 : 40, -15]
})));

const emotions = ["neutral", "happy", "sad", "angry"];
const visemes = ["mbp", "ai", "e", "ou", "fv"];
const mouthNames = [...emotions.flatMap((emotion) => visemes.map((viseme) => `${emotion}_${viseme}`)), "surprised_round"];
const mouthSpecs = mouthNames.map((name) => ({ id: `mouth_${name}`, boneId: "jaw", file: `mouth_${name}.png`, box: [92, 67], drawOrder: 31 }));

const allSpecs = [...bodySpecs, ...armSpecs, ...eyeStaticSpecs, ...pupilSpecs, ...eyelidSpecs, ...mouthSpecs];
const specSizes = Object.fromEntries(allSpecs.map((spec) => [spec.id, { intrinsic: pngSize(spec.file), runtime: containSize(pngSize(spec.file), spec.box) }]));

const armLength = (id, fallback) => Math.round(Math.min(fallback, specSizes[id].runtime[1] * 0.86));
const upperLeftLength = armLength("upper_arm_left_v3", 112);
const upperRightLength = armLength("upper_arm_right_v3", 112);
const forearmLeftLength = armLength("forearm_left_v3", 96);
const forearmRightLength = armLength("forearm_right_v3", 96);
const armDistalOffsets = {
  upper_arm_left_v3: upperLeftLength,
  upper_arm_right_v3: upperRightLength,
  forearm_left_v3: forearmLeftLength,
  forearm_right_v3: forearmRightLength
};

const bones = [
  ["root", null, 0, 145], ["torso", "root", 0, -60], ["chest", "torso", 0, -72], ["neck", "chest", 0, -42], ["head", "neck", 0, -68], ["jaw", "head", 0, 42],
  ["earLeft", "head", -52, -72], ["earRight", "head", 52, -72], ["whiskerLeft", "head", -64, 14], ["whiskerRight", "head", 64, 14],
  ["eyeAimLeft", "head", 0, 0], ["eyeAimRight", "head", 0, 0],
  ["shoulderLeft", "chest", -108, -5], ["upperArmLeft", "shoulderLeft", 0, 0, upperLeftLength], ["elbowLeft", "upperArmLeft", 0, upperLeftLength], ["forearmLeft", "elbowLeft", 0, 0, forearmLeftLength], ["wristLeft", "forearmLeft", 0, forearmLeftLength], ["pawLeft", "wristLeft", 0, 4],
  ["shoulderRight", "chest", 108, -5], ["upperArmRight", "shoulderRight", 0, 0, upperRightLength], ["elbowRight", "upperArmRight", 0, upperRightLength], ["forearmRight", "elbowRight", 0, 0, forearmRightLength], ["wristRight", "forearmRight", 0, forearmRightLength], ["pawRight", "wristRight", 0, 4],
  ["collarLeft", "chest", -45, -4], ["collarRight", "chest", 45, -4], ["scarf", "chest", 0, 8], ["coatFlapLeft", "torso", -58, 58], ["coatFlapRight", "torso", 58, 58], ["coatLower", "torso", 0, 60], ["neckRuff", "neck", 0, 10]
].map(([id, parentId, x, y, length = 0]) => ({
  id,
  name: id,
  ...(parentId ? { parentId } : {}),
  local: transform(x, y),
  length,
  editor: { custom: { facing: 1 } }
}));

const hiddenIdentityParts = new Set(["body_lower_coat", "neck_ruff", "jaw_chin", "collar_left", "collar_right", "scarf_center", "coat_flap_left", "coat_flap_right"]);

function buildPart(spec) {
  const texture = `${publicBase}/${spec.file}`;
  const { intrinsic, runtime } = specSizes[spec.id];
  const [width, height] = runtime;
  const [x, y] = spec.offset ?? [0, 0];
  let mesh;
  const topAnchored = spec.grid?.[1] === 6 || spec.id.includes("shoulder_");
  if (spec.grid?.[0] === 4 && spec.grid?.[1] === 6) {
    mesh = skinnedGridMesh(width, height, texture, 4, 6, spec.boneId, spec.distalBoneId, armDistalOffsets[spec.id]);
  } else if (spec.grid?.[0] === 4 && spec.grid?.[1] === 4) {
    mesh = oneBoneGridMesh(width, height, texture, 4, 4, spec.boneId, "center", x, y);
  } else {
    mesh = quadMesh(width, height, texture, topAnchored ? "top" : "center");
  }
  return {
    id: spec.id,
    name: spec.id,
    boneId: spec.boneId,
    type: "mesh",
    drawOrder: spec.drawOrder,
    visible: true,
    opacity: spec.opacity ?? (hiddenIdentityParts.has(spec.id) ? 0 : 1),
    local: transform(x, y),
    mesh,
    editor: {
      custom: {
        pivot: topAnchored ? [0.5, 0] : [0.5, 0.5],
        points: [],
        anchor: topAnchored ? [0.5, 0] : [0.5, 0.5],
        offset: [x, y],
        assetPath: texture,
        width,
        intrinsicSize: intrinsic,
        aspectLocked: true,
        scale: [1, 1]
      }
    }
  };
}

const parts = allSpecs.map(buildPart);
const singletonSpecs = [...bodySpecs, ...armSpecs.filter((spec) => !spec.id.includes("paw_open_")), ...eyeStaticSpecs];
const bodySlots = singletonSpecs.map((spec) => {
  const side = spec.id.includes("_left_") ? "left" : spec.id.includes("_right_") ? "right" : undefined;
  const pawIds = spec.id.startsWith("paw_closed_") && side ? [spec.id, `paw_open_${side}_v3`] : [spec.id];
  return { id: `slot.${spec.id}`, name: spec.id, boneId: spec.boneId, drawOrder: spec.drawOrder, partIds: pawIds };
});
const expressionPartIds = (side) => eyeExpressions.map((expression) => `eyelid_${side}_${expression}`);
const pupilPartIds = (side) => pupilShapes.map((shape) => `pupil_${side}_${shape}`);
const mouthPartIds = mouthNames.map((name) => `mouth_${name}`);
const facialSlots = [
  { id: "eye.left.expression", name: "Left eye expression", boneId: "head", drawOrder: 30, partIds: expressionPartIds("left") },
  { id: "eye.right.expression", name: "Right eye expression", boneId: "head", drawOrder: 30, partIds: expressionPartIds("right") },
  { id: "eye.left.pupil", name: "Left pupil shape", boneId: "eyeAimLeft", drawOrder: 26, partIds: pupilPartIds("left") },
  { id: "eye.right.pupil", name: "Right pupil shape", boneId: "eyeAimRight", drawOrder: 26, partIds: pupilPartIds("right") },
  { id: "mouth", name: "Mouth", boneId: "jaw", drawOrder: 31, partIds: mouthPartIds }
];
const visualSlots = [...bodySlots, ...facialSlots];
const attachments = [
  ...singletonSpecs.map((spec) => ({ slotId: `slot.${spec.id}`, partId: spec.id })),
  { slotId: "eye.left.expression", partId: "eyelid_left_neutral" },
  { slotId: "eye.right.expression", partId: "eyelid_right_neutral" },
  { slotId: "eye.left.pupil", partId: "pupil_left_medium" },
  { slotId: "eye.right.pupil", partId: "pupil_right_medium" },
  { slotId: "mouth", partId: "mouth_neutral_mbp" }
];

const key = (time, value, interpolation = "linear") => ({ time, value, interpolation });
const track = (id, targetKind, targetId, property, values) => ({ id, target: { kind: targetKind, id: targetId }, property, keyframes: values });
const attachmentTrack = (slot, values) => track(`slot:${slot}.attachment`, "slot", slot, "attachment", values.map(([time, value]) => key(time, value, "step")));
const motionTrack = (bone, property, values) => track(`${bone}.${property.replace("transform.", "")}`, "bone", bone, property, values.map(([time, value]) => key(time, value)));
const partMotionTrack = (partId, property, values) => track(`part:${partId}.${property.replace("transform.", "")}`, "part", partId, property, values.map(([time, value]) => key(time, value)));
const deformTrack = (partId, values) => track(`part:${partId}.deform`, "part", partId, "deform", values.map(([time, value]) => key(time, value)));

function meshZeroes(partId) {
  return Array(parts.find((part) => part.id === partId).mesh.vertices.length).fill(0);
}

function reachDeform(partId, retainedLength = 0.3, distalWidth = 0.2) {
  const vertices = parts.find((part) => part.id === partId).mesh.vertices;
  const ys = vertices.filter((_, index) => index % 2 === 1);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return vertices.map((coordinate, index) => {
    if (index % 2 === 0) {
      const rowY = vertices[index + 1];
      const t = maxY === minY ? 0 : (rowY - minY) / (maxY - minY);
      return coordinate * distalWidth * t;
    }
    return -(coordinate - minY) * (1 - retainedLength);
  });
}

const armDeforms = Object.fromEntries(["left", "right"].flatMap((side) => [
  [`upper_arm_${side}_v3`, reachDeform(`upper_arm_${side}_v3`, 0.3, 0.16)],
  [`forearm_${side}_v3`, reachDeform(`forearm_${side}_v3`, 0.28, 0.2)]
]));

function eyeTracks(emotion, duration, { gaze = "micro", wink = false, pupil = "medium", noBlink = false } = {}) {
  const expression = eyeExpressions.includes(emotion) ? emotion : "neutral";
  const leftExpression = [[0, `eyelid_left_${expression}`]];
  const rightExpression = [[0, `eyelid_right_${expression}`]];
  const leftBlinkIntervals = [];
  const rightBlinkIntervals = [];
  if (wink) {
    leftExpression.push([0.42, "eyelid_left_blink"], [0.72, "eyelid_left_blink"], [0.78, `eyelid_left_${expression}`]);
    leftBlinkIntervals.push([0.42, 0.78]);
  } else if (!noBlink) {
    leftExpression.push([duration * 0.36, `eyelid_left_${expression}`], [duration * 0.39, "eyelid_left_blink"], [duration * 0.43, `eyelid_left_${expression}`]);
    rightExpression.push([duration * 0.38, `eyelid_right_${expression}`], [duration * 0.41, "eyelid_right_blink"], [duration * 0.45, `eyelid_right_${expression}`]);
    leftBlinkIntervals.push([duration * 0.39, duration * 0.43]);
    rightBlinkIntervals.push([duration * 0.41, duration * 0.45]);
  }
  leftExpression.push([duration, `eyelid_left_${expression}`]);
  rightExpression.push([duration, `eyelid_right_${expression}`]);

  const gazeOffsets = gaze === "right"
    ? [[0, 0, 0], [duration * 0.25, 5.5, -1], [duration * 0.75, 6, 0], [duration, 0, 0]]
    : gaze === "alternate"
      ? [[0, 0, 0], [duration * 0.25, -6, 0], [duration * 0.55, 6, -1], [duration * 0.82, -2, 1], [duration, 0, 0]]
      : gaze === "down"
        ? [[0, 0, 0], [duration * 0.25, -1, 3], [duration * 0.8, 1, 3.5], [duration, 0, 3]]
        : [[0, 0, 0], [duration * 0.27, 1.5, -0.5], [duration * 0.53, -1, 0.8], [duration * 0.78, 0.8, 0], [duration, 0, 0]];
  const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));
  const withBlinkCenter = (values, intervals) => {
    const centered = values.map(([time, value]) => [time, intervals.some(([start, end]) => time >= start && time < end) ? 0 : value]);
    const merged = [...centered, ...intervals.flatMap(([start, end]) => [[start, 0], [end, 0]])].sort((a, b) => a[0] - b[0]);
    return merged.filter((entry, index) => index === merged.length - 1 || Math.abs(entry[0] - merged[index + 1][0]) > 1e-9);
  };
  const leftBounds = gazeBoundsByExpression[`eyelid_left_${expression}`];
  const rightBounds = gazeBoundsByExpression[`eyelid_right_${expression}`];
  const leftX = withBlinkCenter(gazeOffsets.map(([time, x]) => [time, clamp(x, leftBounds.x)]), leftBlinkIntervals);
  const leftY = withBlinkCenter(gazeOffsets.map(([time, , y]) => [time, clamp(y, leftBounds.y)]), leftBlinkIntervals);
  const rightX = withBlinkCenter(gazeOffsets.map(([time, x], index) => [time, clamp(x + (index % 2 ? 0.35 : 0), rightBounds.x)]), rightBlinkIntervals);
  const rightY = withBlinkCenter(gazeOffsets.map(([time, , y], index) => [time, clamp(y + (index % 2 ? -0.2 : 0), rightBounds.y)]), rightBlinkIntervals);
  const irisParallax = 0.25;
  const leftIrisX = leftX.map(([time, x]) => [time, -40 + x * irisParallax]);
  const leftIrisY = leftY.map(([time, y]) => [time, -15 + y * irisParallax]);
  const rightIrisX = rightX.map(([time, x]) => [time, 40 + x * irisParallax]);
  const rightIrisY = rightY.map(([time, y]) => [time, -15 + y * irisParallax]);

  return [
    attachmentTrack("eye.left.expression", leftExpression),
    attachmentTrack("eye.right.expression", rightExpression),
    attachmentTrack("eye.left.pupil", [[0, `pupil_left_${pupil}`], [duration, `pupil_left_${pupil}`]]),
    attachmentTrack("eye.right.pupil", [[0, `pupil_right_${pupil}`], [duration, `pupil_right_${pupil}`]]),
    motionTrack("eyeAimLeft", "transform.x", leftX),
    motionTrack("eyeAimLeft", "transform.y", leftY),
    motionTrack("eyeAimRight", "transform.x", rightX),
    motionTrack("eyeAimRight", "transform.y", rightY),
    partMotionTrack("eye_iris_left", "transform.x", leftIrisX),
    partMotionTrack("eye_iris_left", "transform.y", leftIrisY),
    partMotionTrack("eye_iris_right", "transform.x", rightIrisX),
    partMotionTrack("eye_iris_right", "transform.y", rightIrisY)
  ];
}

function mouthTrack(emotion, duration, talking) {
  if (!talking) return attachmentTrack("mouth", [[0, `mouth_${emotion}_mbp`], [duration, `mouth_${emotion}_mbp`]]);
  const sequence = ["mbp", "ai", "e", "ou", "fv", "ai", "mbp", "e", "ou", "mbp"];
  const keys = [];
  for (let time = 0, index = 0; time < duration; time += 4 / 60, index += 1) keys.push([Number(time.toFixed(6)), `mouth_${emotion}_${sequence[index % sequence.length]}`]);
  keys.push([duration, `mouth_${emotion}_mbp`]);
  return attachmentTrack("mouth", keys);
}

function faceTracks(emotion, duration, talking, options) {
  return [...eyeTracks(emotion, duration, options), mouthTrack(emotion, duration, talking)];
}

function baseMotion(duration) {
  return [
    motionTrack("torso", "transform.y", [[0, -60], [duration / 2, -63], [duration, -60]]),
    motionTrack("chest", "transform.scaleY", [[0, 1], [duration / 2, 1.018], [duration, 1]]),
    motionTrack("earLeft", "transform.rotation", [[0, 0], [duration / 2, -0.045], [duration, 0]]),
    motionTrack("earRight", "transform.rotation", [[0, 0], [duration / 2, 0.045], [duration, 0]])
  ];
}

function pawTalkMotion(duration, mood = "neutral") {
  const amplitude = mood === "angry" ? 0.34 : mood === "happy" ? 0.26 : mood === "sad" ? 0.12 : 0.2;
  const direction = mood === "sad" ? -1 : 1;
  return [
    motionTrack("upperArmLeft", "transform.rotation", [[0, 0], [duration * 0.25, amplitude * direction], [duration * 0.5, -amplitude * 0.45], [duration * 0.75, amplitude * 0.75], [duration, 0]]),
    motionTrack("elbowLeft", "transform.rotation", [[0, 0], [duration * 0.25, -amplitude * 0.5], [duration * 0.5, amplitude * 0.3], [duration, 0]]),
    motionTrack("forearmLeft", "transform.rotation", [[0, 0], [duration * 0.25, -amplitude * 0.7], [duration * 0.5, amplitude * 0.35], [duration * 0.75, -amplitude * 0.55], [duration, 0]]),
    motionTrack("wristLeft", "transform.rotation", [[0, 0], [duration * 0.25, -amplitude], [duration * 0.5, amplitude * 0.65], [duration, 0]]),
    motionTrack("upperArmRight", "transform.rotation", [[0, 0], [duration * 0.25, -amplitude * 0.65], [duration * 0.5, amplitude * 0.7], [duration * 0.75, -amplitude], [duration, 0]]),
    motionTrack("elbowRight", "transform.rotation", [[0, 0], [duration * 0.25, amplitude * 0.45], [duration * 0.5, -amplitude * 0.35], [duration, 0]]),
    motionTrack("forearmRight", "transform.rotation", [[0, 0], [duration * 0.25, amplitude * 0.55], [duration * 0.5, -amplitude * 0.5], [duration * 0.75, amplitude * 0.75], [duration, 0]]),
    motionTrack("wristRight", "transform.rotation", [[0, 0], [duration * 0.25, amplitude * 0.9], [duration * 0.5, -amplitude * 0.65], [duration, 0]])
  ];
}

function armReachTracks(side, duration, activeStart, activeEnd, scale = 1.22) {
  const suffix = side === "left" ? "left" : "right";
  const upper = `upper_arm_${suffix}_v3`;
  const forearm = `forearm_${suffix}_v3`;
  const paw = `paw${side === "left" ? "Left" : "Right"}`;
  const zeroUpper = meshZeroes(upper);
  const zeroForearm = meshZeroes(forearm);
  return [
    deformTrack(upper, [[0, zeroUpper], [activeStart, armDeforms[upper]], [activeEnd, armDeforms[upper]], [duration, zeroUpper]]),
    deformTrack(forearm, [[0, zeroForearm], [activeStart, armDeforms[forearm]], [activeEnd, armDeforms[forearm]], [duration, zeroForearm]]),
    motionTrack(paw, "transform.scaleX", [[0, 1], [activeStart, scale], [activeEnd, scale], [duration, 1]]),
    motionTrack(paw, "transform.scaleY", [[0, 1], [activeStart, scale], [activeEnd, scale], [duration, 1]])
  ];
}

function clip(id, duration, loop, extraTracks, events = []) {
  return { id, name: id, duration, frameRate: 60, loop, tracks: [...baseMotion(duration), ...extraTracks], events, markers: [], tags: ["reporter"] };
}

const closedPaw = (side) => `paw_closed_${side}_v3`;
const openPaw = (side) => `paw_open_${side}_v3`;
const pawSlot = (side) => `slot.${closedPaw(side)}`;

const animations = [
  clip("idle_neutral", 3, true, [...faceTracks("neutral", 3, false), ...pawTalkMotion(3, "sad")]),
  clip("talk_neutral", 2, true, [...faceTracks("neutral", 2, true), ...pawTalkMotion(2, "neutral")]),
  clip("talk_happy", 2, true, [...faceTracks("happy", 2, true, { pupil: "round" }), ...pawTalkMotion(2, "happy")]),
  clip("talk_sad", 2.2, true, [...faceTracks("sad", 2.2, true, { gaze: "down", pupil: "slit" }), ...pawTalkMotion(2.2, "sad"), motionTrack("head", "transform.rotation", [[0, 0], [1.1, -0.06], [2.2, 0]])]),
  clip("talk_angry", 1.8, true, [...faceTracks("angry", 1.8, true, { pupil: "slit" }), ...pawTalkMotion(1.8, "angry")]),
  clip("explain_point", 2.4, true, [
    ...faceTracks("neutral", 2.4, true, { gaze: "right" }),
    attachmentTrack(pawSlot("right"), [[0, closedPaw("right")], [0.45, openPaw("right")], [1.8, openPaw("right")], [2.4, closedPaw("right")]]),
    ...pawTalkMotion(2.4, "neutral"),
    ...armReachTracks("right", 2.4, 0.45, 1.8),
    motionTrack("shoulderRight", "transform.rotation", [[0, 0], [0.45, -0.42], [1.8, -0.36], [2.4, 0]])
  ]),
  clip("discuss_two_hands", 2.6, true, [
    ...faceTracks("happy", 2.6, true, { gaze: "alternate", pupil: "round" }),
    attachmentTrack(pawSlot("left"), [[0, closedPaw("left")], [0.35, openPaw("left")], [1.35, openPaw("left")], [1.55, closedPaw("left")], [2.6, closedPaw("left")]]),
    attachmentTrack(pawSlot("right"), [[0, closedPaw("right")], [1.05, openPaw("right")], [2.25, openPaw("right")], [2.6, closedPaw("right")]]),
    ...pawTalkMotion(2.6, "happy"),
    ...armReachTracks("left", 2.6, 0.35, 1.35, 1.2),
    ...armReachTracks("right", 2.6, 1.05, 2.25, 1.2)
  ]),
  clip("greeting", 1.8, false, [
    ...faceTracks("happy", 1.8, false, { wink: true, pupil: "round" }),
    attachmentTrack(pawSlot("right"), [[0, closedPaw("right")], [0.3, openPaw("right")], [1.45, openPaw("right")], [1.8, closedPaw("right")]]),
    ...pawTalkMotion(1.8, "happy")
  ], [{ time: 1.8, type: "reporter.complete", category: "gameplay" }]),
  clip("surprise_reaction", 1.4, false, [
    ...eyeTracks("surprised", 1.4, { pupil: "round", noBlink: true }),
    attachmentTrack("mouth", [[0, "mouth_neutral_mbp"], [0.2, "mouth_surprised_round"], [1.4, "mouth_surprised_round"]]),
    attachmentTrack(pawSlot("left"), [[0, closedPaw("left")], [0.2, openPaw("left")], [1.4, openPaw("left")]]),
    attachmentTrack(pawSlot("right"), [[0, closedPaw("right")], [0.2, openPaw("right")], [1.4, openPaw("right")]]),
    ...pawTalkMotion(1.4, "angry"),
    ...armReachTracks("left", 1.4, 0.2, 1.4, 1.25),
    ...armReachTracks("right", 1.4, 0.2, 1.4, 1.25),
    motionTrack("head", "transform.scaleX", [[0, 1], [0.2, 1.08], [0.5, 1], [1.4, 1]]),
    motionTrack("head", "transform.scaleY", [[0, 1], [0.2, 1.08], [0.5, 1], [1.4, 1]])
  ], [{ time: 1.4, type: "reporter.complete", category: "gameplay" }]),
  clip("farewell", 1.8, false, [
    ...faceTracks("sad", 1.8, false, { gaze: "down", pupil: "slit" }),
    attachmentTrack(pawSlot("left"), [[0, closedPaw("left")], [0.35, openPaw("left")], [1.45, openPaw("left")], [1.8, closedPaw("left")]]),
    ...pawTalkMotion(1.8, "sad")
  ], [{ time: 1.8, type: "reporter.complete", category: "gameplay" }])
];

const poseDeforms = (sides) => Object.fromEntries(["left", "right"].flatMap((side) => [
  [`upper_arm_${side}_v3`, sides.includes(side) ? armDeforms[`upper_arm_${side}_v3`] : meshZeroes(`upper_arm_${side}_v3`)],
  [`forearm_${side}_v3`, sides.includes(side) ? armDeforms[`forearm_${side}_v3`] : meshZeroes(`forearm_${side}_v3`)]
]));
const poses = [
  { id: "arms_neutral", name: "Arms Neutral", rigId: "milo-reporter-rig", boneTransforms: { pawLeft: transform(0, 4), pawRight: transform(0, 4) }, editor: { custom: { deforms: poseDeforms([]) } } },
  { id: "reach_left", name: "Reach Left", rigId: "milo-reporter-rig", boneTransforms: { pawLeft: transform(0, 4, 0, 1.22, 1.22), pawRight: transform(0, 4) }, editor: { custom: { deforms: poseDeforms(["left"]) } } },
  { id: "reach_right", name: "Reach Right", rigId: "milo-reporter-rig", boneTransforms: { pawLeft: transform(0, 4), pawRight: transform(0, 4, 0, 1.22, 1.22) }, editor: { custom: { deforms: poseDeforms(["right"]) } } },
  { id: "reach_both", name: "Reach Both", rigId: "milo-reporter-rig", boneTransforms: { pawLeft: transform(0, 4, 0, 1.25, 1.25), pawRight: transform(0, 4, 0, 1.25, 1.25) }, editor: { custom: { deforms: poseDeforms(["left", "right"]) } } }
];

const states = animations.map(({ id }) => ({ id, name: id, clipId: id }));
const transitions = states.flatMap((from) => states.filter((to) => to.id !== from.id).map((to) => ({
  id: `${from.id}->${to.id}`,
  fromStateId: from.id,
  toStateId: to.id,
  duration: 0.15,
  easing: "easeInOut",
  canInterrupt: true,
  conditions: [{ parameterId: "reporterState", operator: "==", value: to.id }]
})));

const facialRig = {
  expressionSlots: { left: "eye.left.expression", right: "eye.right.expression" },
  pupilSlots: { left: "eye.left.pupil", right: "eye.right.pupil" },
  eyeAimBones: { left: "eyeAimLeft", right: "eyeAimRight" },
  irisParallaxParts: { left: "eye_iris_left", right: "eye_iris_right" },
  irisOrigins: { left: [-40, -15], right: [40, -15] },
  irisParallax: 0.25,
  gazeBounds: { x: [-6, 6], y: [-3.5, 3.5] },
  gazeBoundsByExpression,
  linkedByDefault: true
};

const source = {
  schemaVersion: "1.2.0",
  runtimeTarget: "pixi-v8",
  id: "milo-reporter",
  projectId: "milo-reporter",
  name: "Milo Reporter",
  units: "pixels",
  defaultFrameRate: 60,
  rigs: [{
    id: "milo-reporter-rig",
    name: "Milo Reporter Rig",
    rootBoneId: "root",
    bones,
    parts,
    visualSlots,
    skins: [{ id: "default", name: "Milo Default", attachments }],
    defaultSkinId: "default",
    editor: {
      custom: {
        selectedBoneId: "torso",
        activeSkinId: "default",
        facialRig,
        timeline: { selectedClipId: "idle_neutral", selectedKeyIds: [], keyClipboard: [], autoKey: true, snappingFps: 60, virtualWindow: { startRow: 0, rowCount: 16 } },
        procedural: { inputs: { velocityX: 0, velocityY: 0, gravity: 1, wind: 0, grounded: true, jumpStart: false, landHeavy: false }, breathing: { enabled: false, frequency: 0.8, amplitude: 0, affectedBoneTransforms: {} }, secondaryMotion: { enabled: false, target: "root", stiffness: 0, damping: 0, velocityInfluence: 0, gravityInfluence: 0, windInfluence: 0, maxOffset: 0 }, squashStretch: { enabled: false, target: "root", landingImpactScale: 0, rules: [] }, footIk: { enabled: false, feet: [], footChains: [], maxCorrection: 0, blend: 0 } }
      }
    }
  }],
  animations,
  poses,
  stateMachines: [{ id: "milo-reporter-state-machine", name: "Milo Reporter State Machine", initialStateId: "idle_neutral", parameters: [{ id: "reporterState", type: "string", defaultValue: "idle_neutral" }], states, transitions }],
  proceduralPresets: [],
  editor: { custom: { savedFrom: "bones-editor", characterKind: "cat", preset: "milo-reporter" } }
};

const compiled = compileRig(source);
const dimensions = Object.fromEntries(parts.map((part) => [part.id, specSizes[part.id].intrinsic]));
const activeAssetPaths = parts.map((part) => part.mesh.texture);
const manifest = {
  id: "milo-reporter",
  name: "Milo Reporter",
  version: 3,
  generatedWith: "OpenAI built-in ImageGen",
  reference: "User-approved final-look identity, paw-size calibration, and arm sheet",
  references: {
    finalLook: { source: "exec-a391a217-0dcd-4085-b459-59970971fa59.png", chroma: "source-art/milo-final-look-v3-chroma.png", rgba: "source-art/milo-final-look-v3-rgba.png" },
    pawScaleCalibration: { source: "exec-c60fa62d-4fc4-456a-8d5c-0ffd14515821.png", chroma: "source-art/milo-calibration-v3-chroma.png" },
    armSet: { source: "codex-clipboard-b931cc12-da4d-4624-94ef-f3bbabff45c8.png", chroma: "source-art/milo-arms-v3-chroma.png", rgba: "source-art/milo-arms-v3-rgba.png" },
    eyeAnatomy: { chroma: "source-art/milo-eye-anatomy-v3-chroma.png", rgba: "source-art/milo-eye-anatomy-v3-rgba.png" },
    eyelids: { source: "exec-85342265-5d12-4161-abab-74295ab50d82.png", chroma: "source-art/milo-eyelids-v3-chroma.png", rgba: "source-art/milo-eyelids-v3-rgba.png" },
    removedHeadMask: { source: "exec-f00f7a7c-a857-4dcd-a72a-78d2f42e5a33.png", active: false, reason: "User rejected the full-face safe mask; expression-specific numeric safe zones replace it." }
  },
  chromaKey: "#00FF00",
  prompts: {
    identity: "Match the approved final-look anchor exactly for face, eyes, white-fur silhouette, black coat and frontal waist-up proportions; do not reshape or distort its anatomy.",
    calibration: "Use the separate approved calibration only to measure closed-paw scale against head width; it does not replace the final-look identity.",
    arms: "Preserve the exact silhouette, proportions, rounded edges, closed paws and open padded paws from the user-approved mirrored arm set.",
    eyes: "Use exec-85342265-5d12-4161-abab-74295ab50d82 as the exact top eyelid-expression edging. Per side: a slightly moving solid amber iris and an independently moving enlarged black pupil with side-specific catchlight; each eyelid expression supplies its own numeric gaze safe-zone. No full-face mask is active. The matte white base remains packaged but hidden for compatibility.",
    mouths: "Twenty-one distinct feline emotional visemes with one fixed-size nose anchor."
  },
  counts: { bones: bones.length, bodyParts: bodySpecs.length, armParts: armSpecs.length, eyeParts: eyeStaticSpecs.length + pupilSpecs.length + eyelidSpecs.length, mouthParts: mouthSpecs.length, totalParts: parts.length, clips: animations.length, poses: poses.length },
  activeAssetPaths,
  facialPivots: { leftEye: [0.5, 0.5], rightEye: [0.5, 0.5], mouth: [0.5, 0.5] },
  bindings: Object.fromEntries(parts.map((part) => {
    const [sourceWidth, sourceHeight] = dimensions[part.id];
    const xs = part.mesh.vertices.filter((_, index) => index % 2 === 0);
    const ys = part.mesh.vertices.filter((_, index) => index % 2 === 1);
    const runtimeSize = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    const aspectError = Math.abs((runtimeSize[0] / runtimeSize[1]) / (sourceWidth / sourceHeight) - 1);
    return [part.id, { boneId: part.boneId, texture: part.mesh.texture, intrinsicSize: [sourceWidth, sourceHeight], sourceSize: [sourceWidth, sourceHeight], runtimeSize, aspectLocked: true, baseAspectError: aspectError }];
  })),
  qa: {
    transparentCorners: true,
    chromaFringeChecked: true,
    facialPivotsEqual: true,
    eyeLayerOrder: ["base-head", "moving-solid-iris", "moving-pupil", "eyelid-expression-edging"],
    whiteBaseVisible: false,
    irisMovesWithGaze: true,
    irisParallax: 0.25,
    gazeSafeZone: { pupil: { x: [-6, 6], y: [-3.5, 3.5] }, iris: { x: [-1.5, 1.5], y: [-0.875, 0.875] }, clipsInsideEyelidAperture: true },
    gazeSafeZonesByExpression: facialRig.gazeBoundsByExpression,
    rejectedFullFaceMaskExcluded: true,
    pupilMovesWithGaze: true,
    armOverlapPadding: [0.12, 0.15],
    baseAspectErrorMax: 0.005,
    finalLookLocked: { face: true, eyes: true, body: true, coat: true, silhouette: true, reference: "exec-a391a217-0dcd-4085-b459-59970971fa59.png" },
    calibratedClosedPawToHeadWidth: { measured: 0.307, tolerance: 0.01, measurement: { headWidth: 329, closedPawWidth: 101, sampleScale: 0.5 }, reference: "exec-c60fa62d-4fc4-456a-8d5c-0ffd14515821.png", role: "paw-size-only" },
    legacyAssetsExcludedFromActiveSet: true
  }
};

const check = process.argv.includes("--check");
function emit(fileName, value) {
  const path = resolve(base, fileName);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) throw new Error(`Generated output is stale: ${path}`);
    return;
  }
  writeFileSync(path, content);
}

emit("milo-reporter.source.rig.json", source);
emit("milo-reporter.compiled.json", compiled);
emit("milo-reporter.manifest.json", manifest);
console.log(`Built Milo v3: ${bones.length} bones, ${parts.length} active parts, ${animations.length} clips`);
