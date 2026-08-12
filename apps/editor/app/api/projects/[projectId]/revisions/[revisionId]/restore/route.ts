import { ProjectVersionConflictError, restoreRevision } from "@/lib/db/projects";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ projectId: string; revisionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId, revisionId } = await context.params;
    const body = await request.json() as { version?: unknown };
    if (typeof body.version !== "number") throw new Error("Missing project version.");
    return NextResponse.json({ project: await restoreRevision(projectId, revisionId, body.version) });
  } catch (error) {
    const status = error instanceof ProjectVersionConflictError ? 409 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not restore revision." }, { status });
  }
}
