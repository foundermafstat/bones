"use client";

import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from "react";
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
  createSetParentCommand,
  createBindProceduralPartCommand,
  createBindPartToBoneCommand,
  createEditPathPointCommand,
  createMirrorPathCommand,
  createSetPartDrawOrderCommand,
  createSetPartPathCommand,
  createSetPartPivotCommand,
  createAddAnimationTrackCommand,
  createApplyPoseCommand,
  createCopyPoseCommand,
  createDuplicatePoseCommand,
  createMirrorPoseCommand,
  createPastePoseCommand,
  createPoseFromCurrentCommand,
  createRenamePoseCommand,
  createUpdatePoseTagsCommand,
  createAddKeyframeCommand,
  createDeleteKeyframeCommand,
  createMoveKeyframeCommand,
  createChangeCurveCommand,
  createApplyCurvePresetCommand,
  createEditBezierHandlesCommand,
  createSetCurvePreviewCommand,
  createSetKeyframeTangentsCommand,
  createAddTimelineEventCommand,
  createAddTimelineMarkerCommand,
  createAnimationClipCommand,
  createCopySelectedKeysCommand,
  createNormalizeLoopCommand,
  createPasteKeysCommand,
  createReverseClipCommand,
  createRetimeClipCommand,
  createSetTimelineSelectionCommand,
  createSetBlendTreeCommand,
  createSetStateMachineParameterCommand,
  createSetStateMachinePreviewCommand,
  createSetTransitionConditionsCommand,
  createStateMachineStateCommand,
  createTransitionCommand,
  createUpdateTransitionCommand,
  createUpdateProceduralCommand,
  createUpdateKeyframeCommand,
  createEmptyEditorProject,
  executeCommand,
  initialEditorProject,
  markAutosaveSaved,
  redo,
  undo,
  type EditorProjectState,
  type EditorStateContainer
} from "./editorState";
import { createProjectExportBundle, EDITOR_DRAFT_KEY, loadDraft, parseImportedProject, saveDraft, serializeEditorProject, type ProjectExportBundle } from "./projectIo";
import { PixiPreview } from "./PixiPreview";
import { vectorizeSvgPart } from "./editorVectorImport";
import { createInitialControllerState, toAnimationParameters, updatePlatformerController } from "@bones/platformer-preview";
import type { QualityPresetName, RuntimeProfilerStats } from "@bones/runtime-pixi";

const modes = ["Rig", "Shape", "Pose", "Timeline", "Curve", "State Machine", "Procedural", "Preview"] as const;
type ProjectOrigin = "sample" | "empty" | "draft" | "imported";

const sampleProject = {
  tracks: ["body.scaleY", "head.y", "thighFront.rotation", "thighBack.rotation", "cloak.x"]
};

const previewClips = [
  { id: 0, name: "Idle" },
  { id: 1, name: "Walk" },
  { id: 2, name: "Jump" },
  { id: 3, name: "Fall" },
  { id: 4, name: "Land" }
] as const;

type EditorMode = (typeof modes)[number];
type ToolbarAction = {
  label: string;
  disabled?: boolean;
  variant?: "default" | "destructive";
  onClick?: () => void;
};

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <Label className="truncate text-xs text-muted-foreground">{label}</Label>
      <Input className="h-7 text-xs" readOnly value={value} />
    </div>
  );
}

export default function EditorPage() {
  const [mode, setMode] = useState<EditorMode>("Rig");
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [previewClipId, setPreviewClipId] = useState(0);
  const [previewQuality, setPreviewQuality] = useState<QualityPresetName>("medium");
  const [profilerStats, setProfilerStats] = useState<RuntimeProfilerStats | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<{ readonly index: number; readonly point: readonly [number, number] } | null>(null);
  const [dragBone, setDragBone] = useState<{ readonly boneId: string; readonly point: readonly [number, number] } | null>(null);
  const [selectedPoseId, setSelectedPoseId] = useState("idle_neutral");
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
  const [ioStatus, setIoStatus] = useState("ready");
  const [projectOrigin, setProjectOrigin] = useState<ProjectOrigin>("sample");
  const [lastExportBundle, setLastExportBundle] = useState<ProjectExportBundle | null>(null);
  const [editorState, setEditorState] = useState<EditorStateContainer>({
    project: initialEditorProject,
    history: { past: [], future: [] }
  });
  const selectedBone = editorState.project.selectedBoneId;
  const selectedTransform = editorState.project.bones[selectedBone] ?? editorState.project.bones.root ?? initialEditorProject.bones.body!;
  const selectedBoneMetadata = editorState.project.boneMetadata[selectedBone] ?? {};
  const rigPoints = useMemo(() => getRigWorldPoints(editorState.project), [editorState.project]);
  const displayedRigPoints = dragBone ? { ...rigPoints, [dragBone.boneId]: dragBone.point } : rigPoints;
  const rigViewBox = useMemo(() => getShapeViewBox(Object.values(displayedRigPoints)), [displayedRigPoints]);
  const partRows = useMemo(() => Object.values(editorState.project.parts).sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0)), [editorState.project.parts]);
  const selectedPart = editorState.project.parts[selectedPartId] ?? partRows.find((part) => part.boneId === selectedBone) ?? partRows[0];
  const childBoneCount = editorState.project.hierarchy.filter((boneId) => editorState.project.parents[boneId] === selectedBone).length;
  const boundPartCount = partRows.filter((part) => part.boneId === selectedBone).length;
  const boundTrackCount = Object.values(editorState.project.animations).reduce((count, clip) => count + Object.keys(clip.tracks).filter((trackId) => trackId.startsWith(`${selectedBone}.`)).length, 0);
  const shapePoints = dragPoint
    ? selectedPart?.points.map((point, index) => (index === dragPoint.index ? dragPoint.point : point)) ?? []
    : selectedPart?.points ?? [];
  const shapeViewBox = useMemo(() => getShapeViewBox(shapePoints), [shapePoints]);
  const selectedPoint = selectedPointIndex === null ? undefined : selectedPart?.points[selectedPointIndex];
  const selectedCommand = selectedPointIndex === null ? undefined : selectedPart?.pathCommands?.[selectedPointIndex];
  const selectedPathClosed = selectedPart?.pathCommands?.at(-1)?.type === "Z";
  const poseIds = Object.keys(editorState.project.poses);
  const selectedPose = editorState.project.poses[selectedPoseId] ?? (poseIds[0] ? editorState.project.poses[poseIds[0]] : undefined);
  const selectedPoseTagText = selectedPose?.tags.join(", ") ?? "";
  const clipIds = Object.keys(editorState.project.animations);
  const authorClip = editorState.project.animations[timelineAuthorClipId] ?? editorState.project.animations[editorState.project.timeline.selectedClipId];
  const activeClip = authorClip ?? (clipIds[0] ? editorState.project.animations[clipIds[0]] : undefined);
  const activeTrack = activeClip?.tracks["body.scaleY"] ?? [];
  const selectedKeyId = editorState.project.timeline.selectedKeyIds[0] ?? activeTrack[0]?.id ?? "";
  const timelineTrackId = `${timelineTargetId}.${timelineProperty}`;
  const selectedTimelineTrackId = activeClip ? Object.entries(activeClip.tracks).find(([, keys]) => keys.some((key) => key.id === selectedKeyId))?.[0] ?? timelineTrackId : timelineTrackId;
  const selectedTimelineKey = activeClip ? activeClip.tracks[selectedTimelineTrackId]?.find((key) => key.id === selectedKeyId) : undefined;
  const visibleTimelineTracks = sampleProject.tracks.slice(editorState.project.timeline.virtualWindow.startRow, editorState.project.timeline.virtualWindow.startRow + editorState.project.timeline.virtualWindow.rowCount);
  const exportFileEntries = useMemo(() => Object.entries(lastExportBundle?.files ?? {}), [lastExportBundle]);
  const previewLevel = useMemo(
    () => ({
      colliders: [
        { x: -120, y: 34, width: 260, height: 16, kind: "solid" as const },
        { x: 96, y: -42, width: 12, height: 76, kind: "wallJump" as const },
        { x: 150, y: 20, width: 36, height: 18, kind: "deathZone" as const }
      ],
      cameraZones: [{ x: -64, y: -96, width: 180, height: 120, kind: "solid" as const }],
      animationTriggers: [{ x: 96, y: -10, state: "wallSlide" }]
    }),
    []
  );
  const platformerDebug = useMemo(() => {
    const state = updatePlatformerController(createInitialControllerState(0, 0), { moveX: 1, jumpPressed: false }, 0.2, previewLevel);
    return { state, params: toAnimationParameters(state) };
  }, [previewLevel]);
  const runCommand = (command: Parameters<typeof executeCommand>[1]) => setEditorState((state) => executeCommand(state, command));
  useEffect(() => {
    setRenameBoneId(selectedBone);
    setNewBoneParentId(selectedBone);
  }, [selectedBone]);
  const replaceProject = (project: EditorProjectState, origin: ProjectOrigin, poseId = "") => {
    setEditorState({ project, history: { past: [], future: [] } });
    setProjectOrigin(origin);
    setSelectedPoseId(poseId);
    setSelectedPartId(Object.keys(project.parts)[0] ?? "");
    setSelectedPointIndex(null);
    setDragPoint(null);
    setDragBone(null);
  };
  const exportBundle = async () => {
    const bundle = createProjectExportBundle(editorState.project);
    setLastExportBundle(bundle);
    if (!bundle.validation.ok) {
      setIoStatus(bundle.validation.errors.join("; "));
      return;
    }
    const json = JSON.stringify(bundle.files, null, 2);
    await navigator.clipboard?.writeText(json);
    setIoStatus(`copied ${json.length} bytes / ${Object.keys(bundle.files).length} files`);
  };
  const copyExportFiles = async () => {
    if (!lastExportBundle?.validation.ok) {
      setIoStatus("run Export Bundle first");
      return;
    }
    const json = JSON.stringify(lastExportBundle.files, null, 2);
    await navigator.clipboard?.writeText(json);
    setIoStatus(`copied ${json.length} bytes / ${Object.keys(lastExportBundle.files).length} files`);
  };
  const copyExportFile = async (fileName: string) => {
    const contents = lastExportBundle?.files[fileName];
    if (!contents) {
      setIoStatus(`missing ${fileName}`);
      return;
    }
    await navigator.clipboard?.writeText(contents);
    setIoStatus(`copied ${fileName} (${contents.length} bytes)`);
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
      await navigator.clipboard?.writeText(json);
      setIoStatus(`copied source JSON (${json.length} bytes)`);
    } catch (error) {
      setIoStatus(error instanceof Error ? error.message : "source JSON validation error");
    }
  };
  const importFromClipboard = async () => {
    const text = await navigator.clipboard?.readText();
    const result = parseImportedProject(text ?? "");
    if (result.project) {
      replaceProject(result.project, "imported", Object.keys(result.project.poses)[0] ?? "");
    }
    setIoStatus(result.errors.length ? result.errors.join("; ") : "imported source JSON");
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
      const vectorPart = await vectorizeSvgPart(selectedPart);
      runCommand(createSetPartPathCommand(vectorPart.id, vectorPart.points, vectorPart.pathCommands, vectorPart.svgViewBox));
      const viewBox = vectorPart.svgViewBox ? vectorPart.svgViewBox.join(", ") : "none";
      setVectorizeSummary(`${vectorPart.pathCommands?.length ?? 0} commands / ${vectorPart.points.length} points / viewBox ${viewBox}`);
      setIoStatus("vectorized SVG part; importer uses the first SVG path only");
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
        { label: "Breathing", onClick: () => runCommand(createUpdateProceduralCommand({ breathing: { ...editorState.project.procedural.breathing, enabled: true, frequency: 1, amplitude: 1.2, affectedBones: ["body", "head", "cloak"] } })) },
        { label: "Foot IK", onClick: () => runCommand(createUpdateProceduralCommand({ footIk: { ...editorState.project.procedural.footIk, enabled: true, feet: ["footFront", "footBack"], maxCorrection: 8, blend: 0.75 } })) }
      ]
    },
    {
      label: "Project",
      actions: [
        { label: "New Project", onClick: () => { replaceProject(createEmptyEditorProject(), "empty"); setIoStatus("new empty project"); } },
        { label: "Load Sample", onClick: () => { replaceProject(initialEditorProject, "sample", "idle_neutral"); setIoStatus("sample loaded"); } },
        { label: "Reset Draft", onClick: () => { window.localStorage.removeItem(EDITOR_DRAFT_KEY); replaceProject(initialEditorProject, "sample", "idle_neutral"); setIoStatus("draft reset"); } },
        { label: "Save Draft", onClick: () => { saveDraft(editorState.project); setProjectOrigin("draft"); setIoStatus("draft saved"); } },
        { label: "Load", onClick: () => { const draft = loadDraft(); if (draft) { replaceProject(draft, "draft", Object.keys(draft.poses)[0] ?? ""); setIoStatus("draft loaded"); } else { setIoStatus("no draft found"); } } },
        { label: "Copy Source JSON", onClick: () => void copySourceJson() },
        { label: "Export Bundle", onClick: () => void exportBundle() },
        { label: "Import Clipboard", onClick: () => void importFromClipboard() }
      ]
    }
  ];
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
      ["Dirty", editorState.project.dirty ? editorState.project.dirtyParts.join(", ") : "clean"]
    ],
    [editorState.project.dirty, editorState.project.dirtyParts, ioStatus, mode, projectOrigin, selectedBone, selectedTransform]
  );

  return (
    <main className="grid h-dvh w-screen min-w-0 grid-rows-[84px_minmax(0,1fr)_118px] overflow-hidden bg-background text-foreground" aria-label="Bones editor shell">
      <header className="relative z-10 grid min-w-0 grid-rows-[44px_40px] border-b bg-card px-2.5">
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
      </header>

      <section className="grid min-h-0 min-w-0 grid-cols-[220px_minmax(360px,1fr)_320px]" aria-label="Editor workspace">
        <Card className="min-h-0 rounded-none border-0 border-r py-3 ring-0">
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
            <Badge variant="secondary">{mode}</Badge>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{previewClips.find((clip) => clip.id === previewClipId)?.name}</span>
              <Separator className="h-4" orientation="vertical" />
              <span>{previewPlaying ? "Playing" : "Paused"}</span>
            </div>
          </CardHeader>
          <CardContent className="relative min-h-0 flex-1 overflow-hidden bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:24px_24px] p-0" aria-label="PixiJS canvas viewport">
            <PixiPreview clipId={previewClipId} playing={previewPlaying} project={editorState.project} quality={previewQuality} showSkeleton={mode !== "Preview"} onProfilerStats={setProfilerStats} />
            {mode === "Rig" ? (
              <svg
                aria-label="Rig bone editor"
                className="absolute inset-0 z-10 size-full touch-none"
                viewBox={`${rigViewBox.x} ${rigViewBox.y} ${rigViewBox.width} ${rigViewBox.height}`}
                onPointerMove={(event) => {
                  if (dragBone) {
                    setDragBone({ boneId: dragBone.boneId, point: svgPointFromEvent(event, rigViewBox) });
                  }
                }}
                onPointerUp={() => {
                  if (dragBone) {
                    const parentId = editorState.project.parents[dragBone.boneId];
                    const parentPoint = parentId ? rigPoints[parentId] : [0, 0];
                    const current = editorState.project.bones[dragBone.boneId] ?? selectedTransform;
                    runCommand(
                      createSetBoneTransformCommand(dragBone.boneId, {
                        ...current,
                        x: dragBone.point[0] - (parentPoint?.[0] ?? 0),
                        y: dragBone.point[1] - (parentPoint?.[1] ?? 0)
                      })
                    );
                    setDragBone(null);
                  }
                }}
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
                  return (
                    <circle
                      cx={point[0]}
                      cy={point[1]}
                      fill={selected ? "#ffffff" : "#4f8cff"}
                      aria-label={`Bone ${boneId}`}
                      key={boneId}
                      r={selected ? 5 : 3.5}
                      stroke="#1b4dcc"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setEditorState((state) => ({ ...state, project: { ...state.project, selectedBoneId: boneId } }));
                        if (!editorState.project.boneMetadata[boneId]?.locked) {
                          setDragBone({ boneId, point });
                        }
                      }}
                    />
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
          </CardContent>
        </Card>

        <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-l bg-card p-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium">Inspector</h2>
            <Badge variant={editorState.project.dirty ? "destructive" : "outline"}>{editorState.project.dirty ? "Dirty" : "Clean"}</Badge>
          </div>
          <ScrollArea className="mt-2 min-h-0">
            <div className="grid grid-cols-2 gap-2 pr-2 max-[1180px]:grid-cols-1">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Transform</CardTitle>
                </CardHeader>
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
                  <p className="text-xs text-muted-foreground">Delete impact: {childBoneCount} children / {boundPartCount} parts / {boundTrackCount} tracks</p>
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
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetBoneMetadataCommand(selectedBone, { tags: [...(selectedBoneMetadata.tags ?? []), "default-pose"] }))}>
                      Tag
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetBoneMetadataCommand(selectedBone, { facing: selectedBoneMetadata.facing === -1 ? 1 : -1 }))}>
                      Facing
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Export Bundle</CardTitle>
                </CardHeader>
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
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Shape</CardTitle>
                </CardHeader>
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
                  {selectedPart?.type === "path" ? <p className="text-xs text-amber-600">SVG importer uses the first path only; groups and masks are ignored.</p> : null}
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
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Parts</CardTitle>
                </CardHeader>
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
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Constraints</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-1">
                  <p className="text-xs text-muted-foreground">{editorState.project.procedural.footIk.footChains.map((chain) => `${chain.thighBone ?? "?"}/${chain.shinBone ?? "?"}/${chain.footBone}`).join(", ")}</p>
                  <p className="text-xs text-muted-foreground">max {editorState.project.procedural.footIk.maxCorrection}px / blend {editorState.project.procedural.footIk.blend}</p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Pose Library</CardTitle>
                </CardHeader>
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
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Curve</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <p className="line-clamp-2 text-xs text-muted-foreground">{activeTrack.map((key) => `${key.id}: ${key.interpolation}`).join(", ")}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(["easeIn", "easeOut", "easeInOut", "spring", "overshoot", "anticipation"] as const).map((preset) => (
                      <Button key={preset} size="sm" type="button" variant="outline" disabled={!activeClip || !selectedKeyId} onClick={() => activeClip && runCommand(createApplyCurvePresetCommand(activeClip.id, "body.scaleY", selectedKeyId, preset))}>
                        {preset}
                      </Button>
                    ))}
                    <Button size="sm" type="button" variant="outline" disabled={!activeClip || !selectedKeyId} onClick={() => activeClip && runCommand(createEditBezierHandlesCommand(activeClip.id, "body.scaleY", selectedKeyId, [0.18, 0.92, 0.22, 1]))}>
                      Handles
                    </Button>
                    <Button size="sm" type="button" variant="outline" disabled={!activeClip || !selectedKeyId} onClick={() => activeClip && runCommand(createSetKeyframeTangentsCommand(activeClip.id, "body.scaleY", selectedKeyId, -0.2, 0.35))}>
                      Tangents
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
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
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>State Machine</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  <p className="line-clamp-2 text-xs text-muted-foreground">{editorState.project.stateMachine.transitions.map((transition) => `${transition.fromStateId}->${transition.toStateId}`).join(", ")}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{Object.keys(editorState.project.stateMachine.parameters).join(", ")}</p>
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createStateMachineStateCommand({ id: "run", clipId: "walk", tags: ["locomotion"] }))}>
                      State +
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createTransitionCommand({ id: "walk-run", fromStateId: "walk", toStateId: "run", duration: 0.18, easing: "easeOut", priority: 1, canInterrupt: true, syncMode: "phaseMatch", conditions: [{ parameter: "absSpeed", op: ">", value: 120 }] }))}>
                      Link +
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createUpdateTransitionCommand("idle-walk", { easing: "easeInOut", duration: 0.22 }))}>
                      Ease
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetTransitionConditionsCommand("idle-walk", [{ parameter: "absSpeed", op: ">", value: 10 }]))}>
                      Condition
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetStateMachineParameterCommand("absSpeed", 96))}>
                      Param
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetBlendTreeCommand("locomotion", { type: "1d", parameter: "absSpeed", children: [{ threshold: 0, clipId: "idle" }, { threshold: 80, clipId: "walk" }, { threshold: 150, clipId: "walk" }] }))}>
                      Blend 1D
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createSetStateMachinePreviewCommand("idle", "walk", Math.min(1, editorState.project.stateMachine.preview.weight + 0.1)))}>
                      Preview
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {editorState.project.stateMachine.preview.fromStateId}
                    {"->"}
                    {editorState.project.stateMachine.preview.toStateId} {editorState.project.stateMachine.preview.weight.toFixed(1)}
                  </p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Procedural</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Breathing {editorState.project.procedural.breathing.frequency} Hz</p>
                  <p className="text-xs text-muted-foreground">Cloak stiffness {editorState.project.procedural.secondaryMotion.stiffness} / wind {editorState.project.procedural.secondaryMotion.windInfluence}</p>
                  <p className="text-xs text-muted-foreground">Foot IK {editorState.project.procedural.footIk.enabled ? "on" : "off"}</p>
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createUpdateProceduralCommand({ inputs: { ...editorState.project.procedural.inputs, velocityX: 120, velocityY: 18, wind: 0.4 } }))}>
                      Velocity
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createUpdateProceduralCommand({ secondaryMotion: { ...editorState.project.procedural.secondaryMotion, gravityInfluence: 0.22, windInfluence: 0.18, maxOffset: 18 } }))}>
                      Cloak Lag
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createUpdateProceduralCommand({ squashStretch: { ...editorState.project.procedural.squashStretch, rules: [...editorState.project.procedural.squashStretch.rules, { condition: "damageHit", scaleX: 1.08, scaleY: 0.9, duration: 0.1 }] } }))}>
                      Squash Rule
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => runCommand(createUpdateProceduralCommand({ footIk: { ...editorState.project.procedural.footIk, enabled: true, maxCorrection: 10, blend: 0.85 } }))}>
                      IK Tune
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Profiler</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Preview quality: {previewQuality}</p>
                  <p className="text-xs text-muted-foreground">Update {(profilerStats?.avgUpdateMs ?? 0).toFixed(2)}ms / Render {(profilerStats?.avgRenderMs ?? 0).toFixed(2)}ms</p>
                  <p className="text-xs text-muted-foreground">Max {(profilerStats?.maxUpdateMs ?? 0).toFixed(2)}ms / frames {profilerStats?.frames ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Platformer {platformerDebug.state.animationState} / {platformerDebug.state.debug.activeColliders.length} colliders</p>
                  <p className="text-xs text-muted-foreground">Camera {platformerDebug.state.cameraX.toFixed(0)}, {platformerDebug.state.cameraY.toFixed(0)} / abs {platformerDebug.params.absSpeed}</p>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </aside>
      </section>

      <Card className="min-w-0 rounded-none border-0 border-t py-2 ring-0" aria-label="Timeline and dopesheet">
        <CardHeader className="flex flex-row items-center justify-between px-2.5 py-0">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="text-sm">Timeline</CardTitle>
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
              <Button size="sm" type="button" variant="outline" disabled={!activeClip} onClick={() => activeClip && runCommand(createAddKeyframeCommand(activeClip.id, timelineTrackId, { id: `${timelineTrackId}-${timelineCurrentTime}`, time: timelineCurrentTime, value: timelineKeyValue, interpolation: "linear" }))}>
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
              <Button size="sm" type="button" variant="outline" onClick={() => activeClip && runCommand(createAddTimelineEventCommand(activeClip.id, { id: `${activeClip.id}-event-${activeClip.events.length}`, time: activeClip.duration * 0.5, type: "cue" }))} disabled={!activeClip}>
                Event
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
          <Badge variant="outline">00:00 / 01:12</Badge>
        </CardHeader>
        <CardContent className="mt-1 grid gap-1 px-2.5">
          {selectedTimelineKey ? (
            <div className="mb-1 flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{selectedTimelineTrackId}</span>
              <Input className="h-7 w-20 text-xs" type="number" step="0.01" value={selectedTimelineKey.time} onChange={(event) => activeClip && runCommand(createUpdateKeyframeCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, { time: Number(event.target.value) }))} aria-label="Selected key time" />
              <Input className="h-7 w-20 text-xs" type="number" step="0.01" value={selectedTimelineKey.value} onChange={(event) => activeClip && runCommand(createUpdateKeyframeCommand(activeClip.id, selectedTimelineTrackId, selectedTimelineKey.id, { value: Number(event.target.value) }))} aria-label="Selected key value" />
            </div>
          ) : null}
          {activeClip ? visibleTimelineTracks.map((track, index) => (
            <div className="relative grid min-h-[17px] grid-cols-[140px_1fr] items-center rounded-md bg-muted" key={track}>
              <span className="truncate pl-2 text-xs text-muted-foreground">{track}</span>
              {(activeClip.tracks[track] ?? []).map((keyframe) => (
                <Tooltip key={keyframe.id}>
                  <TooltipTrigger asChild>
                    <button
                      className="absolute top-[5px] size-[7px] rounded-full bg-primary"
                      style={{ left: `${(keyframe.time / activeClip.duration) * 100}%` }}
                      type="button"
                      aria-label={`Key ${keyframe.id}`}
                      onClick={() => runCommand(createSetTimelineSelectionCommand(activeClip.id, [keyframe.id]))}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{keyframe.id}</TooltipContent>
                </Tooltip>
              ))}
              {activeClip.markers.map((marker) => (
                <span className="absolute top-0 h-[17px] w-px bg-amber-500" key={marker.id} style={{ left: `${(marker.time / activeClip.duration) * 100}%` }} title={marker.label} />
              ))}
              {activeClip.events.map((event) => (
                <span className="absolute top-[2px] size-[5px] rotate-45 bg-emerald-500" key={event.id} style={{ left: `${(event.time / activeClip.duration) * 100}%` }} title={event.type} />
              ))}
              <span className="absolute top-[5px] size-[7px] rounded-full bg-primary" style={{ left: `${52 + index * 5}%` }} />
            </div>
          )) : <p className="text-xs text-muted-foreground">No animation clip selected.</p>}
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

function svgPointFromEvent(event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>, viewBox: ShapeViewBox): readonly [number, number] {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = viewBox.x + ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewBox.width;
  const y = viewBox.y + ((event.clientY - rect.top) / Math.max(1, rect.height)) * viewBox.height;
  return [Number(x.toFixed(2)), Number(y.toFixed(2))];
}
