"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BoneIcon,
  CatIcon,
  CheckIcon,
  CircleIcon,
  DogIcon,
  DownloadIcon,
  FileImageIcon,
  FilmIcon,
  FolderOpenIcon,
  LockIcon,
  PackageCheckIcon,
  PauseIcon,
  PlayIcon,
  SaveIcon,
  SettingsIcon,
  TestTube2Icon,
  UploadCloudIcon,
  UserRoundIcon,
  ZapIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { QualityPresetName } from "@bones/runtime-pixi";
import type { EditorProjectState } from "./editorState";
import type { CreationTemplate } from "./characterTemplates";
import type { ProjectExportBundle } from "./projectIo";
import { PixiPreview } from "./PixiPreview";

export type GuidedStep = "character" | "textures" | "skeleton" | "animations" | "test" | "export";

interface GuidedEditorProps {
  readonly creating: boolean;
  readonly createName: string;
  readonly createKind: CreationTemplate;
  readonly creationPreviewProject: EditorProjectState;
  readonly project: EditorProjectState;
  readonly step: GuidedStep;
  readonly playing: boolean;
  readonly clipId: string;
  readonly quality: QualityPresetName;
  readonly ioStatus: string;
  readonly lastExportBundle: ProjectExportBundle | null;
  readonly runtimeZipBytes: number | null;
  readonly packageZipBytes: number | null;
  readonly onCreateNameChange: (value: string) => void;
  readonly onCreateKindChange: (kind: CreationTemplate) => void;
  readonly onCreate: () => void;
  readonly onOpenSample: () => void;
  readonly onImportProject: (file: File) => Promise<void>;
  readonly onNewCharacter: () => void;
  readonly onStepChange: (step: GuidedStep) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onClipChange: (clipId: string) => void;
  readonly onSaveDraft: () => void;
  readonly onOpenAdvanced: (mode?: "Rig" | "Timeline" | "Preview") => void;
  readonly onFilesSelected: (files: readonly File[]) => Promise<void>;
  readonly onExport: () => Promise<void>;
}

const guidedSteps: readonly { readonly id: GuidedStep; readonly label: string; readonly icon: typeof UserRoundIcon }[] = [
  { id: "character", label: "Character", icon: UserRoundIcon },
  { id: "textures", label: "Textures", icon: FileImageIcon },
  { id: "skeleton", label: "Skeleton", icon: BoneIcon },
  { id: "animations", label: "Animations", icon: FilmIcon },
  { id: "test", label: "Test", icon: TestTube2Icon },
  { id: "export", label: "Export", icon: DownloadIcon }
];

const requiredClips = ["idle", "walk", "run", "jump", "fall", "land"] as const;
const fighterRequiredClips = ["idle", "walk_forward", "dash_forward", "jump_start", "air_neutral", "land"] as const;
const reporterRequiredClips = ["idle_neutral", "talk_neutral", "talk_happy", "talk_sad", "talk_angry", "explain_point", "discuss_two_hands", "greeting", "surprise_reaction", "farewell"] as const;

export function GuidedEditor(props: GuidedEditorProps) {
  if (props.creating) {
    return <CharacterCreator {...props} />;
  }

  return <GuidedWorkspace {...props} />;
}

function CharacterCreator({
  createKind,
  createName,
  creationPreviewProject,
  onCreate,
  onCreateKindChange,
  onCreateNameChange,
  onImportProject,
  onOpenSample,
  quality
}: GuidedEditorProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const nameValid = createName.trim().length > 1;

  return (
    <main className="grid h-dvh grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-background" aria-label="Create a Bones character">
      <header className="flex items-center border-b px-6">
        <div className="flex items-center gap-2.5">
          <BoneIcon aria-hidden="true" className="size-5" />
          <strong className="text-base tracking-[0.12em]">BONES</strong>
        </div>
      </header>

      <section className="min-h-0 overflow-auto p-6 lg:p-12">
        <Card className="mx-auto min-h-[min(760px,calc(100dvh-152px))] max-w-6xl grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-0 py-0 lg:grid">
          <div className="flex min-h-0 flex-col border-b p-8 lg:border-r lg:border-b-0 lg:p-12">
            <CardHeader className="px-0">
              <CardTitle className="text-3xl font-semibold tracking-tight">Create a character</CardTitle>
              <CardDescription className="text-base">Choose a starting rig. You can replace every part later.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-center px-0 py-8">
              <FieldGroup>
                <Field data-invalid={!nameValid}>
                  <FieldLabel htmlFor="guided-character-name">Character name</FieldLabel>
                  <Input
                    id="guided-character-name"
                    aria-invalid={!nameValid}
                    autoFocus
                    value={createName}
                    onChange={(event) => onCreateNameChange(event.target.value)}
                  />
                  {!nameValid ? <FieldDescription>Enter at least two characters.</FieldDescription> : null}
                </Field>

                <Field>
                  <FieldLabel id="guided-character-type">Starting rig</FieldLabel>
                  <ToggleGroup
                    aria-labelledby="guided-character-type"
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    type="single"
                    value={createKind}
                    variant="outline"
                    onValueChange={(value) => value && onCreateKindChange(value as CreationTemplate)}
                  >
                    <ToggleGroupItem className="h-28 items-start justify-start px-4 py-4" value="human">
                      <UserRoundIcon aria-hidden="true" className="mt-0.5 shrink-0" />
                      <span className="flex flex-col items-start gap-1 text-left">
                        <strong className="text-base">Human</strong>
                        <span className="text-xs text-muted-foreground">Two-legged platformer rig</span>
                      </span>
                    </ToggleGroupItem>
                    <ToggleGroupItem className="h-28 items-start justify-start px-4 py-4" value="dog">
                      <DogIcon aria-hidden="true" className="mt-0.5 shrink-0" />
                      <span className="flex flex-col items-start gap-1 text-left">
                        <strong className="text-base">Dog</strong>
                        <span className="text-xs text-muted-foreground">Four-legged platformer rig</span>
                      </span>
                    </ToggleGroupItem>
                    <ToggleGroupItem className="h-28 items-start justify-start px-4 py-4" value="pulse">
                      <ZapIcon aria-hidden="true" className="mt-0.5 shrink-0" />
                      <span className="flex flex-col items-start gap-1 text-left">
                        <strong className="text-base">Pulse</strong>
                        <span className="text-xs text-muted-foreground">38-bone fighting preset</span>
                      </span>
                    </ToggleGroupItem>
                    <ToggleGroupItem className="h-28 items-start justify-start px-4 py-4" value="milo-reporter">
                      <CatIcon aria-hidden="true" className="mt-0.5 shrink-0" />
                      <span className="flex flex-col items-start gap-1 text-left">
                        <strong className="text-base">Milo Reporter</strong>
                        <span className="text-xs text-muted-foreground">25-bone talking mascot</span>
                      </span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="flex-wrap gap-3 border-0 bg-transparent px-0 pb-8">
              <Button disabled={!nameValid} size="lg" onClick={onCreate}>
                {createKind === "dog" ? <DogIcon data-icon="inline-start" /> : createKind === "milo-reporter" || createKind === "cat" ? <CatIcon data-icon="inline-start" /> : <UserRoundIcon data-icon="inline-start" />}
                Create {createKind === "pulse" ? "Pulse fighter" : createKind === "milo-reporter" || createKind === "cat" ? "Milo Reporter" : createKind}
              </Button>
              <Button size="lg" variant="outline" onClick={() => importInputRef.current?.click()}>
                <FolderOpenIcon data-icon="inline-start" />
                Import project
              </Button>
              <input
                ref={importInputRef}
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onImportProject(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
              <Button className="basis-full justify-start px-0" variant="link" onClick={onOpenSample}>
                Open sample
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardFooter>
          </div>

          <div className="flex min-h-[520px] flex-col gap-6 p-8 lg:p-12">
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-[var(--guide-canvas)]">
              <PixiPreview
                clipId={createKind === "milo-reporter" || createKind === "cat" ? "idle_neutral" : "idle"}
                playing
                project={creationPreviewProject}
                quality={quality}
                runtimeMode="source"
                showSkeleton={false}
              />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-medium">Starting content</h2>
              {["Skeleton", "Idle, walk, run", "Jump, fall, land"].map((label) => (
                <div className="flex items-center gap-2 text-sm" key={label}>
                  <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}

function GuidedWorkspace(props: GuidedEditorProps) {
  const currentIndex = guidedSteps.findIndex((item) => item.id === props.step);
  const completion = getStepCompletion(props.project, props.lastExportBundle);
  const progress = ((currentIndex + 1) / guidedSteps.length) * 100;

  return (
    <main className="grid h-dvh grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-background" aria-label="Bones guided editor">
      <header className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)_auto] items-center border-b lg:grid-cols-[220px_minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-2.5 px-5">
          <BoneIcon aria-hidden="true" className="size-5 shrink-0" />
          <strong className="hidden truncate text-base lg:block">Bones</strong>
        </div>
        <div className="min-w-0 border-l px-5">
          <p className="truncate text-sm font-medium">{props.project.name}</p>
          <p className="text-xs text-muted-foreground">{characterKindLabel(props.project.characterKind)} character</p>
        </div>
        <div className="flex items-center gap-3 px-5">
          <Button size="sm" variant="outline" onClick={props.onSaveDraft}>
            <SaveIcon data-icon="inline-start" />
            <span className="hidden lg:inline">Save draft</span>
          </Button>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="advanced-mode" className="hidden text-xs lg:block">Advanced</FieldLabel>
            <Switch id="advanced-mode" size="sm" checked={false} onCheckedChange={() => props.onOpenAdvanced()} />
          </Field>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r bg-sidebar" aria-label="Character workflow">
          <div className="px-5 py-5">
            <p className="hidden text-xs font-medium text-muted-foreground lg:block">BUILD CHARACTER</p>
            <Progress className="mt-3" value={progress} />
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-2">
            {guidedSteps.map((item, index) => {
              const completed = index < currentIndex || (item.id === "export" && completion.export);
              const active = item.id === props.step;
              const locked = index > currentIndex + 1;
              const Icon = item.icon;

              return (
                <Button
                  className="h-14 justify-start px-3"
                  disabled={locked}
                  key={item.id}
                  variant={active ? "secondary" : "ghost"}
                  onClick={() => props.onStepChange(item.id)}
                >
                  {completed ? <CheckIcon data-icon="inline-start" /> : locked ? <LockIcon data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
                  <span className="hidden flex-1 text-left lg:grid">
                    <span className="text-sm font-medium">{index + 1}&nbsp; {item.label}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {completed ? "Complete" : active ? "In progress" : locked ? "Locked" : "Ready"}
                    </span>
                  </span>
                </Button>
              );
            })}
          </nav>
          <div className="p-4">
            <Button className="w-full justify-start" variant="ghost" onClick={props.onNewCharacter}>
              <UserRoundIcon data-icon="inline-start" />
              <span className="hidden lg:inline">New character</span>
            </Button>
          </div>
        </aside>

        <GuidedStepSurface {...props} />
      </section>
    </main>
  );
}

function GuidedStepSurface(props: GuidedEditorProps) {
  if (props.step === "character") {
    return <CharacterStep {...props} />;
  }
  if (props.step === "textures") {
    return <TexturesStep {...props} />;
  }
  if (props.step === "skeleton") {
    return <SkeletonStep {...props} />;
  }
  if (props.step === "animations") {
    return <AnimationsStep {...props} />;
  }
  if (props.step === "test") {
    return <TestStep {...props} />;
  }
  return <ExportStep {...props} />;
}

function CharacterStep(props: GuidedEditorProps) {
  return (
    <OpenStepLayout
      title={`${props.project.name} is ready to build`}
      description="Your starting rig and core animations are already in place."
      footer={<StepFooter step="character" nextLabel="Continue to textures" onStepChange={props.onStepChange} />}
      aside={
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Starting content</h2>
          <SummaryRow label="Character type" value={characterKindLabel(props.project.characterKind)} />
          <SummaryRow label="Bones" value={String(props.project.hierarchy.length)} />
          <SummaryRow label="Parts" value={String(Object.keys(props.project.parts).length)} />
          <SummaryRow label="Animations" value={String(Object.keys(props.project.animations).length)} />
          <Alert>
            <CheckIcon aria-hidden="true" />
            <AlertTitle>Good starting point</AlertTitle>
            <AlertDescription>Every part can be replaced or adjusted in the next steps.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <PreviewCanvas {...props} showSkeleton={false} />
    </OpenStepLayout>
  );
}

function TexturesStep(props: GuidedEditorProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const groups = getPartGroups(props.project);

  const upload = async (files: readonly File[]) => {
    if (!files.length) {
      return;
    }
    setUploading(true);
    try {
      await props.onFilesSelected(files);
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void upload([...event.dataTransfer.files]);
  };

  return (
    <OpenStepLayout
      title="Add your character artwork"
      description="Upload PNG or SVG parts. Bones matches them to bones by filename."
      footer={<StepFooter step="textures" nextLabel="Continue to skeleton" onStepChange={props.onStepChange} />}
      aside={
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div>
            <h2 className="text-base font-medium">Parts to add</h2>
            <p className="mt-1 text-sm text-muted-foreground">The template already provides editable placeholders.</p>
            <p className="mt-2 text-xs text-muted-foreground">Use names like head.png, front-paw.svg, or tail.png for automatic matching.</p>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-2 pr-3">
              {groups.map((group) => (
                <div className="flex items-center gap-3 rounded-lg border p-3" key={group.label}>
                  <FileImageIcon aria-hidden="true" className="size-5 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{group.label}</span>
                  <Badge variant="secondary">{group.count}</Badge>
                  <CheckIcon aria-label="Ready" className="size-4 text-primary" />
                </div>
              ))}
            </div>
          </ScrollArea>
          <Alert>
            <CheckIcon aria-hidden="true" />
            <AlertTitle>{Object.keys(props.project.parts).length} parts ready</AlertTitle>
            <AlertDescription>You can continue now or upload replacements.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="grid min-h-0 grid-rows-[auto_minmax(280px,1fr)] gap-5 p-6">
        <div
          className={cn("flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center", dragActive && "border-primary bg-primary/5")}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <UploadCloudIcon aria-hidden="true" className="size-7 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Drop files here</p>
            <p className="mt-1 text-xs text-muted-foreground">PNG or SVG, up to 2 MB each</p>
          </div>
          <Button disabled={uploading} size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <FolderOpenIcon data-icon="inline-start" />
            {uploading ? "Adding files…" : "Choose files"}
          </Button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/png,image/svg+xml,.png,.svg"
            multiple
            onChange={(event) => {
              void upload([...(event.target.files ?? [])]);
              event.currentTarget.value = "";
            }}
          />
        </div>
        <PreviewCanvas {...props} showSkeleton={false} />
      </div>
    </OpenStepLayout>
  );
}

function SkeletonStep(props: GuidedEditorProps) {
  const orphans = props.project.hierarchy.filter((boneId) => boneId !== "root" && !props.project.parents[boneId]);

  return (
    <OpenStepLayout
      title="Check the skeleton"
      description="The template is already rigged. Confirm the hierarchy before animating."
      footer={<StepFooter step="skeleton" nextLabel="Continue to animations" onStepChange={props.onStepChange} />}
      aside={
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Skeleton check</h2>
          <SummaryRow label="Bones" value={String(props.project.hierarchy.length)} />
          <SummaryRow label="Root bone" value={props.project.hierarchy[0] ?? "Missing"} />
          <SummaryRow label="Unparented bones" value={String(orphans.length)} />
          <Alert variant={orphans.length ? "destructive" : "default"}>
            {orphans.length ? <CircleIcon aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
            <AlertTitle>{orphans.length ? "Review needed" : "Skeleton ready"}</AlertTitle>
            <AlertDescription>{orphans.length ? `${orphans.length} bones need a parent.` : "All bones belong to a valid hierarchy."}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => props.onOpenAdvanced("Rig")}>
            <SettingsIcon data-icon="inline-start" />
            Adjust skeleton
          </Button>
        </div>
      }
    >
      <PreviewCanvas {...props} showSkeleton />
    </OpenStepLayout>
  );
}

function AnimationsStep(props: GuidedEditorProps) {
  const projectRequiredClips = requiredClipsFor(props.project);
  const fallbackClipId = projectRequiredClips[0];
  const activeClip = props.project.animations[props.clipId] ?? (fallbackClipId ? props.project.animations[fallbackClipId] : undefined);
  const timelineRows = getTimelineRows(activeClip?.tracks ?? {});

  return (
    <OpenStepLayout
      title={`Bring ${props.project.name} to life`}
      description="Review the starter clips, then adjust only what you need."
      footer={<StepFooter step="animations" nextLabel="Continue to test" onStepChange={props.onStepChange} />}
      aside={<AnimationChecklist {...props} />}
    >
      <div className="grid min-h-0 grid-rows-[auto_minmax(280px,1fr)_220px]">
        <div className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">ANIMATION</span>
            <Badge variant="secondary">{activeClip?.name ?? props.clipId}</Badge>
          </div>
          <PlaybackControls {...props} />
        </div>
        <PreviewCanvas {...props} showSkeleton />
        <div className="min-h-0 border-t bg-card">
          <div className="grid h-9 grid-cols-[180px_minmax(0,1fr)] items-center border-b px-4 text-xs text-muted-foreground">
            <span>Track</span>
            <span>0s　　　　　　　　　{activeClip?.duration.toFixed(1) ?? "1.0"}s</span>
          </div>
          <div className="min-h-0">
            {timelineRows.map((row) => (
              <div className="grid h-8 grid-cols-[100px_minmax(0,1fr)] items-center border-b px-4 sm:grid-cols-[180px_minmax(0,1fr)]" key={row.id}>
                <span className="truncate text-xs">{row.label}</span>
                <div className="relative h-px bg-border">
                  {row.times.map((time, index) => (
                    <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" key={`${time}-${index}`} style={{ left: `${time * 100}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3">
            <Button size="sm" variant="outline" onClick={() => props.onOpenAdvanced("Timeline")}>
              <SettingsIcon data-icon="inline-start" />
              Edit keys
            </Button>
          </div>
        </div>
      </div>
    </OpenStepLayout>
  );
}

function TestStep(props: GuidedEditorProps) {
  return (
    <OpenStepLayout
      title="Test your character"
      description="Play every required state and check that the silhouette stays readable."
      footer={<StepFooter step="test" nextLabel="Continue to export" onStepChange={props.onStepChange} />}
      aside={
        <div className="flex flex-col gap-4">
          <AnimationChecklist {...props} />
          <Separator />
          <Alert>
            <CheckIcon aria-hidden="true" />
            <AlertTitle>Runtime-ready states</AlertTitle>
            <AlertDescription>All six platformer states are present and can be previewed above.</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => props.onOpenAdvanced("Preview")}>
            <TestTube2Icon data-icon="inline-start" />
            Open gameplay preview
          </Button>
        </div>
      }
    >
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex items-center justify-between border-b px-6 py-3">
          <Badge variant="secondary">{props.clipId}</Badge>
          <PlaybackControls {...props} />
        </div>
        <PreviewCanvas {...props} showSkeleton={false} />
      </div>
    </OpenStepLayout>
  );
}

function ExportStep(props: GuidedEditorProps) {
  const runtimeFileNames = ["manifest.json", "hero.hybrid-runtime.bundle.json", "hero.visual.compiled.json", "hero.path.runtime.rig.json"] as const;
  const runtimeBytes = props.lastExportBundle
    ? runtimeFileNames.reduce((total, fileName) => total + new TextEncoder().encode(props.lastExportBundle?.files[fileName] ?? "").byteLength, 0)
    : null;
  const exportOk = props.lastExportBundle?.validation.ok ?? false;
  const budgetOk = props.runtimeZipBytes === null || props.runtimeZipBytes <= 200 * 1024;

  return (
    <OpenStepLayout
      title="Export your character"
      description="Bones validates the project and creates one compact runtime package."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="outline" onClick={() => props.onStepChange("test")}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Button>
          <Button size="lg" onClick={() => void props.onExport()}>
            <DownloadIcon data-icon="inline-start" />
            {exportOk ? "Download character again" : "Export character"}
          </Button>
        </div>
      }
      aside={
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Package summary</h2>
          <SummaryRow label="Bones" value={String(props.project.hierarchy.length)} />
          <SummaryRow label="Parts" value={String(Object.keys(props.project.parts).length)} />
          <SummaryRow label="Animations" value={String(Object.keys(props.project.animations).length)} />
          <SummaryRow label="Runtime data" value={runtimeBytes === null ? "Build to measure" : formatBytes(runtimeBytes)} />
          <SummaryRow label="Runtime compressed" value={props.runtimeZipBytes === null ? "Not built" : `${formatBytes(props.runtimeZipBytes)} / 200 KB`} />
          <SummaryRow label="Texture assets" value={String(props.lastExportBundle?.assetFiles.length ?? 0)} />
          <SummaryRow label="Final package" value={props.packageZipBytes === null ? "Not built" : formatBytes(props.packageZipBytes)} />
          <Alert variant={props.lastExportBundle && (!exportOk || !budgetOk) ? "destructive" : "default"}>
            {exportOk && budgetOk ? <PackageCheckIcon aria-hidden="true" /> : <CircleIcon aria-hidden="true" />}
            <AlertTitle>{exportOk && budgetOk ? "Character exported" : !budgetOk ? "Runtime budget exceeded" : props.lastExportBundle ? "Export needs attention" : "Ready to validate"}</AlertTitle>
            <AlertDescription>{exportOk && budgetOk ? "The compact runtime passed validation and the 200 KB size budget." : !budgetOk ? "Reduce animation keys or parts before shipping." : props.ioStatus}</AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-lg flex-col items-center gap-5 text-center">
          <div className="grid size-20 place-items-center rounded-full bg-primary/10 text-primary">
            <PackageCheckIcon aria-hidden="true" className="size-10" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{exportOk ? `${props.project.name} is ready` : "Create the final character"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Source files stay editable. The game package contains only compact runtime data and required textures.</p>
          </div>
          <Button size="lg" onClick={() => void props.onExport()}>
            <DownloadIcon data-icon="inline-start" />
            {exportOk ? "Download again" : "Build and download"}
          </Button>
        </div>
      </div>
    </OpenStepLayout>
  );
}

function OpenStepLayout({
  aside,
  children,
  description,
  footer,
  title
}: {
  readonly aside: ReactNode;
  readonly children: ReactNode;
  readonly description: string;
  readonly footer: ReactNode;
  readonly title: string;
}) {
  return (
    <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[92px_minmax(0,1fr)_78px] xl:grid-cols-[minmax(520px,1fr)_340px]">
      <div className="border-b px-8 py-5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <aside className="row-span-2 hidden min-h-0 border-l p-6 xl:block">{aside}</aside>
      <div className="min-h-0 min-w-0 overflow-hidden">{children}</div>
      <footer className="flex items-center border-t bg-card px-6 xl:col-span-2">{footer}</footer>
    </div>
  );
}

function PreviewCanvas(props: GuidedEditorProps & { readonly showSkeleton: boolean }) {
  return (
    <div className="relative h-full min-h-[280px] overflow-hidden bg-[var(--guide-canvas)]">
      <PixiPreview
        clipId={props.clipId}
        playing={props.playing}
        project={props.project}
        quality={props.quality}
        runtimeMode="source"
        showSkeleton={props.showSkeleton}
      />
    </div>
  );
}

function PlaybackControls(props: GuidedEditorProps) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant={props.playing ? "default" : "outline"} onClick={() => props.onPlayingChange(!props.playing)}>
        {props.playing ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
        {props.playing ? "Pause" : "Play"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => props.onClipChange(props.clipId)}>
        Loop
      </Button>
    </div>
  );
}

function AnimationChecklist(props: GuidedEditorProps) {
  const projectRequiredClips = requiredClipsFor(props.project);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div>
        <h2 className="text-base font-medium">Required animations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Select a clip to preview it.</p>
      </div>
      <div className="flex flex-col gap-1">
        {projectRequiredClips.map((clipId) => {
          const available = Boolean(props.project.animations[clipId]);
          return (
            <Button
              className="h-12 justify-start"
              disabled={!available}
              key={clipId}
              variant={props.clipId === clipId ? "secondary" : "ghost"}
              onClick={() => { props.onClipChange(clipId); props.onPlayingChange(true); }}
            >
              {available ? <CheckIcon data-icon="inline-start" /> : <CircleIcon data-icon="inline-start" />}
              <span className="flex-1 text-left capitalize">{clipId}</span>
              <span className="text-[11px] font-normal text-muted-foreground">{available ? "Ready" : "Missing"}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function StepFooter({ nextLabel, onStepChange, step }: { readonly nextLabel: string; readonly onStepChange: (step: GuidedStep) => void; readonly step: GuidedStep }) {
  const index = guidedSteps.findIndex((item) => item.id === step);
  const previous = guidedSteps[index - 1]?.id;
  const next = guidedSteps[index + 1]?.id;

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <Button disabled={!previous} variant="outline" onClick={() => previous && onStepChange(previous)}>
        <ArrowLeftIcon data-icon="inline-start" />
        Back
      </Button>
      <Button disabled={!next} size="lg" onClick={() => next && onStepChange(next)}>
        {nextLabel}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}

function SummaryRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right font-medium">{value}</strong>
    </div>
  );
}

function getStepCompletion(project: EditorProjectState, bundle: ProjectExportBundle | null): Record<GuidedStep, boolean> {
  const projectRequiredClips = requiredClipsFor(project);
  return {
    character: project.name.trim().length > 1,
    textures: Object.keys(project.parts).length > 0,
    skeleton: project.hierarchy.length > 1,
    animations: projectRequiredClips.every((clipId) => Boolean(project.animations[clipId])),
    test: projectRequiredClips.every((clipId) => Boolean(project.animations[clipId])),
    export: Boolean(bundle?.validation.ok)
  };
}

function requiredClipsFor(project: EditorProjectState): readonly string[] {
  if (project.characterKind === "cat") return reporterRequiredClips;
  return project.animations.walk_forward ? fighterRequiredClips : requiredClips;
}

function characterKindLabel(kind: EditorProjectState["characterKind"]): string {
  return kind === "dog" ? "Dog" : kind === "cat" ? "Cat" : "Human";
}

function getPartGroups(project: EditorProjectState): readonly { readonly label: string; readonly count: number }[] {
  const ids = Object.keys(project.parts).map((id) => id.toLowerCase());
  const count = (patterns: readonly string[]) => ids.filter((id) => patterns.some((pattern) => id.includes(pattern))).length;
  if (project.characterKind === "dog") {
    return [
      { label: "Body", count: Math.max(1, count(["body", "chest", "belly"])) },
      { label: "Head", count: Math.max(1, count(["head", "muzzle", "ear", "neck"])) },
      { label: "Front legs", count: Math.max(1, count(["front", "fore"])) },
      { label: "Back legs", count: Math.max(1, count(["back", "hind"])) },
      { label: "Tail", count: Math.max(1, count(["tail"])) }
    ];
  }
  return [
    { label: "Body", count: Math.max(1, count(["body", "torso", "pelvis"])) },
    { label: "Head", count: Math.max(1, count(["head", "hair", "hood"])) },
    { label: "Arms", count: Math.max(1, count(["arm", "hand", "finger"])) },
    { label: "Legs", count: Math.max(1, count(["leg", "thigh", "foot", "boot"])) },
    { label: "Details", count: Math.max(1, count(["cape", "cloak", "tail", "collar"])) }
  ];
}

function getTimelineRows(tracks: Readonly<Record<string, readonly { readonly time: number }[]>>): readonly { readonly id: string; readonly label: string; readonly times: readonly number[] }[] {
  const entries = Object.entries(tracks).filter(([, keys]) => keys.length).slice(0, 4);
  const maxTime = Math.max(1, ...entries.flatMap(([, keys]) => keys.map((key) => key.time)));
  return entries.map(([id, keys]) => ({
    id,
    label: id.replaceAll(".", " · "),
    times: keys.map((key) => Math.min(1, Math.max(0, key.time / maxTime)))
  }));
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
}
