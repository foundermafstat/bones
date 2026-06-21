import assert from "node:assert/strict";
import test from "node:test";
import {
  BONES_COMPILED_FORMAT_VERSION,
  CompileError,
  SchemaValidationError,
  buildLookupTables,
  compileRig,
  compiledRigProjectJsonSchema,
  flattenKeyframes,
  migrateCompiledRigProject,
  validateProject
} from "../dist/index.js";

const transform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1
};

const sourceProject = {
  schemaVersion: "1.0.0",
  runtimeTarget: "pixi-v8",
  id: "project.hero",
  name: "Hero",
  editor: { notes: "stripped" },
  rigs: [
    {
      id: "rig.hero",
      name: "Hero Rig",
      rootBoneId: "root",
      editor: { color: "#fff" },
      bones: [
        { id: "root", name: "Root", transform, editor: { locked: true } },
        { id: "body", name: "Body", parentId: "root", transform: { ...transform, y: -20 }, length: 30 }
      ],
      parts: [
        {
          id: "part.body",
          name: "Body Shape",
          boneId: "body",
          type: "procedural",
          drawOrder: 2,
          opacity: 0.9,
          fill: { color: "#050505", alpha: 1 },
          procedural: {
            preset: "tapered-limb",
            params: { length: 32, startWidth: 9, endWidth: 5 }
          },
          editor: { label: "body" }
        }
      ]
    }
  ],
  animations: [
    {
      id: "idle",
      name: "Idle",
      duration: 1,
      loop: true,
      editor: { notes: "clip metadata" },
      tracks: [
        {
          id: "track.body.y",
          target: { kind: "bone", id: "body" },
          property: "transform.y",
          keyframes: [
            { time: 0, value: -20 },
            { time: 1, value: -22, interpolation: "bezier", curve: [0.25, 0.1, 0.25, 1] }
          ]
        }
      ]
    }
  ],
  stateMachines: [
    {
      id: "locomotion",
      name: "Locomotion",
      initialStateId: "idle",
      parameters: [{ id: "absSpeed", type: "number", defaultValue: 0 }],
      states: [{ id: "idle", name: "Idle", clipId: "idle" }],
      transitions: [
        {
          id: "idle.self",
          fromStateId: "idle",
          toStateId: "idle",
          duration: 0.1,
          easing: "easeOut",
          priority: 3,
          canInterrupt: false,
          syncMode: "normalizedTime",
          conditions: [{ parameterId: "absSpeed", operator: ">=", value: 0 }]
        }
      ],
      editor: { collapsed: true }
    }
  ]
};

test("compiles source project into deterministic compiled JSON v1", () => {
  const first = compileRig(sourceProject);
  const second = compileRig(sourceProject);

  assert.deepEqual(first, second);
  assert.equal(first.compiledFormatVersion, BONES_COMPILED_FORMAT_VERSION);
  assert.deepEqual(first.lookups, {
    rigs: { "rig.hero": 0 },
    bones: { root: 0, body: 1 },
    parts: { "part.body": 0 },
    animations: { idle: 0 },
    stateMachines: { locomotion: 0 }
  });
  assert.deepEqual(first.rig.bones, [
    { id: 0, parent: -1, local: [0, 0, 0, 1, 1, 0, 0], length: 0 },
    { id: 1, parent: 0, local: [0, -20, 0, 1, 1, 0, 0], length: 30 }
  ]);
  assert.equal(first.animations[0].tracks[0].target, 1);
  assert.deepEqual(first.animations[0].tracks[0].keyframes[1].curve, [0.25, 0.1, 0.25, 1]);
  assert.equal(first.stateMachines[0].transitions[0].conditions[0].parameter, 0);
  assert.equal(first.stateMachines[0].transitions[0].easing, "easeOut");
  assert.equal(first.stateMachines[0].transitions[0].syncMode, "normalizedTime");
  assert.equal(JSON.stringify(first).includes("editor"), false);
});

test("normalizes source array order into stable compiled ids", () => {
  const reordered = JSON.parse(JSON.stringify(sourceProject));
  reordered.rigs[0].bones.reverse();

  assert.deepEqual(compileRig(reordered), compileRig(sourceProject));
});

test("buildLookupTables exposes stable numeric ids", () => {
  const project = validateProject(sourceProject);
  const lookups = buildLookupTables(project);

  assert.equal(lookups.bones.body, 1);
  assert.equal(lookups.animations.idle, 0);
});

test("flattenKeyframes fills interpolation and curve defaults", () => {
  assert.deepEqual(
    flattenKeyframes([
      { time: 0, value: 1 },
      { time: 1, value: 2, interpolation: "bezier" }
    ]),
    [
      { time: 0, value: 1, interpolation: "linear", curve: [0, 0, 1, 1] },
      { time: 1, value: 2, interpolation: "bezier", curve: [0.25, 0.1, 0.25, 1] }
    ]
  );
});

test("invalid source project fails with clear validation error", () => {
  assert.throws(
    () => compileRig({ ...sourceProject, runtimeTarget: "dom" }),
    (error) => error instanceof CompileError && /\$\.runtimeTarget/.test(error.message)
  );
});

test("validateProject keeps source schema validation semantics", () => {
  assert.throws(
    () => validateProject({ ...sourceProject, runtimeTarget: "dom" }),
    (error) => error instanceof SchemaValidationError && /\$\.runtimeTarget/.test(error.message)
  );
});

test("exports compiled json schema and compiled migration contract", () => {
  const compiled = compileRig(sourceProject);

  assert.equal(compiledRigProjectJsonSchema.$id, "https://bones.dev/schemas/compiled-rig-project-1.0.0.json");
  assert.equal(compiledRigProjectJsonSchema.properties.compiledFormatVersion.const, BONES_COMPILED_FORMAT_VERSION);
  assert.equal(migrateCompiledRigProject(compiled), compiled);
  assert.throws(() => migrateCompiledRigProject({ ...compiled, compiledFormatVersion: "0.9.0" }), /Unsupported compiledFormatVersion/);
});
