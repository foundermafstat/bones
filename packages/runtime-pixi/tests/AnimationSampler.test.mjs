import assert from "node:assert/strict";
import test from "node:test";
import {
  createAnimationClipSampleCache,
  createAnimationSample,
  sampleAnimationClip,
  sampleAnimationEvents,
  sampleTrackValue,
  shortestAngleDelta
} from "../dist/index.js";

const transformClip = {
  id: 0,
  duration: 1,
  fps: 60,
  loop: true,
  tracks: [
    {
      id: 0,
      targetKind: "bone",
      target: 1,
      property: "transform.x",
      keyframes: [
        { time: 0, value: 0, interpolation: "linear", curve: [0, 0, 1, 1] },
        { time: 1, value: 10, interpolation: "linear", curve: [0, 0, 1, 1] }
      ]
    },
    {
      id: 1,
      targetKind: "bone",
      target: 1,
      property: "transform.rotation",
      keyframes: [
        { time: 0, value: (170 * Math.PI) / 180, interpolation: "linear", curve: [0, 0, 1, 1] },
        { time: 1, value: (-170 * Math.PI) / 180, interpolation: "linear", curve: [0, 0, 1, 1] }
      ]
    }
  ]
};

test("samples linear transform tracks and reuses output", () => {
  const out = createAnimationSample();
  const cache = createAnimationClipSampleCache(transformClip);
  const sample = sampleAnimationClip(transformClip, 0.25, out, cache);

  assert.equal(sample, out);
  assert.equal(sample.localTime, 0.25);
  assert.equal(sample.normalizedTime, 0.25);
  assert.equal(sample.values[0].value, 2.5);

  const firstValue = sample.values[0];
  sampleAnimationClip(transformClip, 0.5, out, cache);
  assert.equal(out.values[0], firstValue);
  assert.equal(out.values[0].value, 5);
  assert.equal(cache.keyframeTimesByTrack.get(0) instanceof Float32Array, true);
});

test("wraps looped time and clamps non-looped clips", () => {
  assert.equal(sampleAnimationClip(transformClip, 1.25).localTime, 0.25);

  const nonLoop = { ...transformClip, loop: false };
  assert.equal(sampleAnimationClip(nonLoop, 2).localTime, 1);
});

test("uses shortest angle for rotation tracks", () => {
  const value = sampleAnimationClip(transformClip, 0.5).values[1].value;
  assert.equal(Math.round((value * 180) / Math.PI), 180);
  assert.equal(Math.round((shortestAngleDelta((170 * Math.PI) / 180, (-170 * Math.PI) / 180) * 180) / Math.PI), 20);
});

test("supports step hold and bezier keyframes", () => {
  const stepTrack = {
    id: 0,
    targetKind: "part",
    target: 0,
    property: "opacity",
    keyframes: [
      { time: 0, value: 0, interpolation: "step", curve: [0, 0, 1, 1] },
      { time: 1, value: 1, interpolation: "step", curve: [0, 0, 1, 1] }
    ]
  };
  assert.equal(sampleTrackValue(stepTrack, 0.75), 0);

  const bezierTrack = {
    ...stepTrack,
    keyframes: [
      { time: 0, value: 0, interpolation: "bezier", curve: [0.42, 0, 1, 1] },
      { time: 1, value: 1, interpolation: "bezier", curve: [0, 0, 1, 1] }
    ]
  };
  const value = sampleTrackValue(bezierTrack, 0.5);
  assert.ok(value > 0 && value < 1);
  assert.notEqual(value, 0.5);
});

test("updates reused sample metadata when sampling a different clip", () => {
  const out = createAnimationSample();
  sampleAnimationClip(transformClip, 0.25, out);
  sampleAnimationClip(
    {
      ...transformClip,
      tracks: [
        {
          id: 0,
          targetKind: "part",
          target: 4,
          property: "opacity",
          keyframes: [
            { time: 0, value: 0, interpolation: "linear", curve: [0, 0, 1, 1] },
            { time: 1, value: 1, interpolation: "linear", curve: [0, 0, 1, 1] }
          ]
        }
      ]
    },
    0.5,
    out
  );

  assert.equal(out.values[0].targetKind, "part");
  assert.equal(out.values[0].target, 4);
  assert.equal(out.values[0].property, "opacity");
  assert.equal(out.values[0].value, 0.5);
});

test("samples animation events across loop boundaries", () => {
  const clip = {
    ...transformClip,
    events: [
      { time: 0.1, type: "loopStart" },
      { time: 0.9, type: "loopEnd" }
    ]
  };

  const events = sampleAnimationEvents(clip, 0.8, 1.15);

  assert.deepEqual(events.map((event) => event.type), ["loopEnd", "loopStart"]);
});
