import assert from "node:assert/strict";
import test from "node:test";
import {
  closePath,
  convertLineToSmoothCubic,
  createOrganicBlobPath,
  createTaperedLimbPath,
  createSvgPathSource,
  deletePathCommand,
  getBoundsOverlap,
  getPathBounds,
  getPathDirection,
  getPathPivot,
  hitTestPath,
  importSvgPaths,
  insertPointOnSegment,
  isPathClosed,
  mirrorPath,
  movePathCommandPoint,
  normalizePath,
  normalizePathDirection,
  parsePathData,
  reversePath,
  setCubicHandles,
  serializePathData,
  simplifyPath,
  smoothPath,
  toPixiGraphicsCommands
} from "../dist/index.js";

const square = [
  { cmd: "M", x: 0, y: 0 },
  { cmd: "L", x: 10, y: 0 },
  { cmd: "L", x: 10, y: 10 },
  { cmd: "L", x: 0, y: 10 },
  { cmd: "Z" }
];

test("parses and normalizes internal path commands", () => {
  const commands = parsePathData("M 0 0 L 10 0 l 0 10 q 5 5 0 10 z");

  assert.deepEqual(commands.at(0), { cmd: "M", x: 0, y: 0 });
  assert.deepEqual(commands.at(2), { cmd: "L", x: 10, y: 10 });
  assert.deepEqual(commands.at(-1), { cmd: "Z" });
  assert.equal(isPathClosed(commands), true);
});

test("rejects paths that do not start with M", () => {
  assert.throws(() => normalizePath([{ cmd: "L", x: 1, y: 1 }]), /start with an M/);
});

test("mirrors paths across axes", () => {
  const mirrored = mirrorPath(square, "y", 5);

  assert.deepEqual(mirrored[0], { cmd: "M", x: 10, y: 0 });
  assert.deepEqual(mirrored[1], { cmd: "L", x: 0, y: 0 });
  assert.equal(isPathClosed(mirrored), true);
});

test("detects and normalizes path direction", () => {
  assert.equal(getPathDirection(square), "counterclockwise");

  const clockwise = normalizePathDirection(square, "clockwise");

  assert.equal(getPathDirection(clockwise), "clockwise");
  assert.equal(isPathClosed(clockwise), true);
});

test("reverses open and closed paths", () => {
  const reversedClosed = reversePath(square);
  const reversedOpen = reversePath(square.slice(0, -1));

  assert.equal(getPathDirection(reversedClosed), "clockwise");
  assert.deepEqual(reversedOpen[0], { cmd: "M", x: 0, y: 10 });
  assert.equal(isPathClosed(reversedOpen), false);
});

test("simplifies duplicate and collinear line commands", () => {
  const simplified = simplifyPath([
    { cmd: "M", x: 0, y: 0 },
    { cmd: "L", x: 0, y: 0 },
    { cmd: "L", x: 5, y: 0 },
    { cmd: "L", x: 10, y: 0 },
    { cmd: "L", x: 10, y: 10 }
  ]);

  assert.deepEqual(simplified, [
    { cmd: "M", x: 0, y: 0 },
    { cmd: "L", x: 10, y: 0 },
    { cmd: "L", x: 10, y: 10 }
  ]);
});

test("smooths line-only paths as a safe operation", () => {
  const smoothed = smoothPath(closePath(square), 0.2);

  assert.equal(smoothed.some((command) => command.cmd === "Q"), true);
  assert.equal(isPathClosed(smoothed), true);
});

test("creates procedural tapered limb and organic blob paths", () => {
  const limb = createTaperedLimbPath({ length: 32, startWidth: 9, endWidth: 5, bend: 0.18, softness: 0.75 });
  const blob = createOrganicBlobPath({ radiusX: 12, radiusY: 18, asymmetry: 0.2 });

  assert.equal(limb[0].cmd, "M");
  assert.equal(limb.at(-1).cmd, "Z");
  assert.equal(blob.filter((command) => command.cmd === "C").length, 4);
});

test("serializes and converts to Pixi-compatible command data", () => {
  const serialized = serializePathData(square);
  const pixiCommands = toPixiGraphicsCommands(square);

  assert.equal(serialized, "M 0 0 L 10 0 L 10 10 L 0 10 Z");
  assert.deepEqual(pixiCommands.at(0), { method: "moveTo", args: [0, 0] });
  assert.deepEqual(pixiCommands.at(-1), { method: "closePath", args: [] });
});

test("keeps SVG as an imported source model", () => {
  assert.deepEqual(createSvgPathSource("M0 0L1 1", [0, 0, 1, 1]), {
    type: "svg",
    source: "M0 0L1 1",
    viewBox: [0, 0, 1, 1]
  });
});

test("imports SVG path data into editable vector commands", () => {
  const imported = importSvgPaths('<svg viewBox="0 0 10 20"><path fill="#050505" d="M 0 0 L 10 0 L 10 20 Z"/></svg>');

  assert.deepEqual(imported.viewBox, [0, 0, 10, 20]);
  assert.equal(imported.paths.length, 1);
  assert.equal(imported.paths[0].fill, "#050505");
  assert.deepEqual(imported.paths[0].commands, [
    { cmd: "M", x: 0, y: 0 },
    { cmd: "L", x: 10, y: 0 },
    { cmd: "L", x: 10, y: 20 },
    { cmd: "Z" }
  ]);
});

test("computes bounds, pivot, hit tests, and overlap preview", () => {
  const bounds = getPathBounds(square);

  assert.deepEqual(bounds, { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 });
  assert.deepEqual(getPathPivot(square), { x: 5, y: 5 });
  assert.deepEqual(hitTestPath(square, { x: 10, y: 5 }, 0.1), { kind: "segment", index: 2, distance: 0 });
  assert.deepEqual(getBoundsOverlap(bounds, { minX: 5, minY: 5, maxX: 15, maxY: 8, width: 10, height: 3 }), {
    minX: 5,
    minY: 5,
    maxX: 10,
    maxY: 8,
    width: 5,
    height: 3
  });
});

test("edits path points and bezier handles", () => {
  const inserted = insertPointOnSegment(square, 1, 0.5);
  assert.deepEqual(inserted[1], { cmd: "L", x: 5, y: 0 });

  const moved = movePathCommandPoint(inserted, 1, { x: 6, y: 1 });
  assert.deepEqual(moved[1], { cmd: "L", x: 6, y: 1 });

  const deleted = deletePathCommand(moved, 1);
  assert.deepEqual(deleted, square);

  const cubic = convertLineToSmoothCubic(square, 1, 0.25);
  assert.equal(cubic[1].cmd, "C");

  const handled = setCubicHandles(cubic, 1, { x: 2, y: -2 }, { x: 8, y: -2 });
  assert.deepEqual(handled[1], { cmd: "C", cp1x: 2, cp1y: -2, cp2x: 8, cp2y: -2, x: 10, y: 0 });
});
