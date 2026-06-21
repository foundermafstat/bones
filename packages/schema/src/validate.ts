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
  "procedural.params"
]);
const interpolations = new Set(["linear", "step", "hold", "bezier"]);
const parameterTypes = new Set(["number", "boolean", "string"]);
const conditionOperators = new Set(["==", "!=", ">", ">=", "<", "<="]);

export function validateRigProject(input: unknown): ValidationResult<RigProject> {
  const errors: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return invalid([{ path: "$", message: "Project must be an object." }]);
  }

  expectExact(input.schemaVersion, BONES_SCHEMA_VERSION, "$.schemaVersion", "Unsupported schemaVersion.", errors);
  expectExact(input.runtimeTarget, BONES_RUNTIME_TARGET, "$.runtimeTarget", "Unsupported runtimeTarget.", errors);
  expectNonEmptyString(input.id, "$.id", errors);
  expectNonEmptyString(input.name, "$.name", errors);

  if (!Array.isArray(input.rigs) || input.rigs.length === 0) {
    errors.push({ path: "$.rigs", message: "Project must contain at least one rig." });
  } else {
    input.rigs.forEach((rig, index) => validateRig(rig, `$.rigs[${index}]`, errors));
  }

  const animationIds = new Set<string>();
  if (input.animations !== undefined) {
    if (!Array.isArray(input.animations)) {
      errors.push({ path: "$.animations", message: "Animations must be an array when provided." });
    } else {
      input.animations.forEach((clip, index) => {
        validateAnimationClip(clip, `$.animations[${index}]`, errors);
        if (isRecord(clip) && typeof clip.id === "string") {
          addUnique(animationIds, clip.id, `$.animations[${index}].id`, "Animation clip id", errors);
        }
      });
    }
  }

  const rigIds = new Set(
    Array.isArray(input.rigs)
      ? input.rigs.flatMap((rig) => (isRecord(rig) && typeof rig.id === "string" ? [rig.id] : []))
      : []
  );

  if (input.poses !== undefined) {
    if (!Array.isArray(input.poses)) {
      errors.push({ path: "$.poses", message: "Poses must be an array when provided." });
    } else {
      input.poses.forEach((pose, index) => validatePose(pose, `$.poses[${index}]`, rigIds, errors));
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

  return errors.length > 0 ? invalid(errors) : { ok: true, value: input as unknown as RigProject };
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
  validateTransform(input.transform, `${path}.transform`, errors);
  if (input.length !== undefined) {
    expectNumber(input.length, `${path}.length`, errors, { min: 0 });
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

function validateAnimationClip(input: unknown, path: string, errors: ValidationIssue[]): void {
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
  if (!Array.isArray(input.tracks)) {
    errors.push({ path: `${path}.tracks`, message: "Animation clip tracks must be an array." });
    return;
  }
  input.tracks.forEach((track, index) => validateAnimationTrack(track, `${path}.tracks[${index}]`, input.duration, errors));
}

function validateAnimationTrack(input: unknown, path: string, duration: unknown, errors: ValidationIssue[]): void {
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

function validatePose(input: unknown, path: string, rigIds: ReadonlySet<string>, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Pose must be an object." });
    return;
  }
  expectNonEmptyString(input.id, `${path}.id`, errors);
  expectNonEmptyString(input.name, `${path}.name`, errors);
  expectNonEmptyString(input.rigId, `${path}.rigId`, errors);
  if (typeof input.rigId === "string" && !rigIds.has(input.rigId)) {
    errors.push({ path: `${path}.rigId`, message: `Pose rig '${input.rigId}' does not exist.` });
  }
  if (!isRecord(input.boneTransforms)) {
    errors.push({ path: `${path}.boneTransforms`, message: "Pose boneTransforms must be an object." });
    return;
  }
  Object.entries(input.boneTransforms).forEach(([boneId, transform]) => {
    validateTransform(transform, `${path}.boneTransforms.${boneId}`, errors);
  });
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
      input.transitions.forEach((transition, index) =>
        validateTransition(transition, `${path}.transitions[${index}]`, stateIds, parameterIds, errors)
      );
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
