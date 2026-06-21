import type {
  AnimationParameterValue,
  AnimationParameters,
  RuntimeBlendTreeChild,
  RuntimeState,
  RuntimeStateMachine,
  RuntimeTransition
} from "./types.js";

export interface BlendTree1DOutput {
  readonly lowerClip: number;
  readonly upperClip: number;
  readonly weight: number;
}

export interface StateMachineEvaluation {
  readonly state: RuntimeState;
  readonly previousState?: RuntimeState;
  readonly transition?: RuntimeTransition;
  readonly timeInState: number;
  readonly clip: number;
  readonly blendTree?: BlendTree1DOutput;
}

interface ActiveTransition {
  readonly transition: RuntimeTransition;
  readonly previousState: RuntimeState;
  elapsed: number;
}

export class RuntimeStateMachineController {
  private readonly parameterNames = new Map<number, string>();
  private readonly parameterDefaults = new Map<number, AnimationParameterValue>();
  private activeState: RuntimeState;
  private activeTransition: ActiveTransition | undefined;
  private stateTime = 0;

  constructor(private readonly machine: RuntimeStateMachine) {
    const initial = this.getState(machine.initialState);
    if (!initial) {
      throw new Error(`State machine '${machine.id}' is missing initial state '${machine.initialState}'.`);
    }
    this.activeState = initial;
    for (const [name, id] of Object.entries(machine.parameterLookup ?? {})) {
      this.parameterNames.set(id, name);
    }
    for (const parameter of machine.parameters) {
      this.parameterDefaults.set(parameter.id, parameter.defaultValue);
    }
  }

  update(dt: number, params: AnimationParameters = {}): StateMachineEvaluation {
    this.stateTime += dt;
    if (this.activeTransition) {
      this.activeTransition.elapsed += dt;
      if (this.activeTransition.elapsed >= this.activeTransition.transition.duration) {
        this.activeTransition = undefined;
      }
    }

    if (!this.activeTransition || this.activeTransition.transition.canInterrupt) {
      const transition = this.findTransition(params);
      if (transition) {
        const previousState = this.activeState;
        const nextState = this.getState(transition.to);
        if (!nextState) {
          throw new Error(`State machine '${this.machine.id}' transition '${transition.id}' references missing state '${transition.to}'.`);
        }
        this.activeState = nextState;
        this.stateTime = 0;
        this.activeTransition =
          transition.duration > 0
            ? {
                transition,
                previousState,
                elapsed: 0
              }
            : undefined;
      }
    }

    return this.evaluate(params);
  }

  get timeInState(): number {
    return this.stateTime;
  }

  private evaluate(params: AnimationParameters): StateMachineEvaluation {
    const blendTree = this.activeState.blendTree ? evaluateBlendTree(this.activeState.blendTree.children, this.getParameter(this.activeState.blendTree.parameter, params)) : undefined;
    return {
      state: this.activeState,
      ...(this.activeTransition ? { previousState: this.activeTransition.previousState, transition: this.activeTransition.transition } : {}),
      timeInState: this.stateTime,
      clip: blendTree?.lowerClip ?? this.activeState.clip,
      ...(blendTree ? { blendTree } : {})
    };
  }

  private findTransition(params: AnimationParameters): RuntimeTransition | undefined {
    return this.machine.transitions
      .filter((transition) => transition.from === this.activeState.id && transition.conditions.every((condition) => conditionMatches(this.getParameter(condition.parameter, params), condition.operator, condition.value)))
      .sort((a, b) => b.priority - a.priority || a.id - b.id)[0];
  }

  private getParameter(id: number, params: AnimationParameters): AnimationParameterValue {
    const name = this.parameterNames.get(id);
    if (name === "timeInState") {
      return this.stateTime;
    }
    if (name && params[name] !== undefined) {
      return params[name];
    }
    return this.parameterDefaults.get(id) ?? 0;
  }

  private getState(id: number): RuntimeState | undefined {
    return this.machine.states.find((state) => state.id === id);
  }
}

export function evaluateBlendTree(children: readonly RuntimeBlendTreeChild[], parameter: AnimationParameterValue): BlendTree1DOutput | undefined {
  if (!children.length || typeof parameter !== "number") {
    return undefined;
  }
  const sorted = [...children].sort((a, b) => a.threshold - b.threshold);
  if (parameter <= sorted[0]!.threshold) {
    return { lowerClip: sorted[0]!.clip, upperClip: sorted[0]!.clip, weight: 0 };
  }
  const last = sorted[sorted.length - 1]!;
  if (parameter >= last.threshold) {
    return { lowerClip: last.clip, upperClip: last.clip, weight: 0 };
  }
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const lower = sorted[index]!;
    const upper = sorted[index + 1]!;
    if (parameter >= lower.threshold && parameter <= upper.threshold) {
      const span = upper.threshold - lower.threshold;
      return {
        lowerClip: lower.clip,
        upperClip: upper.clip,
        weight: span > 0 ? (parameter - lower.threshold) / span : 0
      };
    }
  }
  return { lowerClip: last.clip, upperClip: last.clip, weight: 0 };
}

function conditionMatches(left: AnimationParameterValue, operator: RuntimeTransition["conditions"][number]["operator"], right: AnimationParameterValue): boolean {
  if (operator === "==") {
    return left === right;
  }
  if (operator === "!=") {
    return left !== right;
  }
  if (typeof left !== "number" || typeof right !== "number") {
    return false;
  }
  if (operator === ">") {
    return left > right;
  }
  if (operator === ">=") {
    return left >= right;
  }
  if (operator === "<") {
    return left < right;
  }
  return left <= right;
}
