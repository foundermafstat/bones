"use client";

import { compileRig } from "@bones/compiler";
import {
  RigInstance,
  sampleAnimationClip,
  type RuntimeAnimationClip,
  type RuntimeCompiledRig
} from "@bones/runtime-pixi";
import { useEffect, useRef, useState } from "react";
import type { EditorProjectState } from "./editorState";
import { toSourceProject } from "./editorSourceProject";
import { vectorizeSvgParts } from "./editorVectorImport";

interface PixiPreviewProps {
  readonly clipId: number;
  readonly playing: boolean;
  readonly project: EditorProjectState;
  readonly showSkeleton: boolean;
}

export function PixiPreview({ clipId, playing, project, showSkeleton }: PixiPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ clipId, playing, showSkeleton });
  const [error, setError] = useState<string | null>(null);

  stateRef.current = { clipId, playing, showSkeleton };

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
        const [pixi, compiled] = await Promise.all([import("pixi.js"), compilePreviewRig(project)]);
        if (cancelled || !hostRef.current) {
          return;
        }

        const app = new pixi.Application();
        await app.init({
          resizeTo: hostRef.current,
          backgroundAlpha: 0,
          antialias: true
        });

        if (cancelled || !hostRef.current) {
          app.destroy(true);
          return;
        }

        const rig = new RigInstance(compiled, { quality: "medium" });
        const skeleton = new pixi.Graphics();
        skeleton.zIndex = 1000;
        rig.container.sortableChildren = true;
        rig.container.addChild(skeleton);

        hostRef.current.appendChild(app.canvas);
        app.stage.addChild(rig.container);

        let time = 0;
        let activeClipId = stateRef.current.clipId;
        const tick = (ticker: { deltaMS: number }) => {
          const current = stateRef.current;
          if (current.clipId !== activeClipId) {
            activeClipId = current.clipId;
            time = 0;
          }
          if (current.playing) {
            time += ticker.deltaMS / 1000;
          }

          const scale = Math.min(app.screen.width / 460, app.screen.height / 560) * 0.92;
          rig.container.position.set(app.screen.width * 0.5, app.screen.height * 0.88);
          rig.container.scale.set(scale);

          const clip = getPreviewClip(compiled, current.clipId);
          if (clip) {
            rig.applySample(sampleAnimationClip(clip, time));
          } else {
            rig.update(0);
          }

          drawSkeleton(skeleton, rig, compiled, project, current.showSkeleton);
        };

        app.ticker.add(tick);
        cleanup = () => {
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
  }, [project]);

  return (
    <>
      <div className="pixiPreviewHost" ref={hostRef} aria-label="Compiled runtime rig preview" />
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

function getPreviewClip(compiled: RuntimeCompiledRig, clipId: number): RuntimeAnimationClip | undefined {
  const clips = compiled.animations ?? [];
  return clips[clipId] ?? clips[0];
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

function getRuntimeBone(rig: RigInstance, id: number | undefined) {
  return typeof id === "number" ? rig.getBoneContainer(id) : undefined;
}
