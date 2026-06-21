import type { AnimationParameters, AnimationSample, AnimationSampleTrackValue } from "./types.js";

export interface RaycastHit {
  readonly hit: boolean;
  readonly x: number;
  readonly y: number;
  readonly normalX: number;
  readonly normalY: number;
}

export interface RaycastWorld {
  raycastDown(x: number, y: number, distance: number): RaycastHit;
}

export interface FootIkConfig {
  readonly footBone: number;
  readonly shinBone?: number;
  readonly thighBone?: number;
  readonly raycastOffsetX: number;
  readonly raycastHeight: number;
  readonly maxCorrection: number;
  readonly blend: number;
}

export interface ConstraintSolverConfig {
  readonly feet: readonly FootIkConfig[];
}

export class ConstraintSolver {
  readonly output: AnimationSample = {
    normalizedTime: 0,
    localTime: 0,
    values: []
  };

  constructor(private readonly config: ConstraintSolverConfig, private readonly world: RaycastWorld) {}
  private readonly lockedCorrections = new Map<number, { y: number; rotation: number }>();

  solve(params: AnimationParameters = {}): AnimationSample {
    this.output.values.length = 0;
    const grounded = params.grounded === true;
    if (!grounded || params.jumpPressed === true || params.falling === true) {
      return this.output;
    }

    for (const foot of this.config.feet) {
      const baseX = numberParam(params, `bone.${foot.footBone}.worldX`);
      const baseY = numberParam(params, `bone.${foot.footBone}.worldY`);
      const rayX = baseX + foot.raycastOffsetX;
      const rayY = baseY - foot.raycastHeight;
      const hit = this.world.raycastDown(rayX, rayY, foot.raycastHeight * 2);
      const locked = params[`foot.${foot.footBone}.locked`] === true;
      if (!hit.hit && !locked) {
        continue;
      }

      const previous = this.lockedCorrections.get(foot.footBone);
      const correction = hit.hit ? clamp(hit.y - baseY, -foot.maxCorrection, foot.maxCorrection) * clamp(foot.blend, 0, 1) : previous?.y;
      if (correction === undefined) {
        continue;
      }
      this.pushValue(foot.footBone, "transform.y", correction);
      const rotation = hit.hit ? Math.atan2(hit.normalX, hit.normalY) * clamp(foot.blend, 0, 1) : previous?.rotation ?? 0;
      this.pushValue(foot.footBone, "transform.rotation", rotation);
      if (locked || hit.hit) {
        this.lockedCorrections.set(foot.footBone, { y: correction, rotation });
      }

      if (foot.shinBone !== undefined) {
        this.pushValue(foot.shinBone, "transform.y", correction * 0.5);
      }
      if (foot.thighBone !== undefined) {
        this.pushValue(foot.thighBone, "transform.y", correction * 0.25);
      }
    }

    return this.output;
  }

  private pushValue(target: number, property: AnimationSampleTrackValue["property"], value: number): void {
    this.output.values.push({ targetKind: "bone", target, property, value });
  }
}

function numberParam(params: AnimationParameters, key: string): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
