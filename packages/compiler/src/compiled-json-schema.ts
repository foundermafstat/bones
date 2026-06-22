import { BONES_RUNTIME_TARGET, BONES_SCHEMA_VERSION } from "@bones/schema";
import { BONES_COMPILED_FORMAT_VERSION } from "./types.js";

export type JsonSchema = {
  readonly [key: string]: unknown;
};

const numericId = { type: "integer", minimum: 0 };
const lookupTable = {
  type: "object",
  additionalProperties: numericId
};

export const compiledRigProjectJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://bones.dev/schemas/compiled-rig-project-1.0.0.json",
  title: "Bones CompiledRigProject JSON",
  type: "object",
  additionalProperties: false,
  required: [
    "compiledFormatVersion",
    "schemaVersion",
    "runtimeTarget",
    "sourceProjectId",
    "name",
    "rig",
    "animations",
    "stateMachines",
    "lookups"
  ],
  properties: {
    compiledFormatVersion: { const: BONES_COMPILED_FORMAT_VERSION },
    schemaVersion: { const: BONES_SCHEMA_VERSION },
    runtimeTarget: { const: BONES_RUNTIME_TARGET },
    sourceProjectId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    rig: { $ref: "#/$defs/rig" },
    animations: { type: "array", items: { $ref: "#/$defs/animationClip" } },
    stateMachines: { type: "array", items: { $ref: "#/$defs/stateMachine" } },
    lookups: {
      type: "object",
      additionalProperties: false,
      required: ["rigs", "bones", "parts", "animations", "stateMachines"],
      properties: {
        rigs: lookupTable,
        bones: lookupTable,
        parts: lookupTable,
        animations: lookupTable,
        stateMachines: lookupTable
      }
    }
  },
  $defs: {
    numericId,
    transform: {
      type: "array",
      prefixItems: [
        { type: "number" },
        { type: "number" },
        { type: "number" },
        { type: "number" },
        { type: "number" },
        { type: "number" },
        { type: "number" }
      ],
      minItems: 7,
      maxItems: 7
    },
    rig: {
      type: "object",
      additionalProperties: false,
      required: ["id", "rootBone", "bones", "parts"],
      properties: {
        id: numericId,
        rootBone: numericId,
        bones: { type: "array", minItems: 1, items: { $ref: "#/$defs/bone" } },
        parts: { type: "array", items: { $ref: "#/$defs/part" } }
      }
    },
    bone: {
      type: "object",
      additionalProperties: false,
      required: ["id", "parent", "local", "length"],
      properties: {
        id: numericId,
        parent: { type: "integer", minimum: -1 },
        local: { $ref: "#/$defs/transform" },
        length: { type: "number", minimum: 0 }
      }
    },
    part: {
      type: "object",
      additionalProperties: false,
      required: ["id", "bone", "type", "drawOrder", "visible", "opacity", "local"],
      properties: {
        id: numericId,
        bone: numericId,
        type: { enum: ["path", "procedural", "mesh", "svg"] },
        drawOrder: { type: "number" },
        visible: { type: "boolean" },
        opacity: { type: "number", minimum: 0, maximum: 1 },
        local: { $ref: "#/$defs/transform" },
        fill: {
          type: "object",
          additionalProperties: false,
          required: ["color", "alpha"],
          properties: {
            color: { type: "string", minLength: 1 },
            alpha: { type: "number", minimum: 0, maximum: 1 }
          }
        },
        path: {
          type: "object",
          additionalProperties: false,
          required: ["closed", "commands"],
          properties: {
            closed: { type: "boolean" },
            commands: { type: "array" }
          }
        },
        procedural: {
          type: "object",
          additionalProperties: false,
          required: ["preset", "params"],
          properties: {
            preset: { enum: ["tapered-limb", "organic-blob", "capsule", "circle", "rect"] },
            params: {
              type: "object",
              additionalProperties: { type: ["string", "number", "boolean"] }
            }
          }
        },
        mesh: {
          type: "object",
          additionalProperties: false,
          required: ["vertices", "indices"],
          properties: {
            vertices: { type: "array", items: { type: "number" } },
            indices: { type: "array", items: { type: "integer", minimum: 0 } }
          }
        },
        svg: {
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
        }
      }
    },
    animationClip: {
      type: "object",
      additionalProperties: false,
      required: ["id", "duration", "fps", "loop", "tracks", "trackLookup", "events"],
      properties: {
        id: numericId,
        duration: { type: "number", exclusiveMinimum: 0 },
        fps: { type: "number", exclusiveMinimum: 0 },
        loop: { type: "boolean" },
        tracks: { type: "array", items: { $ref: "#/$defs/track" } },
        trackLookup: lookupTable,
        events: { type: "array", items: { $ref: "#/$defs/animationEvent" } }
      }
    },
    animationEvent: {
      type: "object",
      additionalProperties: false,
      required: ["time", "type"],
      properties: {
        time: { type: "number", minimum: 0 },
        type: { type: "string", minLength: 1 },
        payload: true
      }
    },
    track: {
      type: "object",
      additionalProperties: false,
      required: ["id", "targetKind", "target", "property", "keyframes"],
      properties: {
        id: numericId,
        targetKind: { enum: ["bone", "part", "project", "stateMachine"] },
        target: { type: "integer", minimum: 0 },
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
      required: ["time", "value", "interpolation", "curve"],
      properties: {
        time: { type: "number" },
        value: true,
        interpolation: { enum: ["linear", "step", "hold", "bezier", "spring"] },
        curve: {
          type: "array",
          prefixItems: [{ type: "number" }, { type: "number" }, { type: "number" }, { type: "number" }],
          minItems: 4,
          maxItems: 4
        }
      }
    },
    stateMachine: {
      type: "object",
      additionalProperties: false,
      required: ["id", "initialState", "states", "transitions", "parameters", "stateLookup", "parameterLookup"],
      properties: {
        id: numericId,
        initialState: numericId,
        states: { type: "array", items: { $ref: "#/$defs/state" } },
        transitions: { type: "array", items: { $ref: "#/$defs/transition" } },
        parameters: { type: "array", items: { $ref: "#/$defs/parameter" } },
        stateLookup: lookupTable,
        parameterLookup: lookupTable
      }
    },
    state: {
      type: "object",
      additionalProperties: false,
      required: ["id", "clip"],
      properties: {
        id: numericId,
        clip: { type: "integer", minimum: -1 },
        blendTree: {
          type: "object",
          additionalProperties: false,
          required: ["type", "parameter", "children"],
          properties: {
            type: { const: "1d" },
            parameter: numericId,
            children: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["threshold", "clip"],
                properties: {
                  threshold: { type: "number" },
                  clip: numericId
                }
              }
            }
          }
        }
      }
    },
    transition: {
      type: "object",
      additionalProperties: false,
      required: ["id", "from", "to", "duration", "easing", "priority", "canInterrupt", "syncMode", "conditions"],
      properties: {
        id: numericId,
        from: numericId,
        to: numericId,
        duration: { type: "number", minimum: 0 },
        easing: { enum: ["linear", "easeIn", "easeOut", "easeInOut", "cubicBezier", "spring", "overshoot", "anticipation"] },
        priority: { type: "number" },
        canInterrupt: { type: "boolean" },
        syncMode: { enum: ["none", "normalizedTime", "phaseMatch"] },
        transitionClip: numericId,
        interruptWindow: {
          type: "array",
          prefixItems: [{ type: "number", minimum: 0 }, { type: "number", minimum: 0 }],
          minItems: 2,
          maxItems: 2
        },
        exitTime: { type: "number", minimum: 0 },
        minStateTime: { type: "number", minimum: 0 },
        conditions: { type: "array", items: { $ref: "#/$defs/condition" } }
      }
    },
    parameter: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "defaultValue"],
      properties: {
        id: numericId,
        type: { enum: ["number", "boolean", "string"] },
        defaultValue: { type: ["string", "number", "boolean"] }
      }
    },
    condition: {
      type: "object",
      additionalProperties: false,
      required: ["parameter", "operator", "value"],
      properties: {
        parameter: numericId,
        operator: { enum: ["==", "!=", ">", ">=", "<", "<="] },
        value: { type: ["string", "number", "boolean"] }
      }
    }
  }
} as const satisfies JsonSchema;
