import { createRevision, listRevisions } from "@/lib/db/projects";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    return NextResponse.json({ revisions: await listRevisions(projectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not list revisions." }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as { kind?: unknown; label?: unknown };
    const kind = body.kind === "periodic" || body.kind === "restore" || body.kind === "import" ? body.kind : "manual";
    const label = typeof body.label === "string" ? body.label : undefined;
    return NextResponse.json({ revision: await createRevision(projectId, kind, label) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create revision." }, { status: 400 });
  }
}
