import { listAssets, upsertAsset } from "@/lib/db/projects";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    return NextResponse.json({ assets: await listAssets(projectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not list assets." }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json({ asset: await upsertAsset(projectId, body) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save asset metadata." }, { status: 400 });
  }
}
