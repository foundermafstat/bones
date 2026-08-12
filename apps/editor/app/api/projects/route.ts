import { createProject, listProjects } from "@/lib/db/projects";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ projects: await listProjects() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { source?: unknown };
    const project = await createProject(body.source);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown project error.";
  const status = message.includes("DATABASE_URL") ? 503 : 400;
  return NextResponse.json({ error: message }, { status });
}
