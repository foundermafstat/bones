import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeStateMachineController, evaluateBlendTree } from "../dist/index.js";

const machine = {
  id: 0,
  initialState: 0,
  states: [
    { id: 0, clip: 0 },
    { id: 1, clip: 1 },
    { id: 2, clip: 2 },
    { id: 3, clip: 3 }
  ],
  transitions: [
    { id: 0, from: 0, to: 1, duration: 0.1, priority: 0, canInterrupt: true, conditions: [{ parameter: 0, operator: ">", value: 0 }] },
    { id: 1, from: 1, to: 2, duration: 0.1, priority: 0, canInterrupt: true, conditions: [{ parameter: 0, operator: ">", value: 100 }] },
    { id: 2, from: 1, to: 3, duration: 0.2, priority: 10, canInterrupt: false, conditions: [{ parameter: 1, operator: "==", value: true }] },
    { id: 3, from: 3, to: 0, duration: 0, priority: 0, canInterrupt: true, conditions: [{ parameter: 2, operator: ">", value: 0.1 }] }
  ],
  parameters: [
    { id: 0, type: "number", defaultValue: 0 },
    { id: 1, type: "boolean", defaultValue: false },
    { id: 2, type: "number", defaultValue: 0 }
  ],
  parameterLookup: { absSpeed: 0, jumpPressed: 1, timeInState: 2 }
};

test("transitions idle to walk to run using parameters", () => {
  const controller = new RuntimeStateMachineController(machine);

  assert.equal(controller.update(0, { absSpeed: 0 }).state.id, 0);
  assert.equal(controller.update(0.016, { absSpeed: 40 }).state.id, 1);
  assert.equal(controller.update(0.016, { absSpeed: 120 }).state.id, 2);
});

test("uses transition priority and canInterrupt gating", () => {
  const controller = new RuntimeStateMachineController(machine);

  assert.equal(controller.update(0.016, { absSpeed: 40 }).state.id, 1);
  const jump = controller.update(0.016, { absSpeed: 120, jumpPressed: true });
  assert.equal(jump.state.id, 3);
  assert.equal(jump.transition.id, 2);

  const blocked = controller.update(0.05, { absSpeed: 0 });
  assert.equal(blocked.state.id, 3);
  assert.equal(blocked.transition.id, 2);
});

test("exposes timeInState for landing style transitions", () => {
  const controller = new RuntimeStateMachineController(machine);

  controller.update(0, { absSpeed: 40 });
  controller.update(0, { jumpPressed: true });
  controller.update(0.2, {});
  assert.equal(controller.update(0.11, {}).state.id, 0);
});

test("respects min state time and transition interrupt windows", () => {
  const controller = new RuntimeStateMachineController({
    ...machine,
    transitions: [
      { id: 0, from: 0, to: 1, duration: 0.1, priority: 0, canInterrupt: true, minStateTime: 0.05, conditions: [{ parameter: 0, operator: ">", value: 0 }] },
      { id: 1, from: 1, to: 2, duration: 0.2, priority: 0, canInterrupt: true, interruptWindow: [0.1, 0.15], conditions: [{ parameter: 0, operator: ">", value: 50 }] },
      { id: 2, from: 2, to: 3, duration: 0.1, priority: 10, canInterrupt: true, conditions: [{ parameter: 1, operator: "==", value: true }] }
    ]
  });

  assert.equal(controller.update(0.016, { absSpeed: 40 }).state.id, 0);
  assert.equal(controller.update(0.04, { absSpeed: 40 }).state.id, 1);
  assert.equal(controller.update(0.01, { absSpeed: 80 }).state.id, 2);
  assert.equal(controller.update(0.05, { jumpPressed: true }).state.id, 2);
  assert.equal(controller.update(0.05, { jumpPressed: true }).state.id, 3);
});

test("evaluates 1d locomotion blend tree", () => {
  const result = evaluateBlendTree(
    [
      { threshold: 0, clip: 0 },
      { threshold: 20, clip: 1 },
      { threshold: 80, clip: 2 }
    ],
    50
  );

  assert.deepEqual(result, { lowerClip: 1, upperClip: 2, weight: 0.5 });
});
