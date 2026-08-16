import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listAccessibleServers } from "@/lib/permissions";
import { Card } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const user = await getSession();
  const servers = listAccessibleServers(user!);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Servers</h2>
          <p className="text-sm text-muted">All game instances on this VPS</p>
        </div>
        <Link href="/servers/new">
          <Button>Create server</Button>
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {servers.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="text-sm text-muted">{s.templateId}</p>
              </div>
              <span className="text-xs uppercase text-muted">{s.status}</span>
            </div>
            <p className="mt-3 text-sm text-muted">
              {s.memoryMb} MB · {s.cpuLimit} CPU
            </p>
            <Link href={`/servers/${s.id}`} className="mt-4 inline-block">
              <Button variant="secondary" size="sm">
                Manage
              </Button>
            </Link>
          </Card>
        ))}
        {servers.length === 0 && (
          <Card>
            <p className="text-sm text-muted">No servers yet.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
