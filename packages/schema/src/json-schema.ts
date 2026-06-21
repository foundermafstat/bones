import { BONES_RUNTIME_TARGET, BONES_SCHEMA_VERSION } from "./types.js";

export type JsonSchema = {
  readonly [key: string]: unknown;
};

export const rigProjectJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://bones.dev/schemas/source-project-1.0.0.json",
  title: "Bones RigProject Source JSON",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "runtimeTarget", "id", "name", "rigs"],
  properties: {
    schemaVersion: { const: BONES_SCHEMA_VERSION },
    runtimeTarget: { const: BONES_RUNTIME_TARGET },
    id: { $ref: "#/$defs/nonEmptyString" },
    projectId: { $ref: "#/$defs/nonEmptyString" },
    name: { $ref: "#/$defs/nonEmptyString" },
    units: { const: "pixels" },
    defaultFrameRate: { type: "number", exclusiveMinimum: 0 },
    rigs: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/rig" }
    },
    animations: {
      type: "array",
      items: { $ref: "#/$defs/animationClip" }
    },
    poses: {
      type: "array",
      items: { $ref: "#/$defs/pose" }
    },
    stateMachines: {
      type: "array",
      items: { $ref: "#/$defs/stateMachine" }
    },
    proceduralPresets: {
      type: "array",
      items: { $ref: "#/$defs/proceduralAnimationPreset" }
    },
    preview: { $ref: "#/$defs/previewSettings" },
    editor: { $ref: "#/$defs/editorMetadata" }
  },
  $defs: {
    nonEmptyString: { type: "string", minLength: 1 },
    transform2d: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "rotation", "scaleX", "scaleY"],
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        rotation: { type: "number" },
        scaleX: { type: "number" },
        scaleY: { type: "number" },
        skewX: { type: "number" },
        skewY: { type: "number" }
      }
    },
    rig: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "rootBoneId", "bones"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        rootBoneId: { $ref: "#/$defs/nonEmptyString" },
        bones: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/bone" }
        },
        parts: {
          type: "array",
          items: { $ref: "#/$defs/part" }
        },
        editor: { $ref: "#/$defs/editorMetadata" }
      }
    },
    bone: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        parentId: { $ref: "#/$defs/nonEmptyString" },
        local: { $ref: "#/$defs/transform2d" },
        transform: { $ref: "#/$defs/transform2d" },
        length: { type: "number", minimum: 0 },
        inheritRotation: { type: "boolean" },
        inheritScale: { type: "boolean" },
        mirrorGroup: { $ref: "#/$defs/nonEmptyString" },
        tags: { type: "array", items: { type: "string" } },
        editor: { $ref: "#/$defs/editorMetadata" }
      },
      anyOf: [{ required: ["local"] }, { required: ["transform"] }]
    },
    part: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "boneId", "type"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        boneId: { $ref: "#/$defs/nonEmptyString" },
        type: { enum: ["path", "procedural", "mesh", "svg"] },
        drawOrder: { type: "number" },
        visible: { type: "boolean" },
        opacity: { type: "number", minimum: 0, maximum: 1 },
        local: { $ref: "#/$defs/transform2d" },
        transform: { $ref: "#/$defs/transform2d" },
        fill: { $ref: "#/$defs/fill" },
        path: { $ref: "#/$defs/pathShape" },
        procedural: { $ref: "#/$defs/proceduralShape" },
        mesh: { $ref: "#/$defs/meshShape" },
        svg: { $ref: "#/$defs/svgShape" },
        editor: { $ref: "#/$defs/editorMetadata" }
      }
    },
    fill: {
      type: "object",
      additionalProperties: false,
      required: ["color"],
      properties: {
        type: { const: "solid" },
        color: { type: "string", minLength: 1 },
        alpha: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    pathShape: {
      type: "object",
      additionalProperties: false,
      required: ["commands"],
      properties: {
        commands: { type: "array", minItems: 1, items: { type: "object" } },
        closed: { type: "boolean" }
      }
    },
    proceduralShape: {
      type: "object",
      additionalProperties: false,
      required: ["preset"],
      properties: {
        preset: { enum: ["tapered-limb", "organic-blob", "capsule", "circle", "rect"] },
        params: {
          type: "object",
          additionalProperties: {
            type: ["string", "number", "boolean"]
          }
        }
      }
    },
    meshShape: {
      type: "object",
      additionalProperties: false,
      required: ["vertices", "indices"],
      properties: {
        vertices: { type: "array", items: { type: "number" } },
        indices: { type: "array", items: { type: "integer", minimum: 0 } }
      }
    },
    svgShape: {
      type: "object",
      additionalProperties: false,
      required: ["source"],
      properties: {
        source: { type: "string", minLength: 1 },
        viewBox: {
          type: "array",
          prefixItems: [{ type: "number" }, { type: "number" }, { type: "number" }, { type: "number" }],
          minItems: 4,
          maxItems: 4
        }
      }
    },
    animationClip: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "duration", "tracks"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        duration: { type: "number", exclusiveMinimum: 0 },
        fps: { type: "number", exclusiveMinimum: 0 },
        frameRate: { type: "number", exclusiveMinimum: 0 },
        loop: { type: "boolean" },
        tracks: { type: "array", items: { $ref: "#/$defs/animationTrack" } },
        events: { type: "array", items: { $ref: "#/$defs/animationEvent" } },
        markers: { type: "array", items: { $ref: "#/$defs/timelineMarker" } },
        rootMotion: {
          type: "object",
          additionalProperties: false,
          properties: {
            xTrack: { type: "string" },
            yTrack: { type: "string" },
            rotationTrack: { type: "string" }
          }
        },
        tags: { type: "array", items: { type: "string" } },
        editor: { $ref: "#/$defs/editorMetadata" }
      }
    },
    animationTrack: {
      type: "object",
      additionalProperties: false,
      required: ["id", "target", "property", "keyframes"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        target: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "id"],
          properties: {
            kind: { enum: ["bone", "part", "project", "stateMachine"] },
            id: { $ref: "#/$defs/nonEmptyString" }
          }
        },
        property: {
          enum: [
            "transform.x",
            "transform.y",
            "transform.rotation",
            "transform.scaleX",
            "transform.scaleY",
            "transform.skewX",
            "transform.skewY",
            "visible",
            "opacity",
            "drawOrder",
            "procedural.params",
            "deform",
            "event",
            "collider"
          ]
        },
        keyframes: { type: "array", minItems: 1, items: { $ref: "#/$defs/keyframe" } }
      }
    },
    keyframe: {
      type: "object",
      additionalProperties: false,
      required: ["time", "value"],
      properties: {
        time: { type: "number", minimum: 0 },
        value: {},
        interpolation: { enum: ["linear", "step", "hold", "bezier", "spring"] },
        curve: {
          type: "array",
          prefixItems: [{ type: "number" }, { type: "number" }, { type: "number" }, { type: "number" }],
          minItems: 4,
          maxItems: 4
        },
        editor: { $ref: "#/$defs/editorMetadata" }
      }
    },
    animationEvent: {
      type: "object",
      additionalProperties: false,
      required: ["time", "type"],
      properties: {
        time: { type: "number", minimum: 0 },
        type: { $ref: "#/$defs/nonEmptyString" },
        payload: { type: "object" }
      }
    },
    timelineMarker: {
      type: "object",
      additionalProperties: false,
      required: ["id", "time", "label"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        time: { type: "number", minimum: 0 },
        label: { $ref: "#/$defs/nonEmptyString" },
        color: { type: "string" }
      }
    },
    pose: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "rigId", "boneTransforms"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        rigId: { $ref: "#/$defs/nonEmptyString" },
        boneTransforms: {
          type: "object",
          additionalProperties: { $ref: "#/$defs/transform2d" }
        },
        partProperties: { type: "object" },
        editor: { $ref: "#/$defs/editorMetadata" }
      }
    },
    stateMachine: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "initialStateId", "states"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        initialStateId: { $ref: "#/$defs/nonEmptyString" },
        states: { type: "array", minItems: 1, items: { type: "object" } },
        transitions: { type: "array", items: { $ref: "#/$defs/transition" } },
        parameters: { type: "array", items: { type: "object" } },
        editor: { $ref: "#/$defs/editorMetadata" }
      }
    },
    transition: {
      type: "object",
      additionalProperties: true,
      required: ["id", "fromStateId", "toStateId", "duration"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        fromStateId: { $ref: "#/$defs/nonEmptyString" },
        toStateId: { $ref: "#/$defs/nonEmptyString" },
        duration: { type: "number", minimum: 0 },
        easing: { enum: ["linear", "easeIn", "easeOut", "easeInOut", "cubicBezier", "spring", "overshoot", "anticipation"] },
        priority: { type: "number" },
        canInterrupt: { type: "boolean" },
        syncMode: { enum: ["none", "normalizedTime", "phaseMatch"] }
      }
    },
    proceduralAnimationPreset: {
      type: "object",
      additionalProperties: true,
      required: ["id", "type", "enabled"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        type: { enum: ["breathing", "secondaryMotion", "squashStretch", "footIK"] },
        enabled: { type: "boolean" }
      }
    },
    previewSettings: {
      type: "object",
      additionalProperties: false,
      properties: {
        ldtkPath: { $ref: "#/$defs/nonEmptyString" },
        spawnPointId: { $ref: "#/$defs/nonEmptyString" },
        quality: { enum: ["low", "medium", "high"] },
        showCollisionDebug: { type: "boolean" },
        showAnimationStateDebug: { type: "boolean" },
        showSkeleton: { type: "boolean" }
      }
    },
    editorMetadata: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string" },
        notes: { type: "string" },
        color: { type: "string" },
        collapsed: { type: "boolean" },
        locked: { type: "boolean" },
        visible: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        custom: { type: "object" }
      }
    }
  }
} as const satisfies JsonSchema;
