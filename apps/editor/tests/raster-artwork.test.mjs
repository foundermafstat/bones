import assert from "node:assert/strict";
import test from "node:test";

import { initialEditorProject } from "../app/editorState.ts";
import { fromSourceProject, toSourceProject } from "../app/editorSourceProject.ts";
import { buildProjectAssetMetadata, readRasterIntrinsicSize } from "../app/localProjectAssets.ts";
import { createAspectLockedRasterPlacement } from "../app/rasterArtwork.ts";
import { upsertRemoteAsset } from "../app/projectPersistence.ts";

function meshBounds(vertices) {
  const xs = vertices.filter((_, index) => index % 2 === 0);
  const ys = vertices.filter((_, index) => index % 2 === 1);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

test("new raster artwork uses an aspect-locked uniform fit", () => {
  const placement = createAspectLockedRasterPlacement({ width: 800, height: 400 }, "assets/wide.png");
  const bounds = meshBounds(placement.mesh.vertices);

  assert.equal(bounds.width, 240);
  assert.equal(bounds.height, 120);
  assert.equal(bounds.width / bounds.height, 2);
  assert.deepEqual(placement.scale, [1, 1]);
  assert.deepEqual(placement.pivot, [0, 0]);
});

test("replacement raster contain-fits the current attachment bounds and keeps its pivot", () => {
  const target = {
    id: "legacy-part",
    boneId: "body",
    type: "mesh",
    pivot: [10, 20],
    points: [],
    preset: undefined,
    offset: [5, 7],
    rotation: 0.3,
    scale: [2, 0.5],
    mesh: {
      vertices: [-50, -100, 50, -100, 50, 100, -50, 100],
      indices: [0, 1, 2, 0, 2, 3],
      uvs: [0, 0, 1, 0, 1, 1, 0, 1]
    }
  };
  const placement = createAspectLockedRasterPlacement({ width: 400, height: 400 }, "assets/square.png", target);
  const bounds = meshBounds(placement.mesh.vertices);

  assert.deepEqual(placement.pivot, target.pivot);
  assert.deepEqual(placement.offset, target.offset);
  assert.equal(placement.rotation, target.rotation);
  assert.deepEqual(placement.scale, [1, 1]);
  assert.equal(bounds.width, 100);
  assert.equal(bounds.height, 100);
  assert.ok(bounds.width <= 100 * Math.abs(target.scale[0]));
  assert.ok(bounds.height <= 200 * Math.abs(target.scale[1]));

  const oldCenter = [(-target.pivot[0]) * target.scale[0] + target.offset[0], (-target.pivot[1]) * target.scale[1] + target.offset[1]];
  const newCenter = [((bounds.minX + bounds.maxX) / 2 - placement.pivot[0]) * placement.scale[0] + placement.offset[0], ((bounds.minY + bounds.maxY) / 2 - placement.pivot[1]) * placement.scale[1] + placement.offset[1]];
  assert.deepEqual(newCenter, oldCenter);
});

test("raster intrinsic size and aspect lock survive source round-trip without changing legacy parts", () => {
  const project = structuredClone(initialEditorProject);
  const partId = Object.keys(project.parts)[0];
  project.parts[partId] = { ...project.parts[partId], intrinsicSize: [640, 320], aspectLocked: true };

  const source = toSourceProject(project);
  const sourcePart = source.rigs[0].parts.find((part) => part.id === partId);
  const restored = fromSourceProject(source);

  assert.deepEqual(sourcePart.editor.custom.intrinsicSize, [640, 320]);
  assert.equal(sourcePart.editor.custom.aspectLocked, true);
  assert.deepEqual(restored.parts[partId].intrinsicSize, [640, 320]);
  assert.equal(restored.parts[partId].aspectLocked, true);

  const legacyPartId = Object.keys(project.parts).find((id) => id !== partId);
  assert.equal(restored.parts[legacyPartId].intrinsicSize, undefined);
  assert.equal(restored.parts[legacyPartId].aspectLocked, undefined);
});

test("PNG dimensions populate local metadata and are forwarded to remote storage", async () => {
  let closed = false;
  const file = new File([new Uint8Array([137, 80, 78, 71])], "milo-eye.png", { type: "image/png" });
  const dimensions = await readRasterIntrinsicSize(file, async () => ({
    width: 512,
    height: 256,
    close() { closed = true; }
  }));

  assert.deepEqual(dimensions, { width: 512, height: 256 });
  assert.equal(closed, true);
  assert.equal(await readRasterIntrinsicSize(new File(["<svg/>"] , "part.svg", { type: "image/svg+xml" }), async () => { throw new Error("should not decode SVG"); }), undefined);

  const metadata = buildProjectAssetMetadata("asset-eye", "assets/milo-eye.png", file, "abc123", dimensions);
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 256);

  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(null, { status: 204 });
  };
  try {
    await upsertRemoteAsset("project-milo", metadata);
    assert.equal(requestBody.width, 512);
    assert.equal(requestBody.height, 256);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
