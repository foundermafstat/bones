import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Graphics, Mesh } from "pixi.js";
import { RigInstance, RuntimeStateMachineController, sampleAnimationClip } from "../dist/index.js";

test("shadow hero compiled fixture renders body/head/limbs/cloak and samples core clips", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/shadow-hero.compiled.json", import.meta.url), "utf8"));
  const instance = new RigInstance(fixture);

  assert.equal(instance.bones.length, 16);
  assert.equal(instance.parts.length, 15);
  assert.ok(instance.parts.some((part) => part.renderable instanceof Graphics));
  assert.ok(instance.parts.some((part) => part.renderable instanceof Mesh));
  assert.equal(fixture.animations.length, 5);

  const idle = sampleAnimationClip(fixture.animations[0], 0.6);
  assert.ok(idle.values.some((value) => value.property === "transform.scaleY" && value.value > 1));
  const walk = sampleAnimationClip(fixture.animations[1], 0.36);
  assert.ok(walk.values.some((value) => value.property === "transform.rotation"));
});

test("shadow hero state machine covers locomotion jump fall land", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/shadow-hero.compiled.json", import.meta.url), "utf8"));
  const controller = new RuntimeStateMachineController(fixture.stateMachines[0]);

  const locomotion = controller.update(0, { absSpeed: 40, grounded: true });
  assert.deepEqual(locomotion.blendTree, { lowerClip: 0, upperClip: 1, weight: 0.5 });

  assert.equal(controller.update(0.016, { jumpPressed: true, grounded: true }).state.id, 1);
  assert.equal(controller.update(0.1, { velocityY: 20, grounded: false }).state.id, 2);
  assert.equal(controller.update(0.1, { grounded: true }).state.id, 3);
  assert.equal(controller.update(0.3, {}).state.id, 0);
});
