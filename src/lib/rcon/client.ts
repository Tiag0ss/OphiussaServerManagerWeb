import { eq } from "drizzle-orm";
import { Rcon } from "rcon-client";
import { getDb } from "../db";
import { allocations, servers } from "../db/schema";
import { getTemplate } from "../templates/load";

export async function sendRcon(serverId: string, command: string) {
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server) throw new Error("Server not found");
  const tpl = getTemplate(server.templateId);
  if (!tpl?.rcon?.enabled && !server.rconEnabled) {
    throw new Error("RCON not enabled for this server");
  }

  const config = JSON.parse(server.configJson) as Record<string, unknown>;
  const passwordField = tpl?.rcon?.passwordField || "rconPassword";
  const password = String(config[passwordField] || "");
  if (!password) throw new Error("RCON password not set");

  const portKey = tpl?.rcon?.portKey || "rcon";
  const alloc = db
    .select()
    .from(allocations)
    .where(eq(allocations.serverId, serverId))
    .all()
    .find((a) => a.key === portKey);

  const host = "127.0.0.1";
  const port = alloc?.hostPort;
  if (!port) throw new Error("RCON port not allocated");

  const rcon = await Rcon.connect({ host, port, password });
  try {
    return await rcon.send(command);
  } finally {
    rcon.end();
  }
}
