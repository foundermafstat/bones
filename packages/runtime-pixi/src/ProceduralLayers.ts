import type { AnimationParameters, AnimationSample, AnimationSampleTrackValue, RuntimeTrackProperty, RuntimeTrackTargetKind } from "./types.js";

export interface BreathingLayerConfig {
  readonly type: "breathing";
  readonly enabled: boolean;
  readonly frequency: number;
  readonly amplitude: number;
  readonly affectedBones: Readonly<Record<number, Partial<Record<RuntimeTrackProperty, number>>>>;
}

export interface SecondaryMotionLayerConfig {
  readonly type: "secondaryMotion";
  readonly targetKind: RuntimeTrackTargetKind;
  readonly target: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly velocityInfluence: number;
  readonly gravityInfluence?: number;
  readonly windInfluence?: number;
  readonly maxOffset: number;
}

export interface SquashStretchRule {
  readonly condition: string;
  readonly targetBone: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly duration: number;
}

export interface SquashStretchLayerConfig {
  readonly type: "squashStretch";
  readonly rules: readonly SquashStretchRule[];
}

export type ProceduralLayerConfig = BreathingLayerConfig | SecondaryMotionLayerConfig | SquashStretchLayerConfig;

interface SecondaryState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface TriggerState {
  readonly rule: SquashStretchRule;
  elapsed: number;
}

export class ProceduralLayerStack {
  readonly output: AnimationSample = {
    normalizedTime: 0,
    localTime: 0,
    values: []
  };

  private time = 0;
  private readonly secondary = new Map<number, SecondaryState>();
  private readonly triggers: TriggerState[] = [];
  private readonly previousConditions = new Map<string, boolean>();

  constructor(private readonly layers: readonly ProceduralLayerConfig[]) {}

  update(dt: number, params: AnimationParameters = {}): AnimationSample {
    this.time += dt;
    this.output.localTime = this.time;
    this.output.normalizedTime = 0;
    this.output.values.length = 0;

    for (const layer of this.layers) {
      if (layer.type === "breathing" && layer.enabled) {
        this.applyBreathing(layer);
      } else if (layer.type === "secondaryMotion") {
        this.applySecondary(layer, dt, params);
      } else if (layer.type === "squashStretch") {
        this.applySquash(layer, dt, params);
      }
    }

    return this.output;
  }

  private applyBreathing(layer: BreathingLayerConfig): void {
    const wave = Math.sin(this.time * Math.PI * 2 * layer.frequency) * layer.amplitude;
    for (const [boneId, properties] of Object.entries(layer.affectedBones)) {
      for (const [property, amount] of Object.entries(properties) as [RuntimeTrackProperty, number][]) {
        this.pushValue("bone", Number(boneId), property, amount * wave);
      }
    }
  }

  private applySecondary(layer: SecondaryMotionLayerConfig, dt: number, params: AnimationParameters): void {
    const state = this.getSecondaryState(layer.target);
    const velocityX = numberParam(params, "velocityX") + numberParam(params, "speed");
    const velocityY = numberParam(params, "velocityY");
    const wind = numberParam(params, "wind");
    const targetX = clamp((-velocityX * layer.velocityInfluence + wind * (layer.windInfluence ?? 0)) * 0.1, -layer.maxOffset, layer.maxOffset);
    const targetY = clamp((velocityY * (layer.gravityInfluence ?? 0)) * 0.1, -layer.maxOffset, layer.maxOffset);

    state.vx = (state.vx + (targetX - state.x) * layer.stiffness) * layer.damping;
    state.vy = (state.vy + (targetY - state.y) * layer.stiffness) * layer.damping;
    state.x = clamp(state.x + state.vx * Math.max(1, dt * 60), -layer.maxOffset, layer.maxOffset);
    state.y = clamp(state.y + state.vy * Math.max(1, dt * 60), -layer.maxOffset, layer.maxOffset);

    this.pushValue(layer.targetKind, layer.target, "transform.x", state.x);
    this.pushValue(layer.targetKind, layer.target, "transform.y", state.y);
  }

  private applySquash(layer: SquashStretchLayerConfig, dt: number, params: AnimationParameters): void {
    for (const rule of layer.rules) {
      const active = Boolean(params[rule.condition]);
      const previous = this.previousConditions.get(rule.condition) ?? false;
      if (active && !previous) {
        this.triggers.push({ rule, elapsed: 0 });
      }
      this.previousConditions.set(rule.condition, active);
    }

    for (let index = this.triggers.length - 1; index >= 0; index -= 1) {
      const trigger = this.triggers[index]!;
      trigger.elapsed += dt;
      const progress = trigger.rule.duration > 0 ? trigger.elapsed / trigger.rule.duration : 1;
      if (progress >= 1) {
        this.triggers.splice(index, 1);
        continue;
      }
      const weight = 1 - progress;
      this.pushValue("bone", trigger.rule.targetBone, "transform.scaleX", (trigger.rule.scaleX - 1) * weight);
      this.pushValue("bone", trigger.rule.targetBone, "transform.scaleY", (trigger.rule.scaleY - 1) * weight);
    }
  }

  private getSecondaryState(id: number): SecondaryState {
    const existing = this.secondary.get(id);
    if (existing) {
      return existing;
    }
    const created = { x: 0, y: 0, vx: 0, vy: 0 };
    this.secondary.set(id, created);
    return created;
  }

  private pushValue(targetKind: RuntimeTrackTargetKind, target: number, property: RuntimeTrackProperty, value: number): void {
    const existing = this.output.values.find((item) => item.targetKind === targetKind && item.target === target && item.property === property);
    if (existing && typeof existing.value === "number") {
      existing.value += value;
      return;
    }
    this.output.values.push({ targetKind, target, property, value } satisfies AnimationSampleTrackValue);
  }
}

function numberParam(params: AnimationParameters, key: string): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
