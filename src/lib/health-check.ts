import net from "net";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { allocations, servers } from "./db/schema";
import { getTemplate } from "./templates/load";
import { sendRcon } from "./rcon/client";

export type HealthStatus = {
  container: "running" | "stopped" | "unknown";
  gamePort: "open" | "closed" | "skipped";
  rcon: "ok" | "fail" | "skipped";
  overall: "healthy" | "degraded" | "down" | "stopped";
  detail?: string;
};

function probeTcp(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
  });
}

export async function checkServerHealth(serverId: string): Promise<HealthStatus> {
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server) {
    return {
      container: "unknown",
      gamePort: "skipped",
      rcon: "skipped",
      overall: "down",
      detail: "Server not found",
    };
  }

  if (server.status !== "running") {
    return {
      container: "stopped",
      gamePort: "skipped",
      rcon: "skipped",
      overall: "stopped",
    };
  }

  const tpl = getTemplate(server.templateId);
  const ports = db
    .select()
    .from(allocations)
    .where(eq(allocations.serverId, serverId))
    .all();

  const gamePort =
    ports.find((p) => p.key === "game" || p.key === "server") ?? ports[0];
  let gamePortStatus: HealthStatus["gamePort"] = "skipped";
  if (gamePort) {
    const open = await probeTcp("127.0.0.1", gamePort.hostPort);
    gamePortStatus = open ? "open" : "closed";
  }

  let rconStatus: HealthStatus["rcon"] = "skipped";
  if (tpl?.rcon?.enabled || server.rconEnabled) {
    try {
      const cmd = tpl?.rcon?.saveCommand || "help";
      await sendRcon(serverId, cmd);
      rconStatus = "ok";
    } catch {
      rconStatus = "fail";
    }
  }

  let overall: HealthStatus["overall"] = "healthy";
  if (gamePortStatus === "closed") overall = "degraded";
  if (rconStatus === "fail") overall = "degraded";
  if (gamePortStatus === "closed" && rconStatus === "fail") overall = "down";

  return {
    container: "running",
    gamePort: gamePortStatus,
    rcon: rconStatus,
    overall,
  };
}
