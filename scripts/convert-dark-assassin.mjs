import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { compileRig } from "../packages/compiler/dist/index.js";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const sourceRoot = "/Users/irine/Documents/DarkAssassinAnimations/Animation";
const outputRoot = join(repoRoot, "apps/editor/public/assets/dark-assassin");
const selectedAnimations = [
  { source: "idle", id: "idle", name: "Idle", loop: true },
  { source: "walk", id: "walk", name: "Walk", loop: true },
  { source: "run", id: "run", name: "Run", loop: true },
  { source: "jump", id: "jump", name: "Jump", loop: false },
  { source: "jump_airborne", id: "fall", name: "Fall", loop: true },
  { source: "jump_land", id: "land", name: "Land", loop: false }
];

const identity = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const spine = JSON.parse(readFileSync(join(sourceRoot, "DarkAssassin.json"), "utf8"));
const bones = spine.bones ?? [];
const boneByName = new Map(bones.map((bone) => [bone.name, bone]));
const boneIndexToName = bones.map((bone) => bone.name);
const slots = spine.slots ?? [];
const slotIndexByName = new Map(slots.map((slot, index) => [slot.name, index]));
const ikConstraints = [...(spine.ik ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
const bakedFrameRate = 30;
const setupWorld = buildSetupWorldMatrices(bones);
const attachments = spine.skins?.[0]?.attachments ?? {};
const setupLocalTransforms = bakeSpineLocalTransforms(undefined, 0);

mkdirSync(outputRoot, { recursive: true });
mkdirSync(join(outputRoot, "spine-source"), { recursive: true });
cpSync(join(sourceRoot, "images"), join(outputRoot, "images"), { recursive: true });
for (const fileName of ["DarkAssassin.json", "DarkAssassin.atlas", "DarkAssassin.png", "Skull.json", "Skull.atlas", "Skull.png"]) {
  copyFileSync(join(sourceRoot, fileName), join(outputRoot, "spine-source", fileName));
}

const project = {
  schemaVersion: "1.0.0",
  runtimeTarget: "pixi-v8",
  id: "dark-assassin",
  projectId: "dark-assassin",
  name: "Dark Assassin",
  units: "pixels",
  defaultFrameRate: 60,
  rigs: [
    {
      id: "dark-assassin-rig",
      name: "Dark Assassin",
      rootBoneId: bones[0]?.name ?? "root",
      bones: bones.map(toBonesBone),
      parts: toBonesParts(),
      editor: {
        custom: {
          selectedBoneId: "bone",
          hierarchy: bones.map((bone) => bone.name),
          dirty: false,
          dirtyParts: [],
          dirtyScopes: emptyDirtyScopes(),
          autosave: { status: "idle", revision: 0, throttleMs: 750, lastChangedAt: 0, nextSaveAt: 0 },
          timeline: { selectedClipId: "idle", selectedKeyIds: [], keyClipboard: [], autoKey: false, snappingFps: 60, virtualWindow: { startRow: 0, rowCount: 12 }, curvePreview: { fromClipId: "jump", toClipId: "land", weight: 0.5 } },
          procedural: defaultProcedural()
        }
      }
    }
  ],
  animations: selectedAnimations.map(toBonesAnimation),
  poses: [{ id: "idle_neutral", name: "Idle neutral", rigId: "dark-assassin-rig", boneTransforms: {}, editor: { tags: ["idle"] } }],
  stateMachines: [
    {
      id: "dark-assassin-state-machine",
      name: "Dark Assassin State Machine",
      initialStateId: "idle",
      states: [
        { id: "idle", name: "Idle", clipId: "idle" },
        { id: "locomotion", name: "Locomotion", clipId: "walk", blendTree: { type: "1d", parameter: "absSpeed", children: [{ threshold: 0, clipId: "idle" }, { threshold: 80, clipId: "walk" }, { threshold: 150, clipId: "run" }] } },
        { id: "walk", name: "Walk", clipId: "walk" },
        { id: "run", name: "Run", clipId: "run" },
        { id: "jump", name: "Jump", clipId: "jump" },
        { id: "fall", name: "Fall", clipId: "fall" },
        { id: "land", name: "Land", clipId: "land" }
      ],
      transitions: [
        { id: "idle-walk", fromStateId: "idle", toStateId: "walk", duration: 0.12, easing: "easeOut", priority: 0, canInterrupt: true, syncMode: "phaseMatch", conditions: [{ parameterId: "absSpeed", operator: ">", value: 12 }] },
        { id: "walk-run", fromStateId: "walk", toStateId: "run", duration: 0.12, easing: "easeOut", priority: 1, canInterrupt: true, syncMode: "phaseMatch", conditions: [{ parameterId: "absSpeed", operator: ">", value: 130 }] },
        { id: "run-walk", fromStateId: "run", toStateId: "walk", duration: 0.12, easing: "easeInOut", priority: 1, canInterrupt: true, syncMode: "phaseMatch", conditions: [{ parameterId: "absSpeed", operator: "<=", value: 120 }] },
        { id: "walk-idle", fromStateId: "walk", toStateId: "idle", duration: 0.14, easing: "easeInOut", priority: 0, canInterrupt: true, syncMode: "phaseMatch", conditions: [{ parameterId: "absSpeed", operator: "<=", value: 8 }] },
        { id: "any-jump", fromStateId: "idle", toStateId: "jump", duration: 0.06, easing: "anticipation", priority: 10, canInterrupt: true, syncMode: "none", conditions: [{ parameterId: "jumpPressed", operator: "==", value: true }] },
        { id: "jump-fall", fromStateId: "jump", toStateId: "fall", duration: 0.1, easing: "easeIn", priority: 5, canInterrupt: true, syncMode: "normalizedTime", conditions: [{ parameterId: "velocityY", operator: ">", value: 0 }] },
        { id: "fall-land", fromStateId: "fall", toStateId: "land", duration: 0.08, easing: "overshoot", priority: 8, canInterrupt: true, syncMode: "none", conditions: [{ parameterId: "grounded", operator: "==", value: true }] },
        { id: "land-idle", fromStateId: "land", toStateId: "idle", duration: 0.18, easing: "easeOut", priority: 0, canInterrupt: false, syncMode: "none", conditions: [{ parameterId: "timeInState", operator: ">", value: 0.2 }] }
      ],
      parameters: [
        { id: "speed", type: "number", defaultValue: 0 },
        { id: "absSpeed", type: "number", defaultValue: 0 },
        { id: "velocityY", type: "number", defaultValue: 0 },
        { id: "grounded", type: "boolean", defaultValue: true },
        { id: "jumpPressed", type: "boolean", defaultValue: false },
        { id: "timeInState", type: "number", defaultValue: 0 }
      ],
      editor: { custom: { preview: { fromStateId: "idle", toStateId: "idle", weight: 0 } } }
    }
  ],
  proceduralPresets: [],
  editor: {
    custom: {
      savedFrom: "bones-dark-assassin-converter",
      source: "BOJEDIMA DarkAssassin Spine 3.8.75",
      sourceFiles: ["spine-source/DarkAssassin.json", "spine-source/DarkAssassin.atlas", "images/*.png"]
    }
  }
};

const compiled = compileRig(project);
const vectorProject = createVectorProject(project);
const vectorCompiled = compileRig(vectorProject);
writeJson(join(outputRoot, "dark-assassin.source.rig.json"), project);
writeJson(join(outputRoot, "dark-assassin.compiled.json"), compiled);
writeJson(join(outputRoot, "dark-assassin.vector.source.rig.json"), vectorProject);
writeJson(join(outputRoot, "dark-assassin.vector.compiled.json"), vectorCompiled);
writeJson(join(outputRoot, "dark-assassin.vector.runtime.rig.json"), vectorCompiled.rig);
writeJson(join(outputRoot, "dark-assassin.vector.runtime.animations.json"), vectorCompiled.animations ?? []);
writeJson(join(outputRoot, "dark-assassin.vector.runtime.state-machines.json"), vectorCompiled.stateMachines ?? []);
writeJson(join(outputRoot, "manifest.json"), {
  id: "dark-assassin",
  name: "Dark Assassin",
  source: basename(sourceRoot),
  sourceJson: "dark-assassin.source.rig.json",
  compiledJson: "dark-assassin.compiled.json",
  vectorSourceJson: "dark-assassin.vector.source.rig.json",
  vectorCompiledJson: "dark-assassin.vector.compiled.json",
  vectorRuntimeSet: {
    rig: "dark-assassin.vector.runtime.rig.json",
    animations: "dark-assassin.vector.runtime.animations.json",
    stateMachines: "dark-assassin.vector.runtime.state-machines.json"
  },
  animations: selectedAnimations.map(({ id, source, loop }) => ({ id, source, loop })),
  assets: {
    spineSource: "spine-source/",
    images: "images/"
  }
});

function toBonesBone(bone) {
  const transform = setupLocalTransforms.get(bone.name) ?? toTransform(bone);
  return {
    id: bone.name,
    name: bone.name,
    ...(bone.parent ? { parentId: bone.parent } : {}),
    local: transform,
    length: bone.length ?? 0,
    ...(bone.transform === "noScale" ? { inheritScale: false } : {}),
    ...(bone.color ? { editor: { custom: { spineColor: bone.color } } } : {})
  };
}

function toBonesParts() {
  const parts = [];
  for (const [slotIndex, slot] of slots.entries()) {
    const attachmentName = slot.attachment;
    const attachment = attachments[slot.name]?.[attachmentName];
    if (!attachment || attachment.type !== "mesh") {
      continue;
    }
    const skin = parseSpineSkin(attachment.vertices);
    const vertices = setupVertices(skin);
    const texture = `/assets/dark-assassin/images/${attachmentName}.png`;
    parts.push({
      id: slot.name,
      name: slot.name,
      boneId: slot.bone,
      type: "mesh",
      drawOrder: slotIndex,
      visible: true,
      opacity: Number.isFinite(slot.colorAlpha) ? slot.colorAlpha : 1,
      local: identity,
      mesh: {
        vertices,
        indices: attachment.triangles,
        uvs: attachment.uvs,
        texture,
        skin
      },
      editor: {
        custom: {
          spineSlot: slot.name,
          spineAttachment: attachmentName,
          assetPath: texture,
          width: attachment.width,
          height: attachment.height
        }
      }
    });
  }
  return parts;
}

function createVectorProject(sourceProject) {
  const vectorParts = toBonesVectorParts();
  return {
    ...sourceProject,
    id: `${sourceProject.id}-vector`,
    projectId: `${sourceProject.projectId ?? sourceProject.id}-vector`,
    name: `${sourceProject.name} Vector`,
    rigs: sourceProject.rigs.map((rig) => ({
      ...rig,
      parts: vectorParts,
      editor: {
        ...rig.editor,
        custom: {
          ...(rig.editor?.custom ?? {}),
          selectedPartId: vectorParts[0]?.id ?? "",
          assetMode: "vector-path"
        }
      }
    })),
    editor: {
      ...sourceProject.editor,
      custom: {
        ...(sourceProject.editor?.custom ?? {}),
        savedFrom: "bones-dark-assassin-vector-converter",
        sourceFiles: ["dark-assassin.source.rig.json", "spine-source/DarkAssassin.json"],
        vectorization: "spine-mesh-boundary-to-path"
      }
    }
  };
}

function toBonesVectorParts() {
  const parts = [];
  for (const [slotIndex, slot] of slots.entries()) {
    const attachmentName = slot.attachment;
    const attachment = attachments[slot.name]?.[attachmentName];
    if (!attachment || attachment.type !== "mesh") {
      continue;
    }
    const skin = parseSpineSkin(attachment.vertices);
    const localVertices = setupVerticesForBone(skin, slot.bone);
    const commands = meshBoundaryToPathCommands(localVertices, attachment.triangles ?? []);
    if (!commands.length) {
      continue;
    }
    parts.push({
      id: slot.name,
      name: slot.name,
      boneId: slot.bone,
      type: "path",
      drawOrder: slotIndex,
      visible: true,
      opacity: Number.isFinite(slot.colorAlpha) ? slot.colorAlpha : 1,
      local: identity,
      fill: { type: "solid", color: fillForAttachment(attachmentName), alpha: 1 },
      path: { closed: true, commands },
      editor: {
        custom: {
          spineSlot: slot.name,
          spineAttachment: attachmentName,
          vectorizedFrom: `/assets/dark-assassin/images/${attachmentName}.png`,
          boundaryVertices: localVertices.length / 2
        }
      }
    });
  }
  return parts;
}

function parseSpineSkin(vertices) {
  const skin = [];
  let index = 0;
  while (index < vertices.length) {
    const influenceCount = vertices[index++];
    const vertex = [];
    for (let influenceIndex = 0; influenceIndex < influenceCount; influenceIndex += 1) {
      const boneIndex = vertices[index++];
      const x = vertices[index++];
      const y = vertices[index++];
      const weight = vertices[index++];
      vertex.push({ boneId: boneIndexToName[boneIndex], x, y: -y, weight });
    }
    skin.push(vertex);
  }
  return skin;
}

function setupVertices(skin) {
  const vertices = [];
  for (const vertex of skin) {
    let x = 0;
    let y = 0;
    for (const influence of vertex) {
      const point = applyMatrix(setupWorld.get(influence.boneId) ?? identityMatrix(), influence.x, influence.y);
      x += point.x * influence.weight;
      y += point.y * influence.weight;
    }
    vertices.push(round(x), round(y));
  }
  return vertices;
}

function setupVerticesForBone(skin, boneId) {
  const worldVertices = setupVertices(skin);
  const inverseBoneWorld = invertMatrix(setupWorld.get(boneId) ?? identityMatrix());
  const localVertices = [];
  for (let index = 0; index < worldVertices.length; index += 2) {
    const point = applyMatrix(inverseBoneWorld, worldVertices[index] ?? 0, worldVertices[index + 1] ?? 0);
    localVertices.push(round(point.x), round(point.y));
  }
  return localVertices;
}

function meshBoundaryToPathCommands(vertices, triangles) {
  const loops = traceBoundaryLoops(triangles);
  const commands = [];
  for (const loop of loops) {
    const points = simplifyLoop(loop.map((vertexIndex) => ({ x: vertices[vertexIndex * 2] ?? 0, y: vertices[vertexIndex * 2 + 1] ?? 0 })));
    if (points.length < 3) {
      continue;
    }
    commands.push({ type: "M", x: round(points[0].x), y: round(points[0].y) });
    for (const point of points.slice(1)) {
      commands.push({ type: "L", x: round(point.x), y: round(point.y) });
    }
    commands.push({ type: "Z" });
  }
  return commands;
}

function traceBoundaryLoops(triangles) {
  const edgeCounts = new Map();
  for (let index = 0; index < triangles.length; index += 3) {
    countEdge(edgeCounts, triangles[index], triangles[index + 1]);
    countEdge(edgeCounts, triangles[index + 1], triangles[index + 2]);
    countEdge(edgeCounts, triangles[index + 2], triangles[index]);
  }

  const adjacency = new Map();
  const remaining = new Set();
  for (const [key, edge] of edgeCounts.entries()) {
    if (edge.count !== 1) {
      continue;
    }
    remaining.add(key);
    addNeighbor(adjacency, edge.a, edge.b);
    addNeighbor(adjacency, edge.b, edge.a);
  }

  const loops = [];
  while (remaining.size) {
    const startKey = remaining.values().next().value;
    const startEdge = edgeCounts.get(startKey);
    if (!startEdge) {
      remaining.delete(startKey);
      continue;
    }
    const loop = [startEdge.a, startEdge.b];
    remaining.delete(startKey);
    let previous = startEdge.a;
    let current = startEdge.b;
    while (current !== startEdge.a) {
      const next = [...(adjacency.get(current) ?? [])].find((candidate) => candidate !== previous && remaining.has(edgeKey(current, candidate)));
      if (next === undefined) {
        break;
      }
      remaining.delete(edgeKey(current, next));
      previous = current;
      current = next;
      if (current !== startEdge.a) {
        loop.push(current);
      }
    }
    loops.push(loop);
  }
  return loops.sort((left, right) => right.length - left.length);
}

function countEdge(edges, a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return;
  }
  const key = edgeKey(a, b);
  const edge = edges.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), count: 0 };
  edges.set(key, { ...edge, count: edge.count + 1 });
}

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addNeighbor(adjacency, from, to) {
  const neighbors = adjacency.get(from) ?? new Set();
  neighbors.add(to);
  adjacency.set(from, neighbors);
}

function simplifyLoop(points) {
  if (points.length <= 3) {
    return points;
  }
  const out = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const area = Math.abs((current.x - previous.x) * (next.y - previous.y) - (current.y - previous.y) * (next.x - previous.x));
    if (area > 0.01) {
      out.push(current);
    }
  }
  return out.length >= 3 ? out : points;
}

function fillForAttachment(name) {
  if (name === "eyes") {
    return "#ff1a12";
  }
  if (name === "darkness") {
    return "#050507";
  }
  if (name.includes("finger") || name.includes("hand")) {
    return "#f4b183";
  }
  if (name.includes("foot") || name.includes("leg")) {
    return "#4b4c52";
  }
  if (name.includes("cape")) {
    return "#55565d";
  }
  if (name === "collar") {
    return "#b7ad9f";
  }
  return "#62636a";
}

function toBonesAnimation(definition) {
  const animation = spine.animations?.[definition.source];
  if (!animation) {
    throw new Error(`Missing Spine animation '${definition.source}'.`);
  }
  const tracks = bakeBoneTracks(definition, animation);
  pushDeformTracks(tracks, definition.id, animation);
  pushDrawOrderTracks(tracks, definition.id, animation);
  const duration = Math.max(1 / 60, ...tracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.time)));
  return {
    id: definition.id,
    name: definition.name,
    duration: roundTime(duration),
    frameRate: bakedFrameRate,
    loop: definition.loop,
    tracks,
    markers: [{ id: `${definition.id}-end`, time: roundTime(duration), label: definition.loop ? "Loop" : "End" }],
    tags: [definition.id]
  };
}

function bakeBoneTracks(definition, animation) {
  const duration = getAnimationDuration(animation);
  const frameCount = Math.max(1, Math.round(duration * bakedFrameRate));
  const properties = ["x", "y", "rotation", "scaleX", "scaleY", "skewX", "skewY"];
  const tracksByBone = new Map(bones.map((bone) => [bone.name, Object.fromEntries(properties.map((property) => [property, []]))]));

  for (let frame = 0; frame <= frameCount; frame += 1) {
    const time = frame === frameCount ? duration : frame / bakedFrameRate;
    const transforms = bakeSpineLocalTransforms(animation, time);
    for (const bone of bones) {
      const transform = transforms.get(bone.name) ?? identity;
      for (const property of properties) {
        tracksByBone.get(bone.name)[property].push({
          time: roundTime(time),
          value: round(transform[property] ?? (property === "scaleX" || property === "scaleY" ? 1 : 0)),
          interpolation: "linear",
          editor: { custom: { id: `${definition.id}-${bone.name}-${property}-${frame}`, baked: true } }
        });
      }
    }
  }

  const tracks = [];
  for (const bone of bones) {
    const byProperty = tracksByBone.get(bone.name);
    for (const property of properties) {
      const keyframes = compactBakedKeyframes(byProperty[property]);
      tracks.push({
        id: `${definition.id}.${bone.name}.transform.${property}`,
        target: { kind: "bone", id: bone.name },
        property: `transform.${property}`,
        keyframes
      });
    }
  }
  return tracks;
}

function compactBakedKeyframes(keyframes) {
  if (keyframes.length <= 2) {
    return keyframes;
  }
  const compacted = [keyframes[0]];
  for (let index = 1; index < keyframes.length - 1; index += 1) {
    const previous = compacted[compacted.length - 1];
    const current = keyframes[index];
    const next = keyframes[index + 1];
    const t = (current.time - previous.time) / (next.time - previous.time);
    const linearValue = previous.value + (next.value - previous.value) * t;
    if (Math.abs(current.value - linearValue) > 0.001) {
      compacted.push(current);
    }
  }
  compacted.push(keyframes[keyframes.length - 1]);
  return compacted;
}

function bakeSpineLocalTransforms(animation, time) {
  const locals = new Map(bones.map((bone) => [bone.name, sampleBoneLocal(bone, animation?.bones?.[bone.name], time)]));
  let sourceWorld = computeSourceWorldMatrices(locals);
  for (const constraint of ikConstraints) {
    applySpineTwoBoneIk(locals, sourceWorld, constraint);
    sourceWorld = computeSourceWorldMatrices(locals);
  }

  const bonesWorld = new Map();
  const localTransforms = new Map();
  for (const bone of bones) {
    const sourceMatrix = sourceWorld.get(bone.name) ?? sourceIdentityMatrix();
    const worldMatrix = sourceToBonesMatrix(sourceMatrix);
    const parentMatrix = bone.parent ? bonesWorld.get(bone.parent) : undefined;
    const localMatrix = parentMatrix ? multiplyMatrices(invertMatrix(parentMatrix), worldMatrix) : worldMatrix;
    bonesWorld.set(bone.name, worldMatrix);
    localTransforms.set(bone.name, decomposeMatrix(localMatrix));
  }
  return localTransforms;
}

function sampleBoneLocal(bone, timelines, time) {
  const setup = {
    x: bone.x ?? 0,
    y: bone.y ?? 0,
    rotation: bone.rotation ?? 0,
    scaleX: bone.scaleX ?? 1,
    scaleY: bone.scaleY ?? 1,
    shearX: bone.shearX ?? 0,
    shearY: bone.shearY ?? 0
  };
  return {
    x: setup.x + sampleTimeline(timelines?.translate, time, "x", 0),
    y: setup.y + sampleTimeline(timelines?.translate, time, "y", 0),
    rotation: setup.rotation + sampleTimeline(timelines?.rotate, time, "angle", 0, true),
    scaleX: setup.scaleX * sampleTimeline(timelines?.scale, time, "x", 1),
    scaleY: setup.scaleY * sampleTimeline(timelines?.scale, time, "y", 1),
    shearX: setup.shearX + sampleTimeline(timelines?.shear, time, "x", 0),
    shearY: setup.shearY + sampleTimeline(timelines?.shear, time, "y", 0)
  };
}

function sampleTimeline(keys, time, property, setupValue, rotation = false) {
  if (!keys?.length) {
    return setupValue;
  }
  const first = keys[0];
  if (time < (first.time ?? 0)) {
    return setupValue;
  }
  if (time === (first.time ?? 0)) {
    return first[property] ?? setupValue;
  }
  const last = keys[keys.length - 1];
  if (time >= (last.time ?? 0)) {
    return last[property] ?? setupValue;
  }
  for (let index = 0; index < keys.length - 1; index += 1) {
    const from = keys[index];
    const to = keys[index + 1];
    const fromTime = from.time ?? 0;
    const toTime = to.time ?? 0;
    if (time < fromTime || time > toTime) {
      continue;
    }
    if (from.curve === "stepped" || fromTime === toTime) {
      return from[property] ?? setupValue;
    }
    const rawT = Math.min(1, Math.max(0, (time - fromTime) / (toTime - fromTime)));
    const t = typeof from.curve === "number" ? sampleBezier(rawT, [from.curve, from.c2 ?? 0, from.c3 ?? 1, from.c4 ?? 1]) : rawT;
    const a = from[property] ?? setupValue;
    const b = to[property] ?? setupValue;
    return rotation ? a + shortestDegDelta(a, b) * t : a + (b - a) * t;
  }
  return setupValue;
}

function applySpineTwoBoneIk(locals, sourceWorld, constraint) {
  if (!constraint?.bones || constraint.bones.length !== 2 || !constraint.target) {
    return;
  }
  const parentBone = boneByName.get(constraint.bones[0]);
  const childBone = boneByName.get(constraint.bones[1]);
  const parentLocal = parentBone ? locals.get(parentBone.name) : undefined;
  const childLocal = childBone ? locals.get(childBone.name) : undefined;
  const targetWorld = sourceWorld.get(constraint.target);
  const parentWorld = parentBone ? sourceWorld.get(parentBone.name) : undefined;
  const parentParentWorld = parentBone?.parent ? sourceWorld.get(parentBone.parent) : undefined;
  if (!parentBone || !childBone || !parentLocal || !childLocal || !targetWorld || !parentWorld || !parentParentWorld) {
    return;
  }

  const alpha = constraint.mix ?? 1;
  if (alpha === 0) {
    return;
  }

  const px = parentLocal.x;
  const py = parentLocal.y;
  let psx = parentLocal.scaleX;
  let sx = psx;
  let psy = parentLocal.scaleY;
  let csx = childLocal.scaleX;
  let os1 = 0;
  let os2 = 0;
  let s2 = 0;
  if (psx < 0) {
    psx = -psx;
    os1 = 180;
    s2 = -1;
  } else {
    s2 = 1;
  }
  if (psy < 0) {
    psy = -psy;
    s2 = -s2;
  }
  if (csx < 0) {
    csx = -csx;
    os2 = 180;
  }

  const cx = childLocal.x;
  let cy = 0;
  let cwx = 0;
  let cwy = 0;
  let a = parentWorld.a;
  let b = parentWorld.b;
  let c = parentWorld.c;
  let d = parentWorld.d;
  const uniformScale = Math.abs(psx - psy) <= 0.0001;
  if (uniformScale) {
    cy = childLocal.y;
    cwx = a * cx + b * cy + parentWorld.tx;
    cwy = c * cx + d * cy + parentWorld.ty;
  } else {
    cwx = a * cx + parentWorld.tx;
    cwy = c * cx + parentWorld.ty;
  }

  a = parentParentWorld.a;
  b = parentParentWorld.b;
  c = parentParentWorld.c;
  d = parentParentWorld.d;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 0.00001) {
    return;
  }
  const inverseDeterminant = 1 / determinant;
  let x = cwx - parentParentWorld.tx;
  let y = cwy - parentParentWorld.ty;
  const dx = (x * d - y * b) * inverseDeterminant - px;
  const dy = (y * a - x * c) * inverseDeterminant - py;
  const l1 = Math.hypot(dx, dy);
  let l2 = (childBone.length ?? 0) * csx;
  if (l1 < 0.0001 || l2 < 0.0001) {
    return;
  }

  x = targetWorld.tx - parentParentWorld.tx;
  y = targetWorld.ty - parentParentWorld.ty;
  let tx = (x * d - y * b) * inverseDeterminant - px;
  let ty = (y * a - x * c) * inverseDeterminant - py;
  let dd = tx * tx + ty * ty;
  const softness = constraint.softness ?? 0;
  if (softness !== 0) {
    const scaledSoftness = softness * psx * (csx + 1) * 0.5;
    const targetDistance = Math.sqrt(dd);
    const softnessDelta = targetDistance - l1 - l2 * psx + scaledSoftness;
    if (softnessDelta > 0 && targetDistance > 0.0001) {
      const p0 = Math.min(1, softnessDelta / (scaledSoftness * 2)) - 1;
      const p = (softnessDelta - scaledSoftness * (1 - p0 * p0)) / targetDistance;
      tx -= p * tx;
      ty -= p * ty;
      dd = tx * tx + ty * ty;
    }
  }

  const bendDirection = constraint.bendPositive === false ? -1 : 1;
  const stretch = Boolean(constraint.stretch);
  let a1 = 0;
  let a2 = 0;
  if (uniformScale) {
    l2 *= psx;
    let cos = (dd - l1 * l1 - l2 * l2) / (2 * l1 * l2);
    if (cos < -1) {
      cos = -1;
    } else if (cos > 1) {
      cos = 1;
      if (stretch) {
        sx *= (Math.sqrt(dd) / (l1 + l2) - 1) * alpha + 1;
      }
    }
    a2 = Math.acos(cos) * bendDirection;
    a = l1 + l2 * cos;
    b = l2 * Math.sin(a2);
    a1 = Math.atan2(ty * a - tx * b, tx * a + ty * b);
  } else {
    a = psx * l2;
    b = psy * l2;
    const aa = a * a;
    const bb = b * b;
    const ta = Math.atan2(ty, tx);
    c = bb * l1 * l1 + aa * dd - aa * bb;
    const c1 = -2 * bb * l1;
    const c2 = bb - aa;
    d = c1 * c1 - 4 * c2 * c;
    if (d >= 0) {
      let q = Math.sqrt(d);
      if (c1 < 0) {
        q = -q;
      }
      q = -(c1 + q) / 2;
      const r0 = q / c2;
      const r1 = c / q;
      const r = Math.abs(r0) < Math.abs(r1) ? r0 : r1;
      if (r * r <= dd) {
        y = Math.sqrt(dd - r * r) * bendDirection;
        a1 = ta - Math.atan2(y, r);
        a2 = Math.atan2(y / psy, (r - l1) / psx);
      }
    }
    if (a1 === 0 && a2 === 0) {
      let minAngle = Math.PI;
      let minX = l1 - a;
      let minDist = minX * minX;
      let minY = 0;
      let maxAngle = 0;
      let maxX = l1 + a;
      let maxDist = maxX * maxX;
      let maxY = 0;
      c = (-a * l1) / (aa - bb);
      if (c >= -1 && c <= 1) {
        c = Math.acos(c);
        x = a * Math.cos(c) + l1;
        y = b * Math.sin(c);
        d = x * x + y * y;
        if (d < minDist) {
          minAngle = c;
          minDist = d;
          minX = x;
          minY = y;
        }
        if (d > maxDist) {
          maxAngle = c;
          maxDist = d;
          maxX = x;
          maxY = y;
        }
      }
      if (dd <= (minDist + maxDist) / 2) {
        a1 = ta - Math.atan2(minY * bendDirection, minX);
        a2 = minAngle * bendDirection;
      } else {
        a1 = ta - Math.atan2(maxY * bendDirection, maxX);
        a2 = maxAngle * bendDirection;
      }
    }
  }

  const os = Math.atan2(cy, cx) * s2;
  let rotation = parentLocal.rotation;
  let parentDelta = radToDeg(a1 - os) + os1 - rotation;
  parentDelta = normalizeDeg(parentDelta);
  parentLocal.rotation = normalizeDeg(rotation + parentDelta * alpha);
  parentLocal.scaleX = sx;
  parentLocal.shearX = 0;
  parentLocal.shearY = 0;

  rotation = childLocal.rotation;
  let childDelta = (radToDeg(a2 + os) - childLocal.shearX) * s2 + os2 - rotation;
  childDelta = normalizeDeg(childDelta);
  childLocal.rotation = normalizeDeg(rotation + childDelta * alpha);
}

function computeSourceWorldMatrices(locals) {
  const world = new Map();
  for (const bone of bones) {
    const local = locals.get(bone.name);
    const parent = bone.parent ? world.get(bone.parent) : undefined;
    world.set(bone.name, sourceWorldFromLocal(bone, local, parent));
  }
  return world;
}

function sourceWorldFromLocal(bone, local, parent) {
  const rotation = local.rotation + local.shearX;
  const rotationY = local.rotation + 90 + local.shearY;
  const la = cosDeg(rotation) * local.scaleX;
  const lb = cosDeg(rotationY) * local.scaleY;
  const lc = sinDeg(rotation) * local.scaleX;
  const ld = sinDeg(rotationY) * local.scaleY;
  if (!parent) {
    return { a: la, b: lb, c: lc, d: ld, tx: local.x, ty: local.y };
  }
  const tx = parent.a * local.x + parent.b * local.y + parent.tx;
  const ty = parent.c * local.x + parent.d * local.y + parent.ty;
  if (bone.transform === "onlyTranslation") {
    return { a: la, b: lb, c: lc, d: ld, tx, ty };
  }
  if (bone.transform === "noScale" || bone.transform === "noScaleOrReflection") {
    const za = parent.a * la + parent.b * lc;
    const zc = parent.c * la + parent.d * lc;
    let s = Math.hypot(za, zc);
    if (s > 0.00001) {
      s = Math.abs(parent.a * parent.d - parent.b * parent.c) / s;
    }
    const r = Math.PI / 2 + Math.atan2(zc, za);
    const zb = Math.cos(r) * s * local.scaleY;
    const zd = Math.sin(r) * s * local.scaleY;
    return { a: za, b: zb, c: zc, d: zd, tx, ty };
  }
  return {
    a: parent.a * la + parent.b * lc,
    b: parent.a * lb + parent.b * ld,
    c: parent.c * la + parent.d * lc,
    d: parent.c * lb + parent.d * ld,
    tx,
    ty
  };
}

function getAnimationDuration(animation) {
  let duration = 0;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    if (Number.isFinite(value.time)) {
      duration = Math.max(duration, value.time);
    }
    for (const item of Object.values(value)) {
      visit(item);
    }
  };
  visit(animation);
  return roundTime(Math.max(1 / bakedFrameRate, duration));
}

function sourceToBonesMatrix(matrix) {
  return { a: matrix.a, b: -matrix.c, c: -matrix.b, d: matrix.d, tx: matrix.tx, ty: -matrix.ty };
}

function sourceIdentityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function sourceApplyMatrix(matrix, x, y) {
  return { x: matrix.a * x + matrix.b * y + matrix.tx, y: matrix.c * x + matrix.d * y + matrix.ty };
}

function invertSourceMatrix(matrix) {
  const det = matrix.a * matrix.d - matrix.b * matrix.c || 1;
  return {
    a: matrix.d / det,
    b: -matrix.b / det,
    c: -matrix.c / det,
    d: matrix.a / det,
    tx: (matrix.b * matrix.ty - matrix.d * matrix.tx) / det,
    ty: (matrix.c * matrix.tx - matrix.a * matrix.ty) / det
  };
}

function invertMatrix(matrix) {
  const det = matrix.a * matrix.d - matrix.b * matrix.c || 1;
  return {
    a: matrix.d / det,
    b: -matrix.b / det,
    c: -matrix.c / det,
    d: matrix.a / det,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) / det,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) / det
  };
}

function decomposeMatrix(matrix) {
  const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  const yAxisLength = Math.hypot(matrix.c, matrix.d) || 1;
  const scaleY = det < 0 ? -yAxisLength : yAxisLength;
  const rotation = Math.atan2(matrix.b, matrix.a);
  const rotationX = Math.atan2(-matrix.c / scaleY, matrix.d / scaleY);
  return {
    x: round(matrix.tx),
    y: round(matrix.ty),
    rotation: round(rotation),
    scaleX: round(scaleX),
    scaleY: round(scaleY),
    skewX: round(rotation - rotationX),
    skewY: 0
  };
}

function sampleBezier(t, curve) {
  const [x1, y1, x2, y2] = curve;
  let low = 0;
  let high = 1;
  let solved = t;
  for (let index = 0; index < 8; index += 1) {
    solved = (low + high) * 0.5;
    const x = cubicBezier(solved, 0, x1, x2, 1);
    if (x < t) {
      low = solved;
    } else {
      high = solved;
    }
  }
  return cubicBezier(solved, 0, y1, y2, 1);
}

function cubicBezier(t, p0, p1, p2, p3) {
  const inv = 1 - t;
  return inv * inv * inv * p0 + 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t * p3;
}

function shortestDegDelta(from, to) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function normalizeDeg(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function cosDeg(value) {
  return Math.cos(degToRad(value));
}

function sinDeg(value) {
  return Math.sin(degToRad(value));
}

function radToDeg(value) {
  return (value * 180) / Math.PI;
}

function pushDeformTracks(out, clipId, animation) {
  for (const skin of Object.values(animation.deform ?? {})) {
    for (const [slotName, slotAttachments] of Object.entries(skin ?? {})) {
      for (const [attachmentName, keys] of Object.entries(slotAttachments ?? {})) {
        const attachment = attachments[slotName]?.[attachmentName];
        if (!attachment || !Array.isArray(keys)) {
          continue;
        }
        const vertexValueCount = attachment.uvs?.length ?? setupVertices(parseSpineSkin(attachment.vertices ?? [])).length;
        out.push({
          id: `${clipId}.${slotName}.deform`,
          target: { kind: "part", id: slotName },
          property: "deform",
          keyframes: keys.map((key, index) => ({
            time: roundTime(key.time ?? 0),
            value: toDeformOffsets(key, vertexValueCount),
            interpolation: key.curve === "stepped" ? "step" : typeof key.curve === "number" ? "bezier" : "linear",
            ...(typeof key.curve === "number" ? { curve: [key.curve, key.c2 ?? 0, key.c3 ?? 1, key.c4 ?? 1] } : {}),
            editor: { custom: { id: `${clipId}-${slotName}-deform-${index}`, spineAttachment: attachmentName } }
          }))
        });
      }
    }
  }
}

function pushDrawOrderTracks(out, clipId, animation) {
  const frames = animation.drawOrder ?? animation.draworder ?? [];
  if (!frames.length) {
    return;
  }
  const trackKeysBySlot = new Map();
  for (const frame of frames) {
    const drawOrder = resolveDrawOrder(frame.offsets ?? []);
    drawOrder.forEach((slotIndex, drawIndex) => {
      const slot = slots[slotIndex];
      if (!slot?.attachment || !attachments[slot.name]?.[slot.attachment]) {
        return;
      }
      const keys = trackKeysBySlot.get(slot.name) ?? [];
      keys.push({
        time: roundTime(frame.time ?? 0),
        value: drawIndex,
        interpolation: "step",
        editor: { custom: { id: `${clipId}-${slot.name}-drawOrder-${keys.length}` } }
      });
      trackKeysBySlot.set(slot.name, keys);
    });
  }
  for (const [slotName, keyframes] of trackKeysBySlot) {
    out.push({
      id: `${clipId}.${slotName}.drawOrder`,
      target: { kind: "part", id: slotName },
      property: "drawOrder",
      keyframes
    });
  }
}

function toDeformOffsets(key, valueCount) {
  const out = Array.from({ length: valueCount }, () => 0);
  const values = key.vertices ?? [];
  const offset = key.offset ?? 0;
  for (let index = 0; index < values.length && offset + index < out.length; index += 1) {
    const value = values[index] ?? 0;
    out[offset + index] = round((offset + index) % 2 === 0 ? value : -value);
  }
  return out;
}

function resolveDrawOrder(offsets) {
  const drawOrder = Array.from({ length: slots.length }, () => -1);
  const unchanged = [];
  let originalIndex = 0;
  for (const offset of offsets) {
    const slotIndex = slotIndexByName.get(offset.slot);
    if (slotIndex === undefined) {
      continue;
    }
    while (originalIndex !== slotIndex) {
      unchanged.push(originalIndex);
      originalIndex += 1;
    }
    drawOrder[originalIndex + (offset.offset ?? 0)] = originalIndex;
    originalIndex += 1;
  }
  while (originalIndex < slots.length) {
    unchanged.push(originalIndex);
    originalIndex += 1;
  }
  for (let index = drawOrder.length - 1; index >= 0; index -= 1) {
    if (drawOrder[index] === -1) {
      drawOrder[index] = unchanged.pop();
    }
  }
  return drawOrder;
}

function pushTimelineTracks(out, clipId, boneName, setup, timelines) {
  const translate = timelines.translate ?? [];
  if (translate.length) {
    out.push(toTrack(clipId, boneName, "transform.x", translate, (key) => key.x ?? setup.x ?? 0));
    out.push(toTrack(clipId, boneName, "transform.y", translate, (key) => -(key.y ?? setup.y ?? 0)));
  }
  const rotate = timelines.rotate ?? [];
  if (rotate.length) {
    out.push(toTrack(clipId, boneName, "transform.rotation", rotate, (key) => -degToRad(key.angle ?? setup.rotation ?? 0)));
  }
  const scale = timelines.scale ?? [];
  if (scale.length) {
    out.push(toTrack(clipId, boneName, "transform.scaleX", scale, (key) => key.x ?? setup.scaleX ?? 1));
    out.push(toTrack(clipId, boneName, "transform.scaleY", scale, (key) => key.y ?? setup.scaleY ?? 1));
  }
  const shear = timelines.shear ?? [];
  if (shear.length) {
    out.push(toTrack(clipId, boneName, "transform.skewX", shear, (key) => degToRad(key.x ?? 0)));
    out.push(toTrack(clipId, boneName, "transform.skewY", shear, (key) => -degToRad(key.y ?? 0)));
  }
}

function toTrack(clipId, boneName, property, keys, valueForKey) {
  return {
    id: `${clipId}.${boneName}.${property}`,
    target: { kind: "bone", id: boneName },
    property,
    keyframes: keys.map((key, index) => ({
      time: roundTime(key.time ?? 0),
      value: round(valueForKey(key)),
      interpolation: key.curve === "stepped" ? "step" : typeof key.curve === "number" ? "bezier" : "linear",
      ...(typeof key.curve === "number" ? { curve: [key.curve, key.c2 ?? 0, key.c3 ?? 1, key.c4 ?? 1] } : {}),
      editor: { custom: { id: `${clipId}-${boneName}-${property}-${index}` } }
    }))
  };
}

function toTransform(bone) {
  return {
    x: round(bone.x ?? 0),
    y: round(-(bone.y ?? 0)),
    rotation: round(-degToRad(bone.rotation ?? 0)),
    scaleX: round(bone.scaleX ?? 1),
    scaleY: round(bone.scaleY ?? 1)
  };
}

function buildSetupWorldMatrices(sourceBones) {
  const matrices = new Map();
  const sourceByName = new Map(sourceBones.map((bone) => [bone.name, bone]));
  const visit = (boneName) => {
    if (matrices.has(boneName)) {
      return matrices.get(boneName);
    }
    const bone = sourceByName.get(boneName);
    if (!bone) {
      return identityMatrix();
    }
    const local = matrixFromTransform(toTransform(bone));
    const world = bone.parent ? multiplyMatrices(visit(bone.parent), local) : local;
    matrices.set(boneName, world);
    return world;
  };
  for (const bone of sourceBones) {
    visit(bone.name);
  }
  return matrices;
}

function matrixFromTransform(transform) {
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  return {
    a: cos * transform.scaleX,
    b: sin * transform.scaleX,
    c: -sin * transform.scaleY,
    d: cos * transform.scaleY,
    tx: transform.x,
    ty: transform.y
  };
}

function multiplyMatrices(left, right) {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    tx: left.a * right.tx + left.c * right.ty + left.tx,
    ty: left.b * right.tx + left.d * right.ty + left.ty
  };
}

function applyMatrix(matrix, x, y) {
  return { x: matrix.a * x + matrix.c * y + matrix.tx, y: matrix.b * x + matrix.d * y + matrix.ty };
}

function identityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function defaultProcedural() {
  return {
    inputs: { velocityX: 0, velocityY: 0, gravity: 1, wind: 0, grounded: true, jumpStart: false, landHeavy: false },
    breathing: { enabled: false, frequency: 0.8, amplitude: 0, affectedBones: [], affectedBoneTransforms: {} },
    secondaryMotion: { enabled: false, target: "root", stiffness: 0, damping: 0, velocityInfluence: 0, gravityInfluence: 0, windInfluence: 0, maxOffset: 0 },
    squashStretch: { enabled: false, targetBone: "root", landingImpactScale: 0, rules: [] },
    footIk: { enabled: false, feet: [], footChains: [], maxCorrection: 0, blend: 0 }
  };
}

function emptyDirtyScopes() {
  return { project: [], bones: [], parts: [], animations: [], poses: [], stateMachine: [], procedural: [], preview: [] };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function round(value) {
  return Number(value.toFixed(4));
}

function roundTime(value) {
  return Number(value.toFixed(4));
}
