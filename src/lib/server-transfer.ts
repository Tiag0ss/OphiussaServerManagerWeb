import { cpSync, existsSync, mkdirSync } from "fs";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { hashPassword, generatePassword } from "./auth/password";
import { encryptSecret } from "./secrets";
import { getDb } from "./db";
import { allocations, servers } from "./db/schema";
import type { SessionUser } from "./auth/session";
import {
  allocatePorts,
  createServerContainer,
  startServer,
} from "./docker/servers";
import { assertCanCreateServer } from "./quotas";
import { getTemplate } from "./templates/load";
import { serverDataDir } from "./paths";
import { dispatchAlert, sendDiscord } from "./alerts/notify";

export async function cloneServer(
  user: SessionUser,
  sourceId: string,
  opts: { name: string; copyData?: boolean; start?: boolean },
) {
  const db = getDb();
  const source = db.select().from(servers).where(eq(servers.id, sourceId)).get();
  if (!source) throw new Error("Source server not found");

  const tpl = getTemplate(source.templateId);
  if (!tpl) throw new Error("Template not found");

  const quotaError = assertCanCreateServer(user, {
    templateId: source.templateId,
    memoryMb: source.memoryMb,
    cpuLimit: source.cpuLimit,
  });
  if (quotaError) throw new Error(quotaError);

  const id = nanoid();
  const ftpPassword = generatePassword(14);
  const ftpUsername = `ophiussa.${id.slice(0, 8)}`;
  const config = JSON.parse(source.configJson) as Record<string, unknown>;

  mkdirSync(serverDataDir(id), { recursive: true });
  if (opts.copyData) {
    const srcDir = serverDataDir(sourceId);
    if (existsSync(srcDir)) {
      cpSync(srcDir, serverDataDir(id), { recursive: true });
    }
  }

  db.insert(servers)
    .values({
      id,
      name: opts.name,
      templateId: source.templateId,
      ownerId: user.id,
      status: "created",
      configJson: JSON.stringify(config),
      memoryMb: source.memoryMb,
      cpuLimit: source.cpuLimit,
      ftpEnabled: source.ftpEnabled,
      ftpUsername,
      ftpPasswordHash: await hashPassword(ftpPassword),
      ftpPasswordEnc: encryptSecret(ftpPassword),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  await allocatePorts(tpl, id, { ownerId: user.id });
  await createServerContainer(id);
  if (opts.start !== false) {
    await startServer(id);
  }

  const installTitle = `Server installed — ${opts.name}`;
  const installMessage = `${opts.name} (${tpl.name}) was cloned from ${source.name} by ${user.email}.`;
  dispatchAlert({
    title: installTitle,
    message: installMessage,
    severity: "info",
  }).catch(() => undefined);
  if (typeof config.discordWebhook === "string" && config.discordWebhook.trim()) {
    sendDiscord(config.discordWebhook.trim(), {
      title: installTitle,
      message: installMessage,
      severity: "info",
    }).catch(() => undefined);
  }

  return { id, ftpUsername, ftpPassword };
}

export function exportServerBundle(serverId: string) {
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server) throw new Error("Server not found");
  const ports = db
    .select()
    .from(allocations)
    .where(eq(allocations.serverId, serverId))
    .all();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    server: {
      name: server.name,
      templateId: server.templateId,
      config: JSON.parse(server.configJson),
      memoryMb: server.memoryMb,
      cpuLimit: server.cpuLimit,
      ftpEnabled: server.ftpEnabled,
    },
    ports: ports.map((p) => ({
      key: p.key,
      hostPort: p.hostPort,
      containerPort: p.containerPort,
      protocol: p.protocol,
    })),
  };
}

export async function importServerBundle(
  user: SessionUser,
  bundle: {
    server: {
      name: string;
      templateId: string;
      config: Record<string, unknown>;
      memoryMb: number;
      cpuLimit: number;
      ftpEnabled?: boolean;
    };
    ports?: Array<{ key: string; hostPort: number }>;
  },
  opts?: { start?: boolean },
) {
  const tpl = getTemplate(bundle.server.templateId);
  if (!tpl) throw new Error("Template not found");

  const quotaError = assertCanCreateServer(user, {
    templateId: bundle.server.templateId,
    memoryMb: bundle.server.memoryMb,
    cpuLimit: bundle.server.cpuLimit,
  });
  if (quotaError) throw new Error(quotaError);

  const db = getDb();
  const id = nanoid();
  const ftpPassword = generatePassword(14);
  const ftpUsername = `ophiussa.${id.slice(0, 8)}`;
  mkdirSync(serverDataDir(id), { recursive: true });

  const preferred: Record<string, number> = {};
  for (const p of bundle.ports ?? []) preferred[p.key] = p.hostPort;

  db.insert(servers)
    .values({
      id,
      name: bundle.server.name,
      templateId: bundle.server.templateId,
      ownerId: user.id,
      status: "created",
      configJson: JSON.stringify(bundle.server.config),
      memoryMb: bundle.server.memoryMb,
      cpuLimit: bundle.server.cpuLimit,
      ftpEnabled: bundle.server.ftpEnabled ?? true,
      ftpUsername,
      ftpPasswordHash: await hashPassword(ftpPassword),
      ftpPasswordEnc: encryptSecret(ftpPassword),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  await allocatePorts(tpl, id, { ownerId: user.id, preferred });
  await createServerContainer(id);
  if (opts?.start !== false) {
    await startServer(id);
  }

  return { id, ftpUsername, ftpPassword };
}
