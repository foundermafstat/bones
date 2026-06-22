import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { compileRig, validateProject } from "../packages/compiler/dist/index.js";

const sourcePath = new URL("../examples/shadow-hero/source.json", import.meta.url);
const outDir = new URL("../dist/export-shadow-hero/", import.meta.url);
const source = validateProject(JSON.parse(await readFile(sourcePath, "utf8")));
const compiled = compileRig(source);

assert.equal(compiled.rig.parts.some((part) => part.type === "svg"), false, "compiled export must not contain SVG parts");
assert.equal(JSON.stringify(compiled).includes("\"editor\""), false, "compiled export must not contain editor metadata");

await mkdir(outDir, { recursive: true });

const files = {
  "hero.source.rig.json": JSON.stringify(source, null, 2),
  "hero.rig.json": JSON.stringify({ schemaVersion: source.schemaVersion, runtimeTarget: source.runtimeTarget, rigs: source.rigs }, null, 2),
  "hero.animations.json": JSON.stringify({ schemaVersion: source.schemaVersion, animations: source.animations, poses: source.poses }, null, 2),
  "hero.state-machine.json": JSON.stringify({ schemaVersion: source.schemaVersion, stateMachines: source.stateMachines, proceduralPresets: source.proceduralPresets }, null, 2),
  "hero.compiled.json": JSON.stringify(compiled, null, 2),
  "hero.pixi-demo.html": createPixiDemoHtml()
};
const gzip = gzipSync(files["hero.compiled.json"]);
const manifest = {
  artifactVersion: "1.0.0",
  profile: "production",
  sourceProjectId: source.id,
  runtimeTarget: source.runtimeTarget,
  migration: {
    sourceSchemaVersion: source.schemaVersion,
    compiledFormatVersion: compiled.compiledFormatVersion
  },
  counts: {
    bones: source.rigs.reduce((count, rig) => count + rig.bones.length, 0),
    parts: source.rigs.reduce((count, rig) => count + (rig.parts?.length ?? 0), 0),
    animations: source.animations?.length ?? 0,
    states: source.stateMachines?.reduce((count, machine) => count + machine.states.length, 0) ?? 0
  },
  files: Object.fromEntries(
    [
      ...Object.entries(files).map(([fileName, contents]) => [fileName, fileRecord(contents)]),
      ["hero.compiled.json.gz", { bytes: gzip.byteLength, sha256: sha256(gzip), encoding: "gzip" }]
    ]
  )
};

for (const [fileName, contents] of Object.entries(files)) {
  await writeFile(new URL(fileName, outDir), contents);
}
await writeFile(new URL("hero.compiled.json.gz", outDir), gzip);
await writeFile(new URL("hero.release-manifest.json", outDir), JSON.stringify(manifest, null, 2));

console.log(
  JSON.stringify(
    {
      ok: true,
      outDir: outDir.pathname,
      files: Object.keys(manifest.files).length + 1,
      compiledBytes: manifest.files["hero.compiled.json"].bytes,
      gzipBytes: manifest.files["hero.compiled.json.gz"].bytes,
      compiledHash: manifest.files["hero.compiled.json"].sha256
    },
    null,
    2
  )
);

function fileRecord(contents) {
  const bytes = Buffer.byteLength(contents);
  return { bytes, sha256: sha256(contents), encoding: "utf8" };
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function createPixiDemoHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bones Shadow Hero Pixi Demo</title>
  <style>
    html, body, #app { height: 100%; margin: 0; background: #f8fafc; }
    #status { position: fixed; left: 12px; top: 12px; font: 12px system-ui; color: #0f172a; }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="status">Loading hero.compiled.json...</div>
  <script type="module">
    import { Application } from "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.mjs";
    import { RigInstance } from "../../packages/runtime-pixi/dist/index.js";

    const compiled = await fetch("./hero.compiled.json").then((response) => response.json());
    const app = new Application();
    await app.init({ background: "#f8fafc", resizeTo: window, antialias: true });
    document.getElementById("app").appendChild(app.canvas);
    const rig = new RigInstance(compiled);
    rig.container.position.set(window.innerWidth / 2, window.innerHeight * 0.7);
    rig.container.scale.set(1.2);
    app.stage.addChild(rig.container);
    app.ticker.add((ticker) => rig.update(ticker.deltaMS / 1000, { absSpeed: 1, grounded: true }));
    document.getElementById("status").textContent = "Loaded " + compiled.animations.length + " clips / " + compiled.rig.parts.length + " parts";
  </script>
</body>
</html>
`;
}
