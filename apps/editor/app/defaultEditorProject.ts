import darkAssassinSource from "../public/assets/dark-assassin/dark-assassin.source.rig.json";
import { fromSourceProject } from "./editorSourceProject";
import type { EditorProjectState } from "./editorState";

export const defaultEditorProject: EditorProjectState = fromSourceProject(darkAssassinSource);
