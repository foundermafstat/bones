"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  createMoveBoneCommand,
  createRotateBoneCommand,
  executeCommand,
  initialEditorProject,
  redo,
  undo,
  type EditorStateContainer
} from "./editorState";

const modes = ["Rig", "Shape", "Pose", "Timeline", "Curve", "State Machine", "Procedural", "Preview"] as const;

const sampleProject = {
  name: "Shadow Hero",
  hierarchy: ["root", "body", "head", "upperArmFront", "forearmFront", "handFront", "thighFront", "shinFront", "footFront", "cloak"],
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
  const runCommand = (command: Parameters<typeof executeCommand>[1]) => setEditorState((state) => executeCommand(state, command));
  const inspectorRows = useMemo(
    () => [
      ["Mode", mode],
      ["Selection", selectedBone],
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
            {sampleProject.hierarchy.map((item, index) => (
              <li
                key={item}
                className={item === selectedBone ? "selected" : ""}
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
            <p>Path / procedural silhouette</p>
          </section>
          <section>
            <h2>Constraints</h2>
            <p>Foot IK placeholder</p>
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
              <i style={{ left: `${18 + index * 8}%` }} />
              <i style={{ left: `${52 + index * 5}%` }} />
              <i style={{ left: "86%" }} />
            </div>
          ))}
        </div>
      </footer>
    </main>
  );
}
