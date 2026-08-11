import assert from "node:assert/strict";
import test from "node:test";
import { createDogCharacterProject, createFighterCharacterProject, createHumanCharacterProject } from "../app/characterTemplates.ts";
import { fromSourceProject, toSourceProject } from "../app/editorSourceProject.ts";

test("Pulse preset opens as a human and survives source roundtrip", () => {
  const project = createFighterCharacterProject("pulse", "Pulse Pilot");
  assert.equal(project.name, "Pulse Pilot");
  assert.equal(project.characterKind, "human");
  assert.equal(project.hierarchy.length, 38);
  assert.equal(Object.keys(project.parts).length, 21);
  assert.equal(Object.keys(project.animations).length, 50);
  assert.equal(Boolean(project.animations.vanguard_rush), true);

  const source = toSourceProject(project);
  const roundtrip = fromSourceProject(source);
  assert.equal(roundtrip.characterKind, "human");
  assert.equal(Object.keys(roundtrip.parts).length, 21);
  assert.equal(Object.keys(roundtrip.animations).length, 50);
  assert.equal(roundtrip.parts.torso.mesh.texture, "/assets/fighters/pulse/parts/torso.png");
});

test("existing Human and Dog template entrypoints remain unchanged", () => {
  const human = createHumanCharacterProject("Human");
  const dog = createDogCharacterProject("Dog");
  assert.equal(human.characterKind, "human");
  assert.equal(dog.characterKind, "dog");
  assert.equal(dog.hierarchy.length, 20);
  assert.equal(Boolean(dog.animations.idle), true);
});
