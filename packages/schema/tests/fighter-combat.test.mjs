import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateFighterCombatProfile, validateFighterRosterManifest } from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = JSON.parse(readFileSync(resolve(root, "apps/editor/public/assets/fighters/pulse/pulse.source.rig.json"), "utf8"));
const profile = JSON.parse(readFileSync(resolve(root, "apps/editor/public/assets/fighters/pulse/pulse.combat.json"), "utf8"));
const roster = JSON.parse(readFileSync(resolve(root, "apps/editor/public/assets/fighters/roster.manifest.json"), "utf8"));

test("validates the Pulse combat profile against its rig", () => {
  assert.equal(validateFighterCombatProfile(profile, source).ok, true);
  assert.equal(validateFighterRosterManifest(roster).ok, true);
});

test("rejects invalid combat references, ranges, commands, and cancel targets", () => {
  const cases = [
    ["clip ref", (value) => { value.moves[0].clipId = "missing"; }, ".clipId"],
    ["bone ref", (value) => { value.moves[0].boxes[0].boneId = "missing"; }, ".boneId"],
    ["duration", (value) => { value.moves[0].activeWindows = [[0, 9999]]; }, "exceeds clip duration"],
    ["empty active", (value) => { value.moves[0].activeWindows = []; }, ".activeWindows"],
    ["command", (value) => { value.moves[0].command.buttons = ["INVALID"]; }, ".command.buttons"],
    ["cancel target", (value) => { value.moves[0].cancelWindows[0].into = ["missing"]; }, "Cancel target"]
  ];
  for (const [name, mutate, expected] of cases) {
    const value = structuredClone(profile);
    mutate(value);
    const result = validateFighterCombatProfile(value, source);
    assert.equal(result.ok, false, name);
    assert.match(result.errors.map((error) => `${error.path} ${error.message}`).join("\n"), new RegExp(expected.replace(".", "\\.")), name);
  }
});
