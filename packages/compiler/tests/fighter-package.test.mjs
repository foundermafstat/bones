import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const packageRoot = resolve(root, "apps/editor/public/assets/fighters/pulse");

test("Pulse package is deterministic and satisfies roster counts", () => {
  execFileSync(process.execPath, [resolve(root, "scripts/build-fighter-roster.mjs"), "--fighter=pulse", "--check"], { cwd: root });
  const source = JSON.parse(readFileSync(resolve(packageRoot, "pulse.source.rig.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "manifest.json"), "utf8"));
  const parts = readdirSync(resolve(packageRoot, "parts")).filter((name) => name.endsWith(".png"));
  assert.equal(source.rigs[0].bones.length, 38);
  assert.equal(source.rigs[0].parts.length, 21);
  assert.equal(source.animations.length, 50);
  assert.equal(parts.length, 21);
  assert.equal(parts.reduce((bytes, name) => bytes + statSync(resolve(packageRoot, "parts", name)).size, 0) <= 4 * 1024 * 1024, true);
  assert.equal(manifest.gender, "male");
  assert.equal(JSON.stringify(source).includes("/assets/dark-assassin"), false);
});
