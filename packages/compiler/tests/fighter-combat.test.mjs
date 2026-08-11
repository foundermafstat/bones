import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compileFighterCombatProfile, compileRig } from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = JSON.parse(readFileSync(resolve(root, "apps/editor/public/assets/fighters/pulse/pulse.source.rig.json"), "utf8"));
const profile = JSON.parse(readFileSync(resolve(root, "apps/editor/public/assets/fighters/pulse/pulse.combat.json"), "utf8"));

test("compiles fighter clip, bone, and cancel references to numeric ids", () => {
  const compiledRig = compileRig(source);
  const first = compileFighterCombatProfile(profile, compiledRig);
  const second = compileFighterCombatProfile(profile, compiledRig);
  assert.deepEqual(first, second);
  assert.equal(first.moves.length, 30);
  assert.equal(typeof first.moves[0].clip, "number");
  assert.equal(typeof first.moves[0].boxes[0].bone, "number");
  assert.equal(first.moves.every((move) => move.cancelWindows.every((window) => window.into.every(Number.isInteger))), true);
});
