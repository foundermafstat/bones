import assert from "node:assert/strict";
import test from "node:test";
import { AnimationMixer } from "../dist/index.js";

function clip(id, value, property = "transform.x", target = 1) {
  return {
    id,
    duration: 1,
    fps: 60,
    loop: true,
    tracks: [
      {
        id: 0,
        targetKind: "bone",
        target,
        property,
        keyframes: [
          { time: 0, value, interpolation: "linear", curve: [0, 0, 1, 1] },
          { time: 1, value, interpolation: "linear", curve: [0, 0, 1, 1] }
        ]
      }
    ]
  };
}

test("crossfades between clips by transition weight", () => {
  const mixer = new AnimationMixer([clip(0, 0), clip(1, 10)]);
  mixer.play(0);
  mixer.update(0);
  mixer.crossfadeTo(1, { duration: 1 });

  const half = mixer.update(0.5);
  assert.equal(half.values[0].value, 5);
  assert.equal(mixer.transitionWeight, 0.5);

  const done = mixer.update(0.5);
  assert.equal(done.values[0].value, 10);
  assert.equal(mixer.transitionWeight, 0);
});

test("adds additive layers", () => {
  const mixer = new AnimationMixer([clip(0, 10), clip(1, 4)]);
  mixer.play(0);
  mixer.setLayers([{ clipId: 1, additive: true, weight: 0.5 }]);

  const sample = mixer.update(0);
  assert.equal(sample.values[0].value, 12);
});

test("applies partial masks", () => {
  const base = {
    ...clip(0, 1),
    tracks: [clip(0, 1, "transform.x", 1).tracks[0], clip(0, 2, "transform.x", 2).tracks[0]]
  };
  const overlay = {
    ...clip(1, 10),
    tracks: [clip(1, 10, "transform.x", 1).tracks[0], clip(1, 20, "transform.x", 2).tracks[0]]
  };
  const mixer = new AnimationMixer([base, overlay]);
  mixer.play(0);
  mixer.setLayers([{ clipId: 1, weight: 1, mask: { targets: ["bone:2"] } }]);

  const sample = mixer.update(0);
  assert.equal(sample.values[0].value, 1);
  assert.equal(sample.values[1].value, 20);
});

test("phase matches looped transitions", () => {
  const mixer = new AnimationMixer([clip(0, 0), clip(1, 10)]);
  mixer.play(0, 0.75);
  mixer.update(0);
  mixer.crossfadeTo(1, { duration: 1, phaseMatch: true });

  const sample = mixer.update(0);
  assert.equal(sample.localTime, 0.75);
});

test("applies transition easing to crossfade weight", () => {
  const mixer = new AnimationMixer([clip(0, 0), clip(1, 10)]);
  mixer.play(0);
  mixer.update(0);
  mixer.crossfadeTo(1, { duration: 1, easing: "easeIn" });

  const half = mixer.update(0.5);
  assert.equal(half.values[0].value, 2.5);
  assert.equal(mixer.transitionWeight, 0.25);
});

test("queues animation events emitted by active clips", () => {
  const mixer = new AnimationMixer([
    {
      ...clip(0, 0),
      events: [{ time: 0.25, type: "footstep", payload: { foot: "front" } }]
    }
  ]);
  mixer.play(0);

  mixer.update(0.3);

  assert.equal(mixer.events.length, 1);
  assert.deepEqual(mixer.events[0], {
    time: 0.25,
    type: "footstep",
    payload: { foot: "front" },
    clip: 0,
    localTime: 0.25,
    normalizedTime: 0.25
  });
});
