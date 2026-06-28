"use client";

import { compileRig } from "@bones/compiler";
import {
  RigInstance,
  RuntimeProfiler,
  sampleAnimationClip,
  qualityPresets,
  type RuntimeAnimationClip,
  type RuntimeCompiledRig,
  type QualityPresetName,
  type RuntimeProfilerStats
} from "@bones/runtime-pixi";
import { useEffect, useRef, useState } from "react";
import type { EditorProjectState } from "./editorState";
import { toSourceProject } from "./editorSourceProject";
import { vectorizeSvgParts } from "./editorVectorImport";

interface PixiPreviewProps {
  readonly clipId: string;
  readonly compiledProject?: RuntimeCompiledRig | null;
  readonly playing: boolean;
  readonly project: EditorProjectState;
  readonly quality: QualityPresetName;
  readonly runtimeMode: "source" | "compiled";
  readonly sceneState?: PixiPreviewSceneState | undefined;
  readonly showSkeleton: boolean;
  readonly onProfilerStats?: (stats: RuntimeProfilerStats) => void;
}

interface PixiPreviewSceneState {
  readonly x: number;
  readonly y: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly facing: -1 | 1;
  readonly colliders: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly kind: string }[];
}

export function PixiPreview({ clipId, compiledProject, playing, project, quality, runtimeMode, sceneState, showSkeleton, onProfilerStats }: PixiPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ clipId, playing, sceneState, showSkeleton });
  const [error, setError] = useState<string | null>(null);

  stateRef.current = { clipId, playing, sceneState, showSkeleton };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function mountPreview() {
      try {
        setError(null);
        const [pixi, compiled] = await Promise.all([import("pixi.js"), runtimeMode === "compiled" && compiledProject ? Promise.resolve(compiledProject) : compilePreviewRig(project)]);
        const texturePaths = getRigTexturePaths(compiled);
        if (texturePaths.length) {
          await pixi.Assets.load(texturePaths);
        }
        if (cancelled || !hostRef.current) {
          return;
        }

        const preset = qualityPresets[quality];
        const app = new pixi.Application();
        await app.init({
          resizeTo: hostRef.current,
          backgroundAlpha: preset.contextAlpha ? 0 : 1,
          antialias: preset.antialias,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, preset.resolution),
          powerPreference: "high-performance"
        });

        if (cancelled || !hostRef.current) {
          app.destroy(true);
          return;
        }

        const rig = new RigInstance(compiled, { quality });
        const profiler = new RuntimeProfiler();
        const sceneLayer = new pixi.Graphics();
        const skeleton = new pixi.Graphics();
        skeleton.zIndex = 1000;
        rig.container.sortableChildren = true;
        rig.container.addChild(skeleton);

        hostRef.current.appendChild(app.canvas);
        app.stage.addChild(sceneLayer);
        app.stage.addChild(rig.container);

        let time = 0;
        let activeClipId = stateRef.current.clipId;
        let resizeFrame = 0;
        const meshBounds = getRigMeshBounds(compiled);
        const viewState = {
          zoom: 1,
          panX: 0,
          panY: 0,
          pointers: new Map<number, { x: number; y: number }>(),
          pinchDistance: 0
        };
        const resizePreview = () => {
          const currentHost = hostRef.current;
          if (!currentHost) {
            return;
          }
          const width = Math.max(1, Math.round(currentHost.clientWidth));
          const height = Math.max(1, Math.round(currentHost.clientHeight));
          app.renderer.resize(width, height);
        };
        const scheduleResize = () => {
          if (resizeFrame) {
            cancelAnimationFrame(resizeFrame);
          }
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            resizePreview();
          });
        };
        const resizeObserver = new ResizeObserver(scheduleResize);
        resizeObserver.observe(hostRef.current);
        resizePreview();
        const canvas = app.canvas as HTMLCanvasElement;
        canvas.style.touchAction = "none";
        canvas.style.cursor = "grab";
        const applyZoom = (clientX: number, clientY: number, nextZoom: number) => {
          const rect = canvas.getBoundingClientRect();
          const x = clientX - rect.left;
          const y = clientY - rect.top;
          const clamped = Math.min(4, Math.max(0.35, nextZoom));
          const ratio = clamped / viewState.zoom;
          viewState.panX = x - app.screen.width * 0.5 - (x - app.screen.width * 0.5 - viewState.panX) * ratio;
          viewState.panY = y - app.screen.height * 0.5 - (y - app.screen.height * 0.5 - viewState.panY) * ratio;
          viewState.zoom = clamped;
        };
        const centerRig = () => {
          viewState.zoom = 1;
          viewState.panX = 0;
          viewState.panY = 0;
        };
        const pointerDistance = () => {
          const points = [...viewState.pointers.values()];
          if (points.length < 2) {
            return 0;
          }
          return Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
        };
        const pointerCenter = () => {
          const points = [...viewState.pointers.values()];
          return {
            x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
            y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length)
          };
        };
        const onPointerDown = (event: PointerEvent) => {
          canvas.setPointerCapture(event.pointerId);
          viewState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          viewState.pinchDistance = pointerDistance();
          canvas.style.cursor = "grabbing";
        };
        const onPointerMove = (event: PointerEvent) => {
          const previous = viewState.pointers.get(event.pointerId);
          if (!previous) {
            return;
          }
          viewState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (viewState.pointers.size >= 2) {
            const distance = pointerDistance();
            if (viewState.pinchDistance > 0 && distance > 0) {
              const center = pointerCenter();
              applyZoom(center.x, center.y, viewState.zoom * (distance / viewState.pinchDistance));
            }
            viewState.pinchDistance = distance;
            return;
          }
          viewState.panX += event.clientX - previous.x;
          viewState.panY += event.clientY - previous.y;
        };
        const onPointerEnd = (event: PointerEvent) => {
          viewState.pointers.delete(event.pointerId);
          viewState.pinchDistance = pointerDistance();
          if (!viewState.pointers.size) {
            canvas.style.cursor = "grab";
          }
        };
        const onWheel = (event: WheelEvent) => {
          event.preventDefault();
          applyZoom(event.clientX, event.clientY, viewState.zoom * Math.exp(-event.deltaY * 0.0012));
        };
        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerup", onPointerEnd);
        canvas.addEventListener("pointercancel", onPointerEnd);
        canvas.addEventListener("dblclick", centerRig);
        canvas.addEventListener("wheel", onWheel, { passive: false });

        const tick = (ticker: { deltaMS: number }) => {
          const current = stateRef.current;
          if (current.clipId !== activeClipId) {
            activeClipId = current.clipId;
            time = 0;
          }
          if (current.playing) {
            time += ticker.deltaMS / 1000;
          }
          const updateStart = performance.now();

          const fitScale = meshBounds
            ? Math.min(app.screen.width / (meshBounds.width + 80), app.screen.height / (meshBounds.height + 80)) * 0.84
            : Math.min(app.screen.width / 460, app.screen.height / 560) * 0.92;
          const scale = fitScale * viewState.zoom;
          const scene = current.sceneState;
          const sceneX = scene ? scene.x - scene.cameraX : 0;
          const sceneY = scene ? scene.y - scene.cameraY : 0;
          const scaleX = scale * (scene?.facing ?? 1);
          const desiredX = app.screen.width * 0.5 + sceneX * scale + viewState.panX;
          const desiredY = app.screen.height * 0.5 + sceneY * scale + viewState.panY;
          rig.container.position.set(
            meshBounds ? desiredX - meshBounds.centerX * scaleX : desiredX,
            meshBounds ? desiredY - meshBounds.centerY * scale : desiredY
          );
          rig.container.scale.set(scaleX, scale);
          drawPreviewScene(sceneLayer, scene, app.screen, scale, viewState);

          const clip = getPreviewClip(compiled, current.clipId);
          if (clip) {
            rig.applySample(sampleAnimationClip(clip, time));
          } else {
            rig.update(0);
          }

          drawSkeleton(skeleton, rig, compiled, project, current.showSkeleton);
          const updateMs = performance.now() - updateStart;
          const stats = profiler.record({ updateMs, renderMs: ticker.deltaMS, allocations: 0 });
          if (stats.frames % 30 === 0) {
            onProfilerStats?.({ ...stats });
          }
        };

        app.ticker.add(tick);
        cleanup = () => {
          if (resizeFrame) {
            cancelAnimationFrame(resizeFrame);
          }
          canvas.removeEventListener("pointerdown", onPointerDown);
          canvas.removeEventListener("pointermove", onPointerMove);
          canvas.removeEventListener("pointerup", onPointerEnd);
          canvas.removeEventListener("pointercancel", onPointerEnd);
          canvas.removeEventListener("dblclick", centerRig);
          canvas.removeEventListener("wheel", onWheel);
          resizeObserver.disconnect();
          app.ticker.remove(tick);
          app.destroy(true, { children: true });
        };
      } catch (previewError) {
        if (!cancelled) {
          setError(previewError instanceof Error ? previewError.message : "Preview failed to compile.");
        }
      }
    }

    void mountPreview();

    return () => {
      cancelled = true;
      cleanup?.();
      host.replaceChildren();
    };
  }, [compiledProject, onProfilerStats, project, quality, runtimeMode]);

  return (
    <>
      <div className="pixiPreviewHost" ref={hostRef} aria-label={runtimeMode === "compiled" ? "Compiled runtime rig preview" : "Editor source rig preview"} />
      {error ? (
        <div className="absolute left-3 top-3 max-w-md rounded-md border border-destructive/30 bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </>
  );
}

async function compilePreviewRig(project: EditorProjectState): Promise<RuntimeCompiledRig> {
  const vectorProject = await vectorizeSvgParts(project);
  return compileRig(toSourceProject(vectorProject)) as unknown as RuntimeCompiledRig;
}

function getPreviewClip(compiled: RuntimeCompiledRig, clipId: string): RuntimeAnimationClip | undefined {
  const clips = compiled.animations ?? [];
  const compiledId = compiled.lookups?.animations[clipId];
  return compiledId === undefined ? clips[0] : clips.find((clip) => clip.id === compiledId) ?? clips[compiledId] ?? clips[0];
}

function getRigTexturePaths(compiled: RuntimeCompiledRig): string[] {
  return Array.from(new Set(compiled.rig.parts.flatMap((part) => (part.mesh?.texture ? [part.mesh.texture] : []))));
}

function getRigMeshBounds(compiled: RuntimeCompiledRig): { readonly centerX: number; readonly centerY: number; readonly width: number; readonly height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of compiled.rig.parts) {
    const vertices = part.mesh?.vertices;
    if (!vertices?.length) {
      continue;
    }
    for (let index = 0; index < vertices.length; index += 2) {
      const x = vertices[index] ?? 0;
      const y = vertices[index + 1] ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { centerX: (minX + maxX) * 0.5, centerY: (minY + maxY) * 0.5, width: maxX - minX, height: maxY - minY };
}

function drawSkeleton(
  skeleton: import("pixi.js").Graphics,
  rig: RigInstance,
  compiled: RuntimeCompiledRig,
  project: EditorProjectState,
  visible: boolean
) {
  skeleton.clear();
  skeleton.visible = visible;
  if (!visible) {
    return;
  }

  const lookups = compiled.lookups?.bones ?? {};
  for (const boneId of project.hierarchy) {
    const parentId = project.parents[boneId];
    if (!parentId) {
      continue;
    }
    const bone = getRuntimeBone(rig, lookups[boneId]);
    const parent = getRuntimeBone(rig, lookups[parentId]);
    if (!bone || !parent) {
      continue;
    }
    const from = rig.container.toLocal(parent.getGlobalPosition());
    const to = rig.container.toLocal(bone.getGlobalPosition());
    skeleton.moveTo(from.x, from.y);
    skeleton.lineTo(to.x, to.y);
  }

  skeleton.stroke({ color: 0x4f8cff, alpha: 0.78, width: 2 });
  for (const boneId of project.hierarchy) {
    const bone = getRuntimeBone(rig, lookups[boneId]);
    if (!bone) {
      continue;
    }
    const point = rig.container.toLocal(bone.getGlobalPosition());
    skeleton.circle(point.x, point.y, boneId === project.selectedBoneId ? 5 : 3);
  }
  skeleton.fill({ color: 0xffffff, alpha: 0.9 });
  skeleton.stroke({ color: 0x1b4dcc, alpha: 0.9, width: 1 });
}

function drawPreviewScene(
  layer: import("pixi.js").Graphics,
  scene: PixiPreviewSceneState | undefined,
  screen: { readonly width: number; readonly height: number },
  scale: number,
  view: { readonly panX: number; readonly panY: number }
) {
  layer.clear();
  if (!scene) {
    return;
  }
  const originX = screen.width * 0.5 - scene.cameraX * scale + view.panX;
  const originY = screen.height * 0.5 - scene.cameraY * scale + view.panY;
  for (const collider of scene.colliders) {
    const color = collider.kind === "deathZone" ? 0xef4444 : collider.kind === "wallJump" ? 0x22c55e : collider.kind === "movingPlatform" ? 0x8b5cf6 : 0x4f8cff;
    layer.rect(originX + collider.x * scale, originY + collider.y * scale, collider.width * scale, collider.height * scale);
    layer.fill({ color, alpha: collider.kind === "deathZone" ? 0.35 : 0.22 });
    layer.stroke({ color, alpha: 0.72, width: 1 });
  }
  layer.circle(originX + scene.x * scale, originY + scene.y * scale, 4);
  layer.fill({ color: 0xf59e0b, alpha: 0.95 });
}

function getRuntimeBone(rig: RigInstance, id: number | undefined) {
  return typeof id === "number" ? rig.getBoneContainer(id) : undefined;
}
