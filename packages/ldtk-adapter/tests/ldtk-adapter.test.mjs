import assert from "node:assert/strict";
import test from "node:test";
import { parseLdtkLevel } from "../dist/index.js";

test("parses platformer entities from LDtk level", () => {
  const parsed = parseLdtkLevel({
    identifier: "test-room",
    layerInstances: [
      {
        __identifier: "Entities",
        entityInstances: [
          { __identifier: "Collider", px: [0, 64], width: 128, height: 16 },
          { __identifier: "MovingPlatform", px: [20, 40], width: 24, height: 8 },
          { __identifier: "DeathZone", px: [0, 96], width: 128, height: 16 },
          { __identifier: "WallJumpSurface", px: [120, 16], width: 8, height: 64 },
          { __identifier: "Spawn", px: [8, 32], fieldInstances: [{ __identifier: "id", __value: "player" }] },
          { __identifier: "Light", px: [64, 32], fieldInstances: [{ __identifier: "radius", __value: 96 }] },
          { __identifier: "CameraZone", px: [0, 0], width: 160, height: 90 },
          { __identifier: "AnimationTrigger", px: [110, 30], fieldInstances: [{ __identifier: "state", __value: "wallSlide" }] }
        ]
      }
    ]
  });

  assert.equal(parsed.id, "test-room");
  assert.equal(parsed.colliders.length, 4);
  assert.equal(parsed.spawnPoints[0].id, "player");
  assert.equal(parsed.lightEmitters[0].radius, 96);
  assert.equal(parsed.animationTriggers[0].state, "wallSlide");
});
