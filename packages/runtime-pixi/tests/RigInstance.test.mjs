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
  assert.equal(loaded.rig.bones[0].local instanceof Float32Array, true);
  assert.equal(loaded.rig.parts[0].local instanceof Float32Array, true);
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
  assert.ok(Math.abs(body.rotation - 0.2) < 0.000001);
  assert.equal(body.scale.x, 1.5);
  assert.equal(body.scale.y, 0.75);
  assert.ok(Math.abs(body.skew.x - 0.1) < 0.000001);
  assert.ok(Math.abs(body.skew.y + 0.1) < 0.000001);

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

test("update samples the first compiled animation when no state machine is active", () => {
  const instance = new RigInstance({
    ...compiledFixture,
    animations: [transformClip(0, "transform.x", 12, 22)]
  });
  const body = instance.getBoneContainer(1);

  const state = instance.update(0.5, { absSpeed: 3 });

  assert.equal(body.position.x, 17);
  assert.equal(state.activeClip, 0);
  assert.equal(state.sampledValues, 1);
  assert.equal(state.proceduralValues, 0);
  assert.equal(state.constraintValues, 0);
});

test("update evaluates state machine and crossfades through the mixer", () => {
  const instance = new RigInstance({
    ...compiledFixture,
    animations: [transformClip(0, "transform.x", 12, 12), transformClip(1, "transform.x", 42, 42)],
    stateMachines: [
      {
        id: 0,
        initialState: 0,
        states: [
          { id: 0, clip: 0 },
          { id: 1, clip: 1 }
        ],
        transitions: [
          {
            id: 0,
            from: 0,
            to: 1,
            duration: 0.1,
            priority: 0,
            canInterrupt: true,
            conditions: [{ parameter: 0, operator: "==", value: true }]
          }
        ],
        parameters: [{ id: 0, type: "boolean", defaultValue: false }],
        parameterLookup: { go: 0 }
      }
    ]
  });
  const body = instance.getBoneContainer(1);

  const transition = instance.update(0.05, { go: true });
  assert.equal(transition.activeState, 1);
  assert.equal(transition.activeTransition, 0);
  assert.equal(transition.transitionWeight, 0.5);
  assert.equal(transition.previousClip, 0);
  assert.deepEqual(transition.sampledClipTimes.map((entry) => entry.clip), [0, 1]);
  assert.equal(transition.stateMachine.transitionWeight, 0.5);
  assert.equal(body.position.x, 27);

  const settled = instance.update(0.05, { go: false });
  assert.equal(settled.activeState, 1);
  assert.equal(settled.transitionWeight, 0);
  assert.equal(body.position.x, 42);
});

test("update applies procedural and constraint samples after base animation", () => {
  const world = {
    raycastDown(x, y, distance) {
      return { hit: true, x, y: y + distance - 2, normalX: 0, normalY: 1 };
    }
  };
  const instance = new RigInstance(
    {
      ...compiledFixture,
      animations: [transformClip(0, "transform.scaleX", 1.5, 1.5)]
    },
    {
      stateMachine: false,
      proceduralLayers: [
        {
          type: "squashStretch",
          rules: [{ condition: "landHeavy", targetBone: 1, scaleX: 1.2, scaleY: 0.8, duration: 0.1 }]
        }
      ],
      constraints: {
        config: { feet: [{ footBone: 1, raycastOffsetX: 0, raycastHeight: 10, maxCorrection: 4, blend: 1 }] },
        world
      }
    }
  );
  const body = instance.getBoneContainer(1);

  const state = instance.update(0.01, { landHeavy: true, grounded: true, "bone.1.worldY": 10 });

  assert.ok(body.scale.x > 1.5);
  assert.ok(body.position.y > -20);
  assert.equal(state.proceduralValues, 2);
  assert.equal(state.constraintValues, 2);
});

test("update applies compiled procedural layers by default", () => {
  const instance = new RigInstance({
    ...compiledFixture,
    proceduralLayers: [
      {
        type: "breathing",
        enabled: true,
        frequency: 1,
        amplitude: 1,
        affectedBones: { 1: { "transform.y": -2 } }
      }
    ]
  });
  const body = instance.getBoneContainer(1);

  const state = instance.update(0.25, {});

  assert.equal(state.proceduralValues, 1);
  assert.equal(body.position.y, -22);
});

test("constraints derive bone world params, rotate to surface normal, gate jump, and lock feet", () => {
  let hit = true;
  const world = {
    raycastDown(x, y, distance) {
      return hit ? { hit: true, x, y: y + distance - 3, normalX: 0.5, normalY: 1 } : { hit: false, x, y, normalX: 0, normalY: 1 };
    }
  };
  const instance = new RigInstance(compiledFixture, {
    stateMachine: false,
    constraints: {
      config: { feet: [{ footBone: 1, shinBone: 2, thighBone: 3, raycastOffsetX: 0, raycastHeight: 10, maxCorrection: 6, blend: 1 }] },
      world
    }
  });
  const foot = instance.getBoneContainer(1);

  const grounded = instance.update(0.01, { grounded: true });
  assert.equal(grounded.constraintValues, 4);
  assert.ok(foot.position.y > -20);
  assert.ok(Math.abs(foot.rotation) > 0.1);

  const jumping = instance.update(0.01, { grounded: true, jumpPressed: true });
  assert.equal(jumping.constraintValues, 0);

  hit = false;
  const locked = instance.update(0.01, { grounded: true, "foot.1.locked": true });
  assert.equal(locked.constraintValues, 4);
});

test("mesh deform tracks update vertices without rebuilding renderable and reset to base", () => {
  const meshFixture = structuredClone(compiledFixture);
  meshFixture.rig.parts.push({
    id: 1,
    bone: 1,
    type: "mesh",
    drawOrder: 3,
    visible: true,
    opacity: 1,
    local: [0, 0, 0, 1, 1, 0, 0],
    fill: { color: "#050505", alpha: 1 },
    mesh: { vertices: [0, 0, 10, 0, 0, 10], indices: [0, 1, 2] }
  });
  const instance = new RigInstance(
    {
      ...meshFixture,
      animations: [
        {
          id: 0,
          duration: 1,
          fps: 60,
          loop: true,
          tracks: [{ id: 0, targetKind: "part", target: 1, property: "deform", keyframes: [{ time: 0, value: [0, 2, 1, 0, -1, 0], interpolation: "hold" }] }]
        }
      ]
    },
    { stateMachine: false }
  );
  const meshPart = instance.getPartContainer(1).children[0];
  const renderableBefore = meshPart;
  const positions = meshPart.__bonesMeshPositions;

  instance.update(0.01);
  assert.deepEqual(Array.from(positions), [0, 2, 11, 0, -1, 10]);
  assert.equal(instance.getPartContainer(1).children[0], renderableBefore);

  instance.applySample({ normalizedTime: 0, localTime: 0, values: [] });
  assert.deepEqual(Array.from(positions), [0, 0, 10, 0, 0, 10]);
});

test("skinned mesh vertices follow sampled bone transforms", () => {
  const instance = new RigInstance({
    compiledFormatVersion: "1.0.0",
    schemaVersion: "1.0.0",
    runtimeTarget: "pixi-v8",
    sourceProjectId: "project.skinned",
    name: "Skinned",
    rig: {
      id: 0,
      rootBone: 0,
      bones: [
        { id: 0, parent: -1, local: [0, 0, 0, 1, 1, 0, 0], length: 0 },
        { id: 1, parent: 0, local: [10, 0, 0, 1, 1, 0, 0], length: 10 }
      ],
      parts: [
        {
          id: 0,
          bone: 0,
          type: "mesh",
          drawOrder: 0,
          visible: true,
          opacity: 1,
          local: [0, 0, 0, 1, 1, 0, 0],
          mesh: {
            vertices: [10, 0, 20, 0, 10, 10],
            indices: [0, 1, 2],
            skin: [
              [{ bone: 1, x: 0, y: 0, weight: 1 }],
              [{ bone: 1, x: 10, y: 0, weight: 1 }],
              [{ bone: 1, x: 0, y: 10, weight: 1 }]
            ]
          }
        }
      ]
    }
  });
  const meshPart = instance.getPartContainer(0).children[0];
  const positions = meshPart.__bonesMeshPositions;

  assert.equal(instance.getPartContainer(0).parent, instance.rigContainer);
  assert.deepEqual(Array.from(positions), [10, 0, 20, 0, 10, 10]);

  instance.applySample({
    normalizedTime: 0,
    localTime: 0,
    values: [{ targetKind: "bone", target: 1, property: "transform.x", value: 20 }]
  });

  assert.deepEqual(Array.from(positions), [20, 0, 30, 0, 20, 10]);
});

test("skinned mesh deform offsets are applied before skinning", () => {
  const instance = new RigInstance({
    compiledFormatVersion: "1.0.0",
    schemaVersion: "1.0.0",
    runtimeTarget: "pixi-v8",
    sourceProjectId: "project.skinned-deform",
    name: "Skinned Deform",
    rig: {
      id: 0,
      rootBone: 0,
      bones: [
        { id: 0, parent: -1, local: [0, 0, Math.PI / 2, 1, 1, 0, 0], length: 0 },
        { id: 1, parent: 0, local: [10, 0, 0, 1, 1, 0, 0], length: 10 }
      ],
      parts: [
        {
          id: 0,
          bone: 0,
          type: "mesh",
          drawOrder: 0,
          visible: true,
          opacity: 1,
          local: [0, 0, 0, 1, 1, 0, 0],
          mesh: {
            vertices: [0, 10],
            indices: [0],
            skin: [[{ bone: 1, x: 0, y: 0, weight: 1 }]]
          }
        }
      ]
    }
  });
  const positions = instance.getPartContainer(0).children[0].__bonesMeshPositions;

  instance.applySample({
    normalizedTime: 0,
    localTime: 0,
    values: [{ targetKind: "part", target: 0, property: "deform", value: [0, 5] }]
  });

  assert.ok(Math.abs(positions[0] + 5) < 0.0001);
  assert.ok(Math.abs(positions[1] - 10) < 0.0001);
});

test("update exposes state machine blend tree as mixer layers", () => {
  const instance = new RigInstance({
    ...compiledFixture,
    animations: [transformClip(0, "transform.x", 10, 10), transformClip(1, "transform.x", 30, 30)],
    stateMachines: [
      {
        id: 0,
        initialState: 0,
        states: [
          {
            id: 0,
            clip: 0,
            blendTree: {
              type: "1d",
              parameter: 0,
              children: [
                { threshold: 0, clip: 0 },
                { threshold: 10, clip: 1 }
              ]
            }
          }
        ],
        transitions: [],
        parameters: [{ id: 0, type: "number", defaultValue: 0 }],
        parameterLookup: { absSpeed: 0 }
      }
    ]
  });
  const body = instance.getBoneContainer(1);

  const state = instance.update(0, { absSpeed: 5 });

  assert.equal(body.position.x, 20);
  assert.deepEqual(state.stateMachine.blendTree, { lowerClip: 0, upperClip: 1, weight: 0.5 });
  assert.deepEqual(state.activeLayers, [
    { source: "base", clip: 0, weight: 0.5, additive: false },
    { source: "blendTree", clip: 1, weight: 0.5, additive: false }
  ]);
});

test("update passes transition easing and sync mode from state machine to mixer", () => {
  const instance = new RigInstance({
    ...compiledFixture,
    animations: [transformClip(0, "transform.x", 12, 12), transformClip(1, "transform.x", 42, 42)],
    stateMachines: [
      {
        id: 0,
        initialState: 0,
        states: [
          { id: 0, clip: 0 },
          { id: 1, clip: 1 }
        ],
        transitions: [
          {
            id: 0,
            from: 0,
            to: 1,
            duration: 0.1,
            easing: "easeIn",
            syncMode: "phaseMatch",
            priority: 0,
            canInterrupt: true,
            conditions: [{ parameter: 0, operator: "==", value: true }]
          }
        ],
        parameters: [{ id: 0, type: "boolean", defaultValue: false }],
        parameterLookup: { go: 0 }
      }
    ]
  });
  const body = instance.getBoneContainer(1);

  const transition = instance.update(0.05, { go: true });

  assert.equal(transition.transitionWeight, 0.25);
  assert.equal(body.position.x, 19.5);
  assert.deepEqual(transition.activeLayers, [
    { source: "transition", clip: 0, weight: 0.75, additive: false },
    { source: "transition", clip: 1, weight: 0.25, additive: false }
  ]);
});

test("update queues and emits animation events through subscriptions", () => {
  const instance = new RigInstance({
    ...compiledFixture,
    animations: [
      {
        ...transformClip(0, "transform.x", 12, 12),
        events: [{ time: 0.2, type: "dust", category: "vfx", duration: 0.1, payload: { side: "left" } }]
      }
    ]
  });
  const received = [];
  const unsubscribe = instance.on("animationEvent", (event) => received.push(event));

  const state = instance.update(0.25, {});
  unsubscribe();
  instance.update(1, {});

  assert.equal(state.events.length, 1);
  assert.equal(state.eventHistory.length, 1);
  assert.deepEqual(received, [
    {
      time: 0.2,
      type: "dust",
      category: "vfx",
      duration: 0.1,
      payload: { side: "left" },
      clip: 0,
      localTime: 0.2,
      normalizedTime: 0.2
    }
  ]);
});

function transformClip(id, property, from, to) {
  return {
    id,
    duration: 1,
    fps: 60,
    loop: true,
    tracks: [
      {
        id,
        targetKind: "bone",
        target: 1,
        property,
        keyframes: [
          { time: 0, value: from, interpolation: "linear", curve: [0, 0, 1, 1] },
          { time: 1, value: to, interpolation: "linear", curve: [0, 0, 1, 1] }
        ]
      }
    ]
  };
}
