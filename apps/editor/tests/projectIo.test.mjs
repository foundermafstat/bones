import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";

import { initialEditorProject } from "../app/editorState.ts";
import {
  createProjectExportBundle,
  DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE,
  DEFAULT_PATH_RUNTIME_RIG_FILE,
  DEFAULT_VISUAL_RUNTIME_FILE
} from "../app/projectIo.ts";
import { createDeflateZip } from "../app/runtimeArchive.ts";

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

test("production hybrid package uses one canonical animation payload and minified runtime JSON", async () => {
  const bundle = await createProjectExportBundle(initialEditorProject, async () => `<svg viewBox="0 0 10 10"><path d="M 0 0 L 10 0 L 10 10 Z" /></svg>`);

  assert.equal(bundle.validation.ok, true);
  const canonical = JSON.parse(bundle.files[DEFAULT_VISUAL_RUNTIME_FILE]);
  const pathRuntimeRig = JSON.parse(bundle.files[DEFAULT_PATH_RUNTIME_RIG_FILE]);
  const pathCompiled = JSON.parse(bundle.files["hero.path.compiled.json"]);
  const hybrid = JSON.parse(bundle.files[DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE]);
  const packageManifest = JSON.parse(bundle.files["manifest.json"]);

  assert.ok(canonical.animations.length > 0);
  assert.equal(Object.hasOwn(pathRuntimeRig, "animations"), false);
  assert.equal(Object.hasOwn(pathRuntimeRig, "stateMachines"), false);
  assert.deepEqual(Object.keys(pathRuntimeRig.lookups).sort(), ["bones", "parts", "rigs"]);
  assert.equal(hybrid.entry.runtime, DEFAULT_VISUAL_RUNTIME_FILE);
  assert.equal(hybrid.entry.visual, DEFAULT_VISUAL_RUNTIME_FILE);
  assert.equal(hybrid.entry.physics, DEFAULT_PATH_RUNTIME_RIG_FILE);
  assert.equal(hybrid.runtimeFiles.canonical, DEFAULT_VISUAL_RUNTIME_FILE);
  assert.equal(packageManifest.files.canonicalRuntime, DEFAULT_VISUAL_RUNTIME_FILE);
  assert.equal(packageManifest.files.pathRuntimeRig, DEFAULT_PATH_RUNTIME_RIG_FILE);
  assert.equal(Object.hasOwn(packageManifest.files, "pathCompiled"), false);

  for (const fileName of [DEFAULT_VISUAL_RUNTIME_FILE, DEFAULT_PATH_RUNTIME_RIG_FILE, DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE, "manifest.json"]) {
    assert.equal(bundle.files[fileName].includes("\n"), false, `${fileName} should be minified`);
  }
  assert.ok(bundle.files["hero.source.rig.json"].includes("\n"), "source artifact should stay readable");

  const packagedBytes = Buffer.byteLength(bundle.files[DEFAULT_VISUAL_RUNTIME_FILE]) + Buffer.byteLength(bundle.files[DEFAULT_PATH_RUNTIME_RIG_FILE]);
  const duplicatedBytes = Buffer.byteLength(bundle.files[DEFAULT_VISUAL_RUNTIME_FILE]) + Buffer.byteLength(JSON.stringify(pathCompiled));
  assert.ok(packagedBytes < duplicatedBytes, `expected ${packagedBytes} bytes to be smaller than duplicated ${duplicatedBytes}`);

  const shippingFiles = ["manifest.json", DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE, DEFAULT_VISUAL_RUNTIME_FILE, DEFAULT_PATH_RUNTIME_RIG_FILE];
  const shippingArchive = createDeflateZip(shippingFiles.map((path) => ({ path, data: bundle.files[path] })));
  assert.ok(shippingArchive.byteLength <= 200 * 1024, `runtime archive exceeds 200 KiB: ${shippingArchive.byteLength}`);
});

test("runtime archive helper writes deterministic DEFLATE ZIP entries", () => {
  const repeatedJson = JSON.stringify({ frames: Array.from({ length: 2_000 }, () => [0, 1, 0, 1]) });
  const entries = [
    { path: "hero/compiled.json", data: repeatedJson },
    { path: "hero/assets/texture.bin", data: new Uint8Array([1, 2, 3, 4]) }
  ];
  const archive = createDeflateZip(entries);
  const unpacked = unzipSync(archive);

  assert.equal(new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint16(8, true), 8, "first ZIP entry should use DEFLATE");
  assert.equal(new TextDecoder().decode(unpacked["hero/compiled.json"]), repeatedJson);
  assert.deepEqual([...unpacked["hero/assets/texture.bin"]], [1, 2, 3, 4]);
  assert.ok(archive.byteLength < Buffer.byteLength(repeatedJson) / 4);
  assert.deepEqual(createDeflateZip(entries), archive);
});

test("uploaded PNG data URLs receive short runtime asset paths", async () => {
  const texture = "data:image/png;base64,iVBORw0KGgo=";
  const project = {
    ...initialEditorProject,
    parts: {
      ...initialEditorProject.parts,
      uploadedHead: {
        id: "uploadedHead",
        boneId: "head",
        type: "mesh",
        pivot: [0, 0],
        points: [],
        preset: undefined,
        mesh: { vertices: [-8, -8, 8, -8, 8, 8, -8, 8], indices: [0, 1, 2, 0, 2, 3], uvs: [0, 0, 1, 0, 1, 1, 0, 1], texture }
      }
    }
  };
  const bundle = await createProjectExportBundle(project, async () => `<svg viewBox="0 0 10 10"><path d="M 0 0 L 10 0 L 10 10 Z" /></svg>`);

  assert.equal(bundle.validation.ok, true);
  assert.equal(bundle.assetFiles.length, 1);
  assert.equal(bundle.assetFiles[0].runtimePath, "assets/uploaded-1.png");
  assert.equal(bundle.assetFiles[0].contentType, "image/png");
  assert.ok(bundle.files[DEFAULT_VISUAL_RUNTIME_FILE].includes("assets/uploaded-1.png"));
  assert.equal(bundle.files[DEFAULT_VISUAL_RUNTIME_FILE].includes(texture), false);
});
