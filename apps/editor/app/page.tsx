"use client";

import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createMoveBoneCommand,
  createRotateBoneCommand,
  createAddBoneCommand,
  createAddSvgPartCommand,
  createDeleteBoneCommand,
  createRenameBoneCommand,
  createSetBoneMetadataCommand,
  createSetBoneTransformCommand,
  createMirrorBoneBranchCommand,
  createMirrorBoneTransformCommand,
  createSetParentCommand,
  createBindProceduralPartCommand,
  createBindPartToBoneCommand,
  createEditPathPointCommand,
  createMirrorPathCommand,
  createConvertLineToCubicCommand,
  createReversePartPathCommand,
  createSetPathClosedCommand,
  createSetPartDrawOrderCommand,
  createSetPartPathCommand,
  createSetPartPivotCommand,
  createSimplifyPartPathCommand,
  createSmoothPartPathCommand,
  createAddAnimationTrackCommand,
  createApplyPoseCommand,
  createApplyPoseBlendCommand,
  createBlendPoseCommand,
  createCopyPoseCommand,
  createDuplicatePoseCommand,
  createMirrorPoseCommand,
  createPastePoseCommand,
  createPoseFromCurrentCommand,
  createPoseToKeyframesCommand,
  createRenamePoseCommand,
  createUpdatePoseTagsCommand,
  createAddKeyframeCommand,
  createDeleteKeyframeCommand,
  createMoveKeyframeCommand,
  createChangeCurveCommand,
  createApplyCurvePresetCommand,
  createApplyCurvePresetToSelectionCommand,
  createEditBezierHandlesCommand,
  createSetCurvePreviewCommand,
  createSetKeyframeTangentsCommand,
  createAddTimelineEventCommand,
  createAddTimelineMarkerCommand,
  createDeleteTimelineEventCommand,
  createAnimationClipCommand,
  createCopySelectedKeysCommand,
  createDeleteSelectedKeysCommand,
  createNormalizeLoopCommand,
  createPasteKeysCommand,
  createReverseClipCommand,
  createRetimeClipCommand,
  createScaleSelectedKeysCommand,
  createSelectTrackKeysCommand,
  createSetTimelineSelectionCommand,
  createGroupedCommand,
  createDeleteStateMachineStateCommand,
  createDeleteTransitionCommand,
  createMoveStateMachineNodeCommand,
  createSetBlendTreeCommand,
  createSetInitialStateCommand,
  createSetStateMachineParameterCommand,
  createSetStateMachinePreviewCommand,
  createSetTransitionConditionsCommand,
  createSetKeyframeAtTimeCommand,
  createRenameStateMachineStateCommand,
  createStateMachineStateCommand,
  createTransitionCommand,
  createUpdateStateMachineStateCommand,
  createUpdateTransitionCommand,
  createUpdateProceduralCommand,
  createUpdateKeyframeCommand,
  createEmptyEditorProject,
  evaluateStateMachinePreview,
  executeCommand,
  initialEditorProject,
  markAutosaveSaved,
  redo,
  undo,
  type CurvePreset,
  type BlendTree1D,
  type EditorProjectState,
  type EditorTransition,
  type EditorTransitionCondition,
  type EditorStateContainer,
  type Keyframe,
  type StateMachineNodePosition
} from "./editorState";
import { createProjectExportBundle, EDITOR_DRAFT_KEY, EDITOR_DRAFT_META_KEY, loadDraft, loadDraftMeta, parseImportedProject, saveDraft, serializeEditorProject, type DraftMetadata, type ProjectExportBundle, type ProjectImportResult } from "./projectIo";
import { PixiPreview } from "./PixiPreview";
import { inspectSvgVector, vectorizeSvgPart } from "./editorVectorImport";
import { parseLdtkLevel } from "@bones/ldtk-adapter";
import { createInitialControllerState, toAnimationParameters, updatePlatformerController } from "@bones/platformer-preview";
import type { JsonValue } from "@bones/schema";
import { evaluateRuntimeBudget, runtimePerformanceBudgets, type QualityPresetName, type RuntimeProfilerStats } from "@bones/runtime-pixi";

const modes = ["Rig", "Shape", "Pose", "Timeline", "Curve", "State Machine", "Procedural", "Preview"] as const;
const stateMachineViewBox = { x: 0, y: 0, width: 640, height: 360 } as const;
type ProjectOrigin = "sample" | "empty" | "draft" | "imported";

const sampleProject = {
  tracks: ["body.scaleY", "head.y", "upperArmFront.rotation", "thighFront.rotation", "thighBack.rotation"]
};
const defaultBoneTailLength = 42;

const previewClips = [
  { id: 0, name: "Idle" },
  { id: 1, name: "Walk" },
  { id: 2, name: "Jump" },
  { id: 3, name: "Fall" },
  { id: 4, name: "Land" }
] as const;

const previewScenarios = ["idle", "walk", "run", "jump", "fall", "land", "wallSlide", "movingPlatform"] as const;
const previewScenarioClipIds: Record<(typeof previewScenarios)[number], number> = {
  idle: 0,
  walk: 1,
  run: 1,
  jump: 2,
  fall: 3,
  land: 4,
  wallSlide: 3,
  movingPlatform: 1
};

const modeSurfaceDescriptions: Record<string, string> = {
  Rig: "Skeleton hierarchy and transforms",
  Shape: "Vector/path point editing",
  Pose: "Pose library and capture",
  Timeline: "Dopesheet keyframes",
  Curve: "Graph editor",
  "State Machine": "States, transitions, conditions",
  Procedural: "Runtime additive layers",
  Preview: "LDtk gameplay validation"
};

const sampleLdtkLevel = {
  identifier: "BonesPreviewRoom",
  layerInstances: [
    {
      __identifier: "Entities",
      entityInstances: [
        { __identifier: "Spawn", px: [0, 0], width: 16, height: 32, fieldInstances: [{ __identifier: "id", __value: "player" }] },
        { __identifier: "Collider", px: [-120, 34], width: 260, height: 16 },
        { __identifier: "WallJumpSurface", px: [96, -42], width: 12, height: 76 },
        { __identifier: "DeathZone", px: [150, 20], width: 36, height: 18 },
        { __identifier: "CameraZone", px: [-64, -96], width: 180, height: 120 },
        { __identifier: "AnimationTrigger", px: [96, -10], width: 16, height: 16, fieldInstances: [{ __identifier: "state", __value: "wallSlide" }] }
      ]
    }
  ]
} as const;

const interpolationOptions: Keyframe["interpolation"][] = ["linear", "step", "hold", "bezier", "spring"];
const curvePresetOptions: CurvePreset[] = ["linear", "step", "hold", "bezier", "spring", "anticipation", "overshoot"];

type EditorMode = (typeof modes)[number];
type ToolbarAction = {
  label: string;
  disabled?: boolean;
  variant?: "default" | "destructive";
  onClick?: () => void;
};

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <Label className="truncate text-xs text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
        <Input className="h-7 min-w-0 text-xs" readOnly title={value} value={value} />
        <Button className="h-7 px-2 text-xs" type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(value)}>
          Copy
        </Button>
      </div>
    </div>
  );
}

function parseStateMachineValue(value: string): number | boolean | string {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const number = Number(value);
  return Number.isFinite(number) && value.trim() !== "" ? number : value;
}

function parseCsvIds(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function clampPanelSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function InspectorSection({ children, title }: { children: ReactNode; title: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Card size="sm">
      <CardHeader className="p-0">
        <button
          className={`flex w-full items-center justify-between gap-2 text-left ${collapsed ? "min-h-7 px-2.5 py-1" : "px-3 py-2"}`}
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <CardTitle className={collapsed ? "text-xs" : undefined}>{title}</CardTitle>
          <span className={collapsed ? "text-[11px] leading-none text-muted-foreground" : "text-xs text-muted-foreground"} aria-hidden="true">{collapsed ? "+" : "-"}</span>
        </button>
      </CardHeader>
      {collapsed ? null : children}
    </Card>
  );
}

export default function EditorPage() {
  const [mode, setMode] = useState<EditorMode>("Rig");
  const [leftPanelWidth, setLeftPanelWidth] = useState(220);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [timelineHeight, setTimelineHeight] = useState(178);
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [previewClipId, setPreviewClipId] = useState(0);
  const [previewScenario, setPreviewScenario] = useState<(typeof previewScenarios)[number]>("idle");
  const [previewRecords, setPreviewRecords] = useState<readonly { readonly scenario: string; readonly state: string; readonly params: Readonly<Record<string, unknown>> }[]>([]);
  const [previewQuality, setPreviewQuality] = useState<QualityPresetName>("medium");
  const [profilerStats, setProfilerStats] = useState<RuntimeProfilerStats | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<{ readonly index: number; readonly point: readonly [number, number] } | null>(null);
  const [dragBone, setDragBone] = useState<{ readonly boneId: string; readonly point: readonly [number, number]; readonly handle: "head" | "tail" } | null>(null);
  const [dragTimelineKey, setDragTimelineKey] = useState<{ readonly clipId: string; readonly trackId: string; readonly keyframeId: string; readonly time: number } | null>(null);
  const [selectedPoseId, setSelectedPoseId] = useState("idle_neutral");
  const [poseBlendWeight, setPoseBlendWeight] = useState(0.5);
  const [selectedPartId, setSelectedPartId] = useState("bodyShape");
  const [newPartId, setNewPartId] = useState("testSvgShape");
  const [newPartSource, setNewPartSource] = useState("/assets/shadow-hero-silhouette/part_01_rear_head_hair.svg");
  const [newPartBoneId, setNewPartBoneId] = useState("head");
  const [newPartDrawOrder, setNewPartDrawOrder] = useState(9);
  const [vectorizeSummary, setVectorizeSummary] = useState("");
  const [newBoneId, setNewBoneId] = useState("armTest");
  const [newBoneParentId, setNewBoneParentId] = useState("body");
  const [renameBoneId, setRenameBoneId] = useState("body");
  const [newPointX, setNewPointX] = useState(12);
  const [newPointY, setNewPointY] = useState(4);
  const [mirrorSummary, setMirrorSummary] = useState("");
  const [newClipId, setNewClipId] = useState("testWalk");
  const [newClipDuration, setNewClipDuration] = useState(1);
  const [newClipLoop, setNewClipLoop] = useState(true);
  const [timelineTargetId, setTimelineTargetId] = useState("body");
  const [timelineProperty, setTimelineProperty] = useState("scaleY");
  const [timelineCurrentTime, setTimelineCurrentTime] = useState(0);
  const [timelineKeyValue, setTimelineKeyValue] = useState(1);
  const [timelineAuthorClipId, setTimelineAuthorClipId] = useState("idle");
  const [smStateId, setSmStateId] = useState("airborne");
  const [smStateClipId, setSmStateClipId] = useState("jump");
  const [smRenameStateId, setSmRenameStateId] = useState("jumpStart");
  const [smFromStateId, setSmFromStateId] = useState("idle");
  const [smToStateId, setSmToStateId] = useState("jump");
  const [smDuration, setSmDuration] = useState(0.12);
  const [smEasing, setSmEasing] = useState("anticipation");
  const [smPriority, setSmPriority] = useState(10);
  const [smCanInterrupt, setSmCanInterrupt] = useState(true);
  const [smSyncMode, setSmSyncMode] = useState("none");
  const [smConditionParameter, setSmConditionParameter] = useState("jumpPressed");
  const [smConditionOp, setSmConditionOp] = useState("==");
  const [smConditionValue, setSmConditionValue] = useState("true");
  const [smSelectedTransitionId, setSmSelectedTransitionId] = useState("any-jump");
  const [smDragNodeId, setSmDragNodeId] = useState<string | null>(null);
  const [smDraftNodePositions, setSmDraftNodePositions] = useState<Record<string, StateMachineNodePosition>>({});
  const [smConnectorStartId, setSmConnectorStartId] = useState<string | null>(null);
  const [proceduralBonesText, setProceduralBonesText] = useState("body, head");
  const [proceduralFeetText, setProceduralFeetText] = useState("footFront, footBack");
  const [squashCondition, setSquashCondition] = useState("jumpStart");
  const [squashScaleX, setSquashScaleX] = useState(0.92);
  const [squashScaleY, setSquashScaleY] = useState(1.12);
  const [squashDuration, setSquashDuration] = useState(0.08);
  const [ioStatus, setIoStatus] = useState("ready");
  const [lastCommand, setLastCommand] = useState("none");
  const [projectOrigin, setProjectOrigin] = useState<ProjectOrigin>("sample");
  const [availableDraft, setAvailableDraft] = useState<DraftMetadata | null>(null);
  const [lastExportBundle, setLastExportBundle] = useState<ProjectExportBundle | null>(null);
  const [pendingImport, setPendingImport] = useState<ProjectImportResult | null>(null);
  const [editorState, setEditorState] = useState<EditorStateContainer>({
    project: initialEditorProject,
    history: { past: [], future: [] }
  });
  const selectedBone = editorState.project.selectedBoneId;
  const selectedTransform = editorState.project.bones[selectedBone] ?? editorState.project.bones.root ?? initialEditorProject.bones.body!;
  const selectedBoneMetadata = editorState.project.boneMetadata[selectedBone] ?? {};
  const rigPoints = useMemo(() => getRigWorldPoints(editorState.project), [editorState.project]);
  const displayedRigPoints = dragBone?.handle === "head" ? { ...rigPoints, [dragBone.boneId]: dragBone.point } : rigPoints;
  const rigViewBox = useMemo(() => getShapeViewBox(Object.values(displayedRigPoints)), [displayedRigPoints]);
  const partRows = useMemo(() => Object.values(editorState.project.parts).sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0)), [editorState.project.parts]);
  const selectedPart = editorState.project.parts[selectedPartId] ?? partRows.find((part) => part.boneId === selectedBone) ?? partRows[0];
  const childBoneCount = editorState.project.hierarchy.filter((boneId) => editorState.project.parents[boneId] === selectedBone).length;
  const boundPartCount = partRows.filter((part) => part.boneId === selectedBone).length;
  const boundTrackCount = Object.values(editorState.project.animations).reduce((count, clip) => count + Object.keys(clip.tracks).filter((trackId) => trackId.startsWith(`${selectedBone}.`)).length, 0);
  const poseRefCount = Object.values(editorState.project.poses).filter((pose) => pose.boneTransforms[selectedBone]).length;
  const proceduralRefCount = countProceduralBoneRefs(editorState.project, selectedBone);
  const shapePoints = dragPoint
    ? selectedPart?.points.map((point, index) => (index === dragPoint.index ? dragPoint.point : point)) ?? []
    : selectedPart?.points ?? [];
  const shapeViewBox = useMemo(() => getShapeViewBox(shapePoints), [shapePoints]);
  const selectedPoint = selectedPointIndex === null ? undefined : selectedPart?.points[selectedPointIndex];
  const selectedCommand = selectedPointIndex === null ? undefined : selectedPart?.pathCommands?.[selectedPointIndex];
  const selectedPathClosed = selectedPart?.pathCommands?.at(-1)?.type === "Z";
  const poseIds = Object.keys(editorState.project.poses);
  const selectedPose = editorState.project.poses[selectedPoseId] ?? (poseIds[0] ? editorState.project.poses[poseIds[0]] : undefined);
  const selectedPoseIndex = Math.max(0, poseIds.indexOf(selectedPose?.id ?? ""));
  const nextPoseId = poseIds.length ? poseIds[(selectedPoseIndex + 1) % poseIds.length] : undefined;
  const nextPose = nextPoseId ? editorState.project.poses[nextPoseId] : undefined;
  const selectedPoseTagText = selectedPose?.tags.join(", ") ?? "";
  const clipIds = Object.keys(editorState.project.animations);
  const authorClip = editorState.project.animations[timelineAuthorClipId] ?? editorState.project.animations[editorState.project.timeline.selectedClipId];
  const activeClip = authorClip ?? (clipIds[0] ? editorState.project.animations[clipIds[0]] : undefined);
  const activeTrack = activeClip?.tracks["body.scaleY"] ?? [];
  const selectedKeyId = editorState.project.timeline.selectedKeyIds[0] ?? activeTrack[0]?.id ?? "";
  const timelineTrackId = `${timelineTargetId}.${timelineProperty}`;
  const selectedTimelineTrackId = activeClip ? Object.entries(activeClip.tracks).find(([, keys]) => keys.some((key) => key.id === selectedKeyId))?.[0] ?? timelineTrackId : timelineTrackId;
  const selectedTimelineKey = activeClip ? activeClip.tracks[selectedTimelineTrackId]?.find((key) => key.id === selectedKeyId) : undefined;
  const selectedCurve = selectedTimelineKey?.curve ?? [0, 0, 1, 1] as const;
  const curvePath = `M 12 88 C ${12 + selectedCurve[0] * 96} ${88 - selectedCurve[1] * 72}, ${12 + selectedCurve[2] * 96} ${88 - selectedCurve[3] * 72}, 108 16`;
  const selectedKeyCurvePreset = selectedTimelineKey?.curvePreset ?? (selectedTimelineKey?.interpolation === "bezier" ? "bezier" : selectedTimelineKey?.interpolation ?? "linear");
  const curveSamples = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const t = index / 6;
      return { frame: Math.round(t * 60), value: sampleCubicBezierY(t, selectedCurve) };
    }),
    [selectedCurve]
  );
  const timelineTracks = Array.from(new Set([...(activeClip ? Object.keys(activeClip.tracks) : []), ...sampleProject.tracks]));
  const emptyTimelineTracks = activeClip ? Object.entries(activeClip.tracks).filter(([, keys]) => keys.length === 0).map(([trackId]) => trackId) : [];
  const visibleTimelineTracks = timelineTracks.slice(editorState.project.timeline.virtualWindow.startRow, editorState.project.timeline.virtualWindow.startRow + editorState.project.timeline.virtualWindow.rowCount);
  const stateIds = editorState.project.stateMachine.states.map((state) => state.id);
  const parameterIds = Object.keys(editorState.project.stateMachine.parameters);
  const numericParameterIds = parameterIds.filter((parameterId) => typeof editorState.project.stateMachine.parameters[parameterId] === "number");
  const smTransitionId = `${smFromStateId}-${smToStateId}`;
  const selectedTransition = editorState.project.stateMachine.transitions.find((transition) => transition.id === smSelectedTransitionId) ?? editorState.project.stateMachine.transitions[0];
  const selectedStateNode = editorState.project.stateMachine.states.find((state) => state.id === smFromStateId);
  const selectedBlendTree = selectedStateNode?.blendTree ?? { type: "1d", parameter: numericParameterIds.includes("absSpeed") ? "absSpeed" : numericParameterIds[0] ?? "absSpeed", children: [{ threshold: 0, clipId: selectedStateNode?.clipId || clipIds[0] || "" }] } satisfies BlendTree1D;
  const blendTreeParameterValue = Number(editorState.project.stateMachine.parameters[selectedBlendTree.parameter] ?? 0);
  const selectedBlendWeights = useMemo(() => sampleBlendTreeWeights(selectedBlendTree, blendTreeParameterValue), [blendTreeParameterValue, selectedBlendTree]);
  const stateMachineSimulation = useMemo(() => evaluateStateMachinePreview(editorState.project.stateMachine), [editorState.project.stateMachine]);
  const stateMachineGraph = useMemo(() => {
    const states = editorState.project.stateMachine.states;
    const centerX = 320;
    const centerY = 180;
    const radiusX = 220;
    const radiusY = 112;
    const nodePositions = { ...(editorState.project.stateMachine.nodePositions ?? {}), ...smDraftNodePositions };
    const nodes = states.map((state, index) => {
      const angle = states.length > 1 ? (Math.PI * 2 * index) / states.length - Math.PI / 2 : -Math.PI / 2;
      const position = nodePositions[state.id];
      return {
        state,
        x: position?.x ?? centerX + Math.cos(angle) * radiusX,
        y: position?.y ?? centerY + Math.sin(angle) * radiusY
      };
    });
    const byId = new Map(nodes.map((node) => [node.state.id, node]));
    const transitions = editorState.project.stateMachine.transitions.flatMap((transition) => {
      const from = byId.get(transition.fromStateId);
      const to = byId.get(transition.toStateId);
      return from && to ? [{ transition, from, to }] : [];
    });
    return { nodes, transitions };
  }, [editorState.project.stateMachine.nodePositions, editorState.project.stateMachine.states, editorState.project.stateMachine.transitions, smDraftNodePositions]);
  const exportFileEntries = useMemo(() => Object.entries(lastExportBundle?.files ?? {}), [lastExportBundle]);
  const profilerBudget = useMemo(
    () => (profilerStats ? evaluateRuntimeBudget(profilerStats, runtimePerformanceBudgets[previewQuality].hero1) : null),
    [previewQuality, profilerStats]
  );
  const previewLevel = useMemo(() => parseLdtkLevel(sampleLdtkLevel), []);
  const platformerDebug = useMemo(() => {
    const state =
      previewScenario === "walk"
        ? updatePlatformerController(createInitialControllerState(0, 0), { moveX: 1, jumpPressed: false }, 0.2, previewLevel)
        : previewScenario === "run"
          ? updatePlatformerController(createInitialControllerState(0, 0), { moveX: 1.8, jumpPressed: false }, 0.35, previewLevel)
        : previewScenario === "jump"
          ? updatePlatformerController(createInitialControllerState(0, 0), { moveX: 0, jumpPressed: true }, 0.016, previewLevel)
          : previewScenario === "fall"
            ? updatePlatformerController({ ...createInitialControllerState(0, -48), grounded: false, wasGrounded: false, velocityY: 96 }, { moveX: 0, jumpPressed: false }, 0.016, previewLevel)
            : previewScenario === "land"
              ? updatePlatformerController({ ...createInitialControllerState(0, 10), grounded: false, wasGrounded: false, velocityY: 180 }, { moveX: 0, jumpPressed: false }, 0.05, previewLevel)
              : previewScenario === "wallSlide"
                ? updatePlatformerController({ ...createInitialControllerState(-96, -32), grounded: false, wallContact: "left", velocityY: 46 }, { moveX: -1, jumpPressed: false }, 0.12, previewLevel)
                : previewScenario === "movingPlatform"
                  ? updatePlatformerController({ ...createInitialControllerState(36, 0), velocityX: 32, grounded: true }, { moveX: 0.5, jumpPressed: false }, 0.25, previewLevel)
              : updatePlatformerController(createInitialControllerState(0, 0), { moveX: 0, jumpPressed: false }, 0.016, previewLevel);
    return { state, params: toAnimationParameters(state) };
  }, [previewLevel, previewScenario]);
  const previewStateMachineSimulation = useMemo(
    () => evaluateStateMachinePreview({ ...editorState.project.stateMachine, parameters: { ...editorState.project.stateMachine.parameters, ...platformerDebug.params } }),
    [editorState.project.stateMachine, platformerDebug.params]
  );
  const previewEvents = activeClip?.events ?? [];
  const addTimelineEventPreset = (type: string, category: "gameplay" | "audio" | "vfx" | "camera" | "debug", payload?: Readonly<Record<string, JsonValue>>, duration?: number) => {
    if (!activeClip) {
      return;
    }
    const eventTime = clampPanelSize(timelineCurrentTime, 0, activeClip.duration);
    runCommand(
      createAddTimelineEventCommand(activeClip.id, {
        id: `${activeClip.id}-${type}-${activeClip.events.length}`,
        time: eventTime,
        type,
        category,
        ...(duration !== undefined ? { duration: Math.min(duration, Math.max(0, activeClip.duration - eventTime)) } : {}),
        ...(payload ? { payload } : {})
      })
    );
  };
  const runCommand = (command: Parameters<typeof executeCommand>[1]) => {
    setLastCommand(command.label);
    setEditorState((state) => executeCommand(state, command));
  };
  const commitStateNodePosition = (stateId: string, position: StateMachineNodePosition) => {
    setSmDraftNodePositions((positions) => {
      const next = { ...positions };
      delete next[stateId];
      return next;
    });
    setSmDragNodeId(null);
    runCommand(createMoveStateMachineNodeCommand(stateId, position));
  };
  const createTransitionFromConnector = (fromStateId: string, toStateId: string) => {
    if (fromStateId === toStateId) {
      setSmConnectorStartId(null);
      return;
    }
    const transition: EditorTransition = {
      id: `${fromStateId}-${toStateId}`,
      fromStateId,
      toStateId,
      duration: smDuration,
      easing: smEasing as EditorTransition["easing"],
      priority: smPriority,
      canInterrupt: smCanInterrupt,
      syncMode: smSyncMode as EditorTransition["syncMode"],
      interruptWindow: [0, Math.max(0.01, smDuration)],
      conditions: [{ parameter: smConditionParameter, op: smConditionOp as EditorTransitionCondition["op"], value: parseStateMachineValue(smConditionValue) }]
    };
    setSmFromStateId(fromStateId);
    setSmToStateId(toStateId);
    setSmSelectedTransitionId(transition.id);
    setSmConnectorStartId(null);
    runCommand(createTransitionCommand(transition));
  };
  const applyBlendTree = (blendTree: BlendTree1D) => {
    if (!selectedStateNode) {
      return;
    }
    runCommand(createSetBlendTreeCommand(selectedStateNode.id, blendTree));
  };
  const updateBlendTreeChild = (index: number, patch: Partial<BlendTree1D["children"][number]>) => {
    applyBlendTree({ ...selectedBlendTree, children: selectedBlendTree.children.map((child, childIndex) => (childIndex === index ? { ...child, ...patch } : child)) });
  };
  const moveBlendTreeChild = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedBlendTree.children.length) {
      return;
    }
    const children = [...selectedBlendTree.children];
    const [child] = children.splice(index, 1);
    if (!child) {
      return;
    }
    children.splice(nextIndex, 0, child);
    applyBlendTree({ ...selectedBlendTree, children });
  };
  const timelineTimeFromLane = (lane: HTMLElement, clientX: number, duration: number) => {
    const rect = lane.getBoundingClientRect();
    const ratio = clampPanelSize((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return Number((ratio * Math.max(0, duration)).toFixed(3));
  };
  const startTimelineKeyDrag = (event: ReactMouseEvent<HTMLButtonElement>, clipId: string, trackId: string, keyframeId: string, time: number, duration: number) => {
    const lane = event.currentTarget.parentElement;
    if (!lane) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const selectedIds = editorState.project.timeline.selectedClipId === clipId ? editorState.project.timeline.selectedKeyIds : [];
    if (event.shiftKey) {
      const nextSelection = selectedIds.includes(keyframeId) ? selectedIds.filter((id) => id !== keyframeId) : [...selectedIds, keyframeId];
      runCommand(createSetTimelineSelectionCommand(clipId, nextSelection));
      return;
    }
    if (!selectedIds.includes(keyframeId)) {
      runCommand(createSetTimelineSelectionCommand(clipId, [keyframeId]));
    }
    setDragTimelineKey({ clipId, trackId, keyframeId, time });
    setTimelineCurrentTime(time);

    const onMove = (moveEvent: MouseEvent) => {
      const nextTime = timelineTimeFromLane(lane, moveEvent.clientX, duration);
      setTimelineCurrentTime(nextTime);
      setDragTimelineKey((current) => current?.clipId === clipId && current.trackId === trackId && current.keyframeId === keyframeId ? { ...current, time: nextTime } : current);
    };
    const onEnd = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      const nextTime = timelineTimeFromLane(lane, upEvent.clientX, duration);
      setTimelineCurrentTime(nextTime);
      runCommand(createMoveKeyframeCommand(clipId, trackId, keyframeId, nextTime));
      setDragTimelineKey(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
  };
  const commitBoneDrag = (boneId: string, point: readonly [number, number]) => {
    const parentId = editorState.project.parents[boneId];
    const parentPoint = parentId ? rigPoints[parentId] : [0, 0];
    const current = editorState.project.bones[boneId] ?? selectedTransform;
    const nextTransform = {
      ...current,
      x: point[0] - (parentPoint?.[0] ?? 0),
      y: point[1] - (parentPoint?.[1] ?? 0)
    };
    const keyTime = activeClip ? clampPanelSize(timelineCurrentTime, 0, activeClip.duration) : timelineCurrentTime;
    const commands = [createSetBoneTransformCommand(boneId, nextTransform)];
    if (activeClip && editorState.project.timeline.autoKey) {
      commands.push(
        createSetKeyframeAtTimeCommand(activeClip.id, `${boneId}.x`, keyTime, nextTransform.x),
        createSetKeyframeAtTimeCommand(activeClip.id, `${boneId}.y`, keyTime, nextTransform.y)
      );
      setTimelineCurrentTime(keyTime);
    }
    setTimelineTargetId(boneId);
    setTimelineProperty("x");
    runCommand(createGroupedCommand(activeClip && editorState.project.timeline.autoKey ? "Move bone at time" : "Move bone", commands));
  };
  const startBoneDrag = (event: ReactMouseEvent<SVGCircleElement>, boneId: string, point: readonly [number, number]) => {
    if (editorState.project.boneMetadata[boneId]?.locked) {
      return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setEditorState((state) => ({ ...state, project: { ...state.project, selectedBoneId: boneId } }));
    setDragBone({ boneId, point, handle: "head" });

    const onMove = (moveEvent: MouseEvent) => {
      setDragBone({ boneId, point: svgPointFromClient(svg, moveEvent.clientX, moveEvent.clientY, rigViewBox), handle: "head" });
    };
    const onEnd = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      const nextPoint = svgPointFromClient(svg, upEvent.clientX, upEvent.clientY, rigViewBox);
      commitBoneDrag(boneId, nextPoint);
      setDragBone(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
  };
  const commitBoneTailDrag = (boneId: string, point: readonly [number, number]) => {
    const head = rigPoints[boneId];
    const current = editorState.project.bones[boneId] ?? selectedTransform;
    if (!head) {
      return;
    }
    const dx = point[0] - head[0];
    const dy = point[1] - head[1];
    const nextTransform = {
      ...current,
      rotation: Number(Math.atan2(dy, dx).toFixed(4)),
      scaleY: Number(clampPanelSize(Math.hypot(dx, dy) / defaultBoneTailLength, 0.15, 4).toFixed(4))
    };
    const keyTime = activeClip ? clampPanelSize(timelineCurrentTime, 0, activeClip.duration) : timelineCurrentTime;
    const commands = [createSetBoneTransformCommand(boneId, nextTransform)];
    if (activeClip && editorState.project.timeline.autoKey) {
      commands.push(
        createSetKeyframeAtTimeCommand(activeClip.id, `${boneId}.rotation`, keyTime, nextTransform.rotation),
        createSetKeyframeAtTimeCommand(activeClip.id, `${boneId}.scaleY`, keyTime, nextTransform.scaleY)
      );
      setTimelineCurrentTime(keyTime);
    }
    setTimelineTargetId(boneId);
    setTimelineProperty("rotation");
    runCommand(createGroupedCommand(activeClip && editorState.project.timeline.autoKey ? "Rotate bone at time" : "Rotate bone", commands));
  };
  const startBoneTailDrag = (event: ReactMouseEvent<SVGCircleElement>, boneId: string, point: readonly [number, number]) => {
    if (editorState.project.boneMetadata[boneId]?.locked) {
      return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setEditorState((state) => ({ ...state, project: { ...state.project, selectedBoneId: boneId } }));
    setDragBone({ boneId, point, handle: "tail" });

    const onMove = (moveEvent: MouseEvent) => {
      setDragBone({ boneId, point: svgPointFromClient(svg, moveEvent.clientX, moveEvent.clientY, rigViewBox), handle: "tail" });
    };
    const onEnd = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      const nextPoint = svgPointFromClient(svg, upEvent.clientX, upEvent.clientY, rigViewBox);
      commitBoneTailDrag(boneId, nextPoint);
      setDragBone(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
  };
  const startPanelResize = (panel: "left" | "right" | "timeline", event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = leftPanelWidth;
    const startRight = rightPanelWidth;
    const startTimeline = timelineHeight;
    const onResizeMove = (moveEvent: PointerEvent | MouseEvent) => {
      if (panel === "left") {
        setLeftPanelWidth(clampPanelSize(startLeft + moveEvent.clientX - startX, 180, 360));
      } else if (panel === "right") {
        setRightPanelWidth(clampPanelSize(startRight - (moveEvent.clientX - startX), 340, 560));
      } else {
        setTimelineHeight(clampPanelSize(startTimeline - (moveEvent.clientY - startY), 136, 280));
      }
    };
    const onResizeEnd = () => {
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeEnd);
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeEnd);
    };
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeEnd);
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  };
  useEffect(() => {
    setRenameBoneId(selectedBone);
    setNewBoneParentId(selectedBone);
  }, [selectedBone]);
  useEffect(() => {
    setAvailableDraft(loadDraftMeta());
  }, []);
  const replaceProject = (project: EditorProjectState, origin: ProjectOrigin, poseId = "") => {
    setEditorState({ project, history: { past: [], future: [] } });
    setProjectOrigin(origin);
    setSelectedPoseId(poseId);
    setSelectedPartId(Object.keys(project.parts)[0] ?? "");
    setSelectedPointIndex(null);
    setDragPoint(null);
    setDragBone(null);
    setDragTimelineKey(null);
  };
  const loadDraftProject = () => {
    const draft = loadDraft();
    if (!draft) {
      setAvailableDraft(null);
      setIoStatus("no draft found");
      return;
    }
    replaceProject(draft, "draft", Object.keys(draft.poses)[0] ?? "");
    setAvailableDraft(loadDraftMeta());
    setIoStatus("draft loaded");
  };
  const resetToSampleProject = () => {
    window.localStorage.removeItem(EDITOR_DRAFT_KEY);
    window.localStorage.removeItem(EDITOR_DRAFT_META_KEY);
    setAvailableDraft(null);
    replaceProject(structuredClone(initialEditorProject), "sample", "idle_neutral");
    setIoStatus("sample loaded; draft cleared");
  };
  const startEmptyProject = () => {
    replaceProject(createEmptyEditorProject(), "empty");
    setIoStatus("new empty project");
  };
  const exportBundle = async () => {
    const bundle = await createProjectExportBundle(editorState.project);
    setLastExportBundle(bundle);
    if (!bundle.validation.ok) {
      setIoStatus(bundle.validation.errors.join("; "));
      return;
    }
    const json = JSON.stringify(bundle.files, null, 2);
    try {
      await navigator.clipboard?.writeText(json);
      setIoStatus(`copied ${json.length} bytes / ${Object.keys(bundle.files).length} files`);
    } catch {
      setIoStatus(`export ready (${Object.keys(bundle.files).length} files); clipboard permission denied`);
    }
  };
  const copyExportFiles = async () => {
    if (!lastExportBundle?.validation.ok) {
      setIoStatus("run Export Bundle first");
      return;
    }
    const json = JSON.stringify(lastExportBundle.files, null, 2);
    try {
      await navigator.clipboard?.writeText(json);
      setIoStatus(`copied ${json.length} bytes / ${Object.keys(lastExportBundle.files).length} files`);
    } catch {
      setIoStatus(`export ready (${Object.keys(lastExportBundle.files).length} files); clipboard permission denied`);
    }
  };
  const copyExportFile = async (fileName: string) => {
    const contents = lastExportBundle?.files[fileName];
    if (!contents) {
      setIoStatus(`missing ${fileName}`);
      return;
    }
    try {
      await navigator.clipboard?.writeText(contents);
      setIoStatus(`copied ${fileName} (${contents.length} bytes)`);
    } catch {
      setIoStatus(`${fileName} ready; clipboard permission denied`);
    }
  };
  const downloadExportFile = (fileName: string) => {
    const contents = lastExportBundle?.files[fileName];
    if (!contents) {
      setIoStatus(`missing ${fileName}`);
      return;
    }
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setIoStatus(`downloaded ${fileName}`);
  };
  const copySourceJson = async () => {
    try {
      const json = serializeEditorProject(editorState.project);
      try {
        await navigator.clipboard?.writeText(json);
        setIoStatus(`copied source JSON (${json.length} bytes)`);
      } catch {
        setIoStatus(`source JSON ready (${json.length} bytes); clipboard permission denied`);
      }
    } catch (error) {
      setIoStatus(error instanceof Error ? error.message : "source JSON validation error");
    }
  };
  const importFromClipboard = async () => {
    const text = await navigator.clipboard?.readText();
    const result = parseImportedProject(text ?? "");
    setPendingImport(result);
    setIoStatus(result.errors.length ? result.errors.join("; ") : editorState.project.dirty ? "import preview ready; confirm required" : "import preview ready");
  };
  const confirmImport = () => {
    if (!pendingImport?.project) {
      return;
    }
    replaceProject(pendingImport.project, "imported", Object.keys(pendingImport.project.poses)[0] ?? "");
    setIoStatus(`imported ${pendingImport.kind ?? "project"}`);
    setPendingImport(null);
  };
  useEffect(() => {
    const autosave = editorState.project.autosave;
    if (autosave.status !== "pending") {
      return;
    }
    const revision = autosave.revision;
    const handle = window.setTimeout(() => {
      saveDraft(editorState.project);
      setEditorState((state) => (state.project.autosave.revision === revision ? { ...state, project: markAutosaveSaved(state.project) } : state));
    }, Math.max(0, autosave.nextSaveAt - Date.now()));
    return () => window.clearTimeout(handle);
  }, [editorState.project, editorState.project.autosave]);
  const vectorizeSelectedPart = async () => {
    if (!selectedPart) {
      setIoStatus("select an SVG part first");
      return;
    }
    try {
      const imported = selectedPart.assetPath ? await inspectSvgVector(selectedPart.assetPath) : { pathCount: 0 };
      const vectorPart = await vectorizeSvgPart(selectedPart);
      runCommand(createSetPartPathCommand(vectorPart.id, vectorPart.points, vectorPart.pathCommands, vectorPart.svgViewBox));
      const viewBox = vectorPart.svgViewBox ? vectorPart.svgViewBox.join(", ") : "none";
      setVectorizeSummary(`${imported.pathCount} paths / ${vectorPart.pathCommands?.length ?? 0} commands / ${vectorPart.points.length} points / viewBox ${viewBox}`);
      setIoStatus("vectorized SVG part; importer merged SVG paths");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown vectorize error";
      setVectorizeSummary(message);
      setIoStatus(message);
    }
  };
  const addSvgPart = () => {
    const id = newPartId.trim();
    const assetPath = newPartSource.trim();
    if (!id || !assetPath || !editorState.project.bones[newPartBoneId]) {
      setIoStatus("part id, source, and bone are required");
      return;
    }
    runCommand(createAddSvgPartCommand({ id, boneId: newPartBoneId, type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath, zIndex: newPartDrawOrder }));
    setSelectedPartId(id);
    setIoStatus(`added SVG part ${id}`);
  };
  const updateSelectedTransform = (next: Partial<typeof selectedTransform>) => {
    runCommand(createSetBoneTransformCommand(selectedBone, { ...selectedTransform, ...next }));
  };
  const toolbarGroups: { label: string; actions: ToolbarAction[] }[] = [
    {
      label: "History",
      actions: [
        { label: "Undo", disabled: !editorState.history.past.length, onClick: () => setEditorState(undo) },
        { label: "Redo", disabled: !editorState.history.future.length, onClick: () => setEditorState(redo) }
      ]
    },
    {
      label: "Rig",
      actions: [
        { label: "Move", onClick: () => runCommand(createMoveBoneCommand(selectedBone, 2, 0)) },
        { label: "Rotate", onClick: () => runCommand(createRotateBoneCommand(selectedBone, 0.1)) },
        { label: "Add Bone", onClick: () => runCommand(createAddBoneCommand(selectedBone, `bone${editorState.project.hierarchy.length}`)) },
        { label: "Rename", onClick: () => runCommand(createRenameBoneCommand(selectedBone, `${selectedBone}Renamed`)) },
        { label: "Delete", disabled: selectedBone === "root", variant: "destructive", onClick: () => runCommand(createDeleteBoneCommand(selectedBone)) }
      ]
    },
    {
      label: "Shape",
      actions: [
        { label: "Vectorize", disabled: selectedPart?.type !== "svg", onClick: () => void vectorizeSelectedPart() },
        { label: "Bind", onClick: () => runCommand(createBindProceduralPartCommand(`${selectedBone}Shape`, selectedBone, "tapered-limb")) },
        { label: "Pen", disabled: !selectedPart, onClick: () => selectedPart && runCommand(createEditPathPointCommand(selectedPart.id, selectedPart.points.length, [newPointX, newPointY])) },
        { label: "Mirror", disabled: !selectedPart, onClick: () => { if (selectedPart) { runCommand(createMirrorPathCommand(selectedPart.id)); setMirrorSummary(`mirrored ${selectedPart.points.length} points`); } } },
        { label: "Pivot", disabled: !selectedPart, onClick: () => selectedPart && runCommand(createSetPartPivotCommand(selectedPart.id, [4, 0])) }
      ]
    },
    {
      label: "Animate",
      actions: [
        { label: "Apply Pose", disabled: !selectedPose, onClick: () => selectedPose && runCommand(createApplyPoseCommand(selectedPose.id)) },
        { label: "Duplicate Pose", disabled: !selectedPose, onClick: () => selectedPose && runCommand(createDuplicatePoseCommand(selectedPose.id, `${selectedPose.id}_copy`)) },
        { label: "Mirror Pose", disabled: !selectedPose, onClick: () => selectedPose && runCommand(createMirrorPoseCommand(selectedPose.id, `${selectedPose.id}_mirror`)) },
        { label: "Add Key", disabled: !activeClip, onClick: () => activeClip && runCommand(createAddKeyframeCommand(activeClip.id, "body.scaleY", { id: `key${activeTrack.length}`, time: 0.6, value: 1.025, interpolation: "bezier" })) },
        { label: "Move Key", disabled: !activeClip || !activeTrack.length, onClick: () => activeClip && runCommand(createMoveKeyframeCommand(activeClip.id, "body.scaleY", activeTrack[0]?.id ?? "", 0.12)) },
        { label: "Delete Key", disabled: !activeClip || !activeTrack.length, variant: "destructive", onClick: () => activeClip && runCommand(createDeleteKeyframeCommand(activeClip.id, "body.scaleY", activeTrack[0]?.id ?? "")) },
        { label: "Curve", disabled: !activeClip || !activeTrack.length, onClick: () => activeClip && runCommand(createChangeCurveCommand(activeClip.id, "body.scaleY", activeTrack[0]?.id ?? "", "bezier", [0.2, 0.8, 0.2, 1])) },
        { label: "Transition", onClick: () => runCommand(createTransitionCommand({ id: "walk-jump", fromStateId: "walk", toStateId: "jump", duration: 0.12, easing: "anticipation", priority: 10, canInterrupt: true, syncMode: "none", conditions: [{ parameter: "jumpPressed", op: "==", value: true }] })) }
      ]
    },
    {
      label: "Procedural",
      actions: [
        { label: "Breathing", onClick: () => runCommand(createUpdateProceduralCommand({ breathing: { ...editorState.project.procedural.breathing, enabled: true, frequency: 1, amplitude: 1.2, affectedBones: ["body", "head", "upperArmFront", "upperArmBack"] } })) },
        { label: "Foot IK", onClick: () => runCommand(createUpdateProceduralCommand({ footIk: { ...editorState.project.procedural.footIk, enabled: true, feet: ["footFront", "footBack"], maxCorrection: 8, blend: 0.75 } })) }
      ]
    },
    {
      label: "Project",
      actions: [
        { label: "New Project", onClick: startEmptyProject },
        { label: "Load Sample", onClick: resetToSampleProject },
        { label: "Reset Draft", onClick: resetToSampleProject },
        { label: "Save Draft", onClick: () => { saveDraft(editorState.project); setAvailableDraft(loadDraftMeta()); setProjectOrigin("draft"); setIoStatus("draft saved"); } },
        { label: "Load", onClick: loadDraftProject },
        { label: "Copy Source JSON", onClick: () => void copySourceJson() },
        { label: "Export Bundle", onClick: () => void exportBundle() },
        { label: "Import Clipboard", onClick: () => void importFromClipboard() }
      ]
    }
  ];
  const activeToolbarActions = (
    mode === "Rig" || mode === "Shape"
      ? toolbarGroups.find((group) => group.label === "Rig / Shape")?.actions
      : mode === "Procedural"
        ? toolbarGroups.find((group) => group.label === "Procedural")?.actions
        : mode === "Timeline" || mode === "Curve" || mode === "State Machine" || mode === "Pose"
          ? toolbarGroups.find((group) => group.label === "Animate")?.actions
          : toolbarGroups.find((group) => group.label === "Project")?.actions
  )?.slice(0, 4) ?? [];
  const inspectorRows = useMemo<Array<[string, string]>>(
    () => [
      ["Mode", mode],
      ["Selection", selectedBone],
      ["Parent", editorState.project.parents[selectedBone] ?? "none"],
      ["X", String(selectedTransform.x)],
      ["Y", String(selectedTransform.y)],
      ["Rotation", selectedTransform.rotation.toFixed(2)],
      ["Scale", `${selectedTransform.scaleX}, ${selectedTransform.scaleY}`],
      ["Origin", projectOrigin],
      ["IO", ioStatus],
      ["Last command", lastCommand],
      ["Validation", lastExportBundle ? (lastExportBundle.validation.ok ? "ok" : lastExportBundle.validation.errors.join(", ")) : "not run"],
      ["Autosave", `${editorState.project.autosave.status} r${editorState.project.autosave.revision}`],
      ["Dirty", editorState.project.dirty ? editorState.project.dirtyParts.join(", ") : "clean"]
    ],
    [editorState.project.autosave.revision, editorState.project.autosave.status, editorState.project.dirty, editorState.project.dirtyParts, ioStatus, lastCommand, lastExportBundle, mode, projectOrigin, selectedBone, selectedTransform]
  );
  const showDraftBanner = availableDraft !== null && projectOrigin !== "draft";

  return (
    <main
      className="grid h-dvh w-screen min-w-0 overflow-hidden bg-background text-foreground"
      style={{ gridTemplateRows: `${showDraftBanner ? 118 : 84}px minmax(0,1fr) ${timelineHeight}px` }}
      aria-label="Bones editor shell"
    >
      <header className="relative z-10 grid min-w-0 grid-rows-[44px_40px_auto] border-b bg-card px-2.5">
        <div className="grid min-w-0 grid-cols-[142px_minmax(0,1fr)_max-content] items-center gap-2.5">
          <div className="grid min-w-0 gap-0.5">
            <strong className="truncate text-sm">Bones</strong>
            <span className="truncate text-xs text-muted-foreground">{editorState.project.name}</span>
          </div>
          <ToggleGroup
            className="min-w-0 overflow-hidden"
            type="single"
            value={mode}
            variant="outline"
            size="sm"
            spacing={1}
            aria-label="Editor modes"
            onValueChange={(nextMode) => {
              if (nextMode) {
                setMode(nextMode as EditorMode);
              }
            }}
          >
            {modes.map((item) => (
              <ToggleGroupItem className="shrink min-w-0 px-2 text-xs" key={item} value={item} aria-label={item}>
                <span className="truncate">{item}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant={previewPlaying ? "default" : "outline"} type="button" onClick={() => setPreviewPlaying(true)}>
              Play
            </Button>
            <Button size="sm" variant={!previewPlaying ? "default" : "outline"} type="button" onClick={() => setPreviewPlaying(false)}>
              Pause
            </Button>
            <Select value={String(previewClipId)} onValueChange={(value) => setPreviewClipId(Number(value))}>
              <SelectTrigger className="w-28" size="sm" aria-label="Preview animation clip">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {previewClips.map((clip) => (
                    <SelectItem key={clip.id} value={String(clip.id)}>
                      {clip.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={previewQuality} onValueChange={(value) => setPreviewQuality(value as QualityPresetName)}>
              <SelectTrigger className="w-24" size="sm" aria-label="Preview quality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" type="button" onClick={() => void exportBundle()}>
              Export
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-visible">
          <div className="flex min-w-0 items-center gap-1 overflow-hidden" aria-label="Active mode actions">
            {activeToolbarActions.map((action) => (
              <Button className="min-w-0 shrink px-2 text-xs" disabled={action.disabled ?? false} key={action.label} size="sm" type="button" variant={action.variant ?? "outline"} onClick={action.onClick}>
                <span className="truncate">{action.label}</span>
              </Button>
            ))}
          </div>
          <Separator className="h-5" orientation="vertical" />
          {toolbarGroups.map((group) => (
            <DropdownMenu key={group.label}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" type="button">
                  {group.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-40">
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {group.actions.map((action) => (
                    <DropdownMenuItem
                      disabled={action.disabled ?? false}
                      key={action.label}
                      variant={action.variant ?? "default"}
                      onSelect={(event) => {
                        event.preventDefault();
                        action.onClick?.();
                      }}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </div>
        {showDraftBanner ? (
          <div className="flex min-w-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800" role="status" aria-label="Local draft available">
            <span className="min-w-0 flex-1 truncate">
              Draft available: {availableDraft.name} / {availableDraft.bones} bones / {availableDraft.parts} parts / {availableDraft.animations} clips
            </span>
            <Button className="h-6 px-2 text-xs" size="sm" type="button" variant="outline" onClick={loadDraftProject}>
              Continue Draft
            </Button>
            <Button className="h-6 px-2 text-xs" size="sm" type="button" variant="outline" onClick={resetToSampleProject}>
              Reset to Sample
            </Button>
            <Button className="h-6 px-2 text-xs" size="sm" type="button" variant="outline" onClick={startEmptyProject}>
              New Empty
            </Button>
          </div>
        ) : null}
      </header>

      <section
        className="grid min-h-0 min-w-0"
        style={{ gridTemplateColumns: `${leftPanelWidth}px minmax(360px,1fr) ${rightPanelWidth}px` }}
        aria-label="Editor workspace"
      >
        <Card className="relative z-20 min-h-0 rounded-none border-0 border-r py-3 ring-0">
          <div
            className="absolute right-0 top-0 z-30 h-full w-2 touch-none cursor-col-resize bg-transparent hover:bg-primary/30"
            role="separator"
            aria-label="Resize hierarchy panel"
            aria-orientation="vertical"
            onPointerDown={(event) => startPanelResize("left", event)}
            onMouseDown={(event) => startPanelResize("left", event)}
          />
          <CardHeader className="px-3">
            <CardTitle className="text-sm">Hierarchy</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 px-2">
            <ScrollArea className="h-full">
              <ol className="flex flex-col gap-1">
                {editorState.project.hierarchy.map((item, index) => {
                  const depth = item === "root" ? 0 : index > 2 ? 2 : 1;

                  return (
                    <li key={item}>
                      <Button
                        className="h-7 w-full justify-start text-xs"
                        style={{ paddingLeft: `${8 + depth * 12}px` }}
                        type="button"
                        variant={item === selectedBone ? "secondary" : "ghost"}
                        onClick={() => setEditorState((state) => ({ ...state, project: { ...state.project, selectedBoneId: item } }))}
                      >
                        <span className="truncate">{item}</span>
                      </Button>
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="min-h-0 min-w-0 rounded-none border-0 py-0 ring-0">
          <CardHeader className="flex h-[30px] flex-row items-center justify-between border-b px-3 py-0">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant="secondary">{mode}</Badge>
              <span className="truncate text-xs text-muted-foreground">{modeSurfaceDescriptions[mode]}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{previewClips.find((clip) => clip.id === previewClipId)?.name}</span>
              <Separator className="h-4" orientation="vertical" />
              <span>{previewPlaying ? "Playing" : "Paused"}</span>
            </div>
          </CardHeader>
          <CardContent className="relative min-h-0 flex-1 overflow-hidden bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:24px_24px] p-0" aria-label="PixiJS canvas viewport">
            <PixiPreview clipId={previewClipId} playing={previewPlaying} project={editorState.project} quality={previewQuality} showSkeleton={mode !== "Preview" && mode !== "Rig"} onProfilerStats={setProfilerStats} />
            {mode === "Preview" ? (
              <div className="absolute inset-0 z-20 pointer-events-none">
                <div className="pointer-events-auto absolute left-3 top-3 grid w-[min(560px,calc(100%-24px))] gap-2 rounded-md border bg-card/95 p-3 shadow-sm" aria-label="Gameplay preview overlay">
                  <div className="flex flex-wrap items-center gap-1">
                    {previewScenarios.map((scenario, index) => (
                      <Button
                        key={scenario}
                        size="sm"
                        type="button"
                        variant={previewScenario === scenario ? "default" : "outline"}
                        onClick={() => {
                          setPreviewScenario(scenario);
                          setPreviewClipId(previewScenarioClipIds[scenario]);
                        }}
                      >
                        {scenario}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setPreviewRecords((records) => [
                          ...records,
                          { scenario: previewScenario, state: platformerDebug.state.animationState, params: { ...platformerDebug.params } }
                        ])
                      }
                    >
                      Record
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      disabled={!previewRecords.length}
                      onClick={() => {
                        const record = previewRecords[0];
                        if (!record || !previewScenarios.includes(record.scenario as (typeof previewScenarios)[number])) {
                          return;
                        }
                        setPreviewScenario(record.scenario as (typeof previewScenarios)[number]);
                        setPreviewClipId(previewScenarioClipIds[record.scenario as (typeof previewScenarios)[number]]);
                        setPreviewRecords((records) => [...records.slice(1), record]);
                      }}
                    >
                      Replay
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="font-medium">State {platformerDebug.state.animationState}</p>
                      <p className="text-muted-foreground">Clip {previewClips[previewClipId]?.name ?? "Unknown"} / transition {previewStateMachineSimulation.transitionId ?? "none"} {previewStateMachineSimulation.transitionWeight.toFixed(2)}</p>
                      <p className="text-muted-foreground">Params absSpeed {platformerDebug.params.absSpeed} velocityY {platformerDebug.params.velocityY}</p>
                      <p className="text-muted-foreground">grounded {String(platformerDebug.params.grounded)} landing {platformerDebug.params.landingImpact}</p>
                      <p className="text-muted-foreground">active {previewStateMachineSimulation.previousStateId} -&gt; {previewStateMachineSimulation.activeStateId}</p>
                    </div>
                    <div>
                      <p className="font-medium">Events</p>
                      <p className="text-muted-foreground">{previewEvents.map((event) => `${event.category ?? "debug"}:${event.type}@${event.time.toFixed(2)}${event.duration ? `+${event.duration.toFixed(2)}` : ""}`).join(", ") || "none"}</p>
                      <p className="text-muted-foreground">records {previewRecords.length}</p>
                      <p className="text-muted-foreground">colliders {platformerDebug.state.debug.activeColliders.length} / death {String(platformerDebug.state.debug.touchedDeathZone)}</p>
                      <p className="text-muted-foreground">camera {platformerDebug.state.cameraX.toFixed(0)}, {platformerDebug.state.cameraY.toFixed(0)}</p>
                      <p className="text-muted-foreground">room {previewLevel.id}</p>
                    </div>
                  </div>
                </div>
                <svg className="absolute bottom-3 left-3 h-36 w-64 rounded-md border bg-card/90 p-2" viewBox="-150 -110 360 180" aria-label="Collision debug overlay">
                  {previewLevel.colliders.map((collider, index) => (
                    <rect
                      fill={collider.kind === "deathZone" ? "rgba(239,68,68,0.45)" : collider.kind === "wallJump" ? "rgba(34,197,94,0.45)" : "rgba(79,140,255,0.35)"}
                      height={collider.height}
                      key={`${collider.kind}-${index}`}
                      stroke="currentColor"
                      strokeWidth="1"
                      width={collider.width}
                      x={collider.x}
                      y={collider.y}
                    />
                  ))}
                  <circle cx={platformerDebug.state.x} cy={platformerDebug.state.y} r="6" fill="#f59e0b" />
                </svg>
              </div>
            ) : null}
            {mode === "Rig" ? (
              <svg
                aria-label="Rig bone editor"
                className="absolute inset-0 z-10 size-full touch-none"
                viewBox={`${rigViewBox.x} ${rigViewBox.y} ${rigViewBox.width} ${rigViewBox.height}`}
              >
                {editorState.project.hierarchy.map((boneId) => {
                  const parentId = editorState.project.parents[boneId];
                  const point = displayedRigPoints[boneId];
                  const parentPoint = parentId ? displayedRigPoints[parentId] : undefined;
                  return parentPoint && point ? (
                    <line key={`${boneId}-line`} stroke="#4f8cff" strokeWidth={2} vectorEffect="non-scaling-stroke" x1={parentPoint[0]} x2={point[0]} y1={parentPoint[1]} y2={point[1]} />
                  ) : null;
                })}
                {editorState.project.hierarchy.map((boneId) => {
                  const point = displayedRigPoints[boneId];
                  if (!point || editorState.project.boneMetadata[boneId]?.hidden) {
                    return null;
                  }
                  const selected = boneId === selectedBone;
                  const tailPoint = dragBone?.handle === "tail" && dragBone.boneId === boneId ? dragBone.point : getBoneTailPoint(editorState.project, boneId, displayedRigPoints);
                  return (
                    <g key={boneId}>
                      {selected ? (
                        <>
                          <circle cx={point[0]} cy={point[1]} fill="none" r={Math.max(12, defaultBoneTailLength * 0.45)} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
                          <line stroke="#f59e0b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" x1={point[0]} x2={tailPoint[0]} y1={point[1]} y2={tailPoint[1]} />
                          <circle
                            aria-label={`Bone ${boneId} tail`}
                            cx={tailPoint[0]}
                            cy={tailPoint[1]}
                            fill="#fef3c7"
                            r={4.5}
                            stroke="#d97706"
                            strokeWidth={1.5}
                            vectorEffect="non-scaling-stroke"
                            onMouseDown={(event) => startBoneTailDrag(event, boneId, tailPoint)}
                          />
                        </>
                      ) : null}
                      <circle
                        cx={point[0]}
                        cy={point[1]}
                        fill={selected ? "#ffffff" : "#4f8cff"}
                        aria-label={`Bone ${boneId}`}
                        r={selected ? 5 : 3.5}
                        stroke="#1b4dcc"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                        onMouseDown={(event) => startBoneDrag(event, boneId, point)}
                      />
                    </g>
                  );
                })}
              </svg>
            ) : null}
            {mode === "Shape" && selectedPart && shapePoints.length > 0 ? (
              <svg
                aria-label="Shape point editor"
                className="absolute inset-0 z-10 size-full touch-none"
                tabIndex={0}
                viewBox={`${shapeViewBox.x} ${shapeViewBox.y} ${shapeViewBox.width} ${shapeViewBox.height}`}
                onDoubleClick={(event) => {
                  const point = svgPointFromEvent(event, shapeViewBox);
                  runCommand(createEditPathPointCommand(selectedPart.id, selectedPart.points.length, point));
                  setSelectedPointIndex(selectedPart.points.length);
                }}
                onKeyDown={(event) => {
                  if ((event.key === "Backspace" || event.key === "Delete") && selectedPointIndex !== null) {
                    event.preventDefault();
                    runCommand(createEditPathPointCommand(selectedPart.id, selectedPointIndex));
                    setSelectedPointIndex(null);
                  }
                }}
                onPointerMove={(event) => {
                  if (dragPoint) {
                    setDragPoint({ index: dragPoint.index, point: svgPointFromEvent(event, shapeViewBox) });
                  }
                }}
                onPointerUp={() => {
                  if (dragPoint) {
                    runCommand(createEditPathPointCommand(selectedPart.id, dragPoint.index, dragPoint.point));
                    setDragPoint(null);
                  }
                }}
              >
                <polyline fill="rgba(79,140,255,0.12)" points={shapePoints.map(([x, y]) => `${x},${y}`).join(" ")} stroke="#4f8cff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {shapePoints.map(([x, y], index) => (
                  <circle
                    cx={x}
                    cy={y}
                    fill={index === selectedPointIndex ? "#ffffff" : "#4f8cff"}
                    key={`${selectedPart.id}-${index}`}
                    r={index === selectedPointIndex ? 5 : 4}
                    stroke="#1b4dcc"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setSelectedPointIndex(index);
                      setDragPoint({ index, point: [x, y] });
                    }}
                  />
                ))}
              </svg>
            ) : null}
            {mode === "State Machine" ? (
              <div className="absolute inset-0 z-20 grid place-items-center bg-background/70 p-4" aria-label="State machine graph editor">
                <div className="grid w-[min(760px,calc(100%-24px))] gap-2 rounded-md border bg-card/95 p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">State Machine Graph</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {editorState.project.stateMachine.preview.fromStateId}
                        {" -> "}
                        {editorState.project.stateMachine.preview.toStateId} / weight {editorState.project.stateMachine.preview.weight.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {[0, 0.5, 1].map((weight) => (
                        <Button
                          key={weight}
                          size="sm"
                          type="button"
                          variant={Math.abs(editorState.project.stateMachine.preview.weight - weight) < 0.01 ? "default" : "outline"}
                          onClick={() => runCommand(createSetStateMachinePreviewCommand(editorState.project.stateMachine.preview.fromStateId, editorState.project.stateMachine.preview.toStateId, weight))}
                        >
                          {weight.toFixed(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <svg
                    className="h-[min(360px,calc(100dvh-360px))] min-h-60 w-full rounded-md border bg-background"
                    viewBox="0 0 640 360"
                    role="img"
                    aria-label="State machine states and transitions"
                    onPointerMove={(event) => {
                      if (!smDragNodeId) {
                        return;
                      }
                      const [x, y] = svgPointFromEvent(event, stateMachineViewBox);
                      setSmDraftNodePositions((positions) => ({ ...positions, [smDragNodeId]: { x, y } }));
                    }}
                    onPointerUp={(event) => {
                      if (!smDragNodeId) {
                        return;
                      }
                      const [x, y] = svgPointFromEvent(event, stateMachineViewBox);
                      commitStateNodePosition(smDragNodeId, { x, y });
                    }}
                  >
                    <defs>
                      <marker id="state-machine-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                        <path d="M 0 0 L 8 4 L 0 8 Z" fill="#4f8cff" />
                      </marker>
                    </defs>
                    {stateMachineGraph.transitions.map(({ transition, from, to }) => {
                      const selected = transition.id === selectedTransition?.id;
                      const activePreview = editorState.project.stateMachine.preview.fromStateId === transition.fromStateId && editorState.project.stateMachine.preview.toStateId === transition.toStateId;
                      const dx = to.x - from.x;
                      const dy = to.y - from.y;
                      const length = Math.max(1, Math.hypot(dx, dy));
                      const startX = from.x + (dx / length) * 46;
                      const startY = from.y + (dy / length) * 28;
                      const endX = to.x - (dx / length) * 52;
                      const endY = to.y - (dy / length) * 32;
                      const midX = (startX + endX) / 2;
                      const midY = (startY + endY) / 2;
                      return (
                        <g
                          key={transition.id}
                          className="cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSmSelectedTransitionId(transition.id);
                            setSmFromStateId(transition.fromStateId);
                            setSmToStateId(transition.toStateId);
                            setSmDuration(transition.duration);
                            setSmEasing(transition.easing);
                            setSmPriority(transition.priority);
                            setSmCanInterrupt(transition.canInterrupt);
                            setSmSyncMode(transition.syncMode);
                            runCommand(createSetStateMachinePreviewCommand(transition.fromStateId, transition.toStateId, 0.5));
                          }}
                        >
                          <line
                            markerEnd="url(#state-machine-arrow)"
                            stroke={selected || activePreview ? "#4f8cff" : "#94a3b8"}
                            strokeDasharray={activePreview ? "0" : "5 5"}
                            strokeWidth={selected ? 4 : 2}
                            x1={startX}
                            x2={endX}
                            y1={startY}
                            y2={endY}
                          />
                          <rect fill="var(--card)" height="18" rx="4" stroke={selected ? "#4f8cff" : "#cbd5e1"} width={Math.max(70, transition.id.length * 7)} x={midX - Math.max(70, transition.id.length * 7) / 2} y={midY - 9} />
                          <text fill="currentColor" fontSize="10" textAnchor="middle" x={midX} y={midY + 3}>
                            {transition.id}
                          </text>
                        </g>
                      );
                    })}
                    {stateMachineGraph.nodes.map(({ state, x, y }) => {
                      const selected = state.id === smFromStateId;
                      const initial = state.id === editorState.project.stateMachine.initialStateId;
                      const preview = state.id === editorState.project.stateMachine.preview.fromStateId || state.id === editorState.project.stateMachine.preview.toStateId;
                      return (
                        <g
                          key={state.id}
                          className="cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSmFromStateId(state.id);
                            setSmStateId(state.id);
                            setSmStateClipId(state.clipId);
                          }}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setSmDragNodeId(state.id);
                            setSmDraftNodePositions((positions) => ({ ...positions, [state.id]: { x, y } }));
                          }}
                          onPointerUp={() => {
                            if (smConnectorStartId) {
                              createTransitionFromConnector(smConnectorStartId, state.id);
                            }
                          }}
                        >
                          <rect fill={selected ? "#dbeafe" : preview ? "#eff6ff" : "var(--card)"} height="56" rx="8" stroke={selected ? "#1d4ed8" : initial ? "#f59e0b" : "#cbd5e1"} strokeWidth={selected ? 3 : 2} width="112" x={x - 56} y={y - 28} />
                          <text fill="currentColor" fontSize="13" fontWeight="600" textAnchor="middle" x={x} y={y - 4}>
                            {state.id}
                          </text>
                          <text fill="#64748b" fontSize="10" textAnchor="middle" x={x} y={y + 13}>
                            {state.clipId || "no clip"}
                          </text>
                          <circle
                            aria-label={`Create transition from ${state.id}`}
                            cx={x + 48}
                            cy={y}
                            fill={smConnectorStartId === state.id ? "#1d4ed8" : "#ffffff"}
                            r="6"
                            stroke="#1d4ed8"
                            strokeWidth="2"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setSmConnectorStartId(state.id);
                            }}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            ) : null}
            {mode === "Procedural" ? (
              <div className="absolute left-3 top-3 z-20 grid w-[min(520px,calc(100%-24px))] grid-cols-2 gap-2" aria-label="Procedural layer panels">
                {[
                  ["Breathing", `${editorState.project.procedural.breathing.enabled ? "on" : "off"} / ${editorState.project.procedural.breathing.amplitude.toFixed(2)} amp`],
                  ["Secondary Motion", `${editorState.project.procedural.secondaryMotion.target} / ${editorState.project.procedural.secondaryMotion.maxOffset}px`],
                  ["Squash Stretch", `${editorState.project.procedural.squashStretch.targetBone} / ${editorState.project.procedural.squashStretch.rules.length} rules`],
                  ["Foot IK", `${editorState.project.procedural.footIk.enabled ? "on" : "off"} / ${editorState.project.procedural.footIk.feet.join(", ")}`]
                ].map(([title, value]) => (
                  <div className="rounded-md border bg-card/95 p-2 shadow-sm" key={title}>
                    <p className="text-xs font-medium">{title}</p>
                    <p className="truncate text-xs text-muted-foreground">{value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <aside className="relative z-20 grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-l bg-card p-2.5">
          <div
            className="absolute left-0 top-0 z-30 h-full w-2 touch-none cursor-col-resize bg-transparent hover:bg-primary/30"
            role="separator"
            aria-label="Resize inspector panel"
            aria-orientation="vertical"
            onPointerDown={(event) => startPanelResize("right", event)}
            onMouseDown={(event) => startPanelResize("right", event)}
          />
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium">Inspector</h2>
            <Badge variant={editorState.project.dirty ? "destructive" : "outline"}>{editorState.project.dirty ? "Dirty" : "Clean"}</Badge>
          </div>
          <ScrollArea className="mt-2 min-h-0">
            <div className="grid grid-cols-1 gap-2 pr-2">
              {pendingImport ? (
                <InspectorSection title="Import Preview">
                  <CardContent className="grid gap-2">
                    <p className="text-xs text-muted-foreground">{pendingImport.errors.length ? pendingImport.errors.join("; ") : pendingImport.summary}</p>
                    <div className="grid grid-cols-2 gap-1">
                      <Button size="sm" type="button" disabled={!pendingImport.project} onClick={confirmImport}>
                        Confirm Import
                      </Button>
                      <Button size="sm" type="button" variant="outline" onClick={() => setPendingImport(null)}>
                        Clear
                      </Button>
                    </div>
                  </CardContent>
                </InspectorSection>
              ) : null}
              <InspectorSection title="Transform">
                <CardContent className="flex flex-col gap-2">
                  {inspectorRows.map(([label, value]) => (
                    <ReadOnlyField key={label} label={label} value={value} />
                  ))}
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Rename Bone</Label>
                    <div className="grid grid-cols-[1fr_auto] gap-1">
                      <Input className="h-7 text-xs" value={renameBoneId} onChange={(event) => setRenameBoneId(event.target.value)} aria-label="Rename bone id" disabled={selectedBone === "root"} />
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        aria-label="Apply bone rename"
                        disabled={selectedBone === "root" || !renameBoneId.trim() || renameBoneId === selectedBone}
                        onClick={() => {
                          runCommand(createRenameBoneCommand(selectedBone, renameBoneId.trim()));
                          setIoStatus(`renamed ${selectedBone} to ${renameBoneId.trim()}`);
                        }}
                      >
                        Rename
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Input className="h-7 text-xs" type="number" value={selectedTransform.x} onChange={(event) => updateSelectedTransform({ x: Number(event.target.value) })} aria-label="Bone local x" />
                    <Input className="h-7 text-xs" type="number" value={selectedTransform.y} onChange={(event) => updateSelectedTransform({ y: Number(event.target.value) })} aria-label="Bone local y" />
                    <Input className="h-7 text-xs" type="number" step="0.01" value={selectedTransform.rotation} onChange={(event) => updateSelectedTransform({ rotation: Number(event.target.value) })} aria-label="Bone rotation" />
                    <Input className="h-7 text-xs" type="number" step="0.01" value={selectedTransform.scaleX} onChange={(event) => updateSelectedTransform({ scaleX: Number(event.target.value) })} aria-label="Bone scale x" />
                    <Input className="h-7 text-xs" type="number" step="0.01" value={selectedTransform.scaleY} onChange={(event) => updateSelectedTransform({ scaleY: Number(event.target.value) })} aria-label="Bone scale y" />
                  </div>
                  <Select value={editorState.project.parents[selectedBone] ?? "none"} onValueChange={(parentId) => runCommand(createSetParentCommand(selectedBone, parentId === "none" ? null : parentId))} disabled={selectedBone === "root"}>
                    <SelectTrigger className="h-7 w-full" aria-label="Bone parent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">none</SelectItem>
                        {editorState.project.hierarchy.filter((boneId) => boneId !== selectedBone).map((boneId) => (
                          <SelectItem key={boneId} value={boneId}>
                            {boneId}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-1">
                    <Input className="h-7 text-xs" value={selectedBoneMetadata.mirrorGroup ?? ""} onChange={(event) => runCommand(createSetBoneMetadataCommand(selectedBone, { mirrorGroup: event.target.value || undefined }))} aria-label="Bone mirror group" />
                    <Input className="h-7 text-xs" value={(selectedBoneMetadata.tags ?? []).join(", ")} onChange={(event) => runCommand(createSetBoneMetadataCommand(selectedBone, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }))} aria-label="Bone tags" />
                  </div>
                  <Select value={String(selectedBoneMetadata.facing ?? 1)} onValueChange={(value) => runCommand(createSetBoneMetadataCommand(selectedBone, { facing: value === "-1" ? -1 : 1 }))}>
                    <SelectTrigger className="h-7 w-full" aria-label="Bone facing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="1">facing 1</SelectItem>
                        <SelectItem value="-1">facing -1</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Add Bone</Label>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
                      <Input className="h-7 text-xs" value={newBoneId} onChange={(event) => setNewBoneId(event.target.value)} aria-label="New bone id" />
                      <Select value={newBoneParentId} onValueChange={setNewBoneParentId}>
                        <SelectTrigger className="h-7 w-full" aria-label="New bone parent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {editorState.project.hierarchy.map((boneId) => (
                              <SelectItem key={boneId} value={boneId}>
                                {boneId}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        aria-label="Add bone"
                        disabled={!newBoneId.trim() || Boolean(editorState.project.bones[newBoneId.trim()])}
                        onClick={() => {
                          runCommand(createAddBoneCommand(newBoneParentId, newBoneId.trim()));
                          setIoStatus(`added bone ${newBoneId.trim()}`);
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Delete impact: {childBoneCount} children / {boundPartCount} parts / {boundTrackCount} tracks / {poseRefCount} poses / {proceduralRefCount} procedural refs
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetParentCommand(selectedBone, "root"))} disabled={selectedBone === "root"}>
                      Parent Root
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetParentCommand(selectedBone, "body"))} disabled={selectedBone === "root" || selectedBone === "body"}>
                      Parent Body
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetBoneMetadataCommand(selectedBone, { locked: !selectedBoneMetadata.locked }))}>
                      {selectedBoneMetadata.locked ? "Unlock" : "Lock"}
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetBoneMetadataCommand(selectedBone, { hidden: !selectedBoneMetadata.hidden }))}>
                      {selectedBoneMetadata.hidden ? "Show" : "Hide"}
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetBoneMetadataCommand(selectedBone, { mirrorGroup: selectedBone.includes("Front") ? "front" : "back" }))}>
                      Mirror ID
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createMirrorBoneTransformCommand(selectedBone))}>
                      Mirror Transform
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createMirrorBoneBranchCommand(selectedBone))}>
                      Mirror Branch
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetBoneMetadataCommand(selectedBone, { tags: [...(selectedBoneMetadata.tags ?? []), "default-pose"] }))}>
                      Tag
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetBoneMetadataCommand(selectedBone, { facing: selectedBoneMetadata.facing === -1 ? 1 : -1 }))}>
                      Facing
                    </Button>
                  </div>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="Export Bundle">
                <CardContent className="grid gap-2">
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" type="button" variant="outline" onClick={() => void exportBundle()}>
                      Build
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => void copyExportFiles()} disabled={!lastExportBundle?.validation.ok}>
                      Copy All
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => void copyExportFile("hero.source.rig.json")} disabled={!lastExportBundle?.files["hero.source.rig.json"]}>
                      Copy Source
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => void copyExportFile("hero.compiled.json")} disabled={!lastExportBundle?.files["hero.compiled.json"]}>
                      Copy Compiled
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lastExportBundle ? (lastExportBundle.validation.ok ? `${exportFileEntries.length} files ready` : "validation failed") : "not built"}
                  </p>
                  {lastExportBundle?.summary ? (
                    <div className="grid gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                      <span>Profile: {lastExportBundle.summary.profile}</span>
                      <span>Counts: {lastExportBundle.summary.bones} bones / {lastExportBundle.summary.parts} parts / {lastExportBundle.summary.animations} clips / {lastExportBundle.summary.states} states</span>
                      <span>Size: {lastExportBundle.summary.totalBytes}b{lastExportBundle.summary.compressedBytes ? ` / gzip ${lastExportBundle.summary.compressedBytes}b` : ""}</span>
                      <span className="truncate" title={lastExportBundle.summary.compiledHash}>Compiled SHA-256: {lastExportBundle.summary.compiledHash.slice(0, 16)}...</span>
                    </div>
                  ) : null}
                  {lastExportBundle?.validation.errors.map((error) => (
                    <p className="text-xs text-destructive" key={error}>{error}</p>
                  ))}
                  {lastExportBundle?.validation.warnings.map((warning) => (
                    <p className="text-xs text-amber-600" key={warning}>{warning}</p>
                  ))}
                  <div className="grid gap-1">
                    {exportFileEntries.map(([fileName, contents]) => (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-md bg-muted px-2 py-1" key={fileName}>
                        <span className="truncate text-xs" title={fileName}>File: {fileName}</span>
                        <span className="text-xs text-muted-foreground">{contents.length}b</span>
                        <Button size="sm" type="button" variant="outline" onClick={() => downloadExportFile(fileName)}>
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="Shape">
                <CardContent className="flex flex-col gap-2">
                  <p className="truncate text-xs text-muted-foreground">{selectedPart?.id ?? "No part selected"}</p>
                  <ReadOnlyField label="Type" value={selectedPart?.type ?? "none"} />
                  <ReadOnlyField label="Asset" value={selectedPart?.assetPath?.split("/").pop() ?? "none"} />
                  <ReadOnlyField label="Pivot" value={selectedPart?.pivot.join(", ") ?? "none"} />
                  <ReadOnlyField label="Points" value={String(selectedPart?.points.length ?? 0)} />
                  <ReadOnlyField label="Commands" value={String(selectedPart?.pathCommands?.length ?? 0)} />
                  <ReadOnlyField label="ViewBox" value={selectedPart?.svgViewBox?.join(", ") ?? "none"} />
                  <ReadOnlyField label="Closed" value={selectedPathClosed ? "yes" : "no"} />
                  <ReadOnlyField label="Point" value={selectedPointIndex === null ? "none" : String(selectedPointIndex)} />
                  <ReadOnlyField label="Command" value={selectedCommand?.type ?? "none"} />
                  {vectorizeSummary ? <p className="text-xs text-muted-foreground">{vectorizeSummary}</p> : null}
                  {mirrorSummary ? <p className="text-xs text-muted-foreground">{mirrorSummary}</p> : null}
                  {selectedPart?.type === "path" ? <p className="text-xs text-muted-foreground">Path editor supports merged SVG paths, winding, smoothing, simplification, and cubic conversion.</p> : null}
                  <div className="grid grid-cols-2 gap-1">
                    <Input className="h-7 text-xs" type="number" value={selectedPoint?.[0] ?? 0} onChange={(event) => selectedPart && selectedPointIndex !== null && runCommand(createEditPathPointCommand(selectedPart.id, selectedPointIndex, [Number(event.target.value), selectedPoint?.[1] ?? 0]))} aria-label="Selected point x" disabled={!selectedPoint} />
                    <Input className="h-7 text-xs" type="number" value={selectedPoint?.[1] ?? 0} onChange={(event) => selectedPart && selectedPointIndex !== null && runCommand(createEditPathPointCommand(selectedPart.id, selectedPointIndex, [selectedPoint?.[0] ?? 0, Number(event.target.value)]))} aria-label="Selected point y" disabled={!selectedPoint} />
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
                    <Input className="h-7 text-xs" type="number" value={newPointX} onChange={(event) => setNewPointX(Number(event.target.value))} aria-label="New point x" />
                    <Input className="h-7 text-xs" type="number" value={newPointY} onChange={(event) => setNewPointY(Number(event.target.value))} aria-label="New point y" />
                    <Button size="sm" type="button" variant="outline" disabled={!selectedPart} onClick={() => selectedPart && runCommand(createEditPathPointCommand(selectedPart.id, selectedPart.points.length, [newPointX, newPointY]))}>
                      Add Point
                    </Button>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
                    <Input className="h-7 text-xs" type="number" value={selectedPart?.pivot[0] ?? 0} onChange={(event) => selectedPart && runCommand(createSetPartPivotCommand(selectedPart.id, [Number(event.target.value), selectedPart.pivot[1]]))} aria-label="Part pivot x" disabled={!selectedPart} />
                    <Input className="h-7 text-xs" type="number" value={selectedPart?.pivot[1] ?? 0} onChange={(event) => selectedPart && runCommand(createSetPartPivotCommand(selectedPart.id, [selectedPart.pivot[0], Number(event.target.value)]))} aria-label="Part pivot y" disabled={!selectedPart} />
                    <Button size="sm" type="button" variant="outline" disabled={!selectedPart || !selectedPoint} onClick={() => selectedPart && selectedPoint && runCommand(createSetPartPivotCommand(selectedPart.id, selectedPoint))}>
                      Pivot From Point
                    </Button>
                  </div>
                  <Input className="h-7 text-xs" type="number" value={selectedPart?.zIndex ?? 0} onChange={(event) => selectedPart && runCommand(createSetPartDrawOrderCommand(selectedPart.id, Number(event.target.value)))} aria-label="Part draw order" disabled={!selectedPart} />
                  {selectedPart?.points.length ? (
                    <div className="grid max-h-28 gap-1 overflow-auto pr-1">
                      {selectedPart.points.map(([x, y], index) => (
                        <Button key={`${selectedPart.id}-point-${index}`} size="sm" type="button" variant={index === selectedPointIndex ? "default" : "outline"} onClick={() => setSelectedPointIndex(index)}>
                          {index}: {x.toFixed(1)}, {y.toFixed(1)}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" type="button" variant="outline" onClick={() => void vectorizeSelectedPart()} disabled={selectedPart?.type !== "svg"}>
                      Vectorize
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => { if (selectedPart) { runCommand(createMirrorPathCommand(selectedPart.id)); setMirrorSummary(`mirrored ${selectedPart.points.length} points`); } }} disabled={!selectedPart?.points.length}>
                      Mirror
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPart && runCommand(createSetPartPivotCommand(selectedPart.id, [0, 0]))} disabled={!selectedPart}>
                      Pivot 0
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPart && runCommand(createSetPartDrawOrderCommand(selectedPart.id, (selectedPart.zIndex ?? 0) + 1))} disabled={!selectedPart}>
                      Layer +
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPart && runCommand(createSetPathClosedCommand(selectedPart.id, !selectedPathClosed))} disabled={!selectedPart?.points.length}>
                      {selectedPathClosed ? "Open" : "Close"}
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPart && runCommand(createReversePartPathCommand(selectedPart.id))} disabled={!selectedPart?.points.length}>
                      Reverse
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPart && runCommand(createSmoothPartPathCommand(selectedPart.id, 0.18))} disabled={!selectedPart?.points.length}>
                      Smooth
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPart && runCommand(createSimplifyPartPathCommand(selectedPart.id, 0.05))} disabled={!selectedPart?.points.length}>
                      Simplify
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPart && selectedPointIndex !== null && runCommand(createConvertLineToCubicCommand(selectedPart.id, selectedPointIndex))} disabled={!selectedPart?.points.length || selectedPointIndex === null || selectedCommand?.type !== "L"}>
                      Line {"->"} Cubic
                    </Button>
                  </div>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="Parts">
                <CardContent className="grid gap-2">
                  <div className="grid max-h-36 gap-1 overflow-auto pr-1">
                    {partRows.map((part) => (
                      <Button
                        className="h-auto justify-start px-2 py-1 text-left"
                        key={part.id}
                        type="button"
                        variant={part.id === selectedPart?.id ? "default" : part.boneId === selectedBone ? "outline" : "ghost"}
                        onClick={() => setSelectedPartId(part.id)}
                      >
                        <span className="grid min-w-0 gap-0.5">
                          <span className="truncate text-xs">{part.id}</span>
                          <span className="truncate text-[11px] opacity-75">
                            {part.type} / {part.boneId} / z {part.zIndex ?? 0}
                          </span>
                          <span className="truncate text-[11px] opacity-75">{part.assetPath ?? "no asset"}</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Bind to Bone</Label>
                    <Select
                      value={selectedPart?.boneId ?? ""}
                      onValueChange={(boneId) => selectedPart && runCommand(createBindPartToBoneCommand(selectedPart.id, boneId))}
                      disabled={!selectedPart}
                    >
                      <SelectTrigger className="h-7 w-full" aria-label="Bind part to bone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {editorState.project.hierarchy.map((boneId) => (
                            <SelectItem key={boneId} value={boneId}>
                              {boneId}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Add SVG Part</Label>
                    <Input className="h-7 text-xs" value={newPartId} onChange={(event) => setNewPartId(event.target.value)} aria-label="New SVG part id" />
                    <Input className="h-7 text-xs" value={newPartSource} onChange={(event) => setNewPartSource(event.target.value)} aria-label="New SVG source" />
                    <div className="grid grid-cols-[1fr_72px] gap-1">
                      <Select value={newPartBoneId} onValueChange={setNewPartBoneId}>
                        <SelectTrigger className="h-7 w-full" aria-label="New SVG bone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {editorState.project.hierarchy.map((boneId) => (
                              <SelectItem key={boneId} value={boneId}>
                                {boneId}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Input className="h-7 text-xs" type="number" value={newPartDrawOrder} onChange={(event) => setNewPartDrawOrder(Number(event.target.value))} aria-label="New SVG draw order" />
                    </div>
                    <Button size="sm" type="button" variant="outline" onClick={addSvgPart}>
                      Add SVG Part
                    </Button>
                  </div>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="Constraints">
                <CardContent className="grid gap-1">
                  <p className="text-xs text-muted-foreground">{editorState.project.procedural.footIk.footChains.map((chain) => `${chain.thighBone ?? "?"}/${chain.shinBone ?? "?"}/${chain.footBone}`).join(", ")}</p>
                  <p className="text-xs text-muted-foreground">max {editorState.project.procedural.footIk.maxCorrection}px / blend {editorState.project.procedural.footIk.blend}</p>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="Pose Library">
                <CardContent className="grid gap-2">
                  <Select value={selectedPose?.id ?? ""} onValueChange={setSelectedPoseId} disabled={!selectedPose}>
                    <SelectTrigger className="h-7 w-full" aria-label="Selected pose">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {poseIds.map((poseId) => (
                          <SelectItem key={poseId} value={poseId}>
                            {editorState.project.poses[poseId]?.name ?? poseId}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{selectedPoseTagText || "untagged"}</p>
                  <div className="grid grid-cols-[1fr_auto] gap-1">
                    <Input className="h-7 text-xs" type="number" min={0} max={1} step={0.05} value={poseBlendWeight} onChange={(event) => setPoseBlendWeight(clampPanelSize(Number(event.target.value), 0, 1))} aria-label="Pose blend weight" />
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && runCommand(createApplyPoseBlendCommand(selectedPose.id, poseBlendWeight))} disabled={!selectedPose}>
                      Apply Blend
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && runCommand(createApplyPoseCommand(selectedPose.id))} disabled={!selectedPose}>
                      Apply
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createPoseFromCurrentCommand(`pose_${poseIds.length + 1}`, `Pose ${poseIds.length + 1}`, ["custom"]))}>
                      Capture
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && runCommand(createRenamePoseCommand(selectedPose.id, `${selectedPose.name}*`))} disabled={!selectedPose}>
                      Rename
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && runCommand(createDuplicatePoseCommand(selectedPose.id, `${selectedPose.id}_copy`))} disabled={!selectedPose}>
                      Duplicate
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && runCommand(createMirrorPoseCommand(selectedPose.id, `${selectedPose.id}_mirror`))} disabled={!selectedPose}>
                      Mirror
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && runCommand(createCopyPoseCommand(selectedPose.id))} disabled={!selectedPose}>
                      Copy
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!editorState.project.poseClipboard} onClick={() => runCommand(createPastePoseCommand(`pose_paste_${poseIds.length + 1}`))}>
                      Paste
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && runCommand(createUpdatePoseTagsCommand(selectedPose.id, Array.from(new Set([...selectedPose.tags, "reviewed"]))))} disabled={!selectedPose}>
                      Tag
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && nextPose && runCommand(createBlendPoseCommand(selectedPose.id, nextPose.id, `${selectedPose.id}_${nextPose.id}_blend`, poseBlendWeight))} disabled={!selectedPose || !nextPose}>
                      Blend Pose
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => selectedPose && activeClip && runCommand(createPoseToKeyframesCommand(selectedPose.id, activeClip.id, clampPanelSize(timelineCurrentTime, 0, activeClip.duration)))} disabled={!selectedPose || !activeClip}>
                      Key Pose
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Blend target: {nextPose?.name ?? "none"} / key time {activeClip ? clampPanelSize(timelineCurrentTime, 0, activeClip.duration).toFixed(2) : "none"}
                  </p>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="Curve">
                <CardContent className="grid gap-2">
                  <p className="line-clamp-2 text-xs text-muted-foreground">{activeTrack.map((key) => `${key.id}: ${key.interpolation}`).join(", ")}</p>
                  <svg viewBox="0 0 120 100" className="h-28 w-full rounded-md border bg-muted" role="img" aria-label="Curve graph">
                    <path d="M 12 88 H 108 M 12 88 V 16" fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
                    <path d={curvePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" />
                    <line x1="12" y1="88" x2={12 + selectedCurve[0] * 96} y2={88 - selectedCurve[1] * 72} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" />
                    <line x1="108" y1="16" x2={12 + selectedCurve[2] * 96} y2={88 - selectedCurve[3] * 72} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" />
                    <circle cx={12 + selectedCurve[0] * 96} cy={88 - selectedCurve[1] * 72} r="4" fill="hsl(var(--primary))" />
                    <circle cx={12 + selectedCurve[2] * 96} cy={88 - selectedCurve[3] * 72} r="4" fill="hsl(var(--primary))" />
                  </svg>
                  <div className="grid grid-cols-2 gap-1">
                    <Select
                      value={selectedTimelineKey?.interpolation ?? "linear"}
                      onValueChange={(value) => activeClip && selectedTimelineKey && runCommand(createChangeCurveCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, value as Keyframe["interpolation"], selectedCurve, selectedKeyCurvePreset as CurvePreset))}
                      disabled={!activeClip || !selectedTimelineKey}
                    >
                      <SelectTrigger className="h-8" aria-label="Curve interpolation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {interpolationOptions.map((interpolation) => (
                            <SelectItem key={interpolation} value={interpolation}>{interpolation}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Select
                      value={selectedKeyCurvePreset}
                      onValueChange={(preset) => activeClip && selectedTimelineKey && runCommand(createApplyCurvePresetCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, preset as CurvePreset))}
                      disabled={!activeClip || !selectedTimelineKey}
                    >
                      <SelectTrigger className="h-8" aria-label="Curve preset">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {curvePresetOptions.map((preset) => (
                            <SelectItem key={preset} value={preset}>{preset}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    60fps ticks: {curveSamples.map((sample) => `${sample.frame}f:${sample.value.toFixed(2)}`).join(" / ")}
                  </p>
                  <div className="grid grid-cols-4 gap-1">
                    {selectedCurve.map((value, index) => (
                      <Input
                        key={index}
                        className="h-7 text-xs"
                        type="number"
                        step="0.01"
                        value={value}
                        onChange={(event) => {
                          if (!activeClip || !selectedTimelineKey) {
                            return;
                          }
                          const nextCurve = [...selectedCurve] as [number, number, number, number];
                          nextCurve[index] = Number(event.target.value);
                          runCommand(createEditBezierHandlesCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, nextCurve));
                        }}
                        aria-label={`Curve ${["x1", "y1", "x2", "y2"][index]}`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Input
                      className="h-7 text-xs"
                      type="number"
                      step="0.01"
                      value={selectedTimelineKey?.tangentIn ?? 0}
                      onChange={(event) => activeClip && selectedTimelineKey && runCommand(createSetKeyframeTangentsCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, Number(event.target.value), selectedTimelineKey.tangentOut ?? 0))}
                      aria-label="Curve tangent in"
                      disabled={!activeClip || !selectedTimelineKey}
                    />
                    <Input
                      className="h-7 text-xs"
                      type="number"
                      step="0.01"
                      value={selectedTimelineKey?.tangentOut ?? 0}
                      onChange={(event) => activeClip && selectedTimelineKey && runCommand(createSetKeyframeTangentsCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, selectedTimelineKey.tangentIn ?? 0, Number(event.target.value)))}
                      aria-label="Curve tangent out"
                      disabled={!activeClip || !selectedTimelineKey}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" type="button" variant="outline" disabled={!editorState.project.timeline.selectedKeyIds.length} onClick={() => runCommand(createApplyCurvePresetToSelectionCommand(selectedKeyCurvePreset as CurvePreset))}>
                      Batch Preset
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetCurvePreviewCommand("jump", "land", Math.min(1, editorState.project.timeline.curvePreview.weight + 0.1)))}>
                      A/B +
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {editorState.project.timeline.curvePreview.fromClipId}
                      {"->"}
                      {editorState.project.timeline.curvePreview.toClipId} {editorState.project.timeline.curvePreview.weight.toFixed(1)}
                    </span>
                  </div>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="State Machine">
                <CardContent className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-1">
                    <Input className="h-7 text-xs" value={smStateId} onChange={(event) => setSmStateId(event.target.value)} aria-label="State id" />
                    <Select value={smStateClipId} onValueChange={setSmStateClipId}>
                      <SelectTrigger className="h-7" aria-label="State clip">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {clipIds.map((clipId) => (
                            <SelectItem key={clipId} value={clipId}>{clipId}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button size="sm" type="button" variant="outline" disabled={!smStateId.trim()} onClick={() => runCommand(createStateMachineStateCommand({ id: smStateId.trim(), clipId: smStateClipId }))}>
                      Create State
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!smFromStateId} onClick={() => runCommand(createUpdateStateMachineStateCommand(smFromStateId, { clipId: smStateClipId }))}>
                      Set Clip
                    </Button>
                    <Input className="h-7 text-xs" value={smRenameStateId} onChange={(event) => setSmRenameStateId(event.target.value)} aria-label="Rename state id" />
                    <Button size="sm" type="button" variant="outline" disabled={!smFromStateId || !smRenameStateId.trim()} onClick={() => runCommand(createRenameStateMachineStateCommand(smFromStateId, smRenameStateId.trim()))}>
                      Rename State
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!smFromStateId} onClick={() => runCommand(createSetInitialStateCommand(smFromStateId))}>
                      Set Initial
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!smFromStateId} onClick={() => runCommand(createDeleteStateMachineStateCommand(smFromStateId))}>
                      Delete State
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!selectedStateNode} onClick={() => selectedStateNode && runCommand(createSetBlendTreeCommand(selectedStateNode.id, { type: "1d", parameter: "absSpeed", children: [{ threshold: 0, clipId: "idle" }, { threshold: 80, clipId: "walk" }, { threshold: 150, clipId: "walk" }] }))}>
                      Blend 1D
                    </Button>
                  </div>
                  <div className="grid gap-2 rounded-md border p-2">
                    <div className="grid grid-cols-[1fr_auto] gap-1">
                      <Select value={selectedBlendTree.parameter} onValueChange={(parameter) => applyBlendTree({ ...selectedBlendTree, parameter })}>
                        <SelectTrigger className="h-7" aria-label="Blend tree parameter">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {numericParameterIds.map((parameterId) => (
                              <SelectItem key={parameterId} value={parameterId}>{parameterId}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() =>
                          applyBlendTree({
                            ...selectedBlendTree,
                            children: [...selectedBlendTree.children, { threshold: (selectedBlendTree.children.at(-1)?.threshold ?? 0) + 40, clipId: clipIds[0] ?? "" }]
                          })
                        }
                      >
                        Add Threshold
                      </Button>
                    </div>
                    {selectedBlendTree.children.map((child, index) => (
                      <div className="grid grid-cols-[72px_1fr_repeat(3,auto)] gap-1" key={`${child.clipId}-${index}`}>
                        <Input className="h-7 text-xs" type="number" value={child.threshold} onChange={(event) => updateBlendTreeChild(index, { threshold: Number(event.target.value) })} aria-label={`Blend threshold ${index}`} />
                        <Select value={child.clipId} onValueChange={(clipId) => updateBlendTreeChild(index, { clipId })}>
                          <SelectTrigger className="h-7" aria-label={`Blend clip ${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {clipIds.map((clipId) => (
                                <SelectItem key={clipId} value={clipId}>{clipId}</SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Button size="sm" type="button" variant="outline" disabled={index === 0} onClick={() => moveBlendTreeChild(index, -1)}>
                          Up
                        </Button>
                        <Button size="sm" type="button" variant="outline" disabled={index === selectedBlendTree.children.length - 1} onClick={() => moveBlendTreeChild(index, 1)}>
                          Down
                        </Button>
                        <Button size="sm" type="button" variant="outline" disabled={selectedBlendTree.children.length <= 1} onClick={() => applyBlendTree({ ...selectedBlendTree, children: selectedBlendTree.children.filter((_, childIndex) => childIndex !== index) })}>
                          Remove
                        </Button>
                      </div>
                    ))}
                    <svg viewBox="0 0 220 34" className="h-9 w-full rounded border bg-background" role="img" aria-label="Blend tree weight graph">
                      <line x1="8" x2="212" y1="18" y2="18" stroke="#cbd5e1" />
                      {selectedBlendTree.children.map((child, index) => {
                        const thresholds = selectedBlendTree.children.map((item) => item.threshold);
                        const min = Math.min(...thresholds);
                        const max = Math.max(...thresholds, min + 1);
                        const x = 8 + ((child.threshold - min) / Math.max(1, max - min)) * 204;
                        return (
                          <g key={`${child.clipId}-${child.threshold}-${index}`}>
                            <line x1={x} x2={x} y1="8" y2="28" stroke="#4f8cff" />
                            <text fill="currentColor" fontSize="8" textAnchor="middle" x={x} y="31">{child.clipId}</text>
                          </g>
                        );
                      })}
                      <line x1={8 + ((blendTreeParameterValue - Math.min(...selectedBlendTree.children.map((item) => item.threshold))) / Math.max(1, Math.max(...selectedBlendTree.children.map((item) => item.threshold), Math.min(...selectedBlendTree.children.map((item) => item.threshold)) + 1) - Math.min(...selectedBlendTree.children.map((item) => item.threshold)))) * 204} x2={8 + ((blendTreeParameterValue - Math.min(...selectedBlendTree.children.map((item) => item.threshold))) / Math.max(1, Math.max(...selectedBlendTree.children.map((item) => item.threshold), Math.min(...selectedBlendTree.children.map((item) => item.threshold)) + 1) - Math.min(...selectedBlendTree.children.map((item) => item.threshold)))) * 204} y1="4" y2="30" stroke="#f97316" strokeWidth="2" />
                    </svg>
                    <p className="text-xs text-muted-foreground">
                      blend {selectedBlendTree.parameter}={blendTreeParameterValue.toFixed(0)} / {selectedBlendWeights.map((entry) => `${entry.clipId}:${entry.weight.toFixed(2)}`).join(", ") || "select blend state"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Select value={smFromStateId} onValueChange={setSmFromStateId}>
                      <SelectTrigger className="h-7" aria-label="Transition from state">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {stateIds.map((stateId) => (
                            <SelectItem key={stateId} value={stateId}>{stateId}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Select value={smToStateId} onValueChange={setSmToStateId}>
                      <SelectTrigger className="h-7" aria-label="Transition to state">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {stateIds.map((stateId) => (
                            <SelectItem key={stateId} value={stateId}>{stateId}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Input className="h-7 text-xs" type="number" step="0.01" value={smDuration} onChange={(event) => setSmDuration(Number(event.target.value))} aria-label="Transition duration" />
                    <Select value={smEasing} onValueChange={setSmEasing}>
                      <SelectTrigger className="h-7" aria-label="Transition easing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {["linear", "easeIn", "easeOut", "easeInOut", "cubicBezier", "spring", "overshoot", "anticipation"].map((easing) => (
                            <SelectItem key={easing} value={easing}>{easing}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Input className="h-7 text-xs" type="number" step="1" value={smPriority} onChange={(event) => setSmPriority(Number(event.target.value))} aria-label="Transition priority" />
                    <Select value={smSyncMode} onValueChange={setSmSyncMode}>
                      <SelectTrigger className="h-7" aria-label="Transition sync mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {["none", "normalizedTime", "phaseMatch"].map((syncMode) => (
                            <SelectItem key={syncMode} value={syncMode}>{syncMode}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button size="sm" type="button" variant={smCanInterrupt ? "default" : "outline"} onClick={() => setSmCanInterrupt((value) => !value)}>
                      Interrupt
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const transition = {
                          id: smTransitionId,
                          fromStateId: smFromStateId,
                          toStateId: smToStateId,
                          duration: smDuration,
                          easing: smEasing as EditorTransition["easing"],
                          priority: smPriority,
                          canInterrupt: smCanInterrupt,
                          syncMode: smSyncMode as EditorTransition["syncMode"],
                          conditions: [{ parameter: smConditionParameter, op: smConditionOp as EditorTransitionCondition["op"], value: parseStateMachineValue(smConditionValue) }]
                        };
                        setSmSelectedTransitionId(transition.id);
                        runCommand(createTransitionCommand(transition));
                      }}
                    >
                      Create Transition
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <Select value={smConditionParameter} onValueChange={setSmConditionParameter}>
                      <SelectTrigger className="h-7" aria-label="Condition parameter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {parameterIds.map((parameterId) => (
                            <SelectItem key={parameterId} value={parameterId}>{parameterId}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Select value={smConditionOp} onValueChange={setSmConditionOp}>
                      <SelectTrigger className="h-7" aria-label="Condition operator">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {["==", "!=", ">", ">=", "<", "<="].map((operator) => (
                            <SelectItem key={operator} value={operator}>{operator}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Input className="h-7 text-xs" value={smConditionValue} onChange={(event) => setSmConditionValue(event.target.value)} aria-label="Condition value" />
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetStateMachineParameterCommand(smConditionParameter, parseStateMachineValue(smConditionValue)))}>
                      Set Param
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!selectedTransition} onClick={() => selectedTransition && runCommand(createSetTransitionConditionsCommand(selectedTransition.id, [{ parameter: smConditionParameter, op: smConditionOp as EditorTransitionCondition["op"], value: parseStateMachineValue(smConditionValue) }]))}>
                      Set Condition
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!selectedTransition} onClick={() => selectedTransition && runCommand(createUpdateTransitionCommand(selectedTransition.id, { duration: smDuration, easing: smEasing as EditorTransition["easing"], priority: smPriority, canInterrupt: smCanInterrupt, syncMode: smSyncMode as EditorTransition["syncMode"] }))}>
                      Update Transition
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!selectedTransition} onClick={() => selectedTransition && runCommand(createDeleteTransitionCommand(selectedTransition.id))}>
                      Delete Transition
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-md border p-2">
                    {["absSpeed", "velocityY", "timeInState"].map((parameterId) => (
                      <label className="grid gap-1 text-xs" key={parameterId}>
                        <span className="text-muted-foreground">{parameterId}</span>
                        <Input
                          className="h-7 text-xs"
                          type="number"
                          step="1"
                          value={Number(editorState.project.stateMachine.parameters[parameterId] ?? 0)}
                          onChange={(event) => runCommand(createSetStateMachineParameterCommand(parameterId, Number(event.target.value)))}
                          aria-label={`Live parameter ${parameterId}`}
                        />
                      </label>
                    ))}
                    {["grounded", "jumpPressed"].map((parameterId) => (
                      <Button
                        key={parameterId}
                        size="sm"
                        type="button"
                        variant={editorState.project.stateMachine.parameters[parameterId] === true ? "default" : "outline"}
                        onClick={() => runCommand(createSetStateMachineParameterCommand(parameterId, editorState.project.stateMachine.parameters[parameterId] !== true))}
                      >
                        {parameterId}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Select value={selectedTransition?.id ?? ""} onValueChange={setSmSelectedTransitionId}>
                      <SelectTrigger className="h-7" aria-label="Selected transition">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {editorState.project.stateMachine.transitions.map((transition) => (
                            <SelectItem key={transition.id} value={transition.id}>{transition.id}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button size="sm" type="button" variant="outline" disabled={!selectedTransition} onClick={() => selectedTransition && runCommand(createSetStateMachinePreviewCommand(selectedTransition.fromStateId, selectedTransition.toStateId, 1))}>
                      Preview Transition
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    initial {editorState.project.stateMachine.initialStateId} / active {editorState.project.stateMachine.preview.fromStateId}
                    {" -> "}
                    {editorState.project.stateMachine.preview.toStateId} weight {editorState.project.stateMachine.preview.weight.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    simulation {stateMachineSimulation.previousStateId}
                    {" -> "}
                    {stateMachineSimulation.activeStateId} / {stateMachineSimulation.transitionId ?? "no transition"} / weight {stateMachineSimulation.transitionWeight.toFixed(2)} / clips{" "}
                    {stateMachineSimulation.blendWeights.map((entry) => `${entry.clipId}:${entry.weight.toFixed(2)}`).join(", ") || "none"}
                  </p>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="Procedural">
                <CardContent className="flex flex-col gap-2">
                  <div className="grid gap-1 rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">Breathing</Label>
                      <Button size="sm" type="button" variant={editorState.project.procedural.breathing.enabled ? "default" : "outline"} onClick={() => runCommand(createUpdateProceduralCommand({ breathing: { ...editorState.project.procedural.breathing, enabled: !editorState.project.procedural.breathing.enabled } }))}>
                        {editorState.project.procedural.breathing.enabled ? "On" : "Off"}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Input className="h-7 text-xs" type="number" step="0.1" value={editorState.project.procedural.breathing.frequency} onChange={(event) => runCommand(createUpdateProceduralCommand({ breathing: { ...editorState.project.procedural.breathing, frequency: Number(event.target.value) } }))} aria-label="Breathing frequency" />
                      <Input className="h-7 text-xs" type="number" step="0.1" value={editorState.project.procedural.breathing.amplitude} onChange={(event) => runCommand(createUpdateProceduralCommand({ breathing: { ...editorState.project.procedural.breathing, enabled: true, amplitude: Number(event.target.value) } }))} aria-label="Breathing amplitude" />
                    </div>
                    <Input className="h-7 text-xs" value={proceduralBonesText} onChange={(event) => setProceduralBonesText(event.target.value)} aria-label="Breathing affected bones" />
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createUpdateProceduralCommand({ breathing: { ...editorState.project.procedural.breathing, enabled: true, affectedBones: parseCsvIds(proceduralBonesText) } }))}>
                      Apply Bones
                    </Button>
                  </div>
                  <div className="grid gap-1 rounded-md border p-2">
                    <Label className="text-xs">Secondary Motion</Label>
                    <div className="grid grid-cols-2 gap-1">
                      <Select value={editorState.project.procedural.secondaryMotion.target} onValueChange={(target) => runCommand(createUpdateProceduralCommand({ secondaryMotion: { ...editorState.project.procedural.secondaryMotion, enabled: true, target } }))}>
                        <SelectTrigger className="h-7" aria-label="Secondary target">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {editorState.project.hierarchy.map((boneId) => (
                              <SelectItem key={boneId} value={boneId}>{boneId}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Input className="h-7 text-xs" type="number" step="0.01" value={editorState.project.procedural.secondaryMotion.stiffness} onChange={(event) => runCommand(createUpdateProceduralCommand({ secondaryMotion: { ...editorState.project.procedural.secondaryMotion, enabled: true, stiffness: Number(event.target.value) } }))} aria-label="Secondary stiffness" />
                      <Input className="h-7 text-xs" type="number" step="0.01" value={editorState.project.procedural.secondaryMotion.damping} onChange={(event) => runCommand(createUpdateProceduralCommand({ secondaryMotion: { ...editorState.project.procedural.secondaryMotion, enabled: true, damping: Number(event.target.value) } }))} aria-label="Secondary damping" />
                      <Input className="h-7 text-xs" type="number" step="0.01" value={editorState.project.procedural.secondaryMotion.velocityInfluence} onChange={(event) => runCommand(createUpdateProceduralCommand({ secondaryMotion: { ...editorState.project.procedural.secondaryMotion, enabled: true, velocityInfluence: Number(event.target.value) } }))} aria-label="Secondary velocity influence" />
                      <Input className="h-7 text-xs" type="number" step="0.01" value={editorState.project.procedural.secondaryMotion.gravityInfluence} onChange={(event) => runCommand(createUpdateProceduralCommand({ secondaryMotion: { ...editorState.project.procedural.secondaryMotion, enabled: true, gravityInfluence: Number(event.target.value) } }))} aria-label="Secondary gravity influence" />
                      <Input className="h-7 text-xs" type="number" step="0.01" value={editorState.project.procedural.secondaryMotion.windInfluence} onChange={(event) => runCommand(createUpdateProceduralCommand({ secondaryMotion: { ...editorState.project.procedural.secondaryMotion, enabled: true, windInfluence: Number(event.target.value) } }))} aria-label="Secondary wind influence" />
                      <Input className="h-7 text-xs" type="number" step="1" value={editorState.project.procedural.secondaryMotion.maxOffset} onChange={(event) => runCommand(createUpdateProceduralCommand({ secondaryMotion: { ...editorState.project.procedural.secondaryMotion, enabled: true, maxOffset: Number(event.target.value) } }))} aria-label="Secondary max offset" />
                    </div>
                  </div>
                  <div className="grid gap-1 rounded-md border p-2">
                    <Label className="text-xs">Squash / Stretch</Label>
                    <div className="grid grid-cols-2 gap-1">
                      <Select value={editorState.project.procedural.squashStretch.targetBone} onValueChange={(targetBone) => runCommand(createUpdateProceduralCommand({ squashStretch: { ...editorState.project.procedural.squashStretch, enabled: true, targetBone } }))}>
                        <SelectTrigger className="h-7" aria-label="Squash target bone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {editorState.project.hierarchy.map((boneId) => (
                              <SelectItem key={boneId} value={boneId}>{boneId}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Input className="h-7 text-xs" value={squashCondition} onChange={(event) => setSquashCondition(event.target.value)} aria-label="Squash condition" />
                      <Input className="h-7 text-xs" type="number" step="0.01" value={squashScaleX} onChange={(event) => setSquashScaleX(Number(event.target.value))} aria-label="Squash scale x" />
                      <Input className="h-7 text-xs" type="number" step="0.01" value={squashScaleY} onChange={(event) => setSquashScaleY(Number(event.target.value))} aria-label="Squash scale y" />
                      <Input className="h-7 text-xs" type="number" step="0.01" value={squashDuration} onChange={(event) => setSquashDuration(Number(event.target.value))} aria-label="Squash duration" />
                      <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createUpdateProceduralCommand({ squashStretch: { ...editorState.project.procedural.squashStretch, enabled: true, rules: [...editorState.project.procedural.squashStretch.rules.filter((rule) => rule.condition !== squashCondition), { condition: squashCondition, scaleX: squashScaleX, scaleY: squashScaleY, duration: squashDuration }] } }))}>
                        Set Rule
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-1 rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">Foot IK</Label>
                      <Button size="sm" type="button" variant={editorState.project.procedural.footIk.enabled ? "default" : "outline"} onClick={() => runCommand(createUpdateProceduralCommand({ footIk: { ...editorState.project.procedural.footIk, enabled: !editorState.project.procedural.footIk.enabled } }))}>
                        {editorState.project.procedural.footIk.enabled ? "On" : "Off"}
                      </Button>
                    </div>
                    <Input className="h-7 text-xs" value={proceduralFeetText} onChange={(event) => setProceduralFeetText(event.target.value)} aria-label="Foot IK feet" />
                    <div className="grid grid-cols-2 gap-1">
                      <Input className="h-7 text-xs" type="number" step="1" value={editorState.project.procedural.footIk.maxCorrection} onChange={(event) => runCommand(createUpdateProceduralCommand({ footIk: { ...editorState.project.procedural.footIk, enabled: true, maxCorrection: Number(event.target.value) } }))} aria-label="Foot IK max correction" />
                      <Input className="h-7 text-xs" type="number" step="0.01" value={editorState.project.procedural.footIk.blend} onChange={(event) => runCommand(createUpdateProceduralCommand({ footIk: { ...editorState.project.procedural.footIk, enabled: true, blend: Number(event.target.value) } }))} aria-label="Foot IK blend" />
                    </div>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createUpdateProceduralCommand({ footIk: { ...editorState.project.procedural.footIk, enabled: true, feet: parseCsvIds(proceduralFeetText) } }))}>
                      Apply Feet
                    </Button>
                    <p className="text-xs text-muted-foreground">{editorState.project.procedural.footIk.footChains.map((chain) => `${chain.thighBone}/${chain.shinBone}/${chain.footBone}`).join(", ")}</p>
                  </div>
                </CardContent>
              </InspectorSection>
              <InspectorSection title="Profiler">
                <CardContent className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Preview quality: {previewQuality}</p>
                  <p className="text-xs text-muted-foreground">Update {(profilerStats?.avgUpdateMs ?? 0).toFixed(2)}ms / Render {(profilerStats?.avgRenderMs ?? 0).toFixed(2)}ms</p>
                  <p className="text-xs text-muted-foreground">Max {(profilerStats?.maxUpdateMs ?? 0).toFixed(2)}ms / frames {profilerStats?.frames ?? 0}</p>
                  <p className={profilerBudget?.ok === false ? "text-xs text-amber-600" : "text-xs text-muted-foreground"}>Budget {profilerBudget ? (profilerBudget.ok ? "ok" : profilerBudget.issues.join(", ")) : "waiting"}</p>
                  <p className="text-xs text-muted-foreground">Platformer {platformerDebug.state.animationState} / {platformerDebug.state.debug.activeColliders.length} colliders</p>
                  <p className="text-xs text-muted-foreground">Camera {platformerDebug.state.cameraX.toFixed(0)}, {platformerDebug.state.cameraY.toFixed(0)} / abs {platformerDebug.params.absSpeed}</p>
                </CardContent>
              </InspectorSection>
            </div>
          </ScrollArea>
        </aside>
      </section>

      <Card className="relative grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-none border-0 border-t py-0 ring-0" aria-label="Timeline and dopesheet">
        <div
          className="absolute left-0 top-0 z-30 h-2 w-full touch-none cursor-row-resize bg-transparent hover:bg-primary/30"
          role="separator"
          aria-label="Resize timeline panel"
          aria-orientation="horizontal"
          onPointerDown={(event) => startPanelResize("timeline", event)}
          onMouseDown={(event) => startPanelResize("timeline", event)}
        />
        <CardHeader className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden px-2.5 pb-1 pt-2">
          <div className="min-w-0 overflow-x-auto pb-1">
            <div className="flex w-max min-w-full items-center gap-2">
            <CardTitle className="text-sm">Timeline</CardTitle>
            {emptyTimelineTracks.length > 0 ? (
              <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700" title={`${emptyTimelineTracks.join(", ")} will stay editor-only until a keyframe is added`}>
                {emptyTimelineTracks.length} draft track
              </Badge>
            ) : null}
            <Input className="h-7 w-24 text-xs" value={newClipId} onChange={(event) => setNewClipId(event.target.value)} aria-label="New clip id" />
            <Input className="h-7 w-16 text-xs" type="number" step="0.1" value={newClipDuration} onChange={(event) => setNewClipDuration(Number(event.target.value))} aria-label="New clip duration" />
            <Button size="sm" type="button" variant={newClipLoop ? "default" : "outline"} onClick={() => setNewClipLoop((value) => !value)}>
              Loop
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={!newClipId.trim()}
              onClick={() => {
                const clipId = newClipId.trim();
                setTimelineAuthorClipId(clipId);
                runCommand(createAnimationClipCommand(clipId, clipId, newClipDuration, newClipLoop));
              }}
            >
              Create Clip
            </Button>
            <Select value={activeClip?.id ?? ""} onValueChange={(clipId) => {
              setTimelineAuthorClipId(clipId);
              runCommand(createSetTimelineSelectionCommand(clipId, []));
            }} disabled={!activeClip}>
              <SelectTrigger className="h-7 w-28" aria-label="Timeline clip">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {clipIds.map((clipId) => (
                    <SelectItem key={clipId} value={clipId}>
                      {editorState.project.animations[clipId]?.name ?? clipId}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Select value={timelineTargetId} onValueChange={setTimelineTargetId}>
                <SelectTrigger className="h-7 w-28" aria-label="Timeline target bone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {editorState.project.hierarchy.map((boneId) => (
                      <SelectItem key={boneId} value={boneId}>{boneId}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select value={timelineProperty} onValueChange={setTimelineProperty}>
                <SelectTrigger className="h-7 w-24" aria-label="Timeline property">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {["x", "y", "rotation", "scaleX", "scaleY"].map((property) => (
                      <SelectItem key={property} value={property}>{property}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button size="sm" type="button" variant="outline" disabled={!activeClip} onClick={() => activeClip && runCommand(createAddAnimationTrackCommand(activeClip.id, timelineTrackId))}>
                Add Track
              </Button>
              <Input className="h-7 w-16 text-xs" type="number" step="0.1" value={timelineCurrentTime} onChange={(event) => setTimelineCurrentTime(Number(event.target.value))} aria-label="Timeline current time" />
              <Input className="h-7 w-16 text-xs" type="number" step="0.1" value={timelineKeyValue} onChange={(event) => setTimelineKeyValue(Number(event.target.value))} aria-label="Timeline key value" />
              <Button size="sm" type="button" variant="outline" disabled={!activeClip} onClick={() => activeClip && runCommand(createSetKeyframeAtTimeCommand(activeClip.id, timelineTrackId, timelineCurrentTime, timelineKeyValue))}>
                Add Key At Time
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createAnimationClipCommand(`clip_${clipIds.length + 1}`, `Clip ${clipIds.length + 1}`, 1, true))}>
                Clip +
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => activeClip && runCommand(createReverseClipCommand(activeClip.id))} disabled={!activeClip}>
                Reverse
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => activeClip && runCommand(createRetimeClipCommand(activeClip.id, activeClip.duration + 0.12))} disabled={!activeClip}>
                Retime
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => activeClip && runCommand(createNormalizeLoopCommand(activeClip.id))} disabled={!activeClip}>
                Loop
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => activeClip && runCommand(createAddTimelineMarkerCommand(activeClip.id, { id: `${activeClip.id}-marker-${activeClip.markers.length}`, time: activeClip.duration * 0.5, label: "Breakdown", color: "#f59e0b" }))} disabled={!activeClip}>
                Marker
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => activeClip && runCommand(createAddTimelineEventCommand(activeClip.id, { id: `${activeClip.id}-event-${activeClip.events.length}`, time: activeClip.duration * 0.5, type: "cue", category: "debug" }))} disabled={!activeClip}>
                Event
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => addTimelineEventPreset("footstep", "audio", { foot: timelineTargetId.includes("Back") ? "back" : "front" })} disabled={!activeClip}>
                Footstep
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => addTimelineEventPreset("land", "gameplay", { strength: 1 })} disabled={!activeClip}>
                Land
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => addTimelineEventPreset("dust", "vfx", { side: timelineTargetId.includes("Back") ? "back" : "front" })} disabled={!activeClip}>
                Dust
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => addTimelineEventPreset("attackWindow", "gameplay", { phase: "active" }, 0.18)} disabled={!activeClip}>
                Attack
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => activeClip && runCommand(createSelectTrackKeysCommand(activeClip.id, timelineTrackId))} disabled={!activeClip}>
                Select Track
              </Button>
              <Button size="sm" type="button" variant="outline" disabled={!editorState.project.timeline.selectedKeyIds.length} onClick={() => runCommand(createScaleSelectedKeysCommand(1.25))}>
                Scale Keys
              </Button>
              <Button size="sm" type="button" variant="outline" disabled={!editorState.project.timeline.selectedKeyIds.length} onClick={() => runCommand(createDeleteSelectedKeysCommand())}>
                Delete Keys
              </Button>
              <Button size="sm" type="button" variant="outline" disabled={!editorState.project.timeline.selectedKeyIds.length} onClick={() => runCommand(createCopySelectedKeysCommand())}>
                Copy Keys
              </Button>
              <Button size="sm" type="button" variant="outline" disabled={!activeClip || !editorState.project.timeline.keyClipboard.length} onClick={() => activeClip && runCommand(createPasteKeysCommand(activeClip.id, activeClip.duration * 0.5))}>
                Paste Keys
              </Button>
              <Badge variant={editorState.project.timeline.autoKey ? "default" : "outline"}>Auto-key {editorState.project.timeline.autoKey ? "on" : "off"}</Badge>
            </div>
            </div>
          </div>
          <Badge variant="outline">00:00 / 01:12</Badge>
        </CardHeader>
        <CardContent className="grid min-h-0 gap-1 overflow-auto px-2.5 pb-2">
          {selectedTimelineKey ? (
            <div className="mb-1 flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{selectedTimelineTrackId}</span>
              <Input className="h-7 w-20 text-xs" type="number" step="0.01" value={selectedTimelineKey.time} onChange={(event) => activeClip && runCommand(createUpdateKeyframeCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, { time: Number(event.target.value) }))} aria-label="Selected key time" />
              <Input className="h-7 w-20 text-xs" type="number" step="0.01" value={selectedTimelineKey.value} onChange={(event) => activeClip && runCommand(createUpdateKeyframeCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, { value: Number(event.target.value) }))} aria-label="Selected key value" />
            </div>
          ) : null}
          {activeClip ? (
            <div className="grid min-h-7 grid-cols-[140px_minmax(420px,1fr)] items-center rounded-md border border-emerald-200 bg-emerald-50" aria-label="Timeline event lane">
              <span className="truncate pl-2 text-xs font-medium text-emerald-800">events</span>
              <div className="relative h-full min-h-7 overflow-hidden rounded-r-md">
                <span className="absolute bottom-0 top-0 z-10 w-px bg-primary/50" style={{ left: `${(clampPanelSize(timelineCurrentTime, 0, activeClip.duration) / Math.max(0.001, activeClip.duration)) * 100}%` }} />
                {activeClip.events.map((timelineEvent) => {
                  const duration = Math.max(0.001, activeClip.duration);
                  const left = (clampPanelSize(timelineEvent.time, 0, activeClip.duration) / duration) * 100;
                  const width = timelineEvent.duration ? Math.max(1, (timelineEvent.duration / duration) * 100) : 0;

                  return (
                    <Tooltip key={timelineEvent.id}>
                      <TooltipTrigger asChild>
                        <button
                          className="absolute top-1/2 z-20 h-4 min-w-4 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-emerald-700 bg-emerald-500 text-[9px] text-white"
                          style={{ left: `${left}%`, width: width ? `${width}%` : undefined }}
                          type="button"
                          aria-label={`Delete event ${timelineEvent.id}`}
                          onClick={() => runCommand(createDeleteTimelineEventCommand(activeClip.id, timelineEvent.id))}
                        >
                          {timelineEvent.type.slice(0, 1)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="pointer-events-none">
                        {timelineEvent.category ?? "debug"}:{timelineEvent.type}@{timelineEvent.time.toFixed(2)}{timelineEvent.duration ? ` +${timelineEvent.duration.toFixed(2)}` : ""}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ) : null}
          {activeClip ? visibleTimelineTracks.map((track) => {
            const trackKeys = activeClip.tracks[track] ?? [];
            const duration = Math.max(0.001, activeClip.duration);
            const playheadTime = clampPanelSize(timelineCurrentTime, 0, activeClip.duration);

            return (
              <div className="grid min-h-6 grid-cols-[140px_minmax(420px,1fr)] items-center rounded-md bg-muted" key={track}>
                <span className="truncate pl-2 text-xs text-muted-foreground">{track}</span>
                <div className="relative h-full min-h-6 overflow-hidden rounded-r-md" aria-label={`Timeline track ${track}`}>
                  <span className="absolute bottom-0 top-0 z-10 w-px bg-primary/50" style={{ left: `${(playheadTime / duration) * 100}%` }} />
                  {trackKeys.map((keyframe) => {
                    const dragging = dragTimelineKey?.clipId === activeClip.id && dragTimelineKey.trackId === track && dragTimelineKey.keyframeId === keyframe.id;
                    const displayedTime = dragging ? dragTimelineKey.time : keyframe.time;
                    const selected = editorState.project.timeline.selectedClipId === activeClip.id && editorState.project.timeline.selectedKeyIds.includes(keyframe.id);

                    return (
                      <Tooltip key={keyframe.id}>
                        <TooltipTrigger asChild>
                          <button
                            className={`absolute top-1/2 z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-primary touch-none ${selected ? "ring-2 ring-primary/30" : ""}`}
                            style={{ left: `${(clampPanelSize(displayedTime, 0, activeClip.duration) / duration) * 100}%` }}
                            type="button"
                            aria-label={`Key ${keyframe.id} at ${displayedTime.toFixed(3)}`}
                            onMouseDown={(event) => startTimelineKeyDrag(event, activeClip.id, track, keyframe.id, keyframe.time, activeClip.duration)}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="pointer-events-none">{keyframe.id}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {activeClip.markers.map((marker) => (
                    <span className="absolute top-0 z-10 h-full w-px bg-amber-500" key={marker.id} style={{ left: `${(marker.time / duration) * 100}%` }} title={marker.label} />
                  ))}
                  {activeClip.events.map((timelineEvent) => (
                    <span className="absolute top-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-emerald-500" key={timelineEvent.id} style={{ left: `${(timelineEvent.time / duration) * 100}%` }} title={timelineEvent.type} />
                  ))}
                </div>
              </div>
            );
          }) : <p className="text-xs text-muted-foreground">No animation clip selected.</p>}
        </CardContent>
      </Card>
    </main>
  );
}

interface ShapeViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function getShapeViewBox(points: readonly (readonly [number, number])[]): ShapeViewBox {
  if (!points.length) {
    return { x: -64, y: -64, width: 128, height: 128 };
  }
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const padding = Math.max(width, height) * 0.15 + 12;
  return {
    x: minX - padding,
    y: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
}

function sampleCubicBezierY(t: number, curve: readonly [number, number, number, number]): number {
  const u = 1 - t;
  return u * u * u * 0 + 3 * u * u * t * curve[1] + 3 * u * t * t * curve[3] + t * t * t;
}

function sampleBlendTreeWeights(blendTree: BlendTree1D, value: number): readonly { readonly clipId: string; readonly weight: number }[] {
  const children = [...blendTree.children].sort((left, right) => left.threshold - right.threshold);
  if (!children.length) {
    return [];
  }
  if (value <= children[0]!.threshold) {
    return [{ clipId: children[0]!.clipId, weight: 1 }];
  }
  const last = children[children.length - 1]!;
  if (value >= last.threshold) {
    return [{ clipId: last.clipId, weight: 1 }];
  }
  for (let index = 0; index < children.length - 1; index += 1) {
    const lower = children[index]!;
    const upper = children[index + 1]!;
    if (value >= lower.threshold && value <= upper.threshold) {
      const weight = (value - lower.threshold) / Math.max(1, upper.threshold - lower.threshold);
      return [
        { clipId: lower.clipId, weight: Number((1 - weight).toFixed(3)) },
        { clipId: upper.clipId, weight: Number(weight.toFixed(3)) }
      ].filter((entry) => entry.weight > 0);
    }
  }
  return [{ clipId: last.clipId, weight: 1 }];
}

function getRigWorldPoints(project: EditorProjectState): Readonly<Record<string, readonly [number, number]>> {
  const points: Record<string, readonly [number, number]> = {};
  const visit = (boneId: string): readonly [number, number] => {
    const existing = points[boneId];
    if (existing) {
      return existing;
    }
    const local = project.bones[boneId] ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    const parentId = project.parents[boneId];
    const parent = parentId ? visit(parentId) : ([0, 0] as const);
    const point = [parent[0] + local.x, parent[1] + local.y] as const;
    points[boneId] = point;
    return point;
  };
  for (const boneId of project.hierarchy) {
    visit(boneId);
  }
  return points;
}

function getBoneTailPoint(project: EditorProjectState, boneId: string, rigPoints: Readonly<Record<string, readonly [number, number]>>): readonly [number, number] {
  const head = rigPoints[boneId] ?? ([0, 0] as const);
  const transform = project.bones[boneId] ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const length = defaultBoneTailLength * Math.max(0.15, Math.abs(transform.scaleY));
  return [Number((head[0] + Math.cos(transform.rotation) * length).toFixed(2)), Number((head[1] + Math.sin(transform.rotation) * length).toFixed(2))];
}

function countProceduralBoneRefs(project: EditorProjectState, boneId: string): number {
  const procedural = project.procedural;
  return (
    procedural.breathing.affectedBones.filter((id) => id === boneId).length +
    Object.keys(procedural.breathing.affectedBoneTransforms).filter((id) => id === boneId).length +
    (procedural.secondaryMotion.target === boneId ? 1 : 0) +
    (procedural.squashStretch.targetBone === boneId ? 1 : 0) +
    procedural.footIk.feet.filter((id) => id === boneId).length +
    procedural.footIk.footChains.reduce((count, chain) => count + [chain.footBone, chain.shinBone, chain.thighBone].filter((id) => id === boneId).length, 0)
  );
}

function svgPointFromEvent(event: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>, viewBox: ShapeViewBox): readonly [number, number] {
  return svgPointFromClient(event.currentTarget, event.clientX, event.clientY, viewBox);
}

function svgPointFromClient(svg: SVGSVGElement, clientX: number, clientY: number, viewBox: ShapeViewBox): readonly [number, number] {
  const rect = svg.getBoundingClientRect();
  const x = viewBox.x + ((clientX - rect.left) / Math.max(1, rect.width)) * viewBox.width;
  const y = viewBox.y + ((clientY - rect.top) / Math.max(1, rect.height)) * viewBox.height;
  return [Number(x.toFixed(2)), Number(y.toFixed(2))];
}
