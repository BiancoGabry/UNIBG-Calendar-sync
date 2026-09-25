import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runAllActive } from "@/lib/sync/run";

export const dynamic = "force-dynamic";

function authorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** For an external cron: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/sync` */
export async function POST(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const results = await runAllActive("api");
  const body = Object.fromEntries(
    Object.entries(results).map(([id, r]) => [
      id,
      { status: r.status, summary: r.summary, anomaly: r.anomaly?.message, error: r.error },
    ]),
  );
  return NextResponse.json({ ok: true, results: body });
}
