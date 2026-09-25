import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { getRun } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/** Progress of a sync run, polled by the UI during the first (large) sync. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/runs/[id]">) {
  if (!(await getSession())) return NextResponse.json({ error: "non autenticato" }, { status: 401 });
  const { id } = await ctx.params;
  const run = getRun(getDb(), Number(id));
  if (!run) return NextResponse.json({ error: "non trovato" }, { status: 404 });
  return NextResponse.json(run);
}
