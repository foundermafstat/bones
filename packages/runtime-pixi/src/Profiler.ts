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

type MutableRuntimeProfilerStats = {
  -readonly [K in keyof RuntimeProfilerStats]: RuntimeProfilerStats[K];
};

export type QualityPresetName = "low" | "medium" | "high";

export interface QualityPreset {
  readonly name: QualityPresetName;
  readonly antialias: boolean;
  readonly contextAlpha: boolean;
  readonly resolution: number;
  readonly clothFps: number;
  readonly maxDynamicMeshes: number;
  readonly enableSecondaryMotion: boolean;
}

export const qualityPresets: Readonly<Record<QualityPresetName, QualityPreset>> = {
  low: { name: "low", antialias: false, contextAlpha: false, resolution: 1, clothFps: 30, maxDynamicMeshes: 1, enableSecondaryMotion: false },
  medium: { name: "medium", antialias: false, contextAlpha: true, resolution: 1.5, clothFps: 45, maxDynamicMeshes: 4, enableSecondaryMotion: true },
  high: { name: "high", antialias: true, contextAlpha: true, resolution: 2, clothFps: 60, maxDynamicMeshes: 12, enableSecondaryMotion: true }
};

export class RuntimeProfiler {
  private frames = 0;
  private totalUpdate = 0;
  private totalRender = 0;
  private maxUpdate = 0;
  private maxRender = 0;
  private allocations = 0;
  private readonly snapshot: MutableRuntimeProfilerStats = {
    frames: 0,
    avgUpdateMs: 0,
    avgRenderMs: 0,
    maxUpdateMs: 0,
    maxRenderMs: 0,
    allocations: 0
  };

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
    this.snapshot.frames = this.frames;
    this.snapshot.avgUpdateMs = this.frames ? this.totalUpdate / this.frames : 0;
    this.snapshot.avgRenderMs = this.frames ? this.totalRender / this.frames : 0;
    this.snapshot.maxUpdateMs = this.maxUpdate;
    this.snapshot.maxRenderMs = this.maxRender;
    this.snapshot.allocations = this.allocations;
    return this.snapshot;
  }
}
