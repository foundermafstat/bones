"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Bone,
  Cat,
  CircleDot,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  Hand,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Minus,
  MousePointer2,
  PenLine,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Settings2,
  Smile,
  Undo2,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { QualityPresetName } from "@bones/runtime-pixi";
import type { MeshShape, MeshVertexSkin } from "@bones/schema";
import {
  createDefaultEditorIkChains,
  createAddJointCommand,
  createBoneGroupCommand,
  createConnectJointsCommand,
  createEditorAppearance,
  createGroupedCommand,
  createClearPartDeformKeysCommand,
  createMoveKeyframeCommand,
  hasAnimatedDrawOrderTracks,
  createSetActiveSkinCommand,
  createSetBoneTransformCommand,
  createSetBoneMetadataCommand,
  createSetBoneTransformsCommand,
  createSetMeshSkinCommand,
  createSetMeshVertexCommand,
  createSetPartMeshCommand,
  createSetKeyframeAtTimeCommand,
  createReplaceKeyframeRangeCommand,
  createSetTimelineAutoKeyCommand,
  createSetVisualSlotOrderCommand,
  createSetVisualSlotBoneCommand,
  createSetActiveBoneGroupCommand,
  createSkinCommand,
  createUpdateIkChainCommand,
  createUpdateBoneGroupCommand,
  createUpdatePartTransformCommand,
  createUpdateProceduralCommand,
  createMoveBoneToGroupCommand,
  type BoneTransform,
  type EditorCommand,
  type EditorIkChain,
  type EditorProjectState,
  type EditorVisualSlot,
  type Keyframe
} from "./editorState";
import { PixiPreview } from "./PixiPreview";
import { addMeshTriangle, addMeshVertex, createAttachmentMesh, removeMeshTriangle, removeMeshVertex, triangulateMesh } from "./meshAuthoring";
import type { ProjectExportBundle } from "./projectIo";
import type { RemoteProjectSummary } from "./projectPersistence";

type StudioSection = "Build" | "Animate" | "Test" | "Export";
type AdvancedMode = "Rig" | "Shape" | "Pose" | "Timeline" | "Curve" | "State Machine" | "Procedural" | "Preview";
type StudioWorkspace = "Select" | "Skeleton" | "Artwork" | "Face" | "Pose" | "Preview" | "Advanced";
type TrackFilter = "all" | "selected";
type SkeletonTool = "select" | "joint" | "bone" | "pan";
type ArtworkMode = "place" | "bind" | "mesh" | "weights" | "deform";

interface TimelineViewportPreferences {
  readonly height: number;
  readonly heightMode: "auto" | "manual";
  readonly zoomByClip: Readonly<Record<string, number>>;
  readonly filter: TrackFilter;
  readonly collapsedGroups: Readonly<Record<string, boolean>>;
  readonly collapsedBones: Readonly<Record<string, boolean>>;
}

interface StudioUiPreferences {
  readonly timeline: TimelineViewportPreferences;
  readonly inspectorSections: Readonly<Record<string, boolean>>;
}

interface StudioEditorProps {
  readonly project: EditorProjectState;
  readonly playing: boolean;
  readonly clipId: string;
  readonly currentTime: number;
  readonly quality: QualityPresetName;
  readonly ioStatus: string;
  readonly remoteStatus: string;
  readonly folderStatus: string;
  readonly remoteConflictVersion: number | null;
  readonly remoteProjects: readonly RemoteProjectSummary[];
  readonly characterLibraryStatus: string;
  readonly lastExportBundle: ProjectExportBundle | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onRunCommand: (command: EditorCommand) => void;
  readonly onSelectBone: (boneId: string) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onClipChange: (clipId: string) => void;
  readonly onCurrentTimeChange: (time: number) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSave: () => void;
  readonly onConnectFolder: () => void;
  readonly onNewProject: () => void;
  readonly onCreateMiloReporter: () => void;
  readonly onOpenRemoteConflict: () => void;
  readonly onSaveConflictAsNew: () => void;
  readonly onRestoreLatestRevision: () => void;
  readonly onRefreshRemoteProjects: () => void;
  readonly onLoadRemoteProject: (projectId: string) => void;
  readonly onExport: () => void;
  readonly onReplaceArtwork: (slotId: string, file: File) => void;
  readonly onOpenAdvanced: (mode?: AdvancedMode) => void;
  readonly onCloseAdvanced: () => void;
  readonly advancedMode: AdvancedMode;
  readonly advancedWorkspace?: ReactNode;
}

interface WorldBone {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

interface LayerGroup {
  readonly id: string;
  readonly name: string;
  readonly slots: readonly EditorVisualSlot[];
}

const studioSections: readonly StudioSection[] = ["Build", "Animate", "Test", "Export"];
const workspaceItems = [
  { label: "Select", icon: MousePointer2 },
  { label: "Skeleton", icon: Bone },
  { label: "Artwork", icon: ImageIcon },
  { label: "Face", icon: Smile },
  { label: "Pose", icon: Hand },
  { label: "Preview", icon: Eye }
] as const;

const studioUiPreferencesKey = "bones:studio-ui:v1";
const defaultStudioUiPreferences: StudioUiPreferences = {
  timeline: { height: 212, heightMode: "auto", zoomByClip: {}, filter: "all", collapsedGroups: {}, collapsedBones: {} },
  inspectorSections: {}
};

export function StudioEditor(props: StudioEditorProps) {
  const {
    project,
    playing,
    clipId,
    currentTime,
    quality,
    ioStatus,
    remoteStatus,
    folderStatus,
    remoteConflictVersion,
    remoteProjects,
    characterLibraryStatus,
    lastExportBundle,
    canUndo,
    canRedo,
    onRunCommand,
    onSelectBone,
    onPlayingChange,
    onClipChange,
    onCurrentTimeChange,
    onUndo,
    onRedo,
    onSave,
    onConnectFolder,
    onNewProject,
    onCreateMiloReporter,
    onOpenRemoteConflict,
    onSaveConflictAsNew,
    onRestoreLatestRevision,
    onRefreshRemoteProjects,
    onLoadRemoteProject,
    onExport,
    onReplaceArtwork,
    onOpenAdvanced,
    onCloseAdvanced,
    advancedMode,
    advancedWorkspace
  } = props;
  const [section, setSection] = useState<StudioSection>("Animate");
  const [workspace, setWorkspace] = useState<StudioWorkspace>("Pose");
  const [lastWorkspace, setLastWorkspace] = useState<Readonly<Record<StudioSection, StudioWorkspace>>>({ Build: "Artwork", Animate: "Pose", Test: "Preview", Export: "Select" });
  const [uiPreferences, setUiPreferences] = useState<StudioUiPreferences>(defaultStudioUiPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState(() => project.visualSlots.right_hand_1?.id ?? project.visualSlots.upperArmFrontShape?.id ?? "");
  const [selectedFaceSlotId, setSelectedFaceSlotId] = useState(() => project.visualSlots.eyes?.id ?? project.visualSlots.mouth?.id ?? "eyes");
  const [speechEmotion, setSpeechEmotion] = useState("neutral");
  const [speechFrameStep, setSpeechFrameStep] = useState(4);
  const [selectedChainId, setSelectedChainId] = useState("");
  const [draggedSlotId, setDraggedSlotId] = useState("");
  const [draftBones, setDraftBones] = useState<Readonly<Record<string, BoneTransform>> | null>(null);
  const [ikTarget, setIkTarget] = useState<readonly [number, number] | null>(null);
  const [skeletonTool, setSkeletonTool] = useState<SkeletonTool>("select");
  const [boneStartJointId, setBoneStartJointId] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [artworkMode, setArtworkMode] = useState<ArtworkMode>("place");
  const [selectedMeshVertices, setSelectedMeshVertices] = useState<readonly number[]>([]);
  const [selectedTriangleIndex, setSelectedTriangleIndex] = useState(-1);
  const [meshDraftVertices, setMeshDraftVertices] = useState<readonly number[] | null>(null);
  const [weightBoneId, setWeightBoneId] = useState("");
  const [weightTest, setWeightTest] = useState(false);
  const [lockedWeightVertices, setLockedWeightVertices] = useState<Readonly<Record<string, boolean>>>({});
  const artworkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(studioUiPreferencesKey);
      if (stored) setUiPreferences(readStudioUiPreferences(JSON.parse(stored)));
    } catch {
      // Invalid or unavailable local preferences fall back to stable defaults.
    }
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    try {
      window.localStorage.setItem(studioUiPreferencesKey, JSON.stringify(uiPreferences));
    } catch {
      // Editor UI preferences are optional and never block authoring.
    }
  }, [preferencesReady, uiPreferences]);

  const fallbackAppearance = useMemo(() => createEditorAppearance(project.parts), [project.parts]);
  const hasSlotModel = Object.keys(project.visualSlots).length > 0;
  const slotModelBlocked = !hasSlotModel && hasAnimatedDrawOrderTracks(project);
  const visualSlots = hasSlotModel ? project.visualSlots : fallbackAppearance.visualSlots;
  const skins = hasSlotModel && Object.keys(project.skins).length ? project.skins : fallbackAppearance.skins;
  const activeSkinId = skins[project.activeSkinId] ? project.activeSkinId : Object.keys(skins)[0] ?? "default";
  const activeSkin = skins[activeSkinId];
  const orderedSlots = useMemo(() => Object.values(visualSlots).sort((a, b) => a.drawOrder - b.drawOrder), [visualSlots]);
  const faceSlots = useMemo(() => [visualSlots.eyes, visualSlots.mouth].filter((slot): slot is EditorVisualSlot => Boolean(slot)), [visualSlots]);
  const selectedFaceSlot = visualSlots[selectedFaceSlotId] ?? faceSlots[0];
  const layerGroups = useMemo(() => createLayerGroups(orderedSlots), [orderedSlots]);
  const selectedSlot = visualSlots[selectedSlotId] ?? orderedSlots[orderedSlots.length - 1];
  const selectedLayerGroup = layerGroups.find((group) => group.slots.some((slot) => slot.id === selectedSlot?.id));
  const selectedBoundBoneId = workspace === "Artwork" && selectedSlot?.boneId && project.bones[selectedSlot.boneId] ? selectedSlot.boneId : project.selectedBoneId;
  const defaultChains = useMemo(() => createDefaultEditorIkChains(project.bones), [project.bones]);
  const ikChains = Object.keys(project.ikChains).length ? project.ikChains : defaultChains;
  const selectedChain = ikChains[selectedChainId] ?? findChainForBone(project, ikChains, selectedBoundBoneId);
  const selectedBoneId = project.bones[selectedBoundBoneId] ? selectedBoundBoneId : selectedChain?.rootBoneId ?? project.hierarchy[0] ?? "";
  const activeClip = project.animations[clipId] ?? Object.values(project.animations)[0];
  const animationAuthoringActive = section === "Animate" || section === "Test" || workspace === "Face" || (workspace === "Artwork" && artworkMode === "deform");
  const sampledBones = useMemo(() => sampleEditorBones(project, animationAuthoringActive ? activeClip?.id : undefined, currentTime), [activeClip?.id, animationAuthoringActive, currentTime, project]);
  const weightTestBones = useMemo(() => {
    if (!weightTest) return sampledBones;
    const group = Object.values(project.topology.groups).find((item) => item.boneIds.includes(selectedBoundBoneId));
    const transforms = { ...sampledBones };
    (group?.boneIds ?? [selectedBoundBoneId]).forEach((boneId, index) => {
      if (transforms[boneId]) transforms[boneId] = { ...transforms[boneId]!, rotation: transforms[boneId]!.rotation + (index % 2 ? -0.24 : 0.24) };
    });
    return transforms;
  }, [project.topology.groups, sampledBones, selectedBoundBoneId, weightTest]);
  const visibleBones = draftBones ?? weightTestBones;
  const worldBones = useMemo(() => calculateWorldBones(project, visibleBones), [project, visibleBones]);
  const selectedTransform = visibleBones[selectedBoneId] ?? project.bones[selectedBoneId];
  const skeletonGroups = Object.values(project.topology.groups);
  const activeBoneGroup = project.topology.groups[project.topology.activeGroupId] ?? skeletonGroups[0];
  const selectedBoneGroup = skeletonGroups.find((group) => group.boneIds.includes(selectedBoneId));
  const viewBox = useMemo(() => calculateRigViewBox(project, worldBones), [project, worldBones]);
  const activeTracks = useMemo(() => activeClip ? Object.entries(activeClip.tracks) : [], [activeClip]);
  const selectedTimelineTargets = useMemo(
    () => workspace === "Face" && selectedFaceSlot ? [`slot:${selectedFaceSlot.id}`] : selectedChain ? [selectedChain.rootBoneId, selectedChain.middleBoneId, selectedChain.endBoneId] : [selectedBoneId],
    [selectedBoneId, selectedChain, selectedFaceSlot, workspace]
  );
  const timelineBoneGroups = useMemo(
    () => createTimelineBoneGroups(project, activeTracks),
    [activeTracks, project]
  );
  const selectTimelineBone = useCallback((boneId: string) => {
    if (boneId.startsWith("slot:")) {
      setSelectedFaceSlotId(boneId.slice("slot:".length));
      return;
    }
    onSelectBone(boneId);
    const boundSlot = orderedSlots.find((slot) => slot.boneId === boneId);
    if (boundSlot) setSelectedSlotId(boundSlot.id);
  }, [onSelectBone, orderedSlots]);

  const activateWorkspace = useCallback((nextWorkspace: StudioWorkspace) => {
    if (nextWorkspace === "Advanced") {
      setWorkspace("Advanced");
      onOpenAdvanced(advancedMode);
      return;
    }
    onCloseAdvanced();
    const nextSection: StudioSection = nextWorkspace === "Skeleton" || nextWorkspace === "Artwork"
      ? "Build"
      : nextWorkspace === "Pose" || nextWorkspace === "Face"
        ? "Animate"
        : nextWorkspace === "Preview"
          ? "Test"
          : section;
    setSection(nextSection);
    setWorkspace(nextWorkspace);
    setLastWorkspace((current) => ({ ...current, [nextSection]: nextWorkspace }));
  }, [advancedMode, onCloseAdvanced, onOpenAdvanced, section]);

  const activateSection = useCallback((nextSection: StudioSection) => {
    onCloseAdvanced();
    setSection(nextSection);
    setWorkspace(lastWorkspace[nextSection]);
  }, [lastWorkspace, onCloseAdvanced]);

  const selectSlot = (slot: EditorVisualSlot) => {
    setSelectedSlotId(slot.id);
    const chain = findChainForBone(project, ikChains, slot.boneId);
    if (chain) setSelectedChainId(chain.id);
    onSelectBone(chain?.rootBoneId ?? slot.boneId);
  };

  const setFaceAttachment = (partId: string) => {
    if (!activeClip || !selectedFaceSlot) return;
    onRunCommand(createSetKeyframeAtTimeCommand(activeClip.id, `slot:${selectedFaceSlot.id}.attachment`, currentTime, partId, "step"));
  };

  const generateSpeechStream = () => {
    if (!activeClip || !visualSlots.mouth) return;
    const partIds = ["mbp", "ai", "e", "ou", "fv"]
      .map((viseme) => `mouth_${speechEmotion}_${viseme}`)
      .filter((partId) => visualSlots.mouth!.partIds.includes(partId));
    if (!partIds.length) return;
    const step = Math.max(1, speechFrameStep) / frameRate;
    const startTime = Math.min(currentTime, activeClip.duration);
    const keyframes = [];
    for (let time = startTime, index = 0; time <= activeClip.duration + 0.000001; time += step, index += 1) {
      keyframes.push({ time: Math.min(time, activeClip.duration), value: partIds[index % partIds.length]!, interpolation: "step" as const });
    }
    onRunCommand(createReplaceKeyframeRangeCommand(activeClip.id, "slot:mouth.attachment", startTime, activeClip.duration, keyframes));
  };

  const commitBoneProperty = (property: keyof BoneTransform, value: number) => {
    if (!selectedTransform || isBoneEditingLocked(project, selectedBoneId)) return;
    if (section === "Animate" && activeClip) {
      onRunCommand(createSetKeyframeAtTimeCommand(activeClip.id, `${selectedBoneId}.${property}`, currentTime, value));
      return;
    }
    onRunCommand(createSetBoneTransformCommand(selectedBoneId, { ...project.bones[selectedBoneId]!, [property]: value }));
  };

  const startBoneDrag = (event: ReactPointerEvent<SVGCircleElement>, boneId: string) => {
    if (isBoneEditingLocked(project, boneId)) return;
    event.preventDefault();
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    onSelectBone(boneId);
    const baseBones = sampledBones;
    const parentId = project.parents[boneId];
    const parent = parentId ? worldBones[parentId] : undefined;
    const segmentLength = Math.max(0, project.boneLengths[boneId] ?? Math.hypot(baseBones[boneId]?.x ?? 0, baseBones[boneId]?.y ?? 0));
    const constrainedLocal = (local: readonly [number, number]): readonly [number, number] => {
      if (!parent || segmentLength <= 0.001) return local;
      const distance = Math.hypot(local[0], local[1]);
      if (distance <= 0.001) return [baseBones[boneId]!.x, baseBones[boneId]!.y];
      return [local[0] / distance * segmentLength, local[1] / distance * segmentLength];
    };
    const move = (clientX: number, clientY: number) => {
      const point = svgClientPoint(svg, clientX, clientY);
      const local = constrainedLocal(parent ? worldToLocal(point, parent) : point);
      setDraftBones({ ...baseBones, [boneId]: { ...baseBones[boneId]!, x: local[0], y: local[1] } });
    };
    const onMove = (moveEvent: PointerEvent) => move(moveEvent.clientX, moveEvent.clientY);
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const point = svgClientPoint(svg, upEvent.clientX, upEvent.clientY);
      const local = constrainedLocal(parent ? worldToLocal(point, parent) : point);
      setDraftBones(null);
      if (section === "Animate" && activeClip) {
        onRunCommand(createGroupedCommand("Move bone at frame", [
          createSetKeyframeAtTimeCommand(activeClip.id, `${boneId}.x`, currentTime, round(local[0])),
          createSetKeyframeAtTimeCommand(activeClip.id, `${boneId}.y`, currentTime, round(local[1]))
        ]));
      } else {
        onRunCommand(createSetBoneTransformCommand(boneId, { ...project.bones[boneId]!, x: round(local[0]), y: round(local[1]) }));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const selectOrConnectJoint = (event: ReactPointerEvent<SVGCircleElement>, jointId: string) => {
    const jointChain = findChainForBone(project, ikChains, jointId);
    if (workspace === "Pose" && jointChain?.endBoneId === jointId) {
      startIkDrag(event, jointChain);
      return;
    }
    if (workspace !== "Skeleton" || skeletonTool === "select") {
      startBoneDrag(event, jointId);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (skeletonTool !== "bone" || isBoneEditingLocked(project, jointId)) return;
    if (!boneStartJointId) {
      setBoneStartJointId(jointId);
      onSelectBone(jointId);
      return;
    }
    if (boneStartJointId === jointId) {
      setBoneStartJointId("");
      return;
    }
    const start = worldBones[boneStartJointId];
    const end = worldBones[jointId];
    if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 1) return;
    onRunCommand(createConnectJointsCommand(boneStartJointId, jointId, activeBoneGroup?.id ?? "skeleton"));
    setBoneStartJointId(jointId);
  };

  const placeSkeletonPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (workspace !== "Skeleton" || event.target !== event.currentTarget || (skeletonTool !== "joint" && skeletonTool !== "bone")) return;
    const point = svgClientPoint(event.currentTarget, event.clientX, event.clientY);
    const jointId = uniqueId("joint", project.hierarchy);
    if (skeletonTool === "joint") {
      onRunCommand(createAddJointCommand(jointId, point));
      return;
    }
    if (!boneStartJointId) return;
    const start = worldBones[boneStartJointId];
    if (!start || Math.hypot(point[0] - start.x, point[1] - start.y) < 1) return;
    onRunCommand(createConnectJointsCommand(boneStartJointId, jointId, activeBoneGroup?.id ?? "skeleton", point));
    setBoneStartJointId(jointId);
  };

  const addBoneGroup = () => {
    const id = uniqueId("group", Object.keys(project.topology.groups));
    onRunCommand(createBoneGroupCommand(id, `Group ${skeletonGroups.length + 1}`));
  };

  const updatePartTransform = (patch: Parameters<typeof createUpdatePartTransformCommand>[1]) => {
    if (selectedAttachment) onRunCommand(createUpdatePartTransformCommand(selectedAttachment.id, patch));
  };

  const updateMeshTopology = (mesh: MeshShape) => {
    if (selectedAttachment) onRunCommand(createSetPartMeshCommand(selectedAttachment.id, mesh));
  };

  const selectMeshVertex = (event: ReactPointerEvent<SVGCircleElement>, vertexIndex: number) => {
    event.stopPropagation();
    const next = event.shiftKey
      ? selectedMeshVertices.includes(vertexIndex) ? selectedMeshVertices.filter((index) => index !== vertexIndex) : [...selectedMeshVertices, vertexIndex].slice(-3)
      : [vertexIndex];
    setSelectedMeshVertices(next);
    if (artworkMode !== "mesh" && artworkMode !== "deform") return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg || !selectedAttachment || !selectedMesh) return;
    event.preventDefault();
    const base = [...meshLocalVertices];
    const move = (clientX: number, clientY: number) => {
      const worldPoint = svgClientPoint(svg, clientX, clientY);
      const local = partWorldToLocal(selectedAttachment, worldPoint, worldBones[selectedAttachment.boneId]);
      const draft = [...base];
      draft[vertexIndex * 2] = local[0];
      draft[vertexIndex * 2 + 1] = local[1];
      setMeshDraftVertices(draft);
    };
    const onMove = (moveEvent: PointerEvent) => move(moveEvent.clientX, moveEvent.clientY);
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const worldPoint = svgClientPoint(svg, upEvent.clientX, upEvent.clientY);
      const local = partWorldToLocal(selectedAttachment, worldPoint, worldBones[selectedAttachment.boneId]);
      setMeshDraftVertices(null);
      if (artworkMode === "deform" && activeClip) {
        const offsets = Array.from({ length: selectedMesh.vertices.length }, (_, index) => sampledDeform[index] ?? 0);
        offsets[vertexIndex * 2] = round(local[0] - (selectedMesh.vertices[vertexIndex * 2] ?? 0), 4);
        offsets[vertexIndex * 2 + 1] = round(local[1] - (selectedMesh.vertices[vertexIndex * 2 + 1] ?? 0), 4);
        onRunCommand(createSetKeyframeAtTimeCommand(activeClip.id, `${selectedAttachment.id}.deform`, currentTime, offsets));
      } else {
        onRunCommand(createSetMeshVertexCommand(selectedAttachment.id, vertexIndex, [round(local[0], 4), round(local[1], 4)]));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const autoWeightSelectedMesh = () => {
    if (!selectedAttachment?.mesh || !weightBoneIds.length) return;
    const skin: MeshVertexSkin[] = [];
    for (let vertexIndex = 0; vertexIndex < selectedAttachment.mesh.vertices.length / 2; vertexIndex += 1) {
      const local: readonly [number, number] = [selectedAttachment.mesh.vertices[vertexIndex * 2] ?? 0, selectedAttachment.mesh.vertices[vertexIndex * 2 + 1] ?? 0];
      const world = partLocalToWorld(selectedAttachment, local, worldBones[selectedAttachment.boneId]);
      const nearest = weightBoneIds.map((boneId) => ({ boneId, bone: worldBones[boneId], distance: Math.hypot(world[0] - (worldBones[boneId]?.x ?? 0), world[1] - (worldBones[boneId]?.y ?? 0)) }))
        .filter((item): item is typeof item & { bone: WorldBone } => Boolean(item.bone))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 4);
      const raw = nearest.map((item) => ({ ...item, weight: 1 / Math.max(8, item.distance) ** 2 }));
      const total = raw.reduce((sum, item) => sum + item.weight, 0) || 1;
      skin.push(raw.map((item) => { const bind = worldToLocal(world, item.bone); return { boneId: item.boneId, x: bind[0], y: bind[1], weight: item.weight / total }; }));
    }
    onRunCommand(createSetMeshSkinCommand(selectedAttachment.id, skin, "Auto weights"));
  };

  const updateSelectedVertexWeight = (weight: number) => {
    if (!selectedAttachment?.mesh || selectedVertexIndex < 0 || !activeWeightBoneId || lockedWeightVertices[`${selectedAttachment.id}:${selectedVertexIndex}`]) return;
    const skin = Array.from({ length: selectedAttachment.mesh.vertices.length / 2 }, (_, index) => [...(selectedAttachment.mesh!.skin?.[index] ?? [])]);
    const local: readonly [number, number] = [selectedAttachment.mesh.vertices[selectedVertexIndex * 2] ?? 0, selectedAttachment.mesh.vertices[selectedVertexIndex * 2 + 1] ?? 0];
    const world = partLocalToWorld(selectedAttachment, local, worldBones[selectedAttachment.boneId]);
    const bone = worldBones[activeWeightBoneId];
    if (!bone) return;
    const bind = worldToLocal(world, bone);
    const current = skin[selectedVertexIndex]!.filter((influence) => influence.boneId !== activeWeightBoneId);
    const otherTotal = current.reduce((sum, influence) => sum + influence.weight, 0) || 1;
    const clampedWeight = clamp(weight, 0, 1);
    skin[selectedVertexIndex] = [
      ...current.map((influence) => ({ ...influence, weight: influence.weight / otherTotal * (1 - clampedWeight) })),
      ...(clampedWeight > 0 ? [{ boneId: activeWeightBoneId, x: bind[0], y: bind[1], weight: clampedWeight }] : [])
    ];
    onRunCommand(createSetMeshSkinCommand(selectedAttachment.id, skin, "Paint vertex weight"));
  };

  const smoothSelectedWeights = () => {
    if (!selectedAttachment?.mesh?.skin || selectedVertexIndex < 0) return;
    const neighbors = meshNeighborIndices(selectedAttachment.mesh, selectedVertexIndex);
    if (!neighbors.length) return;
    const totals = new Map<string, number>();
    for (const index of [selectedVertexIndex, ...neighbors]) for (const influence of selectedAttachment.mesh.skin[index] ?? []) totals.set(influence.boneId, (totals.get(influence.boneId) ?? 0) + influence.weight);
    const count = neighbors.length + 1;
    const skin = selectedAttachment.mesh.skin.map((influences, index) => index === selectedVertexIndex ? [...totals.entries()].map(([boneId, weight]) => {
      const source = influences.find((item) => item.boneId === boneId) ?? selectedAttachment.mesh!.skin!.flat().find((item) => item.boneId === boneId);
      return { boneId, x: source?.x ?? 0, y: source?.y ?? 0, weight: weight / count };
    }) : influences);
    onRunCommand(createSetMeshSkinCommand(selectedAttachment.id, skin, "Smooth vertex weights"));
  };

  const updateBreathingBone = (boneId: string, patch: Partial<BoneTransform> | null) => {
    const map = { ...project.procedural.breathing.affectedBoneTransforms };
    if (patch === null) delete map[boneId];
    else map[boneId] = { ...(map[boneId] ?? {}), ...patch };
    onRunCommand(createUpdateProceduralCommand({ breathing: { ...project.procedural.breathing, affectedBoneTransforms: map } }));
  };

  const startIkDrag = (event: ReactPointerEvent<SVGCircleElement>, chain: EditorIkChain) => {
    if ([chain.rootBoneId, chain.middleBoneId, chain.endBoneId].some((boneId) => project.boneMetadata[boneId]?.locked)) return;
    event.preventDefault();
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    setSelectedChainId(chain.id);
    const move = (clientX: number, clientY: number) => {
      const target = svgClientPoint(svg, clientX, clientY);
      setIkTarget(target);
      setDraftBones(solveTwoBoneIk(project, sampledBones, chain, target));
    };
    const onMove = (moveEvent: PointerEvent) => move(moveEvent.clientX, moveEvent.clientY);
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const target = svgClientPoint(svg, upEvent.clientX, upEvent.clientY);
      const solved = solveTwoBoneIk(project, sampledBones, chain, target);
      setDraftBones(null);
      setIkTarget(null);
      if (section === "Animate" && activeClip) {
        const commands = [
          createSetKeyframeAtTimeCommand(activeClip.id, `${chain.rootBoneId}.rotation`, currentTime, solved[chain.rootBoneId]!.rotation),
          createSetKeyframeAtTimeCommand(activeClip.id, `${chain.middleBoneId}.rotation`, currentTime, solved[chain.middleBoneId]!.rotation)
        ];
        if (chain.stretch) {
          commands.push(
            createSetKeyframeAtTimeCommand(activeClip.id, `${chain.rootBoneId}.scaleX`, currentTime, solved[chain.rootBoneId]!.scaleX),
            createSetKeyframeAtTimeCommand(activeClip.id, `${chain.rootBoneId}.scaleY`, currentTime, solved[chain.rootBoneId]!.scaleY)
          );
        }
        onRunCommand(createGroupedCommand("IK drag at frame", commands));
      } else {
        onRunCommand(createSetBoneTransformsCommand({
          [chain.rootBoneId]: solved[chain.rootBoneId]!,
          [chain.middleBoneId]: solved[chain.middleBoneId]!
        }, "Move IK chain"));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const reorderSlot = (targetGroupId: string) => {
    if (!draggedSlotId || draggedSlotId === targetGroupId) return;
    const groups = [...layerGroups];
    const sourceIndex = groups.findIndex((group) => group.id === draggedSlotId);
    const targetIndex = groups.findIndex((group) => group.id === targetGroupId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = groups.splice(sourceIndex, 1);
    groups.splice(targetIndex, 0, moved!);
    const next = groups.flatMap((group) => group.slots.map((slot) => slot.id));
    onRunCommand(createSetVisualSlotOrderCommand(next));
    setDraggedSlotId("");
  };

  const duplicateSkin = () => {
    if (slotModelBlocked) return;
    const id = uniqueId("skin", Object.keys(skins));
    onRunCommand(createSkinCommand(id, `Skin ${Object.keys(skins).length + 1}`, activeSkinId));
  };

  const timelineDuration = activeClip?.duration ?? 1;
  const frameRate = activeClip?.frameRate ?? 60;
  const selectedAttachmentId = selectedSlot ? activeSkin?.attachments[selectedSlot.id] : null;
  const selectedAttachment = selectedAttachmentId ? project.parts[selectedAttachmentId] : undefined;
  const selectedMesh = selectedAttachment?.mesh;
  const deformTrackId = selectedAttachment ? `${selectedAttachment.id}.deform` : "";
  const selectedDeformKeys = activeClip && deformTrackId ? activeClip.tracks[deformTrackId] ?? [] : [];
  const hasAnySelectedDeformKeys = selectedAttachment ? Object.values(project.animations).some((clip) => (clip.tracks[`${selectedAttachment.id}.deform`]?.length ?? 0) > 0) : false;
  const sampledDeform = selectedMesh ? sampleDeformKeys(selectedDeformKeys, currentTime, selectedMesh.vertices.length) : [];
  const meshLocalVertices = meshDraftVertices ?? selectedMesh?.vertices.map((value, index) => value + (sampledDeform[index] ?? 0)) ?? [];
  const meshWorldVertices: readonly (readonly [number, number])[] = selectedAttachment && selectedMesh
    ? Array.from({ length: meshLocalVertices.length / 2 }, (_, index) => partLocalToWorld(selectedAttachment, [meshLocalVertices[index * 2] ?? 0, meshLocalVertices[index * 2 + 1] ?? 0], worldBones[selectedAttachment.boneId]))
    : [];
  const weightBoneIds = useMemo(() => {
    const group = Object.values(project.topology.groups).find((item) => item.boneIds.includes(selectedSlot?.boneId ?? ""));
    return (group?.boneIds.length ? group.boneIds : project.hierarchy).filter((boneId) => Boolean(project.bones[boneId]));
  }, [project.bones, project.hierarchy, project.topology.groups, selectedSlot?.boneId]);
  const activeWeightBoneId = weightBoneIds.includes(weightBoneId) ? weightBoneId : selectedSlot?.boneId ?? weightBoneIds[0] ?? "";
  const selectedVertexIndex = selectedMeshVertices[0] ?? -1;
  const selectedVertexSkin = selectedMesh?.skin?.[selectedVertexIndex] ?? [];
  const selectedVertexWeight = selectedVertexSkin.find((influence) => influence.boneId === activeWeightBoneId)?.weight ?? 0;
  const previewProject = weightTest ? { ...project, bones: weightTestBones } : project;
  const activeFacePartId = selectedFaceSlot && activeClip
    ? sampleAttachmentAt(activeClip.tracks[`slot:${selectedFaceSlot.id}.attachment`] ?? [], currentTime)
      ?? activeSkin?.attachments[selectedFaceSlot.id]
      ?? null
    : null;
  const showRigOverlay = workspace === "Select" || workspace === "Skeleton" || workspace === "Pose" || (workspace === "Artwork" && (artworkMode === "bind" || artworkMode === "weights"));
  const inspectorDefaultOpen = useCallback((title: string) => {
    if (workspace === "Artwork") return title === "Transform" || title === "Appearance" || title === "Layer" || (artworkMode === "bind" && title === "Binding") || (artworkMode === "mesh" && title === "Mesh topology") || (artworkMode === "weights" && title === "Weights") || (artworkMode === "deform" && (title === "Vertex Deform" || title === "Breathing"));
    if (workspace === "Skeleton" || workspace === "Pose") return title === "Transform" || title === "Chain";
    return title === "Transform";
  }, [artworkMode, workspace]);
  const inspectorSectionOpen = useCallback((title: string) => {
    const stored = uiPreferences.inspectorSections[`${workspace}:${title}`];
    return stored ?? inspectorDefaultOpen(title);
  }, [inspectorDefaultOpen, uiPreferences.inspectorSections, workspace]);
  const setInspectorSectionOpen = useCallback((title: string, open: boolean) => {
    setUiPreferences((current) => ({
      ...current,
      inspectorSections: { ...current.inspectorSections, [`${workspace}:${title}`]: open }
    }));
  }, [workspace]);
  const setTimelinePreferences = useCallback((timeline: TimelineViewportPreferences) => {
    setUiPreferences((current) => ({ ...current, timeline }));
  }, []);

  return (
    <main className="bones-studio" aria-label="Bones visual rig and animation editor">
      <header className="bones-studio-topbar">
        <div className="bones-brand-group">
          <strong>BONES</strong><Separator orientation="vertical" className="h-6" />
          <span className="truncate">{project.name}</span><ChevronDown size={15} />
        </div>
        <nav className="bones-section-tabs" aria-label="Editor sections">
          {studioSections.map((item) => (
            <button key={item} className={section === item && !advancedWorkspace ? "is-active" : ""} onClick={() => activateSection(item)}>{item}</button>
          ))}
        </nav>
        <div className="bones-top-actions">
          <IconButton label="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 /></IconButton>
          <IconButton label="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 /></IconButton>
          <Separator orientation="vertical" className="h-6" />
          <IconButton label={playing ? "Pause" : "Play"} onClick={() => onPlayingChange(!playing)}>{playing ? <Pause /> : <Play />}</IconButton>
          {section === "Animate" ? (
            <Button size="sm" className="bones-auto-key" onClick={() => onRunCommand(createSetTimelineAutoKeyCommand(!project.timeline.autoKey))}>
              <KeyRound /> Auto Key
            </Button>
          ) : null}
          <IconButton label="Save" onClick={onSave}><Save /></IconButton>
          <IconButton label={folderStatus} onClick={onConnectFolder}><FolderOpen /></IconButton>
        </div>
      </header>

      <div className="bones-studio-main">
        <aside className="bones-tool-rail" aria-label="Editor workspaces">
          {workspaceItems.map(({ label, icon: Icon }) => (
            <Tooltip key={label}><TooltipTrigger asChild>
              <button className={!advancedWorkspace && workspace === label ? "is-active" : ""} onClick={() => activateWorkspace(label)} aria-label={label}><Icon /></button>
            </TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
          ))}
          <Tooltip><TooltipTrigger asChild>
            <button className={`mt-auto ${advancedWorkspace ? "is-active" : ""}`} aria-label="Advanced" onClick={() => activateWorkspace("Advanced")}><Settings2 /></button>
          </TooltipTrigger><TooltipContent side="right">Advanced</TooltipContent></Tooltip>
        </aside>

        {advancedWorkspace ? (
          <section className="bones-advanced-host" aria-label={`${advancedMode} advanced workspace`}>
            {advancedWorkspace}
          </section>
        ) : (
          <>
        <aside className="bones-left-panel">
          <div className="bones-panel-heading"><strong>{workspace}</strong><span>{section}</span></div>
          {workspace === "Skeleton" ? (
            <div className="bones-workspace-tools" aria-label="Skeleton canvas tools">
              {([
                ["select", MousePointer2, "Select"],
                ["joint", CircleDot, "Joint"],
                ["bone", PenLine, "Bone"],
                ["pan", Hand, "Pan"]
              ] as const).map(([tool, Icon, label]) => (
                <Tooltip key={tool}><TooltipTrigger asChild><button className={skeletonTool === tool ? "is-active" : ""} onClick={() => { setSkeletonTool(tool); setBoneStartJointId(""); }} aria-label={label}><Icon /></button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
              ))}
            </div>
          ) : null}
          {workspace === "Artwork" ? (
            <div className="bones-artwork-modes" aria-label="Artwork modes">
              {(["place", "bind", "mesh", "weights", "deform"] as const).map((mode) => <button key={mode} className={artworkMode === mode ? "is-active" : ""} onClick={() => { setArtworkMode(mode); setSelectedMeshVertices([]); setSelectedTriangleIndex(-1); }}>{humanize(mode)}</button>)}
            </div>
          ) : null}
          {workspace === "Face" ? (
            <div className="bones-face-panel">
              <div className="bones-face-tabs" role="tablist" aria-label="Facial slots">
                {faceSlots.map((slot) => <button key={slot.id} className={selectedFaceSlot?.id === slot.id ? "is-active" : ""} onClick={() => setSelectedFaceSlotId(slot.id)}>{slot.name}</button>)}
              </div>
              <div className="bones-face-grid">
                {(selectedFaceSlot?.partIds ?? []).map((partId) => {
                  const part = project.parts[partId];
                  const source = part?.assetUrl ?? part?.assetPath;
                  return <button key={partId} className={activeFacePartId === partId ? "is-active" : ""} aria-label={`Set ${humanize(partId)}`} onClick={() => setFaceAttachment(partId)}>{source ? <img src={source} alt="" /> : <ImageIcon />}<span>{humanize(partId.replace(/^(eyes_|mouth_)/, ""))}</span></button>;
                })}
              </div>
              {selectedFaceSlot?.id === "mouth" ? (
                <div className="bones-speech-stream">
                  <strong>Streaming speech</strong>
                  <Select value={speechEmotion} onValueChange={setSpeechEmotion}>
                    <SelectTrigger aria-label="Speech emotion"><SelectValue /></SelectTrigger>
                    <SelectContent>{["neutral", "happy", "sad", "angry"].map((emotion) => <SelectItem key={emotion} value={emotion}>{humanize(emotion)}</SelectItem>)}</SelectContent>
                  </Select>
                  <label>Frames per mouth<Input aria-label="Frames per mouth" type="number" min={1} max={12} value={speechFrameStep} onChange={(event) => setSpeechFrameStep(clamp(Number(event.target.value) || 1, 1, 12))} /></label>
                  <Button size="sm" onClick={generateSpeechStream}><Play /> Generate to clip end</Button>
                </div>
              ) : null}
              <p className="bones-layer-note">Click a thumbnail to write a step attachment key at frame {Math.round(currentTime * frameRate)}. Undo/redo is supported.</p>
            </div>
          ) : null}
          {workspace === "Select" ? (
            <ScrollArea className="min-h-0 flex-1"><div className="bones-project-card">
              <strong>{project.name}</strong>
              <span>{remoteConflictVersion === null ? remoteStatus : `Resolve Neon conflict · v${remoteConflictVersion}`}</span>
              <span>{folderStatus}</span>
              <div><Button size="sm" onClick={onCreateMiloReporter}><Cat /> Milo Reporter</Button><Button size="sm" variant="outline" onClick={onNewProject}><Plus /> Empty rig</Button><Button size="sm" variant="outline" onClick={onConnectFolder}><FolderOpen /> Folder</Button></div>
              <Button size="sm" variant="outline" onClick={onRestoreLatestRevision}>Restore latest revision</Button>
              {remoteConflictVersion !== null ? <div><Button size="sm" onClick={onOpenRemoteConflict}>Open DB version</Button><Button size="sm" variant="outline" onClick={onSaveConflictAsNew}>Save local as new</Button></div> : null}
              <Separator />
              <div className="bones-character-library-heading"><strong>Saved characters</strong><Button size="xs" variant="ghost" onClick={onRefreshRemoteProjects}>Refresh</Button></div>
              <span>{characterLibraryStatus}</span>
              <div className="bones-character-library">
                {remoteProjects.map((saved) => (
                  <button key={saved.id} className={saved.id === project.projectId ? "is-active" : ""} aria-label={`Load ${saved.name}`} onClick={() => onLoadRemoteProject(saved.id)}>
                    <strong>{saved.name}</strong>
                    <span>{humanize(saved.characterKind)} · {saved.boneCount} bones · {saved.partCount} parts · {saved.animationCount} clips</span>
                    <small>v{saved.version} · {new Date(saved.updatedAt).toLocaleString()}</small>
                  </button>
                ))}
              </div>
            </div></ScrollArea>
          ) : null}
          {workspace === "Artwork" || workspace === "Pose" ? (
            <>
              <div className="bones-skin-row">
                <Select value={activeSkinId} onValueChange={(value) => onRunCommand(createSetActiveSkinCommand(value))}>
                  <SelectTrigger aria-label="Active skin"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(skins).map((skin) => <SelectItem key={skin.id} value={skin.id}>{skin.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" variant="ghost" aria-label="Duplicate skin" disabled={slotModelBlocked} onClick={duplicateSkin}><Plus /></Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="bones-layer-list">
                  {layerGroups.map((group) => {
                    const slot = group.slots[group.slots.length - 1]!;
                    const attachmentId = activeSkin?.attachments[slot.id];
                    const part = attachmentId ? project.parts[attachmentId] : undefined;
                    const selected = group.slots.some((item) => item.id === selectedSlot?.id);
                    return (
                      <button
                        key={group.id}
                        draggable={!slotModelBlocked}
                        className={`bones-layer-row ${selected ? "is-selected" : ""}`}
                        onDragStart={() => setDraggedSlotId(group.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => reorderSlot(group.id)}
                        onClick={() => selectSlot(slot)}
                      >
                        <span className="bones-layer-thumb">{part?.assetUrl || (part?.assetPath && !part.assetPath.startsWith("assets/")) ? <img src={part.assetUrl ?? part.assetPath} alt="" /> : <ImageIcon />}</span>
                        <span className="truncate">{group.name}</span>
                        {group.slots.every((item) => item.visible === false) ? <EyeOff /> : <Eye />}
                        <Lock className={group.slots.every((item) => item.locked) ? "opacity-100" : "opacity-45"} />
                        <GripVertical />
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="bones-layer-note">{slotModelBlocked ? "Animated draw order detected. Remove it in Advanced Timeline before enabling slots." : "Back → front. Slot order stays fixed in every animation."}</div>
            </>
          ) : workspace === "Face" ? null : workspace === "Preview" && project.characterKind === "cat" ? (
            <ScrollArea className="min-h-0 flex-1"><div className="bones-reporter-states">{Object.values(project.animations).map((clip) => <button key={clip.id} className={activeClip?.id === clip.id ? "is-active" : ""} onClick={() => { onClipChange(clip.id); onCurrentTimeChange(0); }}>{humanize(clip.id)}</button>)}</div></ScrollArea>
          ) : workspace === "Skeleton" ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="bones-group-list">
                <div className="bones-list-caption"><span>Bone groups</span><button onClick={addBoneGroup} aria-label="Add bone group"><Plus /></button></div>
                {skeletonGroups.map((group) => (
                  <div key={group.id} className={`bones-bone-group ${group.id === activeBoneGroup?.id ? "is-active" : ""}`}>
                    <div className="bones-bone-group-head">
                      <button onClick={() => onRunCommand(createSetActiveBoneGroupCommand(group.id))}><ChevronDown /><Input defaultValue={group.name} aria-label={`${group.name} name`} onClick={(event) => event.stopPropagation()} onFocus={(event) => setGroupNameDraft(event.currentTarget.value)} onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== group.name) onRunCommand(createUpdateBoneGroupCommand(group.id, { name })); else event.currentTarget.value = group.name; setGroupNameDraft(""); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.currentTarget.value = groupNameDraft || group.name; event.currentTarget.blur(); } }} /></button>
                      <button aria-label={group.hidden ? "Show group" : "Hide group"} onClick={() => onRunCommand(createUpdateBoneGroupCommand(group.id, { hidden: !group.hidden }))}>{group.hidden ? <EyeOff /> : <Eye />}</button>
                      <button aria-label={group.locked ? "Unlock group" : "Lock group"} onClick={() => onRunCommand(createUpdateBoneGroupCommand(group.id, { locked: !group.locked }))}><Lock className={group.locked ? "opacity-100" : "opacity-45"} /></button>
                    </div>
                    {!group.hidden ? group.boneIds.map((boneId) => (
                      <button key={boneId} className={`bones-group-bone ${boneId === selectedBoneId ? "is-selected" : ""}`} onClick={() => onSelectBone(boneId)}><Bone /><span className="truncate">{humanize(boneId)}</span><small>{round(project.boneLengths[boneId] ?? Math.hypot(project.bones[boneId]?.x ?? 0, project.bones[boneId]?.y ?? 0))}</small></button>
                    )) : null}
                  </div>
                ))}
                {project.hierarchy.filter((boneId) => !skeletonGroups.some((group) => group.boneIds.includes(boneId))).map((boneId) => (
                  <button key={boneId} className={`bones-group-bone ${boneId === selectedBoneId ? "is-selected" : ""}`} onClick={() => onSelectBone(boneId)}><CircleDot /><span className="truncate">{humanize(boneId)}</span></button>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="bones-skeleton-list">
                {project.hierarchy.map((boneId) => {
                  const depth = boneDepth(project, boneId);
                  const selected = boneId === selectedBoneId;
                  return (
                    <button key={boneId} className={selected ? "is-selected" : ""} style={{ paddingLeft: 14 + depth * 14 }} onClick={() => onSelectBone(boneId)}>
                      <ChevronRight /><Bone /><span className="truncate">{humanize(boneId)}</span>{project.boneMetadata[boneId]?.locked ? <Lock /> : null}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </aside>

        <section className="bones-stage" aria-label={`${section} canvas`}>
          <PixiPreview
            clipId={activeClip?.id ?? clipId}
            currentTime={animationAuthoringActive ? currentTime : 0}
            disableAnimation={!animationAuthoringActive && section === "Build"}
            onTimeChange={onCurrentTimeChange}
            playing={playing && animationAuthoringActive}
            project={previewProject}
            quality={quality}
            runtimeMode="source"
            showSkeleton={false}
            skinId={activeSkinId}
            interactionMode={workspace === "Pose" ? "pose" : workspace === "Preview" || (workspace === "Skeleton" && skeletonTool === "pan") ? "preview" : "select"}
          />
          {showRigOverlay && (section === "Build" || section === "Animate") ? (
            <svg className={`bones-rig-overlay is-${workspace.toLowerCase()} is-tool-${skeletonTool}`} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="xMidYMid meet" aria-label="Editable bone overlay" onPointerDown={placeSkeletonPoint}>
              {section === "Build" ? Object.values(project.topology.segments).map((segment) => {
                const group = project.topology.groups[segment.groupId];
                const startJoint = project.topology.joints[segment.startJointId];
                const endJoint = project.topology.joints[segment.endJointId];
                const start = startJoint ? worldBones[startJoint.boneId] : undefined;
                const end = endJoint ? worldBones[endJoint.boneId] : undefined;
                if (group?.hidden || !start || !end) return null;
                return <line key={segment.id} className={segment.boneId === selectedBoneId ? "is-selected" : ""} x1={start.x} y1={start.y} x2={end.x} y2={end.y} onPointerDown={(event) => { event.stopPropagation(); onSelectBone(segment.boneId); }} />;
              }) : null}
              {(section === "Build" ? Object.values(project.topology.joints).map((joint) => joint.boneId) : selectedChain ? [] : [selectedBoneId]).map((boneId) => {
                const bone = worldBones[boneId];
                const parentId = project.parents[boneId];
                const parent = parentId ? worldBones[parentId] : undefined;
                if (!bone) return null;
                return (
                  <g key={boneId} className={`${boneId === selectedBoneId ? "is-selected" : ""} ${boneId === boneStartJointId ? "is-bone-start" : ""}`}>
                    {section !== "Build" && parent ? <line x1={parent.x} y1={parent.y} x2={bone.x} y2={bone.y} /> : null}
                    <circle cx={bone.x} cy={bone.y} r={boneId === selectedBoneId ? 7 : 4.5} onPointerDown={(event) => selectOrConnectJoint(event, boneId)} />
                  </g>
                );
              })}
              {selectedChain ? <IkOverlay chain={selectedChain} worldBones={worldBones} target={ikTarget} onPointerDown={startIkDrag} /> : null}
            </svg>
          ) : null}
          {workspace === "Artwork" && selectedAttachment && selectedMesh && ["mesh", "weights", "deform"].includes(artworkMode) ? (
            <svg className={`bones-mesh-overlay is-${artworkMode}`} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="xMidYMid meet" aria-label="Editable artwork mesh">
              {Array.from({ length: Math.floor(selectedMesh.indices.length / 3) }, (_, triangleIndex) => {
                const indices = selectedMesh.indices.slice(triangleIndex * 3, triangleIndex * 3 + 3);
                const points = indices.map((index) => meshWorldVertices[index]).filter(Boolean) as readonly (readonly [number, number])[];
                if (points.length !== 3) return null;
                return <polygon key={triangleIndex} className={triangleIndex === selectedTriangleIndex ? "is-selected" : ""} points={points.map((point) => point.join(",")).join(" ")} onPointerDown={(event) => { event.stopPropagation(); setSelectedTriangleIndex(triangleIndex); }} />;
              })}
              {meshWorldVertices.map((point, vertexIndex) => {
                const weight = selectedMesh.skin?.[vertexIndex]?.find((influence) => influence.boneId === activeWeightBoneId)?.weight ?? 0;
                return <circle key={vertexIndex} className={selectedMeshVertices.includes(vertexIndex) ? "is-selected" : ""} cx={point[0]} cy={point[1]} r={selectedMeshVertices.includes(vertexIndex) ? 6 : 4.5} style={artworkMode === "weights" ? { fill: weightColor(weight) } : undefined} onPointerDown={(event) => selectMeshVertex(event, vertexIndex)} />;
              })}
            </svg>
          ) : null}
          <div className="bones-stage-status"><span>{animationAuthoringActive ? activeClip?.name ?? "No clip" : section === "Build" ? "Default rig pose" : activeClip?.name ?? "No clip"}</span><span>{ioStatus} · {remoteStatus}</span></div>
          {section === "Export" ? (
            <div className="bones-export-card">
              <Download />
              <h2>Runtime-ready rig</h2>
              <p>Exports one skeleton and animation table with compact skin mappings.</p>
              <Button onClick={onExport}><Download /> Export bundle</Button>
              <span>{lastExportBundle?.validation.ok ? "Validation ready" : "Run export to validate"}</span>
            </div>
          ) : null}
        </section>

        <aside className="bones-inspector">
          <div className="bones-inspector-title"><strong>{workspace === "Artwork" ? selectedSlot?.name ?? "Artwork" : workspace === "Face" ? selectedFaceSlot?.name ?? "Face" : humanize(selectedBoneId)}</strong><Settings2 /></div>
          <ScrollArea className="min-h-0 flex-1">
            {workspace === "Face" ? (
              <InspectorSection title="Attachment" open={inspectorSectionOpen("Attachment")} onOpenChange={(open) => setInspectorSectionOpen("Attachment", open)}>
                <FieldGrid label="Slot"><div className="bones-static-field">{selectedFaceSlot?.name ?? "—"}</div></FieldGrid>
                <FieldGrid label="Current"><div className="bones-static-field">{activeFacePartId ? humanize(activeFacePartId) : "Hidden"}</div></FieldGrid>
                <FieldGrid label="Interpolation"><div className="bones-static-field">Step / hold</div></FieldGrid>
                <FieldGrid label="Auto Key"><Switch checked={project.timeline.autoKey} onCheckedChange={(autoKey) => onRunCommand(createSetTimelineAutoKeyCommand(autoKey))} /></FieldGrid>
              </InspectorSection>
            ) : <InspectorSection title="Transform" open={inspectorSectionOpen("Transform")} onOpenChange={(open) => setInspectorSectionOpen("Transform", open)}>
              {workspace === "Artwork" ? (
                <>
                  <FieldGrid label="Position"><NumberField prefix="X" value={selectedAttachment?.offset?.[0] ?? 0} onCommit={(value) => updatePartTransform({ offset: [value, selectedAttachment?.offset?.[1] ?? 0] })} /><NumberField prefix="Y" value={selectedAttachment?.offset?.[1] ?? 0} onCommit={(value) => updatePartTransform({ offset: [selectedAttachment?.offset?.[0] ?? 0, value] })} /></FieldGrid>
                  <FieldGrid label="Rotation"><NumberField value={degrees(selectedAttachment?.rotation ?? 0)} suffix="°" onCommit={(value) => updatePartTransform({ rotation: radians(value) })} /></FieldGrid>
                  <FieldGrid label="Scale"><NumberField prefix="X" value={selectedAttachment?.scale?.[0] ?? 1} onCommit={(value) => updatePartTransform({ scale: [value, selectedAttachment?.scale?.[1] ?? 1] })} /><NumberField prefix="Y" value={selectedAttachment?.scale?.[1] ?? 1} onCommit={(value) => updatePartTransform({ scale: [selectedAttachment?.scale?.[0] ?? 1, value] })} /></FieldGrid>
                  <FieldGrid label="Pivot"><NumberField prefix="X" value={selectedAttachment?.pivot[0] ?? 0} onCommit={(value) => updatePartTransform({ pivot: [value, selectedAttachment?.pivot[1] ?? 0] })} /><NumberField prefix="Y" value={selectedAttachment?.pivot[1] ?? 0} onCommit={(value) => updatePartTransform({ pivot: [selectedAttachment?.pivot[0] ?? 0, value] })} /></FieldGrid>
                </>
              ) : (
                <>
                  <FieldGrid label="Position"><NumberField prefix="X" value={selectedTransform?.x ?? 0} onCommit={(value) => commitBoneProperty("x", value)} /><NumberField prefix="Y" value={selectedTransform?.y ?? 0} onCommit={(value) => commitBoneProperty("y", value)} /></FieldGrid>
                  <FieldGrid label="Rotation"><NumberField value={degrees(selectedTransform?.rotation ?? 0)} suffix="°" onCommit={(value) => commitBoneProperty("rotation", radians(value))} /></FieldGrid>
                  <FieldGrid label="Scale"><NumberField prefix="X" value={selectedTransform?.scaleX ?? 1} onCommit={(value) => commitBoneProperty("scaleX", value)} /><NumberField prefix="Y" value={selectedTransform?.scaleY ?? 1} onCommit={(value) => commitBoneProperty("scaleY", value)} /></FieldGrid>
                </>
              )}
            </InspectorSection>}
            {workspace === "Skeleton" ? (
              <InspectorSection title="Bone" open={inspectorSectionOpen("Bone")} onOpenChange={(open) => setInspectorSectionOpen("Bone", open)}>
                <FieldGrid label="Group"><Select value={selectedBoneGroup?.id ?? ""} onValueChange={(groupId) => onRunCommand(createMoveBoneToGroupCommand(selectedBoneId, groupId))}><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent>{skeletonGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent></Select></FieldGrid>
                <FieldGrid label="Length"><div className="bones-static-field">{round(project.boneLengths[selectedBoneId] ?? Math.hypot(project.bones[selectedBoneId]?.x ?? 0, project.bones[selectedBoneId]?.y ?? 0))}</div></FieldGrid>
                <FieldGrid label="Angle"><div className="bones-static-field">{round(degrees(selectedTransform?.rotation ?? 0))}°</div></FieldGrid>
                <FieldGrid label="Lock"><Switch checked={Boolean(project.boneMetadata[selectedBoneId]?.locked)} disabled={Boolean(selectedBoneGroup?.locked)} onCheckedChange={(locked) => onRunCommand(createSetBoneMetadataCommand(selectedBoneId, { locked }))} /></FieldGrid>
              </InspectorSection>
            ) : null}
            {workspace === "Artwork" && artworkMode === "bind" ? (
              <InspectorSection title="Binding" open={inspectorSectionOpen("Binding")} onOpenChange={(open) => setInspectorSectionOpen("Binding", open)}>
                <FieldGrid label="Joint / bone"><Select value={selectedSlot?.boneId ?? ""} onValueChange={(boneId) => selectedSlot && onRunCommand(createSetVisualSlotBoneCommand(selectedSlot.id, boneId))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{project.hierarchy.map((boneId) => <SelectItem key={boneId} value={boneId}>{humanize(boneId)}</SelectItem>)}</SelectContent></Select></FieldGrid>
                <p className="bones-helper">Attachment transform remains local to this binding.</p>
              </InspectorSection>
            ) : null}
            {workspace === "Artwork" && artworkMode === "mesh" ? (
              <InspectorSection title="Mesh topology" open={inspectorSectionOpen("Mesh topology")} onOpenChange={(open) => setInspectorSectionOpen("Mesh topology", open)}>
                {!selectedMesh ? <Button variant="outline" disabled={!selectedAttachment} onClick={() => selectedAttachment && updateMeshTopology(createAttachmentMesh(selectedAttachment))}>Create Mesh</Button> : (
                  <div className="bones-mesh-actions">
                    <Button size="sm" variant="outline" disabled={hasAnySelectedDeformKeys} onClick={() => updateMeshTopology(addMeshVertex(selectedMesh))}><Plus /> Vertex</Button>
                    <Button size="sm" variant="outline" disabled={hasAnySelectedDeformKeys || selectedVertexIndex < 0} onClick={() => { updateMeshTopology(removeMeshVertex(selectedMesh, selectedVertexIndex)); setSelectedMeshVertices([]); }}><Minus /> Vertex</Button>
                    <Button size="sm" variant="outline" disabled={hasAnySelectedDeformKeys} onClick={() => updateMeshTopology(triangulateMesh(selectedMesh))}>Auto triangles</Button>
                    <Button size="sm" variant="outline" disabled={hasAnySelectedDeformKeys || selectedMeshVertices.length !== 3} onClick={() => updateMeshTopology(addMeshTriangle(selectedMesh, selectedMeshVertices))}>Add triangle</Button>
                    <Button size="sm" variant="outline" disabled={hasAnySelectedDeformKeys || selectedTriangleIndex < 0} onClick={() => { updateMeshTopology(removeMeshTriangle(selectedMesh, selectedTriangleIndex)); setSelectedTriangleIndex(-1); }}>Delete triangle</Button>
                  </div>
                )}
                <p className="bones-helper">Shift-click three vertices to create a triangle. {selectedMesh ? `${selectedMesh.vertices.length / 2} vertices · ${selectedMesh.indices.length / 3} triangles` : ""}</p>
                {hasAnySelectedDeformKeys && selectedAttachment ? <Button size="sm" variant="destructive" onClick={() => onRunCommand(createClearPartDeformKeysCommand(selectedAttachment.id))}>Clear deform keys</Button> : null}
              </InspectorSection>
            ) : null}
            {workspace === "Artwork" && artworkMode === "weights" ? (
              <InspectorSection title="Weights" open={inspectorSectionOpen("Weights")} onOpenChange={(open) => setInspectorSectionOpen("Weights", open)}>
                <FieldGrid label="Bone"><Select value={activeWeightBoneId} onValueChange={setWeightBoneId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{weightBoneIds.map((boneId) => <SelectItem key={boneId} value={boneId}>{humanize(boneId)}</SelectItem>)}</SelectContent></Select></FieldGrid>
                <Button size="sm" variant="outline" disabled={!selectedMesh} onClick={autoWeightSelectedMesh}>Auto Weights</Button>
                <FieldGrid label="Vertex"><div className="bones-static-field">{selectedVertexIndex < 0 ? "Select a vertex" : `#${selectedVertexIndex}`}</div></FieldGrid>
                <FieldGrid label="Weight"><NumberField value={round(selectedVertexWeight, 4)} onCommit={updateSelectedVertexWeight} /></FieldGrid>
                <div className="bones-mesh-actions">
                  <Button size="sm" variant="outline" disabled={!selectedMesh?.skin} onClick={smoothSelectedWeights}>Smooth</Button>
                  <Button size="sm" variant="outline" disabled={!selectedMesh?.skin || !selectedAttachment} onClick={() => selectedAttachment?.mesh?.skin && onRunCommand(createSetMeshSkinCommand(selectedAttachment.id, selectedAttachment.mesh.skin, "Normalize weights"))}>Normalize</Button>
                  <Button size="sm" variant="outline" disabled={!selectedMesh?.skin || !selectedAttachment} onClick={() => selectedAttachment?.mesh?.skin && onRunCommand(createSetMeshSkinCommand(selectedAttachment.id, selectedAttachment.mesh.skin.map((skin) => skin.filter((influence) => influence.weight >= 0.02)), "Prune weights"))}>Prune</Button>
                </div>
                <FieldGrid label="Lock"><Switch checked={selectedAttachment ? Boolean(lockedWeightVertices[`${selectedAttachment.id}:${selectedVertexIndex}`]) : false} disabled={selectedVertexIndex < 0 || !selectedAttachment} onCheckedChange={(locked) => selectedAttachment && setLockedWeightVertices((current) => ({ ...current, [`${selectedAttachment.id}:${selectedVertexIndex}`]: locked }))} /></FieldGrid>
                <FieldGrid label="Weight Test"><Switch checked={weightTest} onCheckedChange={setWeightTest} /></FieldGrid>
              </InspectorSection>
            ) : null}
            {workspace === "Artwork" && artworkMode === "deform" ? (
              <>
                <InspectorSection title="Vertex Deform" open={inspectorSectionOpen("Vertex Deform")} onOpenChange={(open) => setInspectorSectionOpen("Vertex Deform", open)}>
                  <p className="bones-helper">Drag a mesh vertex at frame {Math.round(currentTime * frameRate)}. Auto-key writes one deform offset array.</p>
                  {selectedAttachment ? <Button size="sm" variant="outline" disabled={!hasAnySelectedDeformKeys} onClick={() => onRunCommand(createClearPartDeformKeysCommand(selectedAttachment.id))}>Clear deform keys</Button> : null}
                </InspectorSection>
                <InspectorSection title="Breathing" open={inspectorSectionOpen("Breathing")} onOpenChange={(open) => setInspectorSectionOpen("Breathing", open)}>
                  <FieldGrid label="Enabled"><Switch checked={project.procedural.breathing.enabled} onCheckedChange={(enabled) => onRunCommand(createUpdateProceduralCommand({ breathing: { ...project.procedural.breathing, enabled } }))} /></FieldGrid>
                  <FieldGrid label="Frequency"><NumberField value={project.procedural.breathing.frequency} onCommit={(frequency) => onRunCommand(createUpdateProceduralCommand({ breathing: { ...project.procedural.breathing, frequency: Math.max(0, frequency) } }))} /></FieldGrid>
                  <FieldGrid label="Amplitude"><NumberField value={project.procedural.breathing.amplitude} onCommit={(amplitude) => onRunCommand(createUpdateProceduralCommand({ breathing: { ...project.procedural.breathing, amplitude } }))} /></FieldGrid>
                  {!project.procedural.breathing.affectedBoneTransforms[selectedBoneId] ? <Button size="sm" variant="outline" onClick={() => updateBreathingBone(selectedBoneId, { scaleX: 0.02, scaleY: 0.02 })}><Plus /> Add selected bone</Button> : null}
                  {Object.entries(project.procedural.breathing.affectedBoneTransforms).map(([boneId, transform]) => (
                    <div key={boneId} className="bones-breathing-bone">
                      <div><strong>{humanize(boneId)}</strong><button aria-label={`Remove ${boneId}`} onClick={() => updateBreathingBone(boneId, null)}><Minus /></button></div>
                      <FieldGrid label="X / Y"><NumberField prefix="X" value={transform.x ?? 0} onCommit={(x) => updateBreathingBone(boneId, { x })} /><NumberField prefix="Y" value={transform.y ?? 0} onCommit={(y) => updateBreathingBone(boneId, { y })} /></FieldGrid>
                      <FieldGrid label="Rotation"><NumberField value={degrees(transform.rotation ?? 0)} suffix="°" onCommit={(rotation) => updateBreathingBone(boneId, { rotation: radians(rotation) })} /></FieldGrid>
                      <FieldGrid label="Scale"><NumberField prefix="X" value={transform.scaleX ?? 0} onCommit={(scaleX) => updateBreathingBone(boneId, { scaleX })} /><NumberField prefix="Y" value={transform.scaleY ?? transform.scaleX ?? 0} onCommit={(scaleY) => updateBreathingBone(boneId, { scaleY })} /></FieldGrid>
                    </div>
                  ))}
                </InspectorSection>
              </>
            ) : null}
            {selectedChain ? (
              <InspectorSection title="Chain" open={inspectorSectionOpen("Chain")} onOpenChange={(open) => setInspectorSectionOpen("Chain", open)}>
                <FieldGrid label="Solver"><div className="bones-static-field">IK</div></FieldGrid>
                <FieldGrid label="Stretch"><Switch checked={selectedChain.stretch} onCheckedChange={(stretch) => onRunCommand(createUpdateIkChainCommand(selectedChain.id, { stretch }))} /></FieldGrid>
                <FieldGrid label="Pole Angle"><NumberField value={selectedChain.poleAngle} suffix="°" onCommit={(poleAngle) => onRunCommand(createUpdateIkChainCommand(selectedChain.id, { poleAngle }))} /></FieldGrid>
                <FieldGrid label="Bend"><Button size="sm" variant="outline" onClick={() => onRunCommand(createUpdateIkChainCommand(selectedChain.id, { bendDirection: selectedChain.bendDirection === 1 ? -1 : 1 }))}>{selectedChain.bendDirection === 1 ? "Clockwise" : "Counter"}</Button></FieldGrid>
              </InspectorSection>
            ) : null}
            <InspectorSection title="Appearance" open={inspectorSectionOpen("Appearance")} onOpenChange={(open) => setInspectorSectionOpen("Appearance", open)}>
              <FieldGrid label="Opacity">{workspace === "Artwork" ? <NumberField value={round((selectedAttachment?.opacity ?? 1) * 100)} suffix="%" onCommit={(opacity) => updatePartTransform({ opacity: clamp(opacity / 100, 0, 1) })} /> : <div className="bones-opacity"><span className="bones-opacity-bar" /><span>100%</span></div>}</FieldGrid>
              <input ref={artworkInputRef} className="sr-only" type="file" accept="image/png,image/svg+xml" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && selectedSlot) onReplaceArtwork(selectedSlot.id, file);
                event.currentTarget.value = "";
              }} />
              <Button className="w-full" variant="outline" disabled={!selectedSlot || slotModelBlocked} onClick={() => artworkInputRef.current?.click()}><Upload /> Replace artwork…</Button>
              <div className="bones-attachment-name">{selectedAttachment?.assetPath ?? "Hidden slot"}</div>
            </InspectorSection>
            <InspectorSection title="Layer" open={inspectorSectionOpen("Layer")} onOpenChange={(open) => setInspectorSectionOpen("Layer", open)}>
              <FieldGrid label="Layer"><div className="bones-static-field">{selectedLayerGroup?.name ?? selectedSlot?.name ?? "—"}</div></FieldGrid>
              <FieldGrid label="Order"><div className="bones-static-field">{selectedLayerGroup ? layerGroups.indexOf(selectedLayerGroup) + 1 : selectedSlot?.drawOrder ?? "—"} <Lock /></div></FieldGrid>
              <p className="bones-helper">Layer order is locked during animation.</p>
            </InspectorSection>
          </ScrollArea>
        </aside>
          </>
        )}
      </div>

      {animationAuthoringActive && !advancedWorkspace ? (
        <Timeline
          clip={activeClip}
          clipId={activeClip?.id ?? clipId}
          currentTime={currentTime}
          tracks={activeTracks}
          onClipChange={(nextId) => { onClipChange(nextId); onCurrentTimeChange(0); }}
          clips={Object.values(project.animations).map((clip) => ({ id: clip.id, name: clip.name }))}
          onCurrentTimeChange={onCurrentTimeChange}
          onRunCommand={onRunCommand}
          duration={timelineDuration}
          frameRate={frameRate}
          selectedBoneId={selectedBoneId}
          selectedTargetIds={selectedTimelineTargets}
          selectedTransform={selectedTransform}
          boneGroups={timelineBoneGroups}
          boneTransforms={visibleBones}
          onSelectBone={selectTimelineBone}
          preferences={uiPreferences.timeline}
          onPreferencesChange={setTimelinePreferences}
        />
      ) : null}
    </main>
  );
}

function IconButton({ label, disabled, onClick, children }: { readonly label: string; readonly disabled?: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" disabled={disabled} onClick={onClick} aria-label={label}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function InspectorSection({ title, open, onOpenChange, children }: { readonly title: string; readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly children: ReactNode }) {
  return (
    <Collapsible className="bones-inspector-section" open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="bones-inspector-trigger">
        <ChevronDown className={open ? "is-open" : ""} />
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="bones-inspector-content">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function FieldGrid({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <div className="bones-field-grid"><span>{label}</span><div>{children}</div></div>;
}

function NumberField({ value, prefix, suffix, onCommit }: { readonly value: number; readonly prefix?: string; readonly suffix?: string; readonly onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(round(value)));
  useEffect(() => setDraft(String(round(value))), [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next)) onCommit(next);
    else setDraft(String(round(value)));
  };
  return <label className="bones-number-field">{prefix ? <span>{prefix}</span> : null}<Input value={draft} onFocus={() => setDraft(String(round(value)))} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />{suffix ? <span>{suffix}</span> : null}</label>;
}

function IkOverlay({ chain, worldBones, target, onPointerDown }: { readonly chain: EditorIkChain; readonly worldBones: Readonly<Record<string, WorldBone>>; readonly target: readonly [number, number] | null; readonly onPointerDown: (event: ReactPointerEvent<SVGCircleElement>, chain: EditorIkChain) => void }) {
  const root = worldBones[chain.rootBoneId];
  const middle = worldBones[chain.middleBoneId];
  const end = worldBones[chain.endBoneId];
  if (!root || !middle || !end) return null;
  const handle = target ?? [end.x + 58, end.y + 24] as const;
  return <g className="bones-ik-overlay"><polyline points={`${root.x},${root.y} ${middle.x},${middle.y} ${end.x},${end.y}`} /><line className="is-target" x1={end.x} y1={end.y} x2={handle[0]} y2={handle[1]} /><circle cx={root.x} cy={root.y} r="8" /><circle cx={middle.x} cy={middle.y} r="8" /><circle cx={end.x} cy={end.y} r="8" /><circle className="is-handle" cx={handle[0]} cy={handle[1]} r="9" onPointerDown={(event) => onPointerDown(event, chain)} /></g>;
}

interface TimelineProps {
  readonly clip: EditorProjectState["animations"][string] | undefined;
  readonly clipId: string;
  readonly currentTime: number;
  readonly tracks: readonly [string, readonly Keyframe[]][];
  readonly clips: readonly { readonly id: string; readonly name: string }[];
  readonly duration: number;
  readonly frameRate: number;
  readonly selectedBoneId: string;
  readonly selectedTargetIds: readonly string[];
  readonly selectedTransform: BoneTransform | undefined;
  readonly boneGroups: readonly TimelineGroupDefinition[];
  readonly boneTransforms: Readonly<Record<string, BoneTransform>>;
  readonly preferences: TimelineViewportPreferences;
  readonly onPreferencesChange: (preferences: TimelineViewportPreferences) => void;
  readonly onClipChange: (clipId: string) => void;
  readonly onCurrentTimeChange: (time: number) => void;
  readonly onSelectBone: (boneId: string) => void;
  readonly onRunCommand: (command: EditorCommand) => void;
}

interface TimelineGroupDefinition {
  readonly id: string;
  readonly label: string;
  readonly boneIds: readonly string[];
}

interface TimelineBoneTracks {
  readonly id: string;
  readonly label: string;
  readonly tracks: readonly [string, readonly Keyframe[]][];
}

interface TimelineTrackGroup {
  readonly id: string;
  readonly label: string;
  readonly bones: readonly TimelineBoneTracks[];
}

type TimelineRow =
  | { readonly kind: "group"; readonly id: string; readonly label: string; readonly boneCount: number; readonly trackCount: number }
  | { readonly kind: "bone"; readonly groupId: string; readonly boneId: string; readonly label: string; readonly trackCount: number }
  | { readonly kind: "track"; readonly groupId: string; readonly boneId: string; readonly trackId: string; readonly keys: readonly Keyframe[] };

const timelineLabelWidth = 220;
const timelineEndGutter = 18;
const timelineRulerHeight = 28;
const timelineRowHeight = 27;

function Timeline({ clip, clipId, currentTime, tracks, clips, duration, frameRate, selectedBoneId, selectedTargetIds, selectedTransform, boneGroups, boneTransforms, preferences, onPreferencesChange, onClipChange, onCurrentTimeChange, onSelectBone, onRunCommand }: TimelineProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 900, height: preferences.height - 40, scrollTop: 0 });
  const [windowHeight, setWindowHeight] = useState(720);
  const safeDuration = Math.max(0.001, duration);
  const groups = useMemo<TimelineTrackGroup[]>(() => {
    const grouped = new Map<string, [string, readonly Keyframe[]][]>()
    for (const track of tracks) {
      const dot = track[0].lastIndexOf(".");
      const targetId = dot > 0 ? track[0].slice(0, dot) : "Other";
      const bucket = grouped.get(targetId) ?? [];
      bucket.push(track);
      grouped.set(targetId, bucket);
    }
    const propertyOrder = ["x", "y", "rotation", "scaleX", "scaleY"];
    return boneGroups.map((group) => ({
      id: group.id,
      label: group.label,
      bones: group.boneIds.map((boneId) => {
        const boneTracks = [...(grouped.get(boneId) ?? [])];
        if (boneTransforms[boneId]) {
          for (const property of ["x", "y", "rotation", "scaleX", "scaleY"] as const) {
            const trackId = `${boneId}.${property}`;
            if (!boneTracks.some(([id]) => id === trackId)) boneTracks.push([trackId, []]);
          }
        }
        boneTracks.sort(([left], [right]) => {
          const leftProperty = left.slice(left.lastIndexOf(".") + 1);
          const rightProperty = right.slice(right.lastIndexOf(".") + 1);
          const leftOrder = propertyOrder.indexOf(leftProperty);
          const rightOrder = propertyOrder.indexOf(rightProperty);
          return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder) || left.localeCompare(right);
        });
        return { id: boneId, label: humanize(boneId), tracks: boneTracks };
      }).filter((bone) => bone.tracks.length > 0)
    })).filter((group) => group.bones.length > 0);
  }, [boneGroups, boneTransforms, tracks]);
  const visibleGroups = useMemo(
    () => preferences.filter === "selected" ? groups.filter((group) => group.bones.some((bone) => selectedTargetIds.includes(bone.id))) : groups,
    [groups, preferences.filter, selectedTargetIds]
  );
  const visibleTrackCount = useMemo(() => visibleGroups.reduce((total, group) => total + group.bones.reduce((boneTotal, bone) => boneTotal + bone.tracks.length, 0), 0), [visibleGroups]);
  const rows = useMemo<TimelineRow[]>(() => visibleGroups.flatMap((group) => {
    const groupKey = `${clipId}:${group.id}`;
    const trackCount = group.bones.reduce((total, bone) => total + bone.tracks.length, 0);
    const header: TimelineRow = { kind: "group", id: group.id, label: group.label, boneCount: group.bones.length, trackCount };
    if (preferences.collapsedGroups[groupKey]) return [header];
    return [header, ...group.bones.flatMap((bone): TimelineRow[] => {
      const boneRow: TimelineRow = { kind: "bone", groupId: group.id, boneId: bone.id, label: bone.label, trackCount: bone.tracks.length };
      if (preferences.collapsedBones[`${clipId}:${group.id}:${bone.id}`]) return [boneRow];
      return [boneRow, ...bone.tracks.map(([trackId, keys]): TimelineRow => ({ kind: "track", groupId: group.id, boneId: bone.id, trackId, keys }))];
    })];
  }), [clipId, preferences.collapsedBones, preferences.collapsedGroups, visibleGroups]);
  const zoom = clamp(preferences.zoomByClip[clipId] ?? 1, 1, 8);
  const availableTimeWidth = Math.max(280, viewport.width - timelineLabelWidth - timelineEndGutter);
  const timeWidth = Math.max(availableTimeWidth, availableTimeWidth * zoom);
  const pixelsPerSecond = timeWidth / safeDuration;
  const totalWidth = timelineLabelWidth + timeWidth + timelineEndGutter;
  const contentHeight = timelineRulerHeight + rows.length * timelineRowHeight;
  const visibleStart = Math.max(0, Math.floor((viewport.scrollTop - timelineRulerHeight) / timelineRowHeight) - 4);
  const visibleEnd = Math.min(rows.length, Math.ceil((viewport.scrollTop + viewport.height) / timelineRowHeight) + 4);
  const visibleRows = rows.slice(visibleStart, visibleEnd);
  const frameCount = Math.max(1, Math.round(safeDuration * frameRate));
  const tickStep = niceFrameStep(64 / Math.max(0.001, pixelsPerSecond / frameRate));
  const rulerFrames = useMemo(() => {
    const result: number[] = [];
    for (let frame = 0; frame <= frameCount; frame += tickStep) result.push(frame);
    if (result[result.length - 1] !== frameCount) result.push(frameCount);
    return result;
  }, [frameCount, tickStep]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const resize = () => setViewport((current) => ({ ...current, width: node.clientWidth, height: node.clientHeight }));
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (preferences.heightMode === "manual") return;
    const desired = clamp(42 + timelineRulerHeight + rows.length * timelineRowHeight, 150, windowHeight * 0.4);
    if (Math.abs(desired - preferences.height) > 1) onPreferencesChange({ ...preferences, height: desired });
  }, [onPreferencesChange, preferences, rows.length, windowHeight]);

  const updateZoom = (nextZoom: number) => onPreferencesChange({
    ...preferences,
    zoomByClip: { ...preferences.zoomByClip, [clipId]: clamp(nextZoom, 1, 8) }
  });
  const updateFilter = (filter: TrackFilter) => onPreferencesChange({ ...preferences, filter });
  const toggleGroup = (groupId: string) => {
    const key = `${clipId}:${groupId}`;
    onPreferencesChange({
      ...preferences,
      collapsedGroups: { ...preferences.collapsedGroups, [key]: !preferences.collapsedGroups[key] }
    });
  };
  const toggleBone = (groupId: string, boneId: string) => {
    const key = `${clipId}:${groupId}:${boneId}`;
    onPreferencesChange({ ...preferences, collapsedBones: { ...preferences.collapsedBones, [key]: !preferences.collapsedBones[key] } });
  };
  const snapTime = (time: number) => round(clamp(Math.round(time * frameRate) / frameRate, 0, safeDuration), 4);
  const timeFromLane = (lane: HTMLElement, clientX: number) => snapTime((clientX - lane.getBoundingClientRect().left) / pixelsPerSecond);
  const seek = (event: ReactPointerEvent<HTMLElement>) => onCurrentTimeChange(timeFromLane(event.currentTarget, event.clientX));
  const dragKey = (event: ReactPointerEvent<HTMLButtonElement>, trackId: string, keyframe: Keyframe) => {
    event.stopPropagation();
    const lane = event.currentTarget.parentElement;
    if (!lane) return;
    const onMove = (moveEvent: PointerEvent) => onCurrentTimeChange(timeFromLane(lane, moveEvent.clientX));
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const time = timeFromLane(lane, upEvent.clientX);
      onCurrentTimeChange(time);
      onRunCommand(createMoveKeyframeCommand(clipId, trackId, keyframe.id, time));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = preferences.height;
    const onMove = (moveEvent: PointerEvent) => {
      const height = clamp(startHeight - (moveEvent.clientY - startY), 150, window.innerHeight * 0.55);
      onPreferencesChange({ ...preferences, height, heightMode: "manual" });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const resetAutoHeight = () => onPreferencesChange({ ...preferences, heightMode: "auto" });

  return <section className="bones-timeline" style={{ height: preferences.height }} aria-label="Animation timeline">
    <div className="bones-timeline-resize" role="separator" aria-orientation="horizontal" aria-label="Resize timeline" title="Drag to resize · Double-click for auto height" onPointerDown={startResize} onDoubleClick={resetAutoHeight} />
    <div className="bones-timeline-head">
      <Select value={clipId} onValueChange={onClipChange}><SelectTrigger aria-label="Animation clip"><SelectValue /></SelectTrigger><SelectContent>{clips.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Button size="icon-xs" variant="ghost" aria-label="Add clip"><Plus /></Button>
      <ToggleGroup type="single" value={preferences.filter} size="sm" spacing={0} variant="outline" aria-label="Timeline track filter" onValueChange={(value) => value && updateFilter(value as TrackFilter)}>
        <ToggleGroupItem className="h-6 px-2 text-[10px]" value="all">All</ToggleGroupItem>
        <ToggleGroupItem className="h-6 px-2 text-[10px]" value="selected">Selected</ToggleGroupItem>
      </ToggleGroup>
      <Button size="xs" variant="outline" disabled={!clip || !selectedTransform} onClick={() => clip && selectedTransform && onRunCommand(createSetKeyframeAtTimeCommand(clip.id, `${selectedBoneId}.rotation`, currentTime, selectedTransform.rotation))}><KeyRound data-icon="inline-start" /> Add key</Button>
      <div className="bones-timeline-zoom" aria-label="Timeline zoom">
        <Button size="icon-xs" variant="ghost" aria-label="Zoom out" onClick={() => updateZoom(zoom - 0.25)}><Minus /></Button>
        <Slider value={[zoom]} min={1} max={8} step={0.1} onValueChange={(value) => updateZoom(value[0] ?? 1)} aria-label="Timeline zoom level" />
        <Button size="icon-xs" variant="ghost" aria-label="Zoom in" onClick={() => updateZoom(zoom + 0.25)}><Plus /></Button>
        <Button size="xs" variant="ghost" onClick={() => updateZoom(1)}>Fit</Button>
      </div>
    </div>
    <div
      ref={viewportRef}
      className="bones-timeline-viewport"
      onScroll={(event) => {
        const scrollTop = event.currentTarget.scrollTop;
        setViewport((current) => ({ ...current, scrollTop }));
      }}
    >
      <div className="bones-timeline-content" style={{ width: totalWidth, height: Math.max(contentHeight, viewport.height) }}>
        <div className="bones-timeline-ruler-row" style={{ width: totalWidth }}>
          <div className="bones-timeline-corner">{visibleTrackCount} tracks</div>
          <div className="bones-ruler" style={{ width: timeWidth }} onPointerDown={seek}>
            {rulerFrames.map((frame) => <span key={frame} style={{ left: frame / frameRate * pixelsPerSecond }}>{frame}</span>)}
          </div>
        </div>
        {visibleRows.map((row, localIndex) => {
          const rowIndex = visibleStart + localIndex;
          const top = timelineRulerHeight + rowIndex * timelineRowHeight;
          if (row.kind === "group") {
            const collapsed = Boolean(preferences.collapsedGroups[`${clipId}:${row.id}`]);
            return <div key={`group:${row.id}`} className="bones-timeline-row is-group" style={{ top, width: totalWidth }}>
              <button className="bones-timeline-label" onClick={() => toggleGroup(row.id)} aria-expanded={!collapsed}><ChevronRight className={collapsed ? "" : "is-open"} /><span className="truncate">{row.label}</span><small>{row.boneCount} bones · {row.trackCount}</small></button>
              <div className="bones-track-lane" style={{ width: timeWidth }} onPointerDown={seek} />
            </div>;
          }
          if (row.kind === "bone") {
            const collapsed = Boolean(preferences.collapsedBones[`${clipId}:${row.groupId}:${row.boneId}`]);
            return <div key={`bone:${row.groupId}:${row.boneId}`} className={`bones-timeline-row is-bone${row.boneId === selectedBoneId ? " is-selected" : ""}`} style={{ top, width: totalWidth }}>
              <button className="bones-timeline-label" onClick={() => { onSelectBone(row.boneId); toggleBone(row.groupId, row.boneId); }} aria-expanded={!collapsed}><ChevronRight className={collapsed ? "" : "is-open"} /><Bone /><span className="truncate">{row.label}</span><small>{row.trackCount}</small></button>
              <div className="bones-track-lane" style={{ width: timeWidth }} onPointerDown={seek} />
            </div>;
          }
          const property = row.trackId.slice(row.trackId.lastIndexOf(".") + 1);
          const transform = boneTransforms[row.boneId];
          const transformProperty = (["x", "y", "rotation", "scaleX", "scaleY"] as const).find((item) => item === property);
          const keyValue = transform && transformProperty ? transform[transformProperty] : undefined;
          return <div key={row.trackId} className="bones-timeline-row" style={{ top, width: totalWidth }}>
            <div className="bones-timeline-label" onPointerDown={() => onSelectBone(row.boneId)}>
              <span className="truncate">{humanize(property)}</span>
              {keyValue === undefined ? <span className="bones-track-enabled">✓</span> : <button className="bones-track-key-add" aria-label={`Add ${row.trackId} key`} title="Add key at playhead" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelectBone(row.boneId); onRunCommand(createSetKeyframeAtTimeCommand(clipId, row.trackId, currentTime, keyValue)); }}><KeyRound /></button>}
            </div>
            <div className="bones-track-lane" style={{ width: timeWidth }} onPointerDown={seek}>
              {row.keys.map((key) => <button key={key.id} className="bones-key" style={{ left: clamp(key.time, 0, safeDuration) * pixelsPerSecond }} aria-label={`${row.trackId} key at ${key.time}`} onPointerDown={(event) => dragKey(event, row.trackId, key)} />)}
            </div>
          </div>;
        })}
        <div className="bones-playhead" style={{ left: timelineLabelWidth + clamp(currentTime, 0, safeDuration) * pixelsPerSecond, height: Math.max(contentHeight, viewport.height) }}><span>{Math.round(currentTime * frameRate)}</span></div>
      </div>
    </div>
  </section>;
}

function sampleEditorBones(project: EditorProjectState, clipId: string | undefined, time: number): Readonly<Record<string, BoneTransform>> {
  const bones = Object.fromEntries(Object.entries(project.bones).map(([id, transform]) => [id, { ...transform }])) as Record<string, BoneTransform>;
  const clip = clipId ? project.animations[clipId] : undefined;
  if (!clip) return bones;
  for (const [trackId, keys] of Object.entries(clip.tracks)) {
    const dot = trackId.lastIndexOf(".");
    if (dot < 1) continue;
    const boneId = trackId.slice(0, dot);
    const property = trackId.slice(dot + 1) as keyof BoneTransform;
    if (!bones[boneId] || !["x", "y", "rotation", "scaleX", "scaleY"].includes(property)) continue;
    const value = sampleNumericKeys(keys, time);
    if (value !== undefined) bones[boneId] = { ...bones[boneId]!, [property]: value };
  }
  return bones;
}

function sampleNumericKeys(keys: readonly Keyframe[], time: number): number | undefined {
  const numeric = keys.filter((key): key is Keyframe & { readonly value: number } => typeof key.value === "number").sort((a, b) => a.time - b.time);
  if (!numeric.length) return undefined;
  const rightIndex = numeric.findIndex((key) => key.time >= time);
  if (rightIndex <= 0) return numeric[rightIndex < 0 ? numeric.length - 1 : 0]!.value;
  const left = numeric[rightIndex - 1]!;
  const right = numeric[rightIndex]!;
  if (left.interpolation === "step" || left.interpolation === "hold") return left.value;
  const alpha = clamp((time - left.time) / Math.max(0.00001, right.time - left.time), 0, 1);
  return left.value + (right.value - left.value) * alpha;
}

function calculateWorldBones(project: EditorProjectState, bones: Readonly<Record<string, BoneTransform>>): Readonly<Record<string, WorldBone>> {
  const result: Record<string, WorldBone> = {};
  const visit = (boneId: string): WorldBone => {
    if (result[boneId]) return result[boneId]!;
    const local = bones[boneId] ?? project.bones[boneId] ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    const parentId = project.parents[boneId];
    if (!parentId || !bones[parentId]) return result[boneId] = { ...local };
    const parent = visit(parentId);
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    const x = local.x * parent.scaleX;
    const y = local.y * parent.scaleY;
    return result[boneId] = {
      x: parent.x + x * cos - y * sin,
      y: parent.y + x * sin + y * cos,
      rotation: parent.rotation + local.rotation,
      scaleX: parent.scaleX * local.scaleX,
      scaleY: parent.scaleY * local.scaleY
    };
  };
  for (const boneId of project.hierarchy) visit(boneId);
  return result;
}

function solveTwoBoneIk(project: EditorProjectState, bones: Readonly<Record<string, BoneTransform>>, chain: EditorIkChain, target: readonly [number, number]): Readonly<Record<string, BoneTransform>> {
  const world = calculateWorldBones(project, bones);
  const root = world[chain.rootBoneId];
  const middleLocal = bones[chain.middleBoneId];
  const endLocal = bones[chain.endBoneId];
  if (!root || !middleLocal || !endLocal) return bones;
  const parentId = project.parents[chain.rootBoneId];
  const parentRotation = parentId ? world[parentId]?.rotation ?? 0 : 0;
  const length1 = Math.max(0.001, Math.hypot(middleLocal.x * root.scaleX, middleLocal.y * root.scaleY));
  const middleWorld = world[chain.middleBoneId]!;
  const length2 = Math.max(0.001, Math.hypot(endLocal.x * middleWorld.scaleX, endLocal.y * middleWorld.scaleY));
  const dx = target[0] - root.x;
  const dy = target[1] - root.y;
  const rawDistance = Math.hypot(dx, dy);
  const stretchRatio = chain.stretch && rawDistance > length1 + length2 ? rawDistance / (length1 + length2) : 1;
  const solvedLength1 = length1 * stretchRatio;
  const solvedLength2 = length2 * stretchRatio;
  const distance = clamp(rawDistance, Math.abs(solvedLength1 - solvedLength2) + 0.001, solvedLength1 + solvedLength2 - 0.001);
  const targetAngle = Math.atan2(dy, dx);
  const shoulderOffset = Math.acos(clamp((solvedLength1 * solvedLength1 + distance * distance - solvedLength2 * solvedLength2) / (2 * solvedLength1 * distance), -1, 1));
  const poleWorldAngle = radians(chain.poleAngle);
  const preferredSign = Math.cos(targetAngle - shoulderOffset - poleWorldAngle) >= Math.cos(targetAngle + shoulderOffset - poleWorldAngle) ? -1 : 1;
  const segment1Angle = targetAngle + preferredSign * chain.bendDirection * shoulderOffset;
  const elbowX = root.x + Math.cos(segment1Angle) * solvedLength1;
  const elbowY = root.y + Math.sin(segment1Angle) * solvedLength1;
  const segment2Angle = Math.atan2(target[1] - elbowY, target[0] - elbowX);
  const rootBase = Math.atan2(middleLocal.y, middleLocal.x);
  const endBase = Math.atan2(endLocal.y, endLocal.x);
  const rootRotation = segment1Angle - parentRotation - rootBase;
  const rootWorldRotation = parentRotation + rootRotation;
  const middleRotation = segment2Angle - rootWorldRotation - endBase;
  return {
    ...bones,
    [chain.rootBoneId]: {
      ...bones[chain.rootBoneId]!,
      rotation: round(rootRotation, 5),
      scaleX: round(bones[chain.rootBoneId]!.scaleX * stretchRatio, 5),
      scaleY: round(bones[chain.rootBoneId]!.scaleY * stretchRatio, 5)
    },
    [chain.middleBoneId]: { ...bones[chain.middleBoneId]!, rotation: round(middleRotation, 5) }
  };
}

function calculateRigViewBox(project: EditorProjectState, worldBones: Readonly<Record<string, WorldBone>>) {
  const meshPoints = Object.values(project.parts).flatMap((part) => {
    const vertices = part.mesh?.vertices ?? [];
    const points: { x: number; y: number }[] = [];
    for (let index = 0; index < vertices.length; index += 2) {
      const world = partLocalToWorld(part, [vertices[index] ?? 0, vertices[index + 1] ?? 0], worldBones[part.boneId]);
      points.push({ x: world[0], y: world[1] });
    }
    return points;
  });
  const points = meshPoints.length ? meshPoints : Object.values(worldBones);
  if (!points.length) return { x: -240, y: -420, width: 480, height: 560 };
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = Math.max(120, maxX - minX + 80) / 0.84;
  const height = Math.max(160, maxY - minY + 80) / 0.84;
  return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
}

function svgClientPoint(svg: SVGSVGElement, clientX: number, clientY: number): readonly [number, number] {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
  return [transformed.x, transformed.y];
}

function worldToLocal(point: readonly [number, number], parent: WorldBone): readonly [number, number] {
  const dx = point[0] - parent.x;
  const dy = point[1] - parent.y;
  const cos = Math.cos(-parent.rotation);
  const sin = Math.sin(-parent.rotation);
  return [(dx * cos - dy * sin) / Math.max(0.0001, parent.scaleX), (dx * sin + dy * cos) / Math.max(0.0001, parent.scaleY)];
}

function partLocalToWorld(part: EditorProjectState["parts"][string], point: readonly [number, number], bone: WorldBone | undefined): readonly [number, number] {
  const pivot = part.pivot ?? [0, 0];
  const scale = part.scale ?? [1, 1];
  const offset = part.offset ?? [0, 0];
  const rotation = part.rotation ?? 0;
  const localX = (point[0] - pivot[0]) * scale[0];
  const localY = (point[1] - pivot[1]) * scale[1];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const attached: readonly [number, number] = [localX * cos - localY * sin + offset[0], localX * sin + localY * cos + offset[1]];
  if (!bone) return attached;
  const boneCos = Math.cos(bone.rotation);
  const boneSin = Math.sin(bone.rotation);
  const x = attached[0] * bone.scaleX;
  const y = attached[1] * bone.scaleY;
  return [bone.x + x * boneCos - y * boneSin, bone.y + x * boneSin + y * boneCos];
}

function partWorldToLocal(part: EditorProjectState["parts"][string], point: readonly [number, number], bone: WorldBone | undefined): readonly [number, number] {
  let attached: readonly [number, number] = point;
  if (bone) attached = worldToLocal(point, bone);
  const offset = part.offset ?? [0, 0];
  const dx = attached[0] - offset[0];
  const dy = attached[1] - offset[1];
  const rotation = -(part.rotation ?? 0);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scale = part.scale ?? [1, 1];
  const pivot = part.pivot ?? [0, 0];
  return [(dx * cos - dy * sin) / Math.max(0.0001, scale[0]) + pivot[0], (dx * sin + dy * cos) / Math.max(0.0001, scale[1]) + pivot[1]];
}

function sampleDeformKeys(keys: readonly Keyframe[], time: number, valueCount: number): readonly number[] {
  const arrays = keys.filter((key): key is Keyframe & { readonly value: readonly number[] } => Array.isArray(key.value) && key.value.every((value) => typeof value === "number"));
  if (!arrays.length) return Array.from({ length: valueCount }, () => 0);
  const ordered = [...arrays].sort((left, right) => left.time - right.time);
  const rightIndex = ordered.findIndex((key) => key.time >= time);
  if (rightIndex <= 0) return Array.from({ length: valueCount }, (_, index) => ordered[rightIndex < 0 ? ordered.length - 1 : 0]!.value[index] ?? 0);
  const left = ordered[rightIndex - 1]!;
  const right = ordered[rightIndex]!;
  if (left.interpolation === "step" || left.interpolation === "hold") return Array.from({ length: valueCount }, (_, index) => left.value[index] ?? 0);
  const alpha = clamp((time - left.time) / Math.max(0.00001, right.time - left.time), 0, 1);
  return Array.from({ length: valueCount }, (_, index) => (left.value[index] ?? 0) + ((right.value[index] ?? 0) - (left.value[index] ?? 0)) * alpha);
}

function meshNeighborIndices(mesh: MeshShape, vertexIndex: number): readonly number[] {
  const neighbors = new Set<number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const triangle = mesh.indices.slice(index, index + 3);
    if (!triangle.includes(vertexIndex)) continue;
    triangle.forEach((candidate) => { if (candidate !== vertexIndex) neighbors.add(candidate); });
  }
  return [...neighbors];
}

function weightColor(weight: number): string {
  const clamped = clamp(weight, 0, 1);
  const hue = 225 - clamped * 190;
  return `hsl(${hue} 88% ${55 + clamped * 12}%)`;
}

function boneDepth(project: EditorProjectState, boneId: string): number {
  let depth = 0;
  let cursor = project.parents[boneId];
  while (cursor && depth < 12) { depth += 1; cursor = project.parents[cursor]; }
  return depth;
}

function createLayerGroups(slots: readonly EditorVisualSlot[]): readonly LayerGroup[] {
  const definitions = [
    { id: "rear-arm", name: "Rear arm", matches: (name: string) => /left (hand|finger)/.test(name) },
    { id: "rear-leg", name: "Rear leg", matches: (name: string) => /left (leg|foot)/.test(name) },
    { id: "cape", name: "Cape", matches: (name: string) => name.includes("cape") },
    { id: "body", name: "Body", matches: (name: string) => /^(hip|body|darkness|collar)$/.test(name) },
    { id: "head", name: "Head", matches: (name: string) => /^(eyes|hood)$/.test(name) },
    { id: "front-leg", name: "Front leg", matches: (name: string) => /right (leg|foot)/.test(name) },
    { id: "front-arm", name: "Front arm", matches: (name: string) => /right (hand|finger)/.test(name) }
  ] as const;
  const grouped = definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    slots: slots.filter((slot) => definition.matches(slot.name.toLowerCase()))
  })).filter((group) => group.slots.length);
  const assignedIds = new Set(grouped.flatMap((group) => group.slots.map((slot) => slot.id)));
  if (grouped.length === definitions.length && assignedIds.size === slots.length) return grouped;
  return slots.map((slot) => ({ id: slot.id, name: slot.name, slots: [slot] }));
}

function createTimelineBoneGroups(project: EditorProjectState, tracks: readonly [string, readonly Keyframe[]][]): readonly TimelineGroupDefinition[] {
  const targetIds = [...new Set(tracks.map(([trackId]) => {
    const dot = trackId.lastIndexOf(".");
    return dot > 0 ? trackId.slice(0, dot) : trackId;
  }))];
  const groups = Object.values(project.topology.groups).map((group) => ({ id: group.id, label: group.name, boneIds: group.boneIds.filter((boneId) => Boolean(project.bones[boneId])) }));
  const faceTargetIds = targetIds.filter((targetId) => targetId === "slot:eyes" || targetId === "slot:mouth");
  if (faceTargetIds.length) groups.push({ id: "face", label: "Face", boneIds: faceTargetIds });
  for (const partId of targetIds.filter((targetId) => Boolean(project.parts[targetId]))) {
    const slot = Object.values(project.visualSlots).find((candidate) => Object.values(project.skins).some((skin) => skin.attachments[candidate.id] === partId));
    groups.push({ id: `part:${partId}`, label: slot?.name ?? humanize(partId), boneIds: [partId] });
  }
  const other = { id: "other-bones", label: "Other bones", boneIds: [] as string[] };
  for (const targetId of targetIds) {
    if (groups.some((group) => group.boneIds.includes(targetId))) continue;
    other.boneIds.push(targetId);
  }
  if (other.boneIds.length) groups.push(other);
  return groups.filter((group) => group.boneIds.length > 0);
}

function sampleAttachmentAt(keys: readonly Keyframe[], time: number): string | null | undefined {
  let value: string | null | undefined;
  for (const key of keys) {
    if (key.time > time) break;
    if (key.value === null || typeof key.value === "string") value = key.value;
  }
  return value;
}

function findChainForBone(project: EditorProjectState, chains: Readonly<Record<string, EditorIkChain>>, boneId: string): EditorIkChain | undefined {
  let cursor: string | null | undefined = boneId;
  while (cursor) {
    const chain = Object.values(chains).find((item) => [item.rootBoneId, item.middleBoneId, item.endBoneId].includes(cursor!));
    if (chain) return chain;
    cursor = project.parents[cursor];
  }
  return undefined;
}

function uniqueId(prefix: string, ids: readonly string[]): string {
  let index = 2;
  while (ids.includes(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function niceFrameStep(value: number): number {
  const safe = Math.max(1, value);
  const power = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.max(1, Math.ceil(multiplier * power));
}

function readStudioUiPreferences(value: unknown): StudioUiPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultStudioUiPreferences;
  const record = value as Record<string, unknown>;
  const timelineValue = record.timeline && typeof record.timeline === "object" && !Array.isArray(record.timeline) ? record.timeline as Record<string, unknown> : {};
  const zoomValue = timelineValue.zoomByClip && typeof timelineValue.zoomByClip === "object" && !Array.isArray(timelineValue.zoomByClip) ? timelineValue.zoomByClip as Record<string, unknown> : {};
  const collapsedValue = timelineValue.collapsedGroups && typeof timelineValue.collapsedGroups === "object" && !Array.isArray(timelineValue.collapsedGroups) ? timelineValue.collapsedGroups as Record<string, unknown> : {};
  const collapsedBonesValue = timelineValue.collapsedBones && typeof timelineValue.collapsedBones === "object" && !Array.isArray(timelineValue.collapsedBones) ? timelineValue.collapsedBones as Record<string, unknown> : {};
  const inspectorValue = record.inspectorSections && typeof record.inspectorSections === "object" && !Array.isArray(record.inspectorSections) ? record.inspectorSections as Record<string, unknown> : {};
  return {
    timeline: {
      height: typeof timelineValue.height === "number" ? clamp(timelineValue.height, 150, 640) : defaultStudioUiPreferences.timeline.height,
      heightMode: timelineValue.heightMode === "manual" ? "manual" : "auto",
      zoomByClip: Object.fromEntries(Object.entries(zoomValue).filter((entry): entry is [string, number] => typeof entry[1] === "number").map(([id, zoom]) => [id, clamp(zoom, 1, 8)])),
      filter: timelineValue.filter === "selected" ? "selected" : "all",
      collapsedGroups: Object.fromEntries(Object.entries(collapsedValue).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")),
      collapsedBones: Object.fromEntries(Object.entries(collapsedBonesValue).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"))
    },
    inspectorSections: Object.fromEntries(Object.entries(inspectorValue).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"))
  };
}

function isBoneEditingLocked(project: EditorProjectState, boneId: string): boolean {
  return Boolean(project.boneMetadata[boneId]?.locked || Object.values(project.topology.groups).some((group) => group.locked && group.boneIds.includes(boneId)));
}

function humanize(value: string): string { return value.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()); }
function degrees(value: number): number { return value * 180 / Math.PI; }
function radians(value: number): number { return value * Math.PI / 180; }
function round(value: number, precision = 3): number { const factor = 10 ** precision; return Math.round(value * factor) / factor; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
