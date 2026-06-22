import { Container } from "pixi.js";
import { AnimationMixer } from "./AnimationMixer.js";
import { ConstraintSolver } from "./ConstraintSolver.js";
import type {
  AnimationSample,
  AnimationSampleTrackValue,
  AnimationParameters,
  BoneRuntime,
  PackedTransform2D,
  PartRuntime,
  RigActiveAnimationLayer,
  RigInstanceOptions,
  RigStateMachineUpdate,
  RigUpdateState,
  RuntimeAnimationEventDispatch,
  RuntimeCompiledRig
} from "./types.js";
import { RigLoader } from "./RigLoader.js";
import { createPartRenderable } from "./PixiPartRenderer.js";
import { ProceduralLayerStack } from "./ProceduralLayers.js";
import { type StateMachineEvaluation, RuntimeStateMachineController } from "./RuntimeStateMachine.js";

export class RigInstance {
  readonly container: Container;
  readonly rigContainer: Container;
  readonly bones: readonly BoneRuntime[];
  readonly parts: readonly PartRuntime[];
  readonly compiled: RuntimeCompiledRig;
  readonly options: RigInstanceOptions;

  private elapsed = 0;
  private params: AnimationParameters = {};
  private lastDelta = 0;
  private readonly boneById = new Map<number, BoneRuntime>();
  private readonly partById = new Map<number, PartRuntime>();
  private readonly compiledPartById = new Map<number, RuntimeCompiledRig["rig"]["parts"][number]>();
  private readonly constraintParams: Record<string, AnimationParameters[keyof AnimationParameters]> = {};
  private readonly constraintParamKeys: string[] = [];
  private readonly boneWorldParamKeys = new Map<number, { readonly x: string; readonly y: string }>();
  private readonly emptyEvents: readonly RuntimeAnimationEventDispatch[] = [];
  private readonly mixer: AnimationMixer;
  private readonly stateMachine: RuntimeStateMachineController | undefined;
  private readonly procedural: ProceduralLayerStack | undefined;
  private readonly constraints: ConstraintSolver | undefined;
  private readonly animationEventListeners = new Set<(event: RuntimeAnimationEventDispatch) => void>();
  private activeClip: number | undefined;
  private activeTransition: number | undefined;

  constructor(compiledInput: RuntimeCompiledRig, options: RigInstanceOptions = {}) {
    this.compiled = RigLoader.fromCompiled(compiledInput);
    this.options = options;
    this.container = namedContainer(`Bones:${this.compiled.name}`);
    this.rigContainer = namedContainer("rig");
    this.container.addChild(this.rigContainer);

    this.bones = this.compiled.rig.bones.map((bone) => ({
      id: bone.id,
      parent: bone.parent,
      local: bone.local,
      length: bone.length,
      container: namedContainer(`bone:${bone.id}`)
    }));
    for (const bone of this.bones) {
      this.boneById.set(bone.id, bone);
      this.boneWorldParamKeys.set(bone.id, { x: `bone.${bone.id}.worldX`, y: `bone.${bone.id}.worldY` });
    }

    for (const part of this.compiled.rig.parts) {
      this.compiledPartById.set(part.id, part);
    }

    this.parts = this.compiled.rig.parts.map((part) => {
      const rendered = createPartRenderable(part);
      const container = namedContainer(`part:${part.id}`);
      if (rendered) {
        container.addChild(rendered.renderable);
      }
      const runtimePart: PartRuntime = {
        id: part.id,
        bone: part.bone,
        type: part.type,
        drawOrder: part.drawOrder,
        local: part.local,
        container
      };
      if (rendered) {
        return {
          ...runtimePart,
          renderable: rendered.renderable,
          ...(rendered.graphicsContext ? { graphicsContext: rendered.graphicsContext } : {}),
          ...(rendered.meshBaseVertices ? { meshBaseVertices: rendered.meshBaseVertices } : {}),
          ...(rendered.meshPositions ? { meshPositions: rendered.meshPositions } : {})
        };
      }
      return runtimePart;
    });
    for (const part of this.parts) {
      this.partById.set(part.id, part);
    }

    this.mixer = new AnimationMixer(this.compiled.animations ?? []);
    this.stateMachine = this.createStateMachine(options);
    this.procedural = options.proceduralLayers?.length ? new ProceduralLayerStack(options.proceduralLayers) : undefined;
    this.constraints = options.constraints ? new ConstraintSolver(options.constraints.config, options.constraints.world) : undefined;
    this.startDefaultAnimation();

    this.buildHierarchy();
    this.applyDefaultTransforms();
  }

  update(dt: number, params: AnimationParameters = {}): RigUpdateState {
    this.lastDelta = dt;
    this.elapsed += dt;
    this.params = params;
    const state = this.stateMachine?.update(dt, params);
    if (state) {
      this.syncMixerToState(state);
    } else {
      this.startDefaultAnimation();
    }

    this.applyDefaultTransforms();
    const baseSample = this.mixer.update(dt);
    this.applySampleValues(baseSample, false);
    const proceduralSample = this.procedural?.update(dt, params);
    if (proceduralSample) {
      this.applySampleValues(proceduralSample, true);
    }
    const constraintParams = this.constraints ? this.withBoneWorldParams(params) : params;
    const constraintSample = this.constraints?.solve(constraintParams);
    if (constraintSample) {
      this.applySampleValues(constraintSample, true);
    }
    this.emitAnimationEvents(this.mixer.events);

    return {
      elapsed: this.elapsed,
      lastDelta: this.lastDelta,
      params: this.params,
      ...(this.activeClip !== undefined ? { activeClip: this.activeClip } : {}),
      ...(this.mixer.previousClipId !== undefined ? { previousClip: this.mixer.previousClipId } : {}),
      ...(state ? { activeState: state.state.id } : {}),
      ...(state?.previousState ? { previousState: state.previousState.id } : {}),
      ...(state?.transition ? { activeTransition: state.transition.id } : {}),
      transitionWeight: this.mixer.transitionWeight,
      sampledClipTimes: this.mixer.sampledClipTimes,
      sampledValues: baseSample.values.length,
      proceduralValues: proceduralSample?.values.length ?? 0,
      constraintValues: constraintSample?.values.length ?? 0,
      activeLayers: this.getActiveLayers(state),
      ...(state ? { stateMachine: toRigStateMachineUpdate(state, this.mixer.transitionWeight) } : {}),
      events: this.mixer.events.length ? this.mixer.events.map(copyRuntimeEventDispatch) : this.emptyEvents
    };
  }

  private withBoneWorldParams(params: AnimationParameters): AnimationParameters {
    for (const key of this.constraintParamKeys) {
      delete this.constraintParams[key];
    }
    this.constraintParamKeys.length = 0;
    for (const key in params) {
      const value = params[key];
      if (value === undefined) {
        continue;
      }
      this.constraintParams[key] = value;
      this.constraintParamKeys.push(key);
    }
    for (const bone of this.bones) {
      const keys = this.boneWorldParamKeys.get(bone.id)!;
      this.constraintParams[keys.x] = bone.container.worldTransform.tx;
      this.constraintParams[keys.y] = bone.container.worldTransform.ty;
      this.constraintParamKeys.push(keys.x, keys.y);
    }
    return this.constraintParams;
  }

  getBoneContainer(id: number): Container | undefined {
    return this.boneById.get(id)?.container;
  }

  getPartContainer(id: number): Container | undefined {
    return this.partById.get(id)?.container;
  }

  applySample(sample: AnimationSample): void {
    this.applyDefaultTransforms();
    this.applySampleValues(sample, false);
  }

  on(event: "animationEvent", listener: (event: RuntimeAnimationEventDispatch) => void): () => void {
    this.animationEventListeners.add(listener);
    return () => this.off(event, listener);
  }

  off(event: "animationEvent", listener: (event: RuntimeAnimationEventDispatch) => void): void {
    this.animationEventListeners.delete(listener);
  }

  private createStateMachine(options: RigInstanceOptions): RuntimeStateMachineController | undefined {
    if (options.stateMachine === false) {
      return undefined;
    }
    const machines = this.compiled.stateMachines ?? [];
    const machineId = options.stateMachine ?? machines[0]?.id;
    const machine = machines.find((item) => item.id === machineId);
    return machine ? new RuntimeStateMachineController(machine) : undefined;
  }

  private startDefaultAnimation(): void {
    if (this.activeClip !== undefined) {
      return;
    }
    const clip = this.compiled.animations?.[0];
    if (!clip) {
      return;
    }
    this.mixer.play(clip.id);
    this.activeClip = clip.id;
  }

  private syncMixerToState(state: StateMachineEvaluation): void {
    const clip = state.blendTree?.lowerClip ?? state.clip;
    if (clip < 0) {
      return;
    }

    if (this.activeClip === undefined) {
      this.mixer.play(clip);
    } else if (state.transition && this.activeTransition !== state.transition.id) {
      this.mixer.crossfadeTo(clip, {
        duration: state.transition.duration,
        phaseMatch: state.transition.syncMode === "phaseMatch" || state.transition.syncMode === "normalizedTime",
        easing: state.transition.easing ?? "linear"
      });
    } else if (!state.transition && this.activeClip !== clip) {
      this.mixer.play(clip);
    }

    const blendTreeLayers =
      state.blendTree && state.blendTree.upperClip !== state.blendTree.lowerClip && state.blendTree.weight > 0
        ? [{ clipId: state.blendTree.upperClip, weight: state.blendTree.weight }]
        : [];
    const transitionClipLayers = state.transition?.transitionClip !== undefined ? [{ clipId: state.transition.transitionClip, weight: this.mixer.transitionWeight }] : [];
    this.mixer.setLayers([...blendTreeLayers, ...transitionClipLayers]);
    this.activeClip = clip;
    this.activeTransition = state.transition?.id;
  }

  private getActiveLayers(state: StateMachineEvaluation | undefined): readonly RigActiveAnimationLayer[] {
    if (state?.transition && state.previousState && state.previousState.clip >= 0) {
      const transitionWeight = this.mixer.transitionWeight;
      const layers: RigActiveAnimationLayer[] = [
        { source: "transition", clip: state.previousState.clip, weight: 1 - transitionWeight, additive: false },
        { source: "transition", clip: this.activeClip ?? state.clip, weight: transitionWeight, additive: false }
      ];
      if (state.transition.transitionClip !== undefined) {
        layers.push({ source: "transition", clip: state.transition.transitionClip, weight: transitionWeight, additive: false });
      }
      return layers;
    }
    if (state?.blendTree) {
      return [
        { source: "base", clip: state.blendTree.lowerClip, weight: 1 - state.blendTree.weight, additive: false },
        { source: "blendTree", clip: state.blendTree.upperClip, weight: state.blendTree.weight, additive: false }
      ];
    }
    return this.activeClip !== undefined ? [{ source: "base", clip: this.activeClip, weight: 1, additive: false }] : [];
  }

  private applySampleValues(sample: AnimationSample, additive: boolean): void {
    for (const value of sample.values) {
      if (value.targetKind === "bone") {
        const bone = this.boneById.get(value.target);
        if (bone) {
          applySampleValue(bone.container, value, additive);
        }
      } else if (value.targetKind === "part") {
        const part = this.partById.get(value.target);
        if (part) {
          if (value.property === "deform") {
            this.applyMeshDeform(part, value.value, additive);
          } else {
            applySampleValue(part.container, value, additive);
          }
        }
      }
    }
  }

  private emitAnimationEvents(events: readonly RuntimeAnimationEventDispatch[]): void {
    if (!events.length || !this.animationEventListeners.size) {
      return;
    }
    for (const event of events) {
      for (const listener of this.animationEventListeners) {
        listener(event);
      }
    }
  }

  private buildHierarchy(): void {
    for (const bone of this.bones) {
      if (bone.parent < 0) {
        this.rigContainer.addChild(bone.container);
        continue;
      }

      const parent = this.getBoneContainer(bone.parent);
      if (!parent) {
        throw new Error(`Compiled rig references missing parent bone '${bone.parent}'.`);
      }
      parent.addChild(bone.container);
    }

    for (const part of [...this.parts].sort((a, b) => a.drawOrder - b.drawOrder || a.id - b.id)) {
      const bone = this.getBoneContainer(part.bone);
      if (!bone) {
        throw new Error(`Compiled rig references missing part bone '${part.bone}'.`);
      }
      bone.addChild(part.container);
    }
  }

  private applyDefaultTransforms(): void {
    for (const bone of this.bones) {
      applyTransform(bone.container, bone.local);
    }

    for (const part of this.parts) {
      const source = this.compiledPartById.get(part.id);
      applyTransform(part.container, part.local);
      if (source) {
        part.container.visible = source.visible;
        part.container.alpha = source.opacity;
        part.container.zIndex = source.drawOrder;
      }
      this.resetMeshDeform(part);
    }
  }

  private resetMeshDeform(part: PartRuntime): void {
    if (part.meshBaseVertices && part.meshPositions) {
      part.meshPositions.set(part.meshBaseVertices);
      updateMeshBuffer(part);
    }
  }

  private applyMeshDeform(part: PartRuntime, value: unknown, additive: boolean): void {
    if (!part.meshBaseVertices || !part.meshPositions || !Array.isArray(value)) {
      return;
    }
    for (let index = 0; index < part.meshPositions.length; index += 1) {
      const offset = typeof value[index] === "number" ? value[index] : 0;
      part.meshPositions[index] = additive ? part.meshPositions[index] + offset : part.meshBaseVertices[index] + offset;
    }
    updateMeshBuffer(part);
  }
}

function toRigStateMachineUpdate(state: StateMachineEvaluation, transitionWeight: number): RigStateMachineUpdate {
  return {
    state: state.state.id,
    ...(state.previousState ? { previousState: state.previousState.id } : {}),
    ...(state.transition ? { transition: state.transition.id } : {}),
    transitionWeight: state.transition ? transitionWeight : 0,
    ...(state.transition?.syncMode ? { syncMode: state.transition.syncMode } : {}),
    timeInState: state.timeInState,
    clip: state.clip,
    ...(state.blendTree
      ? {
          blendTree: {
            lowerClip: state.blendTree.lowerClip,
            upperClip: state.blendTree.upperClip,
            weight: state.blendTree.weight
          }
        }
      : {})
  };
}

function copyRuntimeEventDispatch(event: RuntimeAnimationEventDispatch): RuntimeAnimationEventDispatch {
  return {
    time: event.time,
    type: event.type,
    ...(event.payload !== undefined ? { payload: event.payload } : {}),
    clip: event.clip,
    localTime: event.localTime,
    normalizedTime: event.normalizedTime
  };
}

function namedContainer(label: string): Container {
  const container = new Container();
  container.label = label;
  return container;
}

function updateMeshBuffer(part: PartRuntime): void {
  if (!part.meshPositions || !part.renderable || !("geometry" in part.renderable)) {
    return;
  }
  const geometry = part.renderable.geometry as unknown as {
    getBuffer?: (id: string) => { data?: unknown; update?: (data?: unknown) => void } | undefined;
  };
  const buffer = geometry.getBuffer?.("aPosition") ?? geometry.getBuffer?.("aVertexPosition") ?? geometry.getBuffer?.("positions");
  if (buffer) {
    buffer.data = part.meshPositions;
    buffer.update?.(part.meshPositions);
  }
}

function applyTransform(container: Container, transform: PackedTransform2D): void {
  container.position.set(transform[0], transform[1]);
  container.rotation = transform[2];
  container.scale.set(transform[3], transform[4]);
  container.skew.set(transform[5], transform[6]);
}

function applySampleValue(container: Container, sample: AnimationSampleTrackValue, additive = false): void {
  const value = sample.value;
  if (sample.property === "visible" && typeof value === "boolean") {
    container.visible = value;
    return;
  }
  if (sample.property === "opacity" && typeof value === "number") {
    container.alpha = value;
    return;
  }
  if (sample.property === "drawOrder" && typeof value === "number") {
    container.zIndex = value;
    return;
  }
  if (typeof value !== "number") {
    return;
  }
  if (sample.property === "transform.x") {
    container.position.x = additive ? container.position.x + value : value;
  } else if (sample.property === "transform.y") {
    container.position.y = additive ? container.position.y + value : value;
  } else if (sample.property === "transform.rotation") {
    container.rotation = additive ? container.rotation + value : value;
  } else if (sample.property === "transform.scaleX") {
    container.scale.x = additive ? container.scale.x + value : value;
  } else if (sample.property === "transform.scaleY") {
    container.scale.y = additive ? container.scale.y + value : value;
  } else if (sample.property === "transform.skewX") {
    container.skew.x = additive ? container.skew.x + value : value;
  } else if (sample.property === "transform.skewY") {
    container.skew.y = additive ? container.skew.y + value : value;
  }
}
