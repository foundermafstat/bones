import type {
  AnimationSample,
  AnimationSampleTrackValue,
  RuntimeAnimationClip,
  RuntimeAnimationEvent,
  RuntimeAnimationTrack,
  RuntimeKeyframe,
  RuntimeSampleValue
} from "./types.js";

const defaultCurve: readonly [number, number, number, number] = [0, 0, 1, 1];

export interface AnimationClipSampleCache {
  readonly clipId: number;
  readonly tracksById: ReadonlyMap<number, RuntimeAnimationTrack>;
  readonly keyframeTimesByTrack: ReadonlyMap<number, Float32Array>;
}

export function createAnimationClipSampleCache(clip: RuntimeAnimationClip): AnimationClipSampleCache {
  return {
    clipId: clip.id,
    tracksById: new Map(clip.tracks.map((track) => [track.id, track])),
    keyframeTimesByTrack: new Map(clip.tracks.map((track) => [track.id, Float32Array.from(track.keyframes, (keyframe) => keyframe.time)]))
  };
}

export function sampleAnimationClip(
  clip: RuntimeAnimationClip,
  time: number,
  out: AnimationSample = createAnimationSample(),
  cache?: AnimationClipSampleCache
): AnimationSample {
  const localTime = normalizeClipTime(clip, time);
  out.localTime = localTime;
  out.normalizedTime = clip.duration > 0 ? localTime / clip.duration : 0;
  out.values.length = clip.tracks.length;

  for (let index = 0; index < clip.tracks.length; index += 1) {
    const track = clip.tracks[index]!;
    const target = out.values[index] ?? createSampleTrackValue(track);
    setSampleTrackMetadata(target, track);
    target.value = sampleTrackValue(track, localTime, cache?.keyframeTimesByTrack.get(track.id));
    out.values[index] = target;
  }

  return out;
}

export function createAnimationSample(): AnimationSample {
  return {
    normalizedTime: 0,
    localTime: 0,
    values: []
  };
}

export function normalizeClipTime(clip: RuntimeAnimationClip, time: number): number {
  if (clip.duration <= 0 || !Number.isFinite(time)) {
    return 0;
  }
  if (!clip.loop) {
    return clamp(time, 0, clip.duration);
  }
  const wrapped = time % clip.duration;
  return wrapped < 0 ? wrapped + clip.duration : wrapped;
}

export function sampleTrackValue(track: RuntimeAnimationTrack, time: number, keyframeTimes?: Float32Array): RuntimeSampleValue {
  const keyframes = track.keyframes;
  if (keyframes.length === 0) {
    return null;
  }
  if (keyframes.length === 1 || time <= keyframes[0]!.time) {
    return keyframes[0]!.value;
  }

  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time) {
    return last.value;
  }

  const index = findKeyframeIndex(keyframes, time, keyframeTimes);
  const from = keyframes[index]!;
  const to = keyframes[index + 1]!;
  if (!from || !to) {
    return last.value;
  }
  if (from.interpolation === "step" || from.interpolation === "hold" || from.time === to.time) {
    return from.value;
  }

  const rawT = clamp((time - from.time) / (to.time - from.time), 0, 1);
  const t = from.interpolation === "bezier" ? sampleBezier(rawT, from.curve ?? defaultCurve) : rawT;
  return interpolateValue(from.value, to.value, t, track.property);
}

export function sampleAnimationEvents(
  clip: RuntimeAnimationClip,
  previousTime: number,
  nextTime: number,
  out: RuntimeAnimationEvent[] = []
): RuntimeAnimationEvent[] {
  out.length = 0;
  const events = clip.events ?? [];
  if (!events.length || clip.duration <= 0) {
    return out;
  }

  if (!clip.loop) {
    const from = clamp(previousTime, 0, clip.duration);
    const to = clamp(nextTime, 0, clip.duration);
    collectEvents(events, Math.min(from, to), Math.max(from, to), out, false);
    return out;
  }

  const from = normalizeClipTime(clip, previousTime);
  const to = normalizeClipTime(clip, nextTime);
  if (nextTime >= previousTime && to >= from) {
    collectEvents(events, from, to, out, false);
    return out;
  }

  collectEvents(events, from, clip.duration, out, false);
  collectEvents(events, 0, to, out, true);
  return out;
}

export function interpolateValue(
  from: RuntimeSampleValue,
  to: RuntimeSampleValue,
  t: number,
  property: RuntimeAnimationTrack["property"]
): RuntimeSampleValue {
  if (typeof from === "number" && typeof to === "number") {
    if (property === "transform.rotation") {
      return from + shortestAngleDelta(from, to) * t;
    }
    return from + (to - from) * t;
  }
  if (property === "deform" && Array.isArray(from) && Array.isArray(to)) {
    const length = Math.max(from.length, to.length);
    return Array.from({ length }, (_, index) => {
      const fromValue = typeof from[index] === "number" ? from[index] : 0;
      const toValue = typeof to[index] === "number" ? to[index] : 0;
      return fromValue + (toValue - fromValue) * t;
    });
  }
  return t < 1 ? from : to;
}

export function shortestAngleDelta(from: number, to: number): number {
  const fullTurn = Math.PI * 2;
  return ((((to - from) % fullTurn) + Math.PI * 3) % fullTurn) - Math.PI;
}

function findKeyframeIndex(keyframes: readonly RuntimeKeyframe[], time: number, keyframeTimes?: Float32Array): number {
  let low = 0;
  let high = keyframes.length - 2;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const currentTime = keyframeTimes?.[mid] ?? keyframes[mid]!.time;
    const nextTime = keyframeTimes?.[mid + 1] ?? keyframes[mid + 1]!.time;
    if (time < currentTime) {
      high = mid - 1;
    } else if (time >= nextTime) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return Math.max(0, Math.min(keyframes.length - 2, low));
}

function sampleBezier(t: number, curve: readonly [number, number, number, number]): number {
  const [x1, y1, x2, y2] = curve;
  let low = 0;
  let high = 1;
  let solved = t;
  for (let i = 0; i < 8; i += 1) {
    solved = (low + high) * 0.5;
    const x = cubicBezier(solved, 0, x1, x2, 1);
    if (x < t) {
      low = solved;
    } else {
      high = solved;
    }
  }
  return cubicBezier(solved, 0, y1, y2, 1);
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const inv = 1 - t;
  return inv * inv * inv * p0 + 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t * p3;
}

function createSampleTrackValue(track: RuntimeAnimationTrack): AnimationSampleTrackValue {
  return {
    targetKind: track.targetKind,
    target: track.target,
    property: track.property,
    value: null
  };
}

function setSampleTrackMetadata(target: AnimationSampleTrackValue, track: RuntimeAnimationTrack): void {
  target.targetKind = track.targetKind;
  target.target = track.target;
  target.property = track.property;
}

function collectEvents(
  events: readonly RuntimeAnimationEvent[],
  from: number,
  to: number,
  out: RuntimeAnimationEvent[],
  includeStart: boolean
): void {
  for (const event of events) {
    const afterStart = includeStart ? event.time >= from : event.time > from;
    if (afterStart && event.time <= to) {
      out.push(event);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
