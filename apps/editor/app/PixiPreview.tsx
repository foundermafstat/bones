"use client";

import { compileRig } from "@bones/compiler";
import {
  RigInstance,
  sampleAnimationClip,
  type RuntimeAnimationClip,
  type RuntimeCompiledRig
} from "@bones/runtime-pixi";
import type { PartDefinition, PathCommand, RigProject, Transform2D } from "@bones/schema";
import { parsePathData, type PathCommand as VectorPathCommand } from "@bones/vector-core";
import { useEffect, useRef, useState } from "react";
import type { EditorProjectState, ShapePart } from "./editorState";
import { toSourceProject } from "./editorSourceProject";

interface PixiPreviewProps {
  readonly clipId: number;
  readonly playing: boolean;
  readonly project: EditorProjectState;
  readonly showSkeleton: boolean;
}

const identityTransform: Transform2D = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1
};

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
  const source = await inlinePreviewSvgAssets(toSourceProject(project), project.parts);
  return compileRig(source) as unknown as RuntimeCompiledRig;
}

async function inlinePreviewSvgAssets(
  source: RigProject,
  editorParts: Readonly<Record<string, ShapePart>>
): Promise<RigProject> {
  const rigs = await Promise.all(
    source.rigs.map(async (rig) => ({
      ...rig,
      parts: await Promise.all((rig.parts ?? []).map((part) => inlinePreviewSvgPart(part, editorParts[part.id])))
    }))
  );

  return { ...source, rigs };
}

async function inlinePreviewSvgPart(part: PartDefinition, editorPart: ShapePart | undefined): Promise<PartDefinition> {
  if (part.type !== "svg" || !part.svg?.source || !part.svg.source.startsWith("/")) {
    return part;
  }

  const response = await fetch(part.svg.source);
  if (!response.ok) {
    throw new Error(`Failed to load preview SVG '${part.svg.source}': ${response.status}`);
  }

  const svgSource = await response.text();
  const viewBox = readSvgViewBox(svgSource);
  const pathData = readSvgPathData(svgSource);
  if (!pathData) {
    throw new Error(`Preview SVG '${part.svg.source}' does not contain a path.`);
  }

  const { svg: _svg, ...pathPart } = part;
  return {
    ...pathPart,
    type: "path",
    local: editorPart ? svgLocalTransform(editorPart, viewBox) : (part.local ?? identityTransform),
    path: {
      closed: true,
      commands: parsePathData(pathData).map(toSchemaPathCommand)
    }
  };
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

function svgLocalTransform(part: ShapePart, viewBox: readonly [number, number, number, number] | undefined): Transform2D {
  if (!viewBox || !part.width) {
    return {
      ...identityTransform,
      x: part.offset?.[0] ?? 0,
      y: part.offset?.[1] ?? 0
    };
  }

  const [, , width, height] = viewBox;
  const scale = width > 0 ? part.width / width : 1;
  const anchor = part.anchor ?? [0, 0];
  const offset = part.offset ?? [0, 0];

  return {
    x: offset[0] - anchor[0] * width * scale,
    y: offset[1] - anchor[1] * height * scale,
    rotation: 0,
    scaleX: scale,
    scaleY: scale
  };
}

function readSvgViewBox(source: string): readonly [number, number, number, number] | undefined {
  const viewBox = source.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  if (viewBox) {
    const values = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number(value));
    if (values.length === 4 && values.every(Number.isFinite)) {
      return [values[0]!, values[1]!, values[2]!, values[3]!];
    }
  }

  const width = readSvgLength(source, "width");
  const height = readSvgLength(source, "height");
  return width && height ? [0, 0, width, height] : undefined;
}

function readSvgPathData(source: string): string | undefined {
  return source.match(/<path\b[^>]*\bd=["']([^"']+)["'][^>]*>/i)?.[1];
}

function toSchemaPathCommand(command: VectorPathCommand): PathCommand {
  if (command.cmd === "M" || command.cmd === "L") {
    return { type: command.cmd, x: command.x, y: command.y };
  }
  if (command.cmd === "Q") {
    return { type: "Q", cx: command.cpx, cy: command.cpy, x: command.x, y: command.y };
  }
  if (command.cmd === "C") {
    return {
      type: "C",
      c1x: command.cp1x,
      c1y: command.cp1y,
      c2x: command.cp2x,
      c2y: command.cp2y,
      x: command.x,
      y: command.y
    };
  }
  return { type: "Z" };
}

function readSvgLength(source: string, attribute: "width" | "height"): number | undefined {
  const value = source.match(new RegExp(`\\b${attribute}=["']([0-9.]+)`, "i"))?.[1];
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}
