import assert from "node:assert/strict";
import test from "node:test";

import { initialEditorProject } from "../app/editorState.ts";
import { createProjectExportBundle } from "../app/projectIo.ts";

test("production export bundle writes manifest hashes and strips svg/editor metadata", async () => {
  const svg = `<svg viewBox="0 0 10 10"><path d="M 0 0 L 10 0 L 10 10 Z" /></svg>`;
  const bundle = await createProjectExportBundle(initialEditorProject, async () => svg);

  assert.equal(bundle.validation.ok, true);
  assert.equal(bundle.profile, "production");
  assert.ok(bundle.files["hero.source.rig.json"]);
  assert.ok(bundle.files["hero.compiled.json"]);
  assert.ok(bundle.files["hero.release-manifest.json"]);
  assert.ok(bundle.summary);

  const source = JSON.parse(bundle.files["hero.source.rig.json"]);
  const compiled = JSON.parse(bundle.files["hero.compiled.json"]);
  const manifest = JSON.parse(bundle.files["hero.release-manifest.json"]);

  assert.equal(source.rigs[0].parts.some((part) => part.type === "svg"), false);
  assert.equal(compiled.rig.parts.some((part) => part.type === "svg"), false);
  assert.equal(bundle.files["hero.compiled.json"].includes("\"editor\""), false);
  assert.equal(manifest.files["hero.compiled.json"].sha256, bundle.summary.compiledHash);
  assert.equal(manifest.counts.parts, source.rigs[0].parts.length);
});
