import {
  BONES_RUNTIME_TARGET,
  BONES_SCHEMA_VERSION,
  type AnimationClip,
  type AnimationCondition,
  type AnimationParameter,
  type AnimationStateMachine,
  type BoneDefinition,
  type PartDefinition,
  type PoseDefinition,
  type RigDefinition,
  type RigProject,
  type Transform2D
} from "./types.js";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationIssue[] };

export class SchemaValidationError extends Error {
  readonly errors: readonly ValidationIssue[];

  constructor(errors: readonly ValidationIssue[]) {
    super(errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
    this.name = "SchemaValidationError";
    this.errors = errors;
  }
}

const partTypes = new Set(["path", "procedural", "mesh", "svg"]);
const proceduralPresets = new Set(["tapered-limb", "organic-blob", "capsule", "circle", "rect"]);
const trackTargets = new Set(["bone", "part", "project", "stateMachine"]);
const trackProperties = new Set([
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
]);
const interpolations = new Set(["linear", "step", "hold", "bezier", "spring"]);
const parameterTypes = new Set(["number", "boolean", "string"]);
const conditionOperators = new Set(["==", "!=", ">", ">=", "<", "<="]);
const transitionEasings = new Set(["linear", "easeIn", "easeOut", "easeInOut", "cubicBezier", "spring", "overshoot", "anticipation"]);
const syncModes = new Set(["none", "normalizedTime", "phaseMatch"]);
const proceduralAnimationTypes = new Set(["breathing", "secondaryMotion", "squashStretch", "footIK"]);
const qualityPresets = new Set(["low", "medium", "high"]);

interface ProjectReferences {
  readonly projectId: string;
  readonly rigIds: ReadonlySet<string>;
  readonly boneIds: ReadonlySet<string>;
  readonly partIds: ReadonlySet<string>;
  readonly stateMachineIds: ReadonlySet<string>;
  readonly bonesByRig: ReadonlyMap<string, ReadonlySet<string>>;
  readonly partsByRig: ReadonlyMap<string, ReadonlySet<string>>;
}

export function validateRigProject(input: unknown): ValidationResult<RigProject> {
  const errors: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return invalid([{ path: "$", message: "Project must be an object." }]);
  }

  expectExact(input.schemaVersion, BONES_SCHEMA_VERSION, "$.schemaVersion", "Unsupported schemaVersion.", errors);
  expectExact(input.runtimeTarget, BONES_RUNTIME_TARGET, "$.runtimeTarget", "Unsupported runtimeTarget.", errors);
  expectNonEmptyString(input.id, "$.id", errors);
  if (input.projectId !== undefined) {
    expectNonEmptyString(input.projectId, "$.projectId", errors);
  }
  expectNonEmptyString(input.name, "$.name", errors);
  if (input.units !== undefined) {
    expectExact(input.units, "pixels", "$.units", "Unsupported units.", errors);
  }
  if (input.defaultFrameRate !== undefined) {
    expectNumber(input.defaultFrameRate, "$.defaultFrameRate", errors, { minExclusive: 0 });
  }

  if (!Array.isArray(input.rigs) || input.rigs.length === 0) {
    errors.push({ path: "$.rigs", message: "Project must contain at least one rig." });
  } else {
    input.rigs.forEach((rig, index) => validateRig(rig, `$.rigs[${index}]`, errors));
  }

  const refs = collectProjectReferences(input);

  const animationIds = new Set<string>();
  if (input.animations !== undefined) {
    if (!Array.isArray(input.animations)) {
      errors.push({ path: "$.animations", message: "Animations must be an array when provided." });
    } else {
      input.animations.forEach((clip, index) => {
        validateAnimationClip(clip, `$.animations[${index}]`, refs, errors);
        if (isRecord(clip) && typeof clip.id === "string") {
          addUnique(animationIds, clip.id, `$.animations[${index}].id`, "Animation clip id", errors);
        }
      });
    }
  }

  if (input.poses !== undefined) {
    if (!Array.isArray(input.poses)) {
      errors.push({ path: "$.poses", message: "Poses must be an array when provided." });
    } else {
      input.poses.forEach((pose, index) => validatePose(pose, `$.poses[${index}]`, refs, errors));
    }
  }

  if (input.stateMachines !== undefined) {
    if (!Array.isArray(input.stateMachines)) {
      errors.push({ path: "$.stateMachines", message: "State machines must be an array when provided." });
    } else {
      input.stateMachines.forEach((machine, index) =>
        validateStateMachine(machine, `$.stateMachines[${index}]`, animationIds, errors)
      );
    }
  }

  if (input.proceduralPresets !== undefined) {
    if (!Array.isArray(input.proceduralPresets)) {
      errors.push({ path: "$.proceduralPresets", message: "Procedural presets must be an array when provided." });
    } else {
      input.proceduralPresets.forEach((preset, index) => validateProceduralPreset(preset, `$.proceduralPresets[${index}]`, errors));
    }
  }

  if (input.preview !== undefined) {
    validatePreview(input.preview, "$.preview", errors);
  }

  return errors.length > 0 ? invalid(errors) : { ok: true, value: input as unknown as RigProject };
}

function collectProjectReferences(input: Record<string, unknown>): ProjectReferences {
  const rigs = Array.isArray(input.rigs) ? input.rigs.filter(isRecord) : [];
  const rigIds = new Set<string>();
  const boneIds = new Set<string>();
  const partIds = new Set<string>();
  const bonesByRig = new Map<string, Set<string>>();
  const partsByRig = new Map<string, Set<string>>();

  for (const rig of rigs) {
    if (typeof rig.id !== "string") {
      continue;
    }
    rigIds.add(rig.id);
    const rigBoneIds = new Set<string>();
    const rigPartIds = new Set<string>();
    if (Array.isArray(rig.bones)) {
      for (const bone of rig.bones.filter(isRecord)) {
        if (typeof bone.id === "string") {
          boneIds.add(bone.id);
          rigBoneIds.add(bone.id);
        }
      }
    }
    if (Array.isArray(rig.parts)) {
      for (const part of rig.parts.filter(isRecord)) {
        if (typeof part.id === "string") {
          partIds.add(part.id);
          rigPartIds.add(part.id);
        }
      }
    }
    bonesByRig.set(rig.id, rigBoneIds);
    partsByRig.set(rig.id, rigPartIds);
  }

  const stateMachineIds = new Set<string>();
  if (Array.isArray(input.stateMachines)) {
    for (const machine of input.stateMachines.filter(isRecord)) {
      if (typeof machine.id === "string") {
        stateMachineIds.add(machine.id);
      }
    }
  }

  return {
    projectId: typeof input.id === "string" ? input.id : "",
    rigIds,
    boneIds,
    partIds,
    stateMachineIds,
    bonesByRig,
    partsByRig
  };
}

export function assertRigProject(input: unknown): RigProject {
  const result = validateRigProject(input);
  if (!result.ok) {
    throw new SchemaValidationError(result.errors);
  }
  return result.value;
}

export function isRigProject(input: unknown): input is RigProject {
  return validateRigProject(input).ok;
}

function validateRig(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Rig must be an object." });
    return;
  }

  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.name, `${path}.name`, errors);
  expectNonEmptyString(input.rootBoneId, `${path}.rootBoneId`, errors);

  const boneIds = new Set<string>();
  if (!Array.isArray(input.bones) || input.bones.length === 0) {
    errors.push({ path: `${path}.bones`, message: "Rig must contain at least one bone." });
  } else {
    input.bones.forEach((bone, index) => {
      validateBone(bone, `${path}.bones[${index}]`, errors);
      if (isRecord(bone) && typeof bone.id === "string") {
        addUnique(boneIds, bone.id, `${path}.bones[${index}].id`, "Bone id", errors);
      }
    });

    if (typeof input.rootBoneId === "string" && !boneIds.has(input.rootBoneId)) {
      errors.push({ path: `${path}.rootBoneId`, message: `Root bone '${input.rootBoneId}' does not exist.` });
    }

    input.bones.forEach((bone, index) => {
      if (!isRecord(bone) || bone.parentId === undefined) {
        return;
      }
      if (typeof bone.parentId !== "string" || !boneIds.has(bone.parentId)) {
        errors.push({ path: `${path}.bones[${index}].parentId`, message: "Parent bone does not exist." });
      }
      if (bone.parentId === bone.id) {
        errors.push({ path: `${path}.bones[${index}].parentId`, message: "Bone cannot be its own parent." });
      }
    });

    validateBoneGraph(input.bones, input.rootBoneId, path, errors);
  }

  if (input.parts !== undefined) {
    if (!Array.isArray(input.parts)) {
      errors.push({ path: `${path}.parts`, message: "Parts must be an array when provided." });
    } else {
      const partIds = new Set<string>();
      input.parts.forEach((part, index) => {
        validatePart(part, `${path}.parts[${index}]`, boneIds, errors);
        if (isRecord(part) && typeof part.id === "string") {
          addUnique(partIds, part.id, `${path}.parts[${index}].id`, "Part id", errors);
        }
      });
    }
  }
}

function validateBone(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Bone must be an object." });
    return;
  }

  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.name, `${path}.name`, errors);
  if (input.parentId !== undefined) {
    expectNonEmptyString(input.parentId, `${path}.parentId`, errors);
  }
  if (input.local === undefined && input.transform === undefined) {
    errors.push({ path: `${path}.local`, message: "Bone must include canonical local transform or legacy transform." });
  }
  if (input.local !== undefined) {
    validateTransform(input.local, `${path}.local`, errors);
  }
  if (input.transform !== undefined) {
    validateTransform(input.transform, `${path}.transform`, errors);
  }
  if (input.length !== undefined) {
    expectNumber(input.length, `${path}.length`, errors, { min: 0 });
  }
  if (input.inheritRotation !== undefined && typeof input.inheritRotation !== "boolean") {
    errors.push({ path: `${path}.inheritRotation`, message: "inheritRotation must be a boolean." });
  }
  if (input.inheritScale !== undefined && typeof input.inheritScale !== "boolean") {
    errors.push({ path: `${path}.inheritScale`, message: "inheritScale must be a boolean." });
  }
  if (input.mirrorGroup !== undefined) {
    expectNonEmptyString(input.mirrorGroup, `${path}.mirrorGroup`, errors);
  }
  validateStringArray(input.tags, `${path}.tags`, errors);
}

function validateBoneGraph(bonesInput: readonly unknown[], rootBoneId: unknown, path: string, errors: ValidationIssue[]): void {
  const bones = bonesInput.filter(isRecord);
  const parentless = bones.filter((bone) => bone.parentId === undefined);
  if (parentless.length !== 1) {
    errors.push({ path: `${path}.bones`, message: "Rig must contain exactly one root bone without parentId." });
  }
  const root = bones.find((bone) => bone.id === rootBoneId);
  if (root && root.parentId !== undefined) {
    errors.push({ path: `${path}.rootBoneId`, message: "Root bone must not have parentId." });
  }

  const parents = new Map<string, string | undefined>();
  for (const bone of bones) {
    if (typeof bone.id === "string") {
      parents.set(bone.id, typeof bone.parentId === "string" ? bone.parentId : undefined);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (boneId: string): boolean => {
    if (visited.has(boneId)) {
      return false;
    }
    if (visiting.has(boneId)) {
      return true;
    }
    visiting.add(boneId);
    const parentId = parents.get(boneId);
    const cycle = parentId ? visit(parentId) : false;
    visiting.delete(boneId);
    visited.add(boneId);
    return cycle;
  };

  for (const boneId of parents.keys()) {
    if (visit(boneId)) {
      errors.push({ path: `${path}.bones`, message: "Bone hierarchy contains a cycle." });
      return;
    }
  }
}

function validatePart(input: unknown, path: string, boneIds: ReadonlySet<string>, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Part must be an object." });
    return;
  }

  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.name, `${path}.name`, errors);
  expectNonEmptyString(input.boneId, `${path}.boneId`, errors);
  if (typeof input.boneId === "string" && !boneIds.has(input.boneId)) {
    errors.push({ path: `${path}.boneId`, message: `Part bone '${input.boneId}' does not exist.` });
  }
  if (typeof input.type !== "string" || !partTypes.has(input.type)) {
    errors.push({ path: `${path}.type`, message: "Part type must be path, procedural, mesh, or svg." });
  }
  if (input.opacity !== undefined) {
    expectNumber(input.opacity, `${path}.opacity`, errors, { min: 0, max: 1 });
  }
  if (input.transform !== undefined) {
    validateTransform(input.transform, `${path}.transform`, errors);
  }
  if (input.local !== undefined) {
    validateTransform(input.local, `${path}.local`, errors);
  }
  if (input.fill !== undefined) {
    validateFill(input.fill, `${path}.fill`, errors);
  }
  if (input.type === "procedural") {
    validateProcedural(input.procedural, `${path}.procedural`, errors);
  }
  if (input.type === "path" && (!isRecord(input.path) || !Array.isArray(input.path.commands))) {
    errors.push({ path: `${path}.path`, message: "Path parts must include path.commands." });
  }
  if (input.type === "svg" && (!isRecord(input.svg) || typeof input.svg.source !== "string" || input.svg.source === "")) {
    errors.push({ path: `${path}.svg.source`, message: "SVG parts must include a non-empty svg.source." });
  }
  if (input.type === "mesh" && (!isRecord(input.mesh) || !Array.isArray(input.mesh.vertices) || !Array.isArray(input.mesh.indices))) {
    errors.push({ path: `${path}.mesh`, message: "Mesh parts must include vertices and indices arrays." });
  }
  validatePartPayloadMatchesType(input, path, errors);
}

function validatePartPayloadMatchesType(input: Record<string, unknown>, path: string, errors: ValidationIssue[]): void {
  const payloads = ["path", "procedural", "mesh", "svg"] as const;
  for (const payload of payloads) {
    if (payload !== input.type && input[payload] !== undefined) {
      errors.push({ path: `${path}.${payload}`, message: `Part payload '${payload}' does not match part type '${input.type}'.` });
    }
  }
}

function validateProcedural(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Procedural parts must include a procedural definition." });
    return;
  }
  if (typeof input.preset !== "string" || !proceduralPresets.has(input.preset)) {
    errors.push({ path: `${path}.preset`, message: "Unknown procedural preset." });
  }
  if (input.params !== undefined && !isRecord(input.params)) {
    errors.push({ path: `${path}.params`, message: "Procedural params must be an object." });
  }
}

function validateFill(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Fill must be an object." });
    return;
  }
  if (input.type !== undefined && input.type !== "solid") {
    errors.push({ path: `${path}.type`, message: "Only solid fill is supported." });
  }
  expectNonEmptyString(input.color, `${path}.color`, errors);
  if (input.alpha !== undefined) {
    expectNumber(input.alpha, `${path}.alpha`, errors, { min: 0, max: 1 });
  }
}

function validateAnimationClip(input: unknown, path: string, refs: ProjectReferences, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Animation clip must be an object." });
    return;
  }

  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.name, `${path}.name`, errors);
  expectNumber(input.duration, `${path}.duration`, errors, { minExclusive: 0 });
  if (input.fps !== undefined) {
    expectNumber(input.fps, `${path}.fps`, errors, { minExclusive: 0 });
  }
  if (input.frameRate !== undefined) {
    expectNumber(input.frameRate, `${path}.frameRate`, errors, { minExclusive: 0 });
  }
  validateStringArray(input.tags, `${path}.tags`, errors);
  if (!Array.isArray(input.tracks)) {
    errors.push({ path: `${path}.tracks`, message: "Animation clip tracks must be an array." });
    return;
  }
  const trackIds = new Set<string>();
  input.tracks.forEach((track, index) => {
    validateAnimationTrack(track, `${path}.tracks[${index}]`, input.duration, refs, errors);
    if (isRecord(track) && typeof track.id === "string") {
      addUnique(trackIds, track.id, `${path}.tracks[${index}].id`, "Animation track id", errors);
    }
  });
  if (input.events !== undefined) {
    if (!Array.isArray(input.events)) {
      errors.push({ path: `${path}.events`, message: "Animation events must be an array." });
    } else {
      input.events.forEach((event, index) => validateAnimationEvent(event, `${path}.events[${index}]`, input.duration, errors));
    }
  }
  if (input.markers !== undefined) {
    if (!Array.isArray(input.markers)) {
      errors.push({ path: `${path}.markers`, message: "Timeline markers must be an array." });
    } else {
      const markerIds = new Set<string>();
      input.markers.forEach((marker, index) => {
        validateTimelineMarker(marker, `${path}.markers[${index}]`, input.duration, errors);
        if (isRecord(marker) && typeof marker.id === "string") {
          addUnique(markerIds, marker.id, `${path}.markers[${index}].id`, "Timeline marker id", errors);
        }
      });
    }
  }
  if (input.rootMotion !== undefined && !isRecord(input.rootMotion)) {
    errors.push({ path: `${path}.rootMotion`, message: "Root motion must be an object." });
  }
}

function validateAnimationEvent(input: unknown, path: string, duration: unknown, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Animation event must be an object." });
    return;
  }
  expectNumber(input.time, `${path}.time`, errors, { min: 0 });
  if (typeof input.time === "number" && typeof duration === "number" && input.time > duration) {
    errors.push({ path: `${path}.time`, message: "Animation event time cannot exceed clip duration." });
  }
  expectNonEmptyString(input.type, `${path}.type`, errors);
  if (input.payload !== undefined && !isRecord(input.payload)) {
    errors.push({ path: `${path}.payload`, message: "Animation event payload must be an object." });
  }
}

function validateTimelineMarker(input: unknown, path: string, duration: unknown, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Timeline marker must be an object." });
    return;
  }
  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.label, `${path}.label`, errors);
  expectNumber(input.time, `${path}.time`, errors, { min: 0 });
  if (typeof input.time === "number" && typeof duration === "number" && input.time > duration) {
    errors.push({ path: `${path}.time`, message: "Timeline marker time cannot exceed clip duration." });
  }
}

function validateAnimationTrack(input: unknown, path: string, duration: unknown, refs: ProjectReferences, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Animation track must be an object." });
    return;
  }

  expectNonEmptyString(input.id, `${path}.id`, errors);
  if (!isRecord(input.target)) {
    errors.push({ path: `${path}.target`, message: "Animation track target must be an object." });
  } else {
    if (typeof input.target.kind !== "string" || !trackTargets.has(input.target.kind)) {
      errors.push({ path: `${path}.target.kind`, message: "Unknown animation track target kind." });
    }
    expectNonEmptyString(input.target.id, `${path}.target.id`, errors);
    validateTrackTargetReference(input.target, `${path}.target`, refs, errors);
  }
  if (typeof input.property !== "string" || !trackProperties.has(input.property)) {
    errors.push({ path: `${path}.property`, message: "Unknown animation track property." });
  }
  if (!Array.isArray(input.keyframes) || input.keyframes.length === 0) {
    errors.push({ path: `${path}.keyframes`, message: "Animation track must contain at least one keyframe." });
    return;
  }

  let previousTime = -Infinity;
  input.keyframes.forEach((keyframe, index) => {
    validateKeyframe(keyframe, `${path}.keyframes[${index}]`, duration, errors);
    if (isRecord(keyframe) && typeof keyframe.time === "number") {
      if (keyframe.time < previousTime) {
        errors.push({ path: `${path}.keyframes[${index}].time`, message: "Keyframes must be sorted by time." });
      }
      previousTime = keyframe.time;
    }
  });
}

function validateTrackTargetReference(target: Record<string, unknown>, path: string, refs: ProjectReferences, errors: ValidationIssue[]): void {
  if (typeof target.kind !== "string" || typeof target.id !== "string") {
    return;
  }
  if (target.kind === "bone" && !refs.boneIds.has(target.id)) {
    errors.push({ path: `${path}.id`, message: `Animation track bone target '${target.id}' does not exist.` });
  }
  if (target.kind === "part" && !refs.partIds.has(target.id)) {
    errors.push({ path: `${path}.id`, message: `Animation track part target '${target.id}' does not exist.` });
  }
  if (target.kind === "stateMachine" && !refs.stateMachineIds.has(target.id)) {
    errors.push({ path: `${path}.id`, message: `Animation track state machine target '${target.id}' does not exist.` });
  }
  if (target.kind === "project" && target.id !== refs.projectId) {
    errors.push({ path: `${path}.id`, message: `Animation track project target '${target.id}' does not match project id.` });
  }
}

function validateKeyframe(input: unknown, path: string, duration: unknown, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Keyframe must be an object." });
    return;
  }

  expectNumber(input.time, `${path}.time`, errors, { min: 0 });
  if (typeof input.time === "number" && typeof duration === "number" && input.time > duration) {
    errors.push({ path: `${path}.time`, message: "Keyframe time cannot exceed clip duration." });
  }
  if (!("value" in input)) {
    errors.push({ path: `${path}.value`, message: "Keyframe must include a value." });
  }
  if (input.interpolation !== undefined && (typeof input.interpolation !== "string" || !interpolations.has(input.interpolation))) {
    errors.push({ path: `${path}.interpolation`, message: "Unknown keyframe interpolation." });
  }
  if (input.curve !== undefined && (!Array.isArray(input.curve) || input.curve.length !== 4 || input.curve.some((value) => typeof value !== "number"))) {
    errors.push({ path: `${path}.curve`, message: "Bezier curve must contain four numbers." });
  }
}

function validatePose(input: unknown, path: string, refs: ProjectReferences, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Pose must be an object." });
    return;
  }
  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.name, `${path}.name`, errors);
  expectNonEmptyString(input.rigId, `${path}.rigId`, errors);
  if (typeof input.rigId === "string" && !refs.rigIds.has(input.rigId)) {
    errors.push({ path: `${path}.rigId`, message: `Pose rig '${input.rigId}' does not exist.` });
  }
  if (!isRecord(input.boneTransforms)) {
    errors.push({ path: `${path}.boneTransforms`, message: "Pose boneTransforms must be an object." });
    return;
  }
  Object.entries(input.boneTransforms).forEach(([boneId, transform]) => {
    const rigBoneIds = typeof input.rigId === "string" ? refs.bonesByRig.get(input.rigId) : undefined;
    if (rigBoneIds && !rigBoneIds.has(boneId)) {
      errors.push({ path: `${path}.boneTransforms.${boneId}`, message: `Pose bone '${boneId}' does not exist in rig '${input.rigId}'.` });
    }
    validateTransform(transform, `${path}.boneTransforms.${boneId}`, errors);
  });
  if (input.partProperties !== undefined) {
    if (!isRecord(input.partProperties)) {
      errors.push({ path: `${path}.partProperties`, message: "Pose partProperties must be an object." });
    } else {
      const rigPartIds = typeof input.rigId === "string" ? refs.partsByRig.get(input.rigId) : undefined;
      Object.keys(input.partProperties).forEach((partId) => {
        if (rigPartIds && !rigPartIds.has(partId)) {
          errors.push({ path: `${path}.partProperties.${partId}`, message: `Pose part '${partId}' does not exist in rig '${input.rigId}'.` });
        }
      });
    }
  }
}

function validateStateMachine(
  input: unknown,
  path: string,
  animationIds: ReadonlySet<string>,
  errors: ValidationIssue[]
): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "State machine must be an object." });
    return;
  }

  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.name, `${path}.name`, errors);
  expectNonEmptyString(input.initialStateId, `${path}.initialStateId`, errors);

  const stateIds = new Set<string>();
  if (!Array.isArray(input.states) || input.states.length === 0) {
    errors.push({ path: `${path}.states`, message: "State machine must contain at least one state." });
  } else {
    input.states.forEach((state, index) => {
      if (!isRecord(state)) {
        errors.push({ path: `${path}.states[${index}]`, message: "State must be an object." });
        return;
      }
      expectNonEmptyString(state.id, `${path}.states[${index}].id`, errors);
      expectNonEmptyString(state.name, `${path}.states[${index}].name`, errors);
      if (typeof state.id === "string") {
        addUnique(stateIds, state.id, `${path}.states[${index}].id`, "State id", errors);
      }
      if (typeof state.clipId === "string" && animationIds.size > 0 && !animationIds.has(state.clipId)) {
        errors.push({ path: `${path}.states[${index}].clipId`, message: `Animation clip '${state.clipId}' does not exist.` });
      }
    });
  }

  if (typeof input.initialStateId === "string" && !stateIds.has(input.initialStateId)) {
    errors.push({ path: `${path}.initialStateId`, message: `Initial state '${input.initialStateId}' does not exist.` });
  }

  const parameterIds = new Set<string>();
  if (input.parameters !== undefined) {
    if (!Array.isArray(input.parameters)) {
      errors.push({ path: `${path}.parameters`, message: "State machine parameters must be an array." });
    } else {
      input.parameters.forEach((parameter, index) => validateParameter(parameter, `${path}.parameters[${index}]`, parameterIds, errors));
    }
  }

  if (input.transitions !== undefined) {
    if (!Array.isArray(input.transitions)) {
      errors.push({ path: `${path}.transitions`, message: "State machine transitions must be an array." });
    } else {
      const transitionIds = new Set<string>();
      input.transitions.forEach((transition, index) => {
        validateTransition(transition, `${path}.transitions[${index}]`, stateIds, parameterIds, errors);
        if (isRecord(transition) && typeof transition.id === "string") {
          addUnique(transitionIds, transition.id, `${path}.transitions[${index}].id`, "Transition id", errors);
        }
      });
    }
  }
}

function validateParameter(input: unknown, path: string, parameterIds: Set<string>, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Parameter must be an object." });
    return;
  }
  expectNonEmptyString(input.id, `${path}.id`, errors);
  if (typeof input.id === "string") {
    addUnique(parameterIds, input.id, `${path}.id`, "Parameter id", errors);
  }
  if (typeof input.type !== "string" || !parameterTypes.has(input.type)) {
    errors.push({ path: `${path}.type`, message: "Parameter type must be number, boolean, or string." });
  }
  if (!("defaultValue" in input)) {
    errors.push({ path: `${path}.defaultValue`, message: "Parameter must include defaultValue." });
  } else if (!defaultValueMatches(input as unknown as AnimationParameter)) {
    errors.push({ path: `${path}.defaultValue`, message: "Parameter defaultValue must match parameter type." });
  }
}

function validateTransition(
  input: unknown,
  path: string,
  stateIds: ReadonlySet<string>,
  parameterIds: ReadonlySet<string>,
  errors: ValidationIssue[]
): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Transition must be an object." });
    return;
  }
  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.fromStateId, `${path}.fromStateId`, errors);
  expectNonEmptyString(input.toStateId, `${path}.toStateId`, errors);
  expectNumber(input.duration, `${path}.duration`, errors, { min: 0 });
  if (input.easing !== undefined && (typeof input.easing !== "string" || !transitionEasings.has(input.easing))) {
    errors.push({ path: `${path}.easing`, message: "Unknown transition easing." });
  }
  if (input.syncMode !== undefined && (typeof input.syncMode !== "string" || !syncModes.has(input.syncMode))) {
    errors.push({ path: `${path}.syncMode`, message: "Unknown transition syncMode." });
  }
  if (typeof input.fromStateId === "string" && !stateIds.has(input.fromStateId)) {
    errors.push({ path: `${path}.fromStateId`, message: `Transition source state '${input.fromStateId}' does not exist.` });
  }
  if (typeof input.toStateId === "string" && !stateIds.has(input.toStateId)) {
    errors.push({ path: `${path}.toStateId`, message: `Transition target state '${input.toStateId}' does not exist.` });
  }
  if (input.conditions !== undefined) {
    if (!Array.isArray(input.conditions)) {
      errors.push({ path: `${path}.conditions`, message: "Transition conditions must be an array." });
    } else {
      input.conditions.forEach((condition, index) =>
        validateCondition(condition, `${path}.conditions[${index}]`, parameterIds, errors)
      );
    }
  }
}

function validateProceduralPreset(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Procedural preset must be an object." });
    return;
  }
  expectNonEmptyString(input.id, `${path}.id`, errors);
  if (typeof input.type !== "string" || !proceduralAnimationTypes.has(input.type)) {
    errors.push({ path: `${path}.type`, message: "Unknown procedural animation preset type." });
  }
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    errors.push({ path: `${path}.enabled`, message: "Procedural preset enabled must be boolean." });
  }
}

function validatePreview(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Preview settings must be an object." });
    return;
  }
  if (input.quality !== undefined && (typeof input.quality !== "string" || !qualityPresets.has(input.quality))) {
    errors.push({ path: `${path}.quality`, message: "Preview quality must be low, medium, or high." });
  }
  if (input.ldtkPath !== undefined) {
    expectNonEmptyString(input.ldtkPath, `${path}.ldtkPath`, errors);
  }
  if (input.spawnPointId !== undefined) {
    expectNonEmptyString(input.spawnPointId, `${path}.spawnPointId`, errors);
  }
}

function validateCondition(
  input: unknown,
  path: string,
  parameterIds: ReadonlySet<string>,
  errors: ValidationIssue[]
): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Condition must be an object." });
    return;
  }
  expectNonEmptyString(input.parameterId, `${path}.parameterId`, errors);
  if (typeof input.parameterId === "string" && parameterIds.size > 0 && !parameterIds.has(input.parameterId)) {
    errors.push({ path: `${path}.parameterId`, message: `Condition parameter '${input.parameterId}' does not exist.` });
  }
  if (typeof input.operator !== "string" || !conditionOperators.has(input.operator)) {
    errors.push({ path: `${path}.operator`, message: "Unknown condition operator." });
  }
  if (!("value" in input)) {
    errors.push({ path: `${path}.value`, message: "Condition must include a value." });
  }
}

function validateTransform(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Transform2D must be an object." });
    return;
  }
  expectNumber(input.x, `${path}.x`, errors);
  expectNumber(input.y, `${path}.y`, errors);
  expectNumber(input.rotation, `${path}.rotation`, errors);
  expectNumber(input.scaleX, `${path}.scaleX`, errors);
  expectNumber(input.scaleY, `${path}.scaleY`, errors);
  if (input.skewX !== undefined) {
    expectNumber(input.skewX, `${path}.skewX`, errors);
  }
  if (input.skewY !== undefined) {
    expectNumber(input.skewY, `${path}.skewY`, errors);
  }
}

function validateStringArray(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push({ path, message: "Expected an array of strings." });
  }
}

function defaultValueMatches(parameter: AnimationParameter): boolean {
  if (parameter.type === "number") {
    return typeof parameter.defaultValue === "number";
  }
  if (parameter.type === "boolean") {
    return typeof parameter.defaultValue === "boolean";
  }
  if (parameter.type === "string") {
    return typeof parameter.defaultValue === "string";
  }
  return false;
}

function addUnique(
  ids: Set<string>,
  id: string,
  path: string,
  label: string,
  errors: ValidationIssue[]
): void {
  if (ids.has(id)) {
    errors.push({ path, message: `${label} '${id}' is duplicated.` });
    return;
  }
  ids.add(id);
}

function expectExact(
  value: unknown,
  expected: string,
  path: string,
  message: string,
  errors: ValidationIssue[]
): void {
  if (value !== expected) {
    errors.push({ path, message: `${message} Expected '${expected}'.` });
  }
}

function expectNonEmptyString(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length === 0) {
    errors.push({ path, message: "Expected a non-empty string." });
  }
}

function expectNumber(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
  options: { readonly min?: number; readonly max?: number; readonly minExclusive?: number } = {}
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ path, message: "Expected a finite number." });
    return;
  }
  if (options.min !== undefined && value < options.min) {
    errors.push({ path, message: `Expected a number greater than or equal to ${options.min}.` });
  }
  if (options.max !== undefined && value > options.max) {
    errors.push({ path, message: `Expected a number less than or equal to ${options.max}.` });
  }
  if (options.minExclusive !== undefined && value <= options.minExclusive) {
    errors.push({ path, message: `Expected a number greater than ${options.minExclusive}.` });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(errors: readonly ValidationIssue[]): ValidationResult<never> {
  return { ok: false, errors };
}

export type {
  AnimationClip,
  AnimationCondition,
  AnimationParameter,
  AnimationStateMachine,
  BoneDefinition,
  PartDefinition,
  PoseDefinition,
  RigDefinition,
  RigProject,
  Transform2D
};
