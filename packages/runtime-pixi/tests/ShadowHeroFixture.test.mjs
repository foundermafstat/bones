import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Graphics } from "pixi.js";
import { RigInstance, RuntimeStateMachineController, sampleAnimationClip } from "../dist/index.js";

test("shadow hero compiled fixture renders body/head/limbs and samples core clips", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/shadow-hero.compiled.json", import.meta.url), "utf8"));
  const instance = new RigInstance(fixture);

  assert.equal(instance.bones.length, 9);
  assert.equal(instance.parts.length, 4);
  assert.ok(instance.parts.some((part) => part.renderable instanceof Graphics));
  assert.equal(fixture.animations.length, 6);
  assert.equal(fixture.lookups.bones.cloak, undefined);
  assert.ok(fixture.lookups.animations.run !== undefined);

  const idle = sampleAnimationClip(fixture.animations[fixture.lookups.animations.idle], 0.6);
  assert.ok(idle.values.some((value) => value.property === "transform.scaleY" && value.value > 1));
  const walk = sampleAnimationClip(fixture.animations[fixture.lookups.animations.walk], 0.36);
  assert.ok(walk.values.some((value) => value.property === "transform.rotation"));
  const run = sampleAnimationClip(fixture.animations[fixture.lookups.animations.run], 0.26);
  assert.ok(run.values.some((value) => value.property === "transform.rotation"));
  assert.ok(fixture.animations[fixture.lookups.animations.land].events.some((event) => event.type === "land" && event.category === "gameplay"));
});

test("shadow hero state machine covers locomotion jump fall land", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/shadow-hero.compiled.json", import.meta.url), "utf8"));
  const controller = new RuntimeStateMachineController(fixture.stateMachines[0]);
  const states = fixture.stateMachines[0].stateLookup;

  assert.equal(controller.update(0, { absSpeed: 40, grounded: true }).state.id, states.walk);
  assert.equal(controller.update(0.016, { absSpeed: 150, grounded: true }).state.id, states.run);
  assert.equal(controller.update(0.016, { velocityY: -20, grounded: false }).state.id, states.jump);
  assert.equal(controller.update(0.1, { velocityY: 20, grounded: false }).state.id, states.fall);
  assert.equal(controller.update(0.1, { landed: true, grounded: true }).state.id, states.land);
  assert.equal(controller.update(0.3, { grounded: true }).state.id, states.idle);
});
