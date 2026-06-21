import assert from "node:assert/strict";
import test from "node:test";
import { Container, Graphics, GraphicsContext } from "pixi.js";
import { RigInstance, RigLoader } from "../dist/index.js";

const compiledFixture = {
  compiledFormatVersion: "1.0.0",
  schemaVersion: "1.0.0",
  runtimeTarget: "pixi-v8",
  sourceProjectId: "project.hero",
  name: "Hero",
  rig: {
    id: 0,
    rootBone: 0,
    bones: [
      { id: 0, parent: -1, local: [0, 0, 0, 1, 1, 0, 0], length: 0 },
      { id: 1, parent: 0, local: [12, -20, 0.2, 1.5, 0.75, 0.1, -0.1], length: 30 },
      { id: 2, parent: 1, local: [0, -18, 0, 1, 1, 0, 0], length: 10 }
    ],
    parts: [
      {
        id: 0,
        bone: 1,
        type: "path",
        drawOrder: 2,
        visible: true,
        opacity: 0.8,
        local: [1, 2, 0.1, 1, 1, 0, 0],
        fill: { color: "#050505", alpha: 1 },
        path: {
          closed: true,
          commands: [
            { cmd: "M", x: 0, y: 0 },
            { cmd: "L", x: 10, y: 0 },
            { cmd: "L", x: 10, y: 10 },
            { cmd: "Z" }
          ]
        }
      }
    ]
  }
};

test("RigLoader accepts compiled pixi-v8 JSON", async () => {
  const loaded = await RigLoader.load(compiledFixture);

  assert.equal(loaded.name, "Hero");
  assert.throws(() => RigLoader.fromCompiled({ runtimeTarget: "canvas" }), /Invalid compiled Bones rig/);
});

test("RigInstance creates Pixi Container hierarchy and default transforms", () => {
  const instance = new RigInstance(compiledFixture);
  const root = instance.getBoneContainer(0);
  const body = instance.getBoneContainer(1);
  const head = instance.getBoneContainer(2);
  const part = instance.getPartContainer(0);

  assert.ok(instance.container instanceof Container);
  assert.equal(instance.container.children[0], instance.rigContainer);
  assert.equal(instance.rigContainer.children[0], root);
  assert.equal(root.children[0], body);
  assert.equal(body.children[0], head);
  assert.equal(body.children[1], part);

  assert.equal(body.position.x, 12);
  assert.equal(body.position.y, -20);
  assert.equal(body.rotation, 0.2);
  assert.equal(body.scale.x, 1.5);
  assert.equal(body.scale.y, 0.75);
  assert.equal(body.skew.x, 0.1);
  assert.equal(body.skew.y, -0.1);

  assert.equal(part.position.x, 1);
  assert.equal(part.position.y, 2);
  assert.equal(part.alpha, 0.8);
  assert.equal(part.visible, true);
  assert.equal(part.zIndex, 2);
  assert.ok(instance.parts[0].renderable instanceof Graphics);
  assert.ok(instance.parts[0].graphicsContext instanceof GraphicsContext);
  assert.equal(part.children[0], instance.parts[0].renderable);
});

test("update stores params and reapplies default transforms without animation", () => {
  const instance = new RigInstance(compiledFixture);
  const body = instance.getBoneContainer(1);
  const graphics = instance.parts[0].renderable;
  const context = instance.parts[0].graphicsContext;
  body.position.set(999, 999);

  const state = instance.update(0.016, { absSpeed: 10, grounded: true });

  assert.equal(state.elapsed, 0.016);
  assert.deepEqual(state.params, { absSpeed: 10, grounded: true });
  assert.equal(body.position.x, 12);
  assert.equal(body.position.y, -20);
  assert.equal(instance.parts[0].renderable, graphics);
  assert.equal(instance.parts[0].graphicsContext, context);
});

test("applySample applies sampled bone and part properties", () => {
  const instance = new RigInstance(compiledFixture);
  const body = instance.getBoneContainer(1);
  const part = instance.getPartContainer(0);

  instance.applySample({
    localTime: 0.5,
    normalizedTime: 0.5,
    values: [
      { targetKind: "bone", target: 1, property: "transform.x", value: 22 },
      { targetKind: "bone", target: 1, property: "transform.scaleY", value: 1.25 },
      { targetKind: "part", target: 0, property: "opacity", value: 0.35 }
    ]
  });

  assert.equal(body.position.x, 22);
  assert.equal(body.position.y, -20);
  assert.equal(body.scale.y, 1.25);
  assert.equal(part.alpha, 0.35);

  instance.applySample({ localTime: 0, normalizedTime: 0, values: [] });
  assert.equal(body.position.x, 12);
  assert.equal(part.alpha, 0.8);
});
