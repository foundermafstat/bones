import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMiloReporterProject } from "../app/characterTemplates.ts";
import { createReplaceKeyframeRangeCommand, createSetKeyframeAtTimeCommand, createSetTimelineAutoKeyCommand } from "../app/editorState.ts";
import { fromSourceProject, toSourceProject } from "../app/editorSourceProject.ts";
import { createProjectExportBundle } from "../app/projectIo.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const base = resolve(root, "apps/editor/public/assets/mascots/milo-reporter");

test("Milo preset has the complete facial animation package and round-trips", () => {
  const project = createMiloReporterProject("Milo Reporter");
  assert.equal(project.characterKind, "cat");
  assert.equal(project.hierarchy.length, 25);
  assert.equal(Object.keys(project.parts).length, 51);
  assert.equal(Object.keys(project.animations).length, 10);
  assert.equal(project.visualSlots.eyes.partIds.length, 6);
  assert.equal(project.visualSlots.mouth.partIds.length, 21);
  assert.deepEqual(project.visualSlots["slot.paw_left"].partIds, ["paw_left", "paw_open_left"]);
  assert.deepEqual(project.visualSlots["slot.paw_right"].partIds, ["paw_right", "paw_open_right"]);
  assert.equal(Object.values(project.parts).every((part) => !part.assetUrl && (!part.assetPath || /^(?:\/)?assets\//.test(part.assetPath))), true);
  assert.equal(project.animations.talk_happy.tracks["slot:mouth.attachment"].every((key) => key.interpolation === "step"), true);
  assert.equal(project.animations.talk_happy.tracks["slot:mouth.attachment"].length >= 30, true);
  assert.equal(["upperArmLeft.rotation", "forearmLeft.rotation", "pawLeft.rotation", "upperArmRight.rotation", "forearmRight.rotation", "pawRight.rotation"].every((trackId) => Boolean(project.animations.talk_happy.tracks[trackId]?.length)), true);
  assert.equal(project.animations.explain_point.tracks["slot:slot.paw_right.attachment"].some((key) => key.value === "paw_open_right"), true);
  assert.equal(project.animations.discuss_two_hands.tracks["slot:slot.paw_left.attachment"].some((key) => key.value === "paw_open_left"), true);
  assert.equal(project.animations.greeting.events.some((event) => event.type === "reporter.complete"), true);

  const restored = fromSourceProject(toSourceProject(project));
  assert.equal(restored.characterKind, "cat");
  assert.deepEqual(restored.visualSlots.mouth.partIds, project.visualSlots.mouth.partIds);
  assert.deepEqual(restored.animations.talk_happy.tracks["slot:mouth.attachment"], project.animations.talk_happy.tracks["slot:mouth.attachment"]);
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

test("Milo face attachment keys support auto key and command undo", () => {
  const project = createMiloReporterProject("Milo Reporter");
  const autoKey = createSetTimelineAutoKeyCommand(false);
  const autoKeyed = autoKey.do(project);
  assert.equal(autoKeyed.timeline.autoKey, false);
  assert.equal(autoKey.undo(autoKeyed).timeline.autoKey, project.timeline.autoKey);

  const before = project.animations.talk_happy.tracks["slot:mouth.attachment"];
  const command = createSetKeyframeAtTimeCommand("talk_happy", "slot:mouth.attachment", 0.117, "mouth_happy_fv", "step");
  const changed = command.do(project);
  assert.equal(changed.animations.talk_happy.tracks["slot:mouth.attachment"].some((key) => key.value === "mouth_happy_fv" && Math.abs(key.time - 7 / 60) < 0.0001), true);
  assert.deepEqual(command.undo(changed).animations.talk_happy.tracks["slot:mouth.attachment"], before);
});

test("Milo generated source, compiled output, manifest, and 51 RGBA assets are deterministic", () => {
  execFileSync(process.execPath, [resolve(root, "scripts/build-milo-reporter.mjs"), "--check"], { cwd: root });
  const source = JSON.parse(readFileSync(resolve(base, "milo-reporter.source.rig.json"), "utf8"));
  const compiled = JSON.parse(readFileSync(resolve(base, "milo-reporter.compiled.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(base, "milo-reporter.manifest.json"), "utf8"));
  const parts = readdirSync(resolve(base, "parts")).filter((name) => name.endsWith(".png"));
  assert.equal(source.schemaVersion, "1.2.0");
  assert.equal(compiled.compiledFormatVersion, "1.1.0");
  assert.equal(manifest.counts.totalParts, 51);
  assert.equal(parts.length, 51);
  assert.equal(parts.every((name) => existsSync(resolve(base, "parts", name))), true);
  const mouthTrack = compiled.animations.find((clip) => compiled.lookups.animations.talk_neutral === clip.id).tracks.find((track) => track.targetKind === "slot" && track.target === compiled.lookups.visualSlots.mouth);
  assert.equal(mouthTrack.keyframes.every((key) => typeof key.value === "number" && key.interpolation === "step"), true);
});

test("Milo production export includes every texture variant", async () => {
  const bundle = await createProjectExportBundle(createMiloReporterProject("Milo Reporter"));
  assert.equal(bundle.validation.ok, true, bundle.validation.errors.join("\n"));
  assert.equal(bundle.assetFiles.length, 51);
  assert.equal(bundle.assetFiles.some((asset) => asset.sourcePath.endsWith("mouth_surprised_round.png")), true);
  const visual = JSON.parse(bundle.files["hero.visual.compiled.json"]);
  assert.equal(visual.rig.visualSlots.find((slot) => slot.id === "mouth").partIds.length, 21);
  const torsoSlotIndex = visual.lookups.visualSlots["slot.chest_upper_coat"];
  assert.equal(visual.rig.visualSlots[torsoSlotIndex].id, "slot.chest_upper_coat");
  assert.equal(visual.rig.skins[0].attachments.find((attachment) => attachment.slot === torsoSlotIndex).part, visual.lookups.parts.chest_upper_coat);
});
