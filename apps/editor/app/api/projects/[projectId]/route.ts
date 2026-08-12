import { getProject, ProjectVersionConflictError, updateProject } from "@/lib/db/projects";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const project = await getProject(projectId);
    return project ? NextResponse.json({ project }) : NextResponse.json({ error: "Project not found." }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as { version?: unknown; source?: unknown };
    if (typeof body.version !== "number") throw new Error("Missing project version.");
    return NextResponse.json({ project: await updateProject(projectId, body.version, body.source) });
  } catch (error) {
    return apiError(error);
  }
}

function apiError(error: unknown) {
  if (error instanceof ProjectVersionConflictError) {
    return NextResponse.json({ error: error.message, currentVersion: error.currentVersion }, { status: 409 });
  }
  const message = error instanceof Error ? error.message : "Unknown project error.";
  return NextResponse.json({ error: message }, { status: message.includes("DATABASE_URL") ? 503 : 400 });
}
