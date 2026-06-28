import assert from "node:assert/strict";
import test from "node:test";
import { createInitialControllerState, toAnimationParameters, updatePlatformerController } from "../src/index.ts";

const level = {
  colliders: [
    { x: -100, y: 34, width: 240, height: 16, kind: "solid" },
    { x: 42, y: -20, width: 12, height: 60, kind: "wallJump" },
    { x: 80, y: 10, width: 20, height: 20, kind: "deathZone" }
  ],
  cameraZones: [{ x: -50, y: -80, width: 100, height: 80, kind: "solid" }],
  animationTriggers: [{ x: 40, y: 0, state: "wallSlide" }]
};

test("controller collides with LDtk preview level and exposes debug params", () => {
  const state = updatePlatformerController(createInitialControllerState(0, 0), { moveX: 1, jumpPressed: false }, 0.2, level);
  assert.equal(state.grounded, true);
  assert.ok(state.debug.activeColliders.length > 0);
  assert.equal(typeof state.cameraX, "number");
  assert.equal(toAnimationParameters(state).wallContact, state.wallContact);
});

test("controller supports jump/fall/wall slide and death zone debug", () => {
  const jump = updatePlatformerController(createInitialControllerState(0, 0), { moveX: 0, jumpPressed: true }, 0.016, level);
  assert.equal(jump.animationState, "jump");

  const land = updatePlatformerController({ ...createInitialControllerState(0, 10), grounded: false, wasGrounded: false, velocityY: 180 }, { moveX: 0, jumpPressed: false }, 0.05, level);
  assert.equal(land.animationState, "land");
  assert.ok(toAnimationParameters(land).landingImpact > 0);

  const wall = updatePlatformerController({ ...createInitialControllerState(39, -12), grounded: false, velocityY: 120 }, { moveX: 1, jumpPressed: false }, 0.016, level);
  assert.equal(wall.animationState, "wallSlide");

  const death = updatePlatformerController(createInitialControllerState(85, 0), { moveX: 0, jumpPressed: false }, 0.016, level);
  assert.equal(death.debug.touchedDeathZone, true);
});

test("controller switches from walk to run when run input is held", () => {
  const walk = updatePlatformerController(createInitialControllerState(0, 0), { moveX: 1, jumpPressed: false }, 0.016, level);
  assert.equal(walk.animationState, "walk");

  const run = updatePlatformerController(createInitialControllerState(0, 0), { moveX: 1, jumpPressed: false, runHeld: true }, 0.016, level);
  assert.equal(run.animationState, "run");
  assert.equal(toAnimationParameters(run).absSpeed, Math.abs(run.velocityX));
});
