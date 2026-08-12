import assert from "node:assert/strict";
import test from "node:test";
import { listRemoteProjects } from "../app/projectPersistence.ts";

test("character library reads lightweight database summaries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(input, "/api/projects");
    return new Response(JSON.stringify({ projects: [{
      id: "milo-db",
      name: "Milo Database",
      slug: "milo-database",
      version: 3,
      characterKind: "cat",
      boneCount: 25,
      partCount: 47,
      animationCount: 10,
      createdAt: "2026-08-12T10:00:00.000Z",
      updatedAt: "2026-08-12T11:00:00.000Z"
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const projects = await listRemoteProjects();
    assert.deepEqual(projects.map(({ name, characterKind, boneCount, partCount, animationCount }) => ({ name, characterKind, boneCount, partCount, animationCount })), [{
      name: "Milo Database",
      characterKind: "cat",
      boneCount: 25,
      partCount: 47,
      animationCount: 10
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
