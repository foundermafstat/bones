import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileRig, validateProject } from "../packages/compiler/dist/index.js";
import { parseLdtkLevel } from "../packages/ldtk-adapter/dist/index.js";
import { RigInstance, RigLoader, sampleAnimationClip } from "../packages/runtime-pixi/dist/index.js";

const sourceProject = JSON.parse(await readFile(new URL("../examples/shadow-hero/source.json", import.meta.url), "utf8"));
const ldtkRoom = JSON.parse(await readFile(new URL("../examples/ldtk/sample-room.ldtk.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../packages/runtime-pixi/fixtures/shadow-hero.compiled.json", import.meta.url), "utf8"));

validateProject(sourceProject);
const compiled = compileRig(sourceProject);
const loadedFixture = RigLoader.fromCompiled(fixture);
const level = parseLdtkLevel(ldtkRoom);

assert.equal(compiled.runtimeTarget, "pixi-v8");
assert.equal(compiled.animations?.length, 5);
assert.ok(compiled.lookups?.animations.idle !== undefined);
assert.ok(compiled.lookups?.animations.walk !== undefined);
assert.ok(compiled.lookups?.animations.jump !== undefined);
assert.ok(compiled.lookups?.animations.fall !== undefined);
assert.ok(compiled.lookups?.animations.land !== undefined);
assert.equal(compiled.rig.parts.some((part) => part.type === "mesh"), true);
assert.equal(level.colliders.length, 4);
assert.equal(level.spawnPoints[0]?.id, "player");

const rig = new RigInstance(compiled);
const idle = compiled.animations?.[compiled.lookups.animations.idle];
const land = compiled.animations?.[compiled.lookups.animations.land];
assert.ok(idle);
assert.ok(land);
rig.applySample(sampleAnimationClip(idle, 0.6));
const landState = rig.update(0.02, { grounded: true, landed: true, absSpeed: 0, velocityY: 4 });
assert.equal(Array.isArray(landState.events), true);

assert.equal(loadedFixture.rig.bones[0].local instanceof Float32Array, true);

console.log(
  JSON.stringify(
    {
      ok: true,
      sourceProject: sourceProject.id,
      compiledAnimations: compiled.animations?.length ?? 0,
      ldtkColliders: level.colliders.length,
      fixtureBones: loadedFixture.rig.bones.length,
      runtimeParts: rig.parts.length
    },
    null,
    2
  )
);
