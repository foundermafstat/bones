export interface RuntimeProfilerSample {
  readonly updateMs: number;
  readonly renderMs: number;
  readonly allocations: number;
}

export interface RuntimeProfilerStats {
  readonly frames: number;
  readonly avgUpdateMs: number;
  readonly avgRenderMs: number;
  readonly maxUpdateMs: number;
  readonly maxRenderMs: number;
  readonly allocations: number;
}

export type QualityPresetName = "low" | "medium" | "high";

export interface QualityPreset {
  readonly name: QualityPresetName;
  readonly antialias: boolean;
  readonly contextAlpha: boolean;
  readonly maxDynamicMeshes: number;
  readonly enableSecondaryMotion: boolean;
}

export const qualityPresets: Readonly<Record<QualityPresetName, QualityPreset>> = {
  low: { name: "low", antialias: false, contextAlpha: false, maxDynamicMeshes: 1, enableSecondaryMotion: false },
  medium: { name: "medium", antialias: false, contextAlpha: true, maxDynamicMeshes: 4, enableSecondaryMotion: true },
  high: { name: "high", antialias: true, contextAlpha: true, maxDynamicMeshes: 12, enableSecondaryMotion: true }
};

export class RuntimeProfiler {
  private frames = 0;
  private totalUpdate = 0;
  private totalRender = 0;
  private maxUpdate = 0;
  private maxRender = 0;
  private allocations = 0;

  record(sample: RuntimeProfilerSample): RuntimeProfilerStats {
    this.frames += 1;
    this.totalUpdate += sample.updateMs;
    this.totalRender += sample.renderMs;
    this.maxUpdate = Math.max(this.maxUpdate, sample.updateMs);
    this.maxRender = Math.max(this.maxRender, sample.renderMs);
    this.allocations += sample.allocations;
    return this.stats;
  }

  get stats(): RuntimeProfilerStats {
    return {
      frames: this.frames,
      avgUpdateMs: this.frames ? this.totalUpdate / this.frames : 0,
      avgRenderMs: this.frames ? this.totalRender / this.frames : 0,
      maxUpdateMs: this.maxUpdate,
      maxRenderMs: this.maxRender,
      allocations: this.allocations
    };
  }
}
