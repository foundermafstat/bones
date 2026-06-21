"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  createMoveBoneCommand,
  createRotateBoneCommand,
  createAddBoneCommand,
  createDeleteBoneCommand,
  createRenameBoneCommand,
  createBindProceduralPartCommand,
  createEditPathPointCommand,
  createMirrorPathCommand,
  createSetPartPivotCommand,
  createApplyPoseCommand,
  createDuplicatePoseCommand,
  createMirrorPoseCommand,
  createAddKeyframeCommand,
  createDeleteKeyframeCommand,
  createMoveKeyframeCommand,
  createChangeCurveCommand,
  createTransitionCommand,
  createUpdateProceduralCommand,
  executeCommand,
  initialEditorProject,
  redo,
  undo,
  type EditorStateContainer
} from "./editorState";
import { loadDraft, saveDraft, serializeEditorProject } from "./projectIo";

const modes = ["Rig", "Shape", "Pose", "Timeline", "Curve", "State Machine", "Procedural", "Preview"] as const;

const sampleProject = {
  tracks: ["body.scaleY", "head.y", "thighFront.rotation", "thighBack.rotation", "cloak.x"]
};

type DepthStyle = CSSProperties & { "--depth": number };

export default function EditorPage() {
  const [mode, setMode] = useState<(typeof modes)[number]>("Rig");
  const [editorState, setEditorState] = useState<EditorStateContainer>({
    project: initialEditorProject,
    history: { past: [], future: [] }
  });
  const selectedBone = editorState.project.selectedBoneId;
  const selectedTransform = editorState.project.bones[selectedBone] ?? initialEditorProject.bones.body!;
  const selectedPart = Object.values(editorState.project.parts).find((part) => part.boneId === selectedBone) ?? editorState.project.parts.bodyShape!;
  const poseIds = Object.keys(editorState.project.poses);
  const selectedPose = editorState.project.poses[poseIds[0]!]!;
  const activeClip = editorState.project.animations.idle!;
  const activeTrack = activeClip.tracks["body.scaleY"] ?? [];
  const runCommand = (command: Parameters<typeof executeCommand>[1]) => setEditorState((state) => executeCommand(state, command));
  const inspectorRows = useMemo(
    () => [
      ["Mode", mode],
      ["Selection", selectedBone],
      ["Parent", editorState.project.parents[selectedBone] ?? "none"],
      ["X", String(selectedTransform.x)],
      ["Y", String(selectedTransform.y)],
      ["Rotation", selectedTransform.rotation.toFixed(2)],
      ["Scale", `${selectedTransform.scaleX}, ${selectedTransform.scaleY}`],
      ["Dirty", editorState.project.dirty ? editorState.project.dirtyParts.join(", ") : "clean"]
    ],
    [editorState.project.dirty, editorState.project.dirtyParts, mode, selectedBone, selectedTransform]
  );

  return (
    <main className="editorShell" aria-label="Bones editor shell">
      <header className="topBar">
        <div className="brand">
          <strong>Bones</strong>
          <span>{editorState.project.name}</span>
        </div>
        <nav className="modeTabs" aria-label="Editor modes">
          {modes.map((item) => (
            <button key={item} className={item === mode ? "active" : ""} type="button" onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
        </nav>
        <div className="toolbarActions" aria-label="Playback tools">
          <button type="button" disabled={!editorState.history.past.length} onClick={() => setEditorState(undo)}>
            Undo
          </button>
          <button type="button" disabled={!editorState.history.future.length} onClick={() => setEditorState(redo)}>
            Redo
          </button>
          <button type="button" onClick={() => runCommand(createMoveBoneCommand(selectedBone, 2, 0))}>
            Move
          </button>
          <button type="button" onClick={() => runCommand(createRotateBoneCommand(selectedBone, 0.1))}>
            Rotate
          </button>
          <button type="button" onClick={() => runCommand(createAddBoneCommand(selectedBone, `bone${editorState.project.hierarchy.length}`))}>
            Add Bone
          </button>
          <button type="button" onClick={() => runCommand(createRenameBoneCommand(selectedBone, `${selectedBone}Renamed`))}>
            Rename
          </button>
          <button type="button" disabled={selectedBone === "root"} onClick={() => runCommand(createDeleteBoneCommand(selectedBone))}>
            Delete
          </button>
          <button type="button" onClick={() => runCommand(createBindProceduralPartCommand(`${selectedBone}Shape`, selectedBone, "tapered-limb"))}>
            Bind Shape
          </button>
          <button type="button" onClick={() => runCommand(createEditPathPointCommand(selectedPart.id, selectedPart.points.length, [12, 4]))}>
            Pen
          </button>
          <button type="button" onClick={() => runCommand(createMirrorPathCommand(selectedPart.id))}>
            Mirror
          </button>
          <button type="button" onClick={() => runCommand(createSetPartPivotCommand(selectedPart.id, [4, 0]))}>
            Pivot
          </button>
          <button type="button" onClick={() => runCommand(createApplyPoseCommand(selectedPose.id))}>
            Apply Pose
          </button>
          <button type="button" onClick={() => runCommand(createDuplicatePoseCommand(selectedPose.id, `${selectedPose.id}_copy`))}>
            Duplicate Pose
          </button>
          <button type="button" onClick={() => runCommand(createMirrorPoseCommand(selectedPose.id, `${selectedPose.id}_mirror`))}>
            Mirror Pose
          </button>
          <button type="button" onClick={() => runCommand(createAddKeyframeCommand("idle", "body.scaleY", { id: `key${activeTrack.length}`, time: 0.6, value: 1.025, interpolation: "bezier" }))}>
            Add Key
          </button>
          <button type="button" disabled={!activeTrack.length} onClick={() => runCommand(createMoveKeyframeCommand("idle", "body.scaleY", activeTrack[0]?.id ?? "", 0.12))}>
            Move Key
          </button>
          <button type="button" disabled={!activeTrack.length} onClick={() => runCommand(createDeleteKeyframeCommand("idle", "body.scaleY", activeTrack[0]?.id ?? ""))}>
            Delete Key
          </button>
          <button type="button" disabled={!activeTrack.length} onClick={() => runCommand(createChangeCurveCommand("idle", "body.scaleY", activeTrack[0]?.id ?? "", "bezier", [0.2, 0.8, 0.2, 1]))}>
            Ease
          </button>
          <button type="button" onClick={() => runCommand(createTransitionCommand({ id: "walk-jump", fromStateId: "walk", toStateId: "jump", duration: 0.12, priority: 10, canInterrupt: true, syncMode: "none" }))}>
            Transition
          </button>
          <button type="button" onClick={() => runCommand(createUpdateProceduralCommand({ breathing: { enabled: true, frequency: 1, amplitude: 1.2, affectedBones: ["body", "head", "cloak"] } }))}>
            Breathing
          </button>
          <button type="button" onClick={() => runCommand(createUpdateProceduralCommand({ footIk: { enabled: true, feet: ["footFront", "footBack"], maxCorrection: 8, blend: 0.75 } }))}>
            Foot IK
          </button>
          <button type="button" onClick={() => saveDraft(editorState.project)}>
            Save
          </button>
          <button type="button" onClick={() => setEditorState((state) => ({ ...state, project: loadDraft() ?? state.project }))}>
            Load
          </button>
          <button type="button" onClick={() => navigator.clipboard?.writeText(serializeEditorProject(editorState.project))}>
            Copy JSON
          </button>
          <button type="button">Play</button>
          <button type="button">Pause</button>
          <button type="button">Record</button>
          <button type="button">Auto Key</button>
          <button type="button">Snap</button>
          <select aria-label="Timeline FPS" defaultValue="60">
            <option value="30">30 FPS</option>
            <option value="60">60 FPS</option>
          </select>
          <button type="button">Export</button>
        </div>
      </header>
      <section className="workspace" aria-label="Editor workspace">
        <aside className="panel hierarchyPanel">
          <header>Hierarchy</header>
          <ol>
            {editorState.project.hierarchy.map((item, index) => (
              <li
                key={item}
                className={item === selectedBone ? "selected" : ""}
                onClick={() => setEditorState((state) => ({ ...state, project: { ...state.project, selectedBoneId: item } }))}
                style={{ "--depth": item === "root" ? 0 : index > 2 ? 2 : 1 } as DepthStyle}
              >
                {item}
              </li>
            ))}
          </ol>
        </aside>
        <section className="canvasPanel" aria-label="Canvas and Pixi preview">
          <div className="canvasToolbar">
            <span>{mode}</span>
            <span>100%</span>
            <span>Light</span>
          </div>
          <div className="canvas" aria-label="PixiJS canvas viewport">
            <canvas aria-label="PixiJS preview canvas" />
            <div className="rigPreview" aria-hidden="true">
              <span className="bone rootBone" />
              <span className="bone bodyBone" />
              <span className="bone headBone" />
              <span className="bone armBone front" />
              <span className="bone armBone back" />
              <span className="bone legBone front" />
              <span className="bone legBone back" />
              <span className="shape bodyShape" />
              <span className="shape headShape" />
              <span className="shape cloakShape" />
            </div>
          </div>
        </section>
        <aside className="panel inspectorPanel">
          <header>Inspector</header>
          <section>
            <h2>Transform</h2>
            {inspectorRows.map(([label, value]) => (
              <label key={label}>
                <span>{label}</span>
                <input readOnly value={value} />
              </label>
            ))}
          </section>
          <section>
            <h2>Shape</h2>
            <p>{selectedPart.id}</p>
            <label>
              <span>Type</span>
              <input readOnly value={selectedPart.type} />
            </label>
            <label>
              <span>Pivot</span>
              <input readOnly value={selectedPart.pivot.join(", ")} />
            </label>
            <label>
              <span>Points</span>
              <input readOnly value={String(selectedPart.points.length)} />
            </label>
          </section>
          <section>
            <h2>Constraints</h2>
            <p>Foot IK placeholder</p>
          </section>
          <section>
            <h2>Pose Library</h2>
            <p>{poseIds.map((poseId) => editorState.project.poses[poseId]?.name).join(", ")}</p>
          </section>
          <section>
            <h2>Curve</h2>
            <p>{activeTrack.map((key) => `${key.id}: ${key.interpolation}`).join(", ")}</p>
          </section>
          <section>
            <h2>State Machine</h2>
            <p>{editorState.project.stateMachine.transitions.map((transition) => `${transition.fromStateId}->${transition.toStateId}`).join(", ")}</p>
            <p>{Object.keys(editorState.project.stateMachine.parameters).join(", ")}</p>
          </section>
          <section>
            <h2>Procedural</h2>
            <p>Breathing {editorState.project.procedural.breathing.frequency} Hz</p>
            <p>Cloak stiffness {editorState.project.procedural.secondaryMotion.stiffness}</p>
            <p>Foot IK {editorState.project.procedural.footIk.enabled ? "on" : "off"}</p>
          </section>
          <section>
            <h2>Profiler</h2>
            <p>Preview quality: medium</p>
            <p>Update 0.4ms / Render 1.2ms</p>
          </section>
        </aside>
      </section>
      <footer className="timeline" aria-label="Timeline and dopesheet">
        <header>
          <strong>Timeline</strong>
          <span>00:00 / 01:12</span>
        </header>
        <div className="tracks">
          {sampleProject.tracks.map((track, index) => (
            <div className="track" key={track}>
              <span>{track}</span>
              {(activeClip.tracks[track] ?? []).map((keyframe) => (
                <i key={keyframe.id} style={{ left: `${(keyframe.time / activeClip.duration) * 100}%` }} />
              ))}
              <i style={{ left: `${52 + index * 5}%` }} />
            </div>
          ))}
        </div>
      </footer>
    </main>
  );
}
