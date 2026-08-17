import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { queryMetricHistory } from "@/lib/metrics-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireSession();
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") as "host" | "server" | "aggregate";
  const metric = url.searchParams.get("metric");
  const serverId = url.searchParams.get("serverId") ?? undefined;
  const hours = Number(url.searchParams.get("hours") ?? 24);

  if (!scope || !metric) {
    return NextResponse.json(
      { error: "scope and metric required" },
      { status: 400 },
    );
  }

  const sinceMs = Date.now() - hours * 60 * 60 * 1000;
  const series = queryMetricHistory({
    scope,
    metric,
    serverId,
    sinceMs,
    limit: 1000,
  });

  return NextResponse.json({ series });
}
