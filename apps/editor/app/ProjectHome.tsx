"use client";

import { useRef, type ReactNode } from "react";
import { Bone, Cat, Dog, FolderOpen, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QualityPresetName } from "@bones/runtime-pixi";
import type { EditorProjectState } from "./editorState";
import { PixiPreview } from "./PixiPreview";
import type { RemoteProjectSummary } from "./projectPersistence";

export type StartPreset = "human" | "dog" | "milo-reporter";
export type PendingCreation = StartPreset | "blank";

interface ProjectHomeProps {
  readonly projects: readonly RemoteProjectSummary[];
  readonly status: string;
  readonly pendingCreation: PendingCreation | null;
  readonly projectName: string;
  readonly onSelectPreset: (preset: StartPreset) => void;
  readonly onSelectBlank: () => void;
  readonly onProjectNameChange: (name: string) => void;
  readonly onCancelCreation: () => void;
  readonly onConfirmCreation: () => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly onImportProject: (file: File) => Promise<void>;
}

const presetDefinitions: readonly { readonly id: StartPreset; readonly label: string; readonly description: string }[] = [
  { id: "human", label: "2D Character", description: "Side-view platformer character" },
  { id: "dog", label: "2D Animal", description: "Side-view animal character" },
  { id: "milo-reporter", label: "Reporter", description: "Front-facing presenter animation set" }
];

export function ProjectHome({
  projects,
  status,
  pendingCreation,
  projectName,
  onSelectPreset,
  onSelectBlank,
  onProjectNameChange,
  onCancelCreation,
  onConfirmCreation,
  onOpenProject,
  onImportProject
}: ProjectHomeProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const nameValid = projectName.trim().length > 1;

  return (
    <main className="bones-project-home" aria-label="Bones projects">
      <header className="bones-home-header">
        <strong>BONES</strong>
        <Button variant="outline" onClick={() => importInputRef.current?.click()}><FolderOpen /> Import project</Button>
        <input
          ref={importInputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onImportProject(file);
            event.currentTarget.value = "";
          }}
        />
      </header>

      <div className="bones-home-content">
        <h1>Projects</h1>

        <section className="bones-home-section" aria-labelledby="saved-projects-title">
          <h2 id="saved-projects-title">Your projects</h2>
          {projects.length ? (
            <div className="bones-saved-projects">
              {projects.map((project) => (
                <article className="bones-saved-project" key={project.id}>
                  <div className="bones-saved-project-icon" aria-hidden="true">{projectIcon(project.characterKind)}</div>
                  <div className="bones-saved-project-copy">
                    <strong>{project.name}</strong>
                    <span>{characterLabel(project.characterKind)} · {project.boneCount} bones · {project.partCount} parts · {project.animationCount} clips</span>
                  </div>
                  <time dateTime={project.updatedAt}>Updated {new Date(project.updatedAt).toLocaleString()}</time>
                  <Button variant="outline" onClick={() => onOpenProject(project.id)}>Open</Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="bones-home-empty">{status}</div>
          )}
        </section>

        <section className="bones-home-section" aria-labelledby="create-project-title">
          <h2 id="create-project-title">Create new</h2>
          <div className="bones-preset-grid">
            {presetDefinitions.map((preset) => (
              <button className="bones-preset-card" key={preset.id} onClick={() => onSelectPreset(preset.id)}>
                <span className="bones-preset-preview">
                  <PresetPreview preset={preset.id} />
                </span>
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
          <Button className="bones-blank-project" variant="outline" onClick={onSelectBlank}><Bone /> Blank project</Button>
        </section>
      </div>

      {pendingCreation ? (
        <div className="bones-create-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancelCreation()}>
          <section className="bones-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-dialog-title">
            <div className="bones-create-preview">
              {pendingCreation === "blank" ? <Bone aria-hidden="true" /> : <PresetPreview preset={pendingCreation} />}
            </div>
            <div className="bones-create-form">
              <h2 id="create-dialog-title">{pendingCreation === "blank" ? "Blank project" : presetDefinitions.find((item) => item.id === pendingCreation)?.label}</h2>
              <label htmlFor="new-project-name">Project name</label>
              <Input id="new-project-name" autoFocus value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && nameValid && onConfirmCreation()} />
              <div className="bones-create-actions">
                <Button variant="outline" onClick={onCancelCreation}>Cancel</Button>
                <Button disabled={!nameValid} onClick={onConfirmCreation}>Create</Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export function SkeletonSetup({ project, quality, onBack, onCreateFirstBone }: { readonly project: EditorProjectState; readonly quality: QualityPresetName; readonly onBack: () => void; readonly onCreateFirstBone: () => void }) {
  return (
    <main className="bones-skeleton-setup" aria-label="Create the first bone">
      <header className="bones-home-header">
        <strong>BONES</strong>
        <Button variant="outline" onClick={onBack}>Back to projects</Button>
      </header>
      <section className="bones-skeleton-setup-content">
        <div className="bones-skeleton-setup-copy">
          <span>Blank project</span>
          <h1>Create the first bone</h1>
          <p>Start with one body bone. Studio opens immediately after it is created.</p>
          <Button size="lg" onClick={onCreateFirstBone}><Bone /> Create body bone</Button>
        </div>
        <div className="bones-skeleton-setup-canvas">
          <PixiPreview clipId="" currentTime={0} disableAnimation playing={false} project={project} quality={quality} runtimeMode="source" showSkeleton />
          <div className="bones-root-marker" aria-hidden="true"><span />Root</div>
        </div>
      </section>
    </main>
  );
}

function PresetPreview({ preset }: { readonly preset: StartPreset }) {
  const preview = preset === "human"
    ? { src: "/assets/start-presets/human-side-silhouette.png", alt: "Side-facing human silhouette" }
    : preset === "dog"
      ? { src: "/assets/start-presets/animal-side-silhouette.png", alt: "Side-facing animal silhouette" }
      : { src: "/assets/start-presets/reporter-silhouette.png", alt: "Front-facing upper-body reporter silhouette" };
  return <img src={preview.src} alt={preview.alt} />;
}

function projectIcon(kind: RemoteProjectSummary["characterKind"]): ReactNode {
  if (kind === "cat") return <Cat />;
  if (kind === "dog") return <Dog />;
  return <UserRound />;
}

function characterLabel(kind: RemoteProjectSummary["characterKind"]): string {
  if (kind === "cat") return "Cat";
  if (kind === "dog") return "Animal";
  return "Character";
}
