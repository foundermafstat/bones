import {
  createAnimationSample,
  interpolateValue,
  sampleAnimationClip
} from "./AnimationSampler.js";
import type {
  AnimationSample,
  AnimationSampleTrackValue,
  RuntimeAnimationClip,
  RuntimeSampleValue,
  RuntimeTransitionEasing,
  RuntimeTrackProperty,
  RuntimeTrackTargetKind
} from "./types.js";

export interface AnimationMask {
  readonly targets?: readonly string[];
  readonly properties?: readonly RuntimeTrackProperty[];
}

export interface AnimationLayerOptions {
  readonly clipId: number;
  readonly weight?: number;
  readonly additive?: boolean;
  readonly mask?: AnimationMask;
  readonly time?: number;
}

export interface CrossfadeOptions {
  readonly duration: number;
  readonly phaseMatch?: boolean;
  readonly easing?: RuntimeTransitionEasing;
}

export class AnimationMixer {
  readonly output: AnimationSample = createAnimationSample();

  private readonly clips = new Map<number, RuntimeAnimationClip>();
  private readonly baseSample = createAnimationSample();
  private readonly fadeSample = createAnimationSample();
  private readonly layerSamples: AnimationSample[] = [];
  private baseClip: RuntimeAnimationClip | undefined;
  private fadeClip: RuntimeAnimationClip | undefined;
  private baseTime = 0;
  private fadeTime = 0;
  private fadeDuration = 0;
  private fadeElapsed = 0;
  private fadeEasing: RuntimeTransitionEasing = "linear";
  private layers: AnimationLayerOptions[] = [];

  constructor(clips: readonly RuntimeAnimationClip[] = []) {
    for (const clip of clips) {
      this.clips.set(clip.id, clip);
    }
  }

  addClip(clip: RuntimeAnimationClip): void {
    this.clips.set(clip.id, clip);
  }

  play(clipId: number, time = 0): void {
    this.baseClip = this.requireClip(clipId);
    this.baseTime = time;
    this.fadeClip = undefined;
    this.fadeTime = 0;
    this.fadeDuration = 0;
    this.fadeElapsed = 0;
  }

  crossfadeTo(clipId: number, options: CrossfadeOptions): void {
    const next = this.requireClip(clipId);
    if (!this.baseClip || options.duration <= 0) {
      this.play(clipId);
      return;
    }
    this.fadeClip = next;
    this.fadeDuration = options.duration;
    this.fadeElapsed = 0;
    this.fadeEasing = options.easing ?? "linear";
    this.fadeTime = options.phaseMatch ? next.duration * (this.baseSample.normalizedTime || normalizedTime(this.baseClip, this.baseTime)) : 0;
  }

  setLayers(layers: readonly AnimationLayerOptions[]): void {
    this.layers = [...layers];
  }

  update(dt: number): AnimationSample {
    if (!this.baseClip) {
      this.output.values.length = 0;
      return this.output;
    }

    this.baseTime += dt;
    const base = sampleAnimationClip(this.baseClip, this.baseTime, this.baseSample);
    copySample(base, this.output);

    if (this.fadeClip) {
      this.fadeTime += dt;
      this.fadeElapsed += dt;
      const fade = sampleAnimationClip(this.fadeClip, this.fadeTime, this.fadeSample);
      const rawWeight = Math.min(1, this.fadeElapsed / this.fadeDuration);
      const weight = transitionEase(rawWeight, this.fadeEasing);
      blendInto(this.output, fade, weight);
      if (rawWeight >= 1) {
        this.baseClip = this.fadeClip;
        this.baseTime = this.fadeTime;
        this.fadeClip = undefined;
        this.fadeTime = 0;
        this.fadeElapsed = 0;
        this.fadeDuration = 0;
      }
    }

    for (let index = 0; index < this.layers.length; index += 1) {
      const layer = this.layers[index]!;
      const clip = this.requireClip(layer.clipId);
      const sample = this.layerSamples[index] ?? createAnimationSample();
      this.layerSamples[index] = sampleAnimationClip(clip, layer.time ?? this.baseTime, sample);
      if (layer.additive) {
        addInto(this.output, sample, layer.weight ?? 1, layer.mask);
      } else {
        blendInto(this.output, sample, layer.weight ?? 1, layer.mask);
      }
    }

    return this.output;
  }

  get transitionWeight(): number {
    return this.fadeClip ? transitionEase(Math.min(1, this.fadeElapsed / this.fadeDuration), this.fadeEasing) : 0;
  }

  private requireClip(id: number): RuntimeAnimationClip {
    const clip = this.clips.get(id);
    if (!clip) {
      throw new Error(`Animation clip '${id}' was not registered.`);
    }
    return clip;
  }
}

export function blendInto(base: AnimationSample, overlay: AnimationSample, weight: number, mask?: AnimationMask): AnimationSample {
  for (const value of overlay.values) {
    if (!matchesMask(value, mask)) {
      continue;
    }
    const existing = findValue(base, value);
    if (existing) {
      existing.value = interpolateValue(existing.value, value.value, weight, value.property);
    } else {
      base.values.push({ ...value });
    }
  }
  return base;
}

export function addInto(base: AnimationSample, overlay: AnimationSample, weight: number, mask?: AnimationMask): AnimationSample {
  for (const value of overlay.values) {
    if (!matchesMask(value, mask)) {
      continue;
    }
    const existing = findValue(base, value);
    if (existing && typeof existing.value === "number" && typeof value.value === "number") {
      existing.value += value.value * weight;
    }
  }
  return base;
}

function copySample(from: AnimationSample, to: AnimationSample): void {
  to.localTime = from.localTime;
  to.normalizedTime = from.normalizedTime;
  to.values.length = from.values.length;
  for (let index = 0; index < from.values.length; index += 1) {
    const value = from.values[index]!;
    const target = to.values[index];
    if (target) {
      target.value = value.value;
    } else {
      to.values[index] = { ...value };
    }
  }
}

function findValue(sample: AnimationSample, value: AnimationSampleTrackValue): AnimationSampleTrackValue | undefined {
  return sample.values.find((item) => item.targetKind === value.targetKind && item.target === value.target && item.property === value.property);
}

function matchesMask(value: AnimationSampleTrackValue, mask: AnimationMask | undefined): boolean {
  if (!mask) {
    return true;
  }
  if (mask.properties && !mask.properties.includes(value.property)) {
    return false;
  }
  return !mask.targets || mask.targets.includes(targetKey(value.targetKind, value.target));
}

function targetKey(kind: RuntimeTrackTargetKind, target: number): string {
  return `${kind}:${target}`;
}

function normalizedTime(clip: RuntimeAnimationClip, time: number): number {
  if (clip.duration <= 0) {
    return 0;
  }
  return (time % clip.duration) / clip.duration;
}

function transitionEase(t: number, easing: RuntimeTransitionEasing): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (easing === "easeIn") {
    return clamped * clamped;
  }
  if (easing === "easeOut") {
    return 1 - (1 - clamped) * (1 - clamped);
  }
  if (easing === "easeInOut" || easing === "cubicBezier") {
    return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
  }
  if (easing === "spring") {
    return Math.min(1, 1 - Math.cos(clamped * Math.PI * 0.5) * Math.exp(-4 * clamped));
  }
  if (easing === "overshoot") {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return Math.min(1, 1 + c3 * Math.pow(clamped - 1, 3) + c1 * Math.pow(clamped - 1, 2));
  }
  if (easing === "anticipation") {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return Math.max(0, c3 * clamped * clamped * clamped - c1 * clamped * clamped);
  }
  return clamped;
}
