import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listAccessibleServers } from "@/lib/permissions";
import { getHostMetrics } from "@/lib/host-metrics";
import { Card } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { reconcileServers } from "@/lib/docker/servers";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  try {
    await reconcileServers();
  } catch {
    /* docker may be unavailable in build/dev without socket */
  }
  const servers = listAccessibleServers(user!);
  const metrics = getHostMetrics();
  const running = servers.filter((s) => s.status === "running").length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-sm text-muted">
            {running} running · {servers.length} total servers
          </p>
        </div>
        <Link href="/servers/new">
          <Button>Create server</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-muted">RAM</p>
          <p className="mt-1 text-2xl font-semibold">
            {metrics.ram.usedPercent}%
          </p>
          <p className="text-sm text-muted">
            {metrics.ram.freeMb} MB free / {metrics.ram.totalMb} MB
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-muted">Disk</p>
          <p className="mt-1 text-2xl font-semibold">
            {metrics.disk.usedPercent}%
          </p>
          <p className="text-sm text-muted">
            {metrics.disk.freeMb} MB free / {metrics.disk.totalMb} MB
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-muted">Servers</p>
          <p className="mt-1 text-2xl font-semibold">{running}</p>
          <p className="text-sm text-muted">currently running</p>
        </Card>
      </div>

      <Card>
        <h3 className="font-medium">Your servers</h3>
        <div className="mt-4 divide-y divide-border">
          {servers.length === 0 && (
            <p className="py-6 text-sm text-muted">
              No servers yet. Create one from a game template.
            </p>
          )}
          {servers.map((s) => (
            <Link
              key={s.id}
              href={`/servers/${s.id}`}
              className="flex items-center justify-between rounded-lg px-2 py-3 hover:bg-card-elevated"
            >
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted">{s.templateId}</p>
              </div>
              <StatusPill status={s.status} />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-ok/15 text-ok"
      : status === "stopped"
        ? "bg-card-elevated text-muted"
        : "bg-warn/15 text-warn";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}
