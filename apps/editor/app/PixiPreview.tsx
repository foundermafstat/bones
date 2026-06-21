"use client";

import { useEffect, useRef } from "react";
import type { AnimationClip, BoneTransform, EditorProjectState, ShapePart } from "./editorState";

interface PixiPreviewProps {
  readonly clipId: number;
  readonly playing: boolean;
  readonly project: EditorProjectState;
  readonly showSkeleton: boolean;
}

const clipOrder = ["idle", "walk", "jump", "fall", "land"] as const;
const transformChannels = new Set(["x", "y", "rotation", "scaleX", "scaleY"]);

type TransformSample = Partial<Record<keyof BoneTransform, number>>;

export function PixiPreview({ clipId, playing, project, showSkeleton }: PixiPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ clipId, playing, project, showSkeleton });

  stateRef.current = { clipId, playing, project, showSkeleton };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function mountPreview() {
      const pixi = await import("pixi.js");
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

      hostRef.current.appendChild(app.canvas);

      const rigRoot = new pixi.Container();
      const skeleton = new pixi.Graphics();
      const boneContainers = new Map<string, InstanceType<typeof pixi.Container>>();
      rigRoot.sortableChildren = true;
      app.stage.addChild(rigRoot);

      for (const boneId of project.hierarchy) {
        const container = new pixi.Container();
        container.label = boneId;
        container.sortableChildren = true;
        boneContainers.set(boneId, container);
      }

      for (const boneId of project.hierarchy) {
        const parentId = project.parents[boneId];
        const container = boneContainers.get(boneId);
        if (!container) {
          continue;
        }
        (parentId ? boneContainers.get(parentId) : rigRoot)?.addChild(container);
      }

      const svgParts = Object.values(project.parts).filter((part) => part.type === "svg" && part.assetPath);
      await Promise.all(svgParts.map((part) => addSvgPart(pixi, boneContainers, part)));
      rigRoot.addChild(skeleton);
      skeleton.zIndex = 100;

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
        rigRoot.position.set(app.screen.width * 0.5, app.screen.height * 0.88);
        rigRoot.scale.set(scale);

        const samples = sampleAnimation(current.project, current.clipId, time);
        for (const boneId of current.project.hierarchy) {
          const container = boneContainers.get(boneId);
          const base = current.project.bones[boneId];
          if (!container || !base) {
            continue;
          }
          const sample = samples[boneId];
          container.position.set(sample?.x ?? base.x, sample?.y ?? base.y);
          container.rotation = sample?.rotation ?? base.rotation;
          container.scale.set(sample?.scaleX ?? base.scaleX, sample?.scaleY ?? base.scaleY);
        }

        drawSkeleton(skeleton, rigRoot, boneContainers, current.project, current.showSkeleton);
      };

      app.ticker.add(tick);
      cleanup = () => {
        app.ticker.remove(tick);
        app.destroy(true, { children: true });
      };
    }

    void mountPreview();

    return () => {
      cancelled = true;
      cleanup?.();
      host.replaceChildren();
    };
  }, [project.hierarchy, project.parents, project.parts]);

  return <div className="pixiPreviewHost" ref={hostRef} aria-label="Animated SVG rig preview" />;
}

async function addSvgPart(
  pixi: typeof import("pixi.js"),
  boneContainers: Map<string, InstanceType<typeof pixi.Container>>,
  part: ShapePart
) {
  if (!part.assetPath) {
    return;
  }

  const texture = await pixi.Assets.load(part.assetPath);
  const sprite = new pixi.Sprite(texture);
  const anchor = part.anchor ?? [0.5, 0.5];
  const offset = part.offset ?? [0, 0];
  sprite.anchor.set(anchor[0], anchor[1]);
  if (part.width) {
    sprite.width = part.width;
  }
  sprite.position.set(offset[0], offset[1]);
  sprite.zIndex = part.zIndex ?? 0;
  boneContainers.get(part.boneId)?.addChild(sprite);
}

function sampleAnimation(project: EditorProjectState, clipId: number, time: number): Record<string, TransformSample> {
  const clipKey = clipOrder[clipId] ?? "idle";
  const clip = project.animations[clipKey] ?? project.animations.idle;
  if (!clip) {
    return {};
  }

  const localTime = clip.loop ? time % clip.duration : Math.min(time, clip.duration);
  const samples: Record<string, TransformSample> = {};
  for (const [trackId, keyframes] of Object.entries(clip.tracks)) {
    const splitIndex = trackId.lastIndexOf(".");
    const boneId = trackId.slice(0, splitIndex);
    const channel = trackId.slice(splitIndex + 1);
    if (!project.bones[boneId] || !transformChannels.has(channel)) {
      continue;
    }
    samples[boneId] = { ...samples[boneId], [channel]: sampleTrack(clip, keyframes, localTime) };
  }
  return samples;
}

function sampleTrack(clip: AnimationClip, keyframes: readonly AnimationClip["tracks"][string][number][], time: number): number {
  if (!keyframes.length) {
    return 0;
  }
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0]!.time) {
    return sorted[0]!.value;
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]!;
    const previous = sorted[index - 1]!;
    if (time <= next.time) {
      if (previous.interpolation === "step" || previous.interpolation === "hold") {
        return previous.value;
      }
      const span = Math.max(0.0001, next.time - previous.time);
      const t = (time - previous.time) / span;
      return previous.value + (next.value - previous.value) * t;
    }
  }
  return clip.loop ? sorted[0]!.value : sorted[sorted.length - 1]!.value;
}

function drawSkeleton(
  skeleton: import("pixi.js").Graphics,
  rigRoot: import("pixi.js").Container,
  boneContainers: Map<string, import("pixi.js").Container>,
  project: EditorProjectState,
  visible: boolean
) {
  skeleton.clear();
  skeleton.visible = visible;
  if (!visible) {
    return;
  }

  for (const boneId of project.hierarchy) {
    const parentId = project.parents[boneId];
    const bone = boneContainers.get(boneId);
    const parent = parentId ? boneContainers.get(parentId) : undefined;
    if (!bone || !parent) {
      continue;
    }
    const from = rigRoot.toLocal(parent.getGlobalPosition());
    const to = rigRoot.toLocal(bone.getGlobalPosition());
    skeleton.moveTo(from.x, from.y);
    skeleton.lineTo(to.x, to.y);
  }

  skeleton.stroke({ color: 0x4f8cff, alpha: 0.78, width: 2 });
  for (const boneId of project.hierarchy) {
    const bone = boneContainers.get(boneId);
    if (!bone) {
      continue;
    }
    const point = rigRoot.toLocal(bone.getGlobalPosition());
    skeleton.circle(point.x, point.y, boneId === project.selectedBoneId ? 5 : 3);
  }
  skeleton.fill({ color: 0xffffff, alpha: 0.9 });
  skeleton.stroke({ color: 0x1b4dcc, alpha: 0.9, width: 1 });
}
