import assert from "node:assert/strict";
import test from "node:test";
import {
  BONES_RUNTIME_TARGET,
  BONES_SCHEMA_VERSION,
  SchemaValidationError,
  assertRigProject,
  rigProjectJsonSchema,
  validateRigProject
} from "../dist/index.js";

const transform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1
};

const minimalProject = {
  schemaVersion: BONES_SCHEMA_VERSION,
  runtimeTarget: BONES_RUNTIME_TARGET,
  id: "project.player",
  name: "Player",
  rigs: [
    {
      id: "rig.player",
      name: "Player Rig",
      rootBoneId: "root",
      bones: [
        {
          id: "root",
          name: "Root",
          transform
        }
      ]
    }
  ]
};

test("exports a source JSON schema for RigProject", () => {
  assert.equal(rigProjectJsonSchema.title, "Bones RigProject Source JSON");
  assert.equal(rigProjectJsonSchema.properties.schemaVersion.const, BONES_SCHEMA_VERSION);
  assert.equal(rigProjectJsonSchema.properties.runtimeTarget.const, BONES_RUNTIME_TARGET);
});

test("validates a minimal source project", () => {
  const result = validateRigProject(minimalProject);

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, "1.0.0");
  assert.equal(result.value.runtimeTarget, "pixi-v8");
});

test("validates rig, animation, pose, procedural part, and state machine", () => {
  const project = {
    ...minimalProject,
    rigs: [
      {
        id: "rig.player",
        name: "Player Rig",
        rootBoneId: "root",
        bones: [
          { id: "root", name: "Root", transform },
          { id: "head", name: "Head", parentId: "root", transform: { ...transform, y: -40 } }
        ],
        parts: [
          {
            id: "part.head",
            name: "Head Shape",
            boneId: "head",
            type: "procedural",
            opacity: 1,
            fill: { color: "#111111", alpha: 1 },
            procedural: {
              preset: "organic-blob",
              params: { radius: 18, asymmetry: 0.2 }
            }
          }
        ],
        editor: {
          label: "Player",
          tags: ["hero", "silhouette"]
        }
      }
    ],
    animations: [
      {
        id: "clip.idle",
        name: "Idle",
        duration: 1,
        loop: true,
        tracks: [
          {
            id: "track.head.y",
            target: { kind: "bone", id: "head" },
            property: "transform.y",
            keyframes: [
              { time: 0, value: -40, interpolation: "linear" },
              { time: 1, value: -42, interpolation: "linear" }
            ]
          }
        ]
      }
    ],
    poses: [
      {
        id: "pose.idle",
        name: "Idle Pose",
        rigId: "rig.player",
        boneTransforms: {
          root: transform,
          head: { ...transform, y: -40 }
        }
      }
    ],
    stateMachines: [
      {
        id: "sm.locomotion",
        name: "Locomotion",
        initialStateId: "idle",
        parameters: [{ id: "speed", type: "number", defaultValue: 0 }],
        states: [{ id: "idle", name: "Idle", clipId: "clip.idle" }],
        transitions: [
          {
            id: "idle.self",
            fromStateId: "idle",
            toStateId: "idle",
            duration: 0.1,
            conditions: [{ parameterId: "speed", operator: ">=", value: 0 }]
          }
        ]
      }
    ]
  };

  assert.equal(validateRigProject(project).ok, true);
});

test("returns clear errors for invalid projects", () => {
  const invalid = {
    ...minimalProject,
    schemaVersion: "2.0.0",
    rigs: [
      {
        id: "rig.player",
        name: "Player Rig",
        rootBoneId: "missing",
        bones: [
          { id: "root", name: "Root", transform },
          { id: "root", name: "Duplicate Root", parentId: "ghost", transform }
        ],
        parts: [
          {
            id: "part.bad",
            name: "Bad Part",
            boneId: "ghost",
            type: "procedural",
            procedural: { preset: "unknown" }
          }
        ]
      }
    ],
    animations: [
      {
        id: "clip.bad",
        name: "Bad",
        duration: 1,
        tracks: [
          {
            id: "track.bad",
            target: { kind: "bone", id: "root" },
            property: "transform.x",
            keyframes: [
              { time: 1, value: 1 },
              { time: 0.5, value: 2 }
            ]
          }
        ]
      }
    ],
    stateMachines: [
      {
        id: "sm.bad",
        name: "Bad",
        initialStateId: "missing",
        states: [{ id: "idle", name: "Idle", clipId: "missing.clip" }],
        parameters: [{ id: "speed", type: "number", defaultValue: "fast" }],
        transitions: [{ id: "bad", fromStateId: "idle", toStateId: "missing", duration: -1 }]
      }
    ]
  };

  const result = validateRigProject(invalid);

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.message).join("\n"), /Unsupported schemaVersion/);
  assert.match(result.errors.map((error) => error.message).join("\n"), /Root bone 'missing' does not exist/);
  assert.match(result.errors.map((error) => error.message).join("\n"), /Bone id 'root' is duplicated/);
  assert.match(result.errors.map((error) => error.message).join("\n"), /Keyframes must be sorted by time/);
  assert.match(result.errors.map((error) => error.message).join("\n"), /Parameter defaultValue must match parameter type/);
});

test("assertRigProject throws SchemaValidationError", () => {
  assert.throws(
    () => assertRigProject({ ...minimalProject, runtimeTarget: "canvas-2d" }),
    (error) => error instanceof SchemaValidationError && /Unsupported runtimeTarget/.test(error.message)
  );
});
