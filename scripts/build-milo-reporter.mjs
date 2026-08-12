#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileRig } from "../packages/compiler/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const base = resolve(root, "apps/editor/public/assets/mascots/milo-reporter");
const publicBase = "/assets/mascots/milo-reporter/parts";
const transform = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });

const bones = [
  ["root", null, 0, 145], ["torso", "root", 0, -60], ["chest", "torso", 0, -72], ["neck", "chest", 0, -42], ["head", "neck", 0, -68], ["jaw", "head", 0, 42],
  ["earLeft", "head", -52, -72], ["earRight", "head", 52, -72], ["whiskerLeft", "head", -64, 14], ["whiskerRight", "head", 64, 14],
  ["shoulderLeft", "chest", -108, -5], ["upperArmLeft", "shoulderLeft", 0, 0], ["forearmLeft", "upperArmLeft", -5, 72], ["pawLeft", "forearmLeft", 3, 55],
  ["shoulderRight", "chest", 108, -5], ["upperArmRight", "shoulderRight", 0, 0], ["forearmRight", "upperArmRight", 5, 72], ["pawRight", "forearmRight", -3, 55],
  ["collarLeft", "chest", -45, -4], ["collarRight", "chest", 45, -4], ["scarf", "chest", 0, 8], ["coatFlapLeft", "torso", -58, 58], ["coatFlapRight", "torso", 58, 58], ["coatLower", "torso", 0, 60], ["neckRuff", "neck", 0, 10]
].map(([id, parentId, x, y]) => ({ id, name: id, ...(parentId ? { parentId } : {}), local: transform(x, y), length: id.includes("Arm") ? 112 : id.includes("forearm") ? 88 : 0, editor: { custom: { facing: 1 } } }));

const bodyParts = [
  ["body_lower_coat", "coatLower", 220, 216, 1], ["chest_upper_coat", "chest", 340, 430, 4, 0, 60], ["neck_ruff", "neckRuff", 150, 150, 9, 0, 78], ["head_shell", "head", 205, 205, 20], ["jaw_chin", "jaw", 120, 74, 21],
  ["ear_left", "earLeft", 70, 107, 22], ["ear_right", "earRight", 70, 107, 22], ["whiskers_left", "whiskerLeft", 38, 47, 23], ["whiskers_right", "whiskerRight", 38, 47, 23],
  ["shoulder_left", "shoulderLeft", 104, 112, 10], ["upper_arm_left", "upperArmLeft", 90, 142, 11], ["forearm_left", "forearmLeft", 92, 122, 12], ["paw_left", "pawLeft", 82, 78, 16],
  ["shoulder_right", "shoulderRight", 104, 112, 10], ["upper_arm_right", "upperArmRight", 90, 142, 11], ["forearm_right", "forearmRight", 92, 122, 12], ["paw_right", "pawRight", 82, 78, 16],
  ["collar_left", "torso", 82, 127, 7, -45, -76], ["collar_right", "torso", 82, 127, 7, 45, -76], ["scarf_center", "torso", 260, 340, 6, 0, 20], ["coat_flap_left", "torso", 75, 129, 2, -58, 58], ["coat_flap_right", "torso", 75, 129, 3, 58, 58]
];
const pawVariantParts = [
  ["paw_open_left", "pawLeft", 88, 88, 16],
  ["paw_open_right", "pawRight", 88, 88, 16]
];
const eyeNames = ["neutral", "blink", "happy", "sad", "angry", "surprised"];
const emotions = ["neutral", "happy", "sad", "angry"];
const visemes = ["mbp", "ai", "e", "ou", "fv"];
const mouthNames = [...emotions.flatMap((emotion) => visemes.map((viseme) => `${emotion}_${viseme}`)), "surprised_round"];

function mesh(width, height, texture) {
  return {
    vertices: [-width / 2, -height / 2, width / 2, -height / 2, width / 2, height / 2, -width / 2, height / 2],
    indices: [0, 1, 2, 0, 2, 3],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    texture
  };
}

const identityBasePartIds = new Set(["body_lower_coat", "neck_ruff", "jaw_chin", "collar_left", "collar_right", "scarf_center", "coat_flap_left", "coat_flap_right"]);

function part(id, boneId, width, height, drawOrder, x = 0, y = 0) {
  const texture = `${publicBase}/${id === "chest_upper_coat" || id === "head_shell" ? `${id}_v5` : id}.png`;
  const visible = !identityBasePartIds.has(id);
  const opacity = visible ? 1 : 0;
  const editor = { custom: { pivot: [0.5, 0.5], points: [], anchor: [0.5, 0.5], offset: [x, y], assetPath: texture, width, scale: [1, 1] } };
  return {
    id, name: id, boneId, type: "mesh", drawOrder, visible: true, opacity, local: transform(x, y), mesh: mesh(width, height, texture),
    editor
  };
}

const parts = [
  ...bodyParts.map((entry) => part(...entry)),
  ...pawVariantParts.map((entry) => part(...entry)),
  ...eyeNames.map((name) => part(`eyes_${name}`, "head", 150, 61, 24, 0, -15)),
  ...mouthNames.map((name) => part(`mouth_${name}`, "jaw", 92, 67, 25, 0, 0))
];
const bodySlots = bodyParts.map(([id, boneId, _width, _height, drawOrder]) => ({
  id: `slot.${id}`,
  name: id,
  boneId,
  drawOrder,
  partIds: id === "paw_left" ? ["paw_left", "paw_open_left"] : id === "paw_right" ? ["paw_right", "paw_open_right"] : [id]
}));
const eyePartIds = eyeNames.map((name) => `eyes_${name}`);
const mouthPartIds = mouthNames.map((name) => `mouth_${name}`);
const visualSlots = [...bodySlots, { id: "eyes", name: "Eyes", boneId: "head", drawOrder: 24, partIds: eyePartIds }, { id: "mouth", name: "Mouth", boneId: "jaw", drawOrder: 25, partIds: mouthPartIds }];
const attachments = [...bodyParts.map(([id]) => ({ slotId: `slot.${id}`, partId: id })), { slotId: "eyes", partId: "eyes_neutral" }, { slotId: "mouth", partId: "mouth_neutral_mbp" }];

const key = (time, value, interpolation = "linear") => ({ time, value, interpolation });
const track = (id, targetKind, targetId, property, values) => ({ id, target: { kind: targetKind, id: targetId }, property, keyframes: values });
const attachmentTrack = (slot, values) => track(`slot:${slot}.attachment`, "slot", slot, "attachment", values.map(([time, value]) => key(time, value, "step")));
const motionTrack = (bone, property, values) => track(`${bone}.${property.replace("transform.", "")}`, "bone", bone, property, values.map(([time, value]) => key(time, value)));
const partMotionTrack = (partId, property, values) => track(`part:${partId}.${property.replace("transform.", "")}`, "part", partId, property, values.map(([time, value]) => key(time, value)));

function faceTracks(emotion, duration, talking) {
  const eyes = emotion === "neutral" ? "eyes_neutral" : `eyes_${emotion}`;
  const eyeKeys = [[0, eyes], [duration * 0.38, eyes], [duration * 0.42, "eyes_blink"], [duration * 0.46, eyes], [duration, eyes]];
  if (!talking) return [attachmentTrack("eyes", eyeKeys), attachmentTrack("mouth", [[0, `mouth_${emotion}_mbp`], [duration, `mouth_${emotion}_mbp`]])];
  const sequence = ["mbp", "ai", "e", "ou", "fv", "ai", "mbp", "e", "ou", "mbp"];
  const mouthKeys = [];
  for (let time = 0, index = 0; time < duration; time += 4 / 60, index += 1) mouthKeys.push([time, `mouth_${emotion}_${sequence[index % sequence.length]}`]);
  mouthKeys.push([duration, `mouth_${emotion}_mbp`]);
  return [attachmentTrack("eyes", eyeKeys), attachmentTrack("mouth", mouthKeys)];
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
    motionTrack("forearmLeft", "transform.rotation", [[0, 0], [duration * 0.25, -amplitude * 0.7], [duration * 0.5, amplitude * 0.35], [duration * 0.75, -amplitude * 0.55], [duration, 0]]),
    motionTrack("pawLeft", "transform.rotation", [[0, 0], [duration * 0.25, -amplitude], [duration * 0.5, amplitude * 0.65], [duration * 0.75, -amplitude * 0.8], [duration, 0]]),
    motionTrack("upperArmRight", "transform.rotation", [[0, 0], [duration * 0.25, -amplitude * 0.65], [duration * 0.5, amplitude * 0.7], [duration * 0.75, -amplitude], [duration, 0]]),
    motionTrack("forearmRight", "transform.rotation", [[0, 0], [duration * 0.25, amplitude * 0.55], [duration * 0.5, -amplitude * 0.5], [duration * 0.75, amplitude * 0.75], [duration, 0]]),
    motionTrack("pawRight", "transform.rotation", [[0, 0], [duration * 0.25, amplitude * 0.9], [duration * 0.5, -amplitude * 0.65], [duration * 0.75, amplitude], [duration, 0]])
  ];
}

function clip(id, duration, loop, extraTracks, events = []) {
  return { id, name: id, duration, frameRate: 60, loop, tracks: [...baseMotion(duration), ...extraTracks], events, markers: [], tags: ["reporter"] };
}

const animations = [
  clip("idle_neutral", 3, true, [...faceTracks("neutral", 3, false), ...pawTalkMotion(3, "sad")]),
  clip("talk_neutral", 2, true, [...faceTracks("neutral", 2, true), ...pawTalkMotion(2, "neutral")]),
  clip("talk_happy", 2, true, [...faceTracks("happy", 2, true), ...pawTalkMotion(2, "happy")]),
  clip("talk_sad", 2.2, true, [...faceTracks("sad", 2.2, true), ...pawTalkMotion(2.2, "sad"), motionTrack("head", "transform.rotation", [[0, 0], [1.1, -0.06], [2.2, 0]])]),
  clip("talk_angry", 1.8, true, [...faceTracks("angry", 1.8, true), ...pawTalkMotion(1.8, "angry")]),
  clip("explain_point", 2.4, true, [...faceTracks("neutral", 2.4, true), attachmentTrack("slot.paw_right", [[0, "paw_right"], [0.45, "paw_open_right"], [1.8, "paw_open_right"], [2.4, "paw_right"]]), ...pawTalkMotion(2.4, "neutral"), motionTrack("shoulderRight", "transform.rotation", [[0, 0], [0.45, -0.55], [1.8, -0.48], [2.4, 0]])]),
  clip("discuss_two_hands", 2.6, true, [...faceTracks("happy", 2.6, true), attachmentTrack("slot.paw_left", [[0, "paw_left"], [0.4, "paw_open_left"], [2.2, "paw_open_left"], [2.6, "paw_left"]]), attachmentTrack("slot.paw_right", [[0, "paw_right"], [0.4, "paw_open_right"], [2.2, "paw_open_right"], [2.6, "paw_right"]]), ...pawTalkMotion(2.6, "happy")]),
  clip("greeting", 1.8, false, [...faceTracks("happy", 1.8, false), attachmentTrack("slot.paw_right", [[0, "paw_right"], [0.3, "paw_open_right"], [1.45, "paw_open_right"], [1.8, "paw_right"]]), ...pawTalkMotion(1.8, "happy")], [{ time: 1.8, type: "reporter.complete", category: "gameplay" }]),
  clip("surprise_reaction", 1.4, false, [attachmentTrack("eyes", [[0, "eyes_neutral"], [0.2, "eyes_surprised"], [1.4, "eyes_surprised"]]), attachmentTrack("mouth", [[0, "mouth_neutral_mbp"], [0.2, "mouth_surprised_round"], [1.4, "mouth_surprised_round"]]), attachmentTrack("slot.paw_left", [[0, "paw_left"], [0.2, "paw_open_left"], [1.4, "paw_open_left"]]), attachmentTrack("slot.paw_right", [[0, "paw_right"], [0.2, "paw_open_right"], [1.4, "paw_open_right"]]), ...pawTalkMotion(1.4, "angry"), motionTrack("head", "transform.scaleX", [[0, 1], [0.2, 1.08], [0.5, 1], [1.4, 1]]), motionTrack("head", "transform.scaleY", [[0, 1], [0.2, 1.08], [0.5, 1], [1.4, 1]])], [{ time: 1.4, type: "reporter.complete", category: "gameplay" }]),
  clip("farewell", 1.8, false, [...faceTracks("sad", 1.8, false), attachmentTrack("slot.paw_left", [[0, "paw_left"], [0.35, "paw_open_left"], [1.45, "paw_open_left"], [1.8, "paw_left"]]), ...pawTalkMotion(1.8, "sad")], [{ time: 1.8, type: "reporter.complete", category: "gameplay" }])
];
const states = animations.map(({ id }) => ({ id, name: id, clipId: id }));
const transitions = states.flatMap((from) => states.filter((to) => to.id !== from.id).map((to) => ({ id: `${from.id}->${to.id}`, fromStateId: from.id, toStateId: to.id, duration: 0.15, easing: "easeInOut", canInterrupt: true, conditions: [{ parameterId: "reporterState", operator: "==", value: to.id }] })));

const source = {
  schemaVersion: "1.2.0", runtimeTarget: "pixi-v8", id: "milo-reporter", projectId: "milo-reporter", name: "Milo Reporter", units: "pixels", defaultFrameRate: 60,
  rigs: [{ id: "milo-reporter-rig", name: "Milo Reporter Rig", rootBoneId: "root", bones, parts, visualSlots, skins: [{ id: "default", name: "Milo Default", attachments }], defaultSkinId: "default", editor: { custom: { selectedBoneId: "torso", activeSkinId: "default", timeline: { selectedClipId: "idle_neutral", selectedKeyIds: [], keyClipboard: [], autoKey: true, snappingFps: 60, virtualWindow: { startRow: 0, rowCount: 16 } }, procedural: { inputs: { velocityX: 0, velocityY: 0, gravity: 1, wind: 0, grounded: true, jumpStart: false, landHeavy: false }, breathing: { enabled: false, frequency: 0.8, amplitude: 0, affectedBoneTransforms: {} }, secondaryMotion: { enabled: false, target: "root", stiffness: 0, damping: 0, velocityInfluence: 0, gravityInfluence: 0, windInfluence: 0, maxOffset: 0 }, squashStretch: { enabled: false, targetBone: "root", landingImpactScale: 0, rules: [] }, footIk: { enabled: false, feet: [], footChains: [], maxCorrection: 0, blend: 0 } } } } }],
  animations,
  stateMachines: [{ id: "milo-reporter-state-machine", name: "Milo Reporter State Machine", initialStateId: "idle_neutral", parameters: [{ id: "reporterState", type: "string", defaultValue: "idle_neutral" }], states, transitions }],
  proceduralPresets: [],
  editor: { custom: { savedFrom: "bones-editor", characterKind: "cat", preset: "milo-reporter" } }
};

const compiled = compileRig(source);
const dimensions = Object.fromEntries(parts.map((item) => {
  const texture = item.mesh?.texture ?? item.editor.custom.assetPath;
  const bytes = readFileSync(resolve(root, "apps/editor/public", texture.replace(/^\//, "")));
  return [item.id, [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]];
}));
const manifest = {
  id: "milo-reporter", name: "Milo Reporter", generatedWith: "OpenAI built-in ImageGen", reference: "User-provided white cat reporter portrait", chromaKey: "#00FF00",
  prompts: { identity: "Front-facing waist-up white cat reporter, amber eyes, black trench coat, no glasses or microphone.", body: "Strict isolated body and coat cutouts plus straight shoulder, upper-arm, forearm, closed-paw and open-paw chains for both sides.", eyes: "Strict 3x2 aligned eye-expression and gaze sheet with distinct pupil directions and shapes.", mouths: "Strict 5x5 aligned emotional viseme sheet with 21 visibly distinct feline mouth geometries and a locked nose anchor." },
  counts: { bones: bones.length, bodyParts: bodyParts.length, pawVariants: pawVariantParts.length, eyeParts: eyePartIds.length, mouthParts: mouthPartIds.length, totalParts: parts.length, clips: animations.length },
  facialPivots: { eyes: [0.5, 0.5], mouth: [0.5, 0.5] },
  bindings: Object.fromEntries(parts.map((item) => [item.id, { boneId: item.boneId, texture: item.mesh.texture, sourceSize: dimensions[item.id], runtimeSize: [item.mesh.vertices[2] - item.mesh.vertices[0], item.mesh.vertices[5] - item.mesh.vertices[1]] }])),
  qa: { transparentCorners: true, chromaFringeChecked: true, facialPivotsEqual: true, shoulderOverlapPadding: true }
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
console.log(`Built Milo: ${bones.length} bones, ${parts.length} parts, ${animations.length} clips`);
