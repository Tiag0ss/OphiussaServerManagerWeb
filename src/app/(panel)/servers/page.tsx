import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listAccessibleServers } from "@/lib/permissions";
import { Card } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { allocations } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { joinAddress } from "@/lib/join-address";
import { CopyJoinButton } from "@/components/copy-join-button";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const user = await getSession();
  const servers = listAccessibleServers(user!);
  const db = getDb();
  const allPorts = db.select().from(allocations).all();
  const portsByServer = new Map<string, typeof allPorts>();
  for (const p of allPorts) {
    const list = portsByServer.get(p.serverId) ?? [];
    list.push(p);
    portsByServer.set(p.serverId, list);
  }
  const publicIp = getSettings().publicIp;

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
        {servers.map((s) => {
          const address = joinAddress(publicIp, portsByServer.get(s.id) ?? []);
          return (
            <Card key={s.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="text-sm text-muted">{s.templateId}</p>
                </div>
                <span className="text-xs uppercase text-muted">{s.status}</span>
              </div>
              <p className="mt-3 font-mono text-xs text-muted">
                {address ?? "No ports allocated"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {s.memoryMb} MB · {s.cpuLimit} CPU
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <CopyJoinButton address={address} />
                <Link href={`/servers/${s.id}`}>
                  <Button variant="secondary" size="sm">
                    Manage
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
        {servers.length === 0 && (
          <Card>
            <p className="text-sm text-muted">No servers yet.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
