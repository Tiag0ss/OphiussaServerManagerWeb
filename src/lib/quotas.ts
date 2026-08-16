import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { servers, users } from "./db/schema";
import type { SessionUser } from "./auth/session";

export type UserQuotas = {
  maxServers: number;
  maxMemoryMb: number;
  maxCpu: number;
  allowedTemplates: string[];
};

export function getUserQuotas(userId: string): UserQuotas | null {
  const row = getDb().select().from(users).where(eq(users.id, userId)).get();
  if (!row) return null;
  let allowedTemplates: string[] = [];
  try {
    allowedTemplates = JSON.parse(row.allowedTemplatesJson || "[]") as string[];
  } catch {
    allowedTemplates = [];
  }
  return {
    maxServers: row.maxServers,
    maxMemoryMb: row.maxMemoryMb,
    maxCpu: row.maxCpu,
    allowedTemplates,
  };
}

export function getUserResourceUsage(userId: string) {
  const owned = getDb()
    .select()
    .from(servers)
    .where(eq(servers.ownerId, userId))
    .all();
  return {
    servers: owned.length,
    memoryMb: owned.reduce((a, s) => a + s.memoryMb, 0),
    cpu: owned.reduce((a, s) => a + s.cpuLimit, 0),
  };
}

export function assertCanCreateServer(
  user: SessionUser,
  opts: { templateId: string; memoryMb: number; cpuLimit: number },
): string | null {
  if (user.role === "admin") return null;
  const quotas = getUserQuotas(user.id);
  if (!quotas) return "User not found";
  if (
    quotas.allowedTemplates.length > 0 &&
    !quotas.allowedTemplates.includes(opts.templateId)
  ) {
    return "You are not allowed to use this game template";
  }
  const usage = getUserResourceUsage(user.id);
  if (usage.servers + 1 > quotas.maxServers) {
    return `Server limit reached (${quotas.maxServers})`;
  }
  if (usage.memoryMb + opts.memoryMb > quotas.maxMemoryMb) {
    return `RAM quota exceeded (${usage.memoryMb + opts.memoryMb} / ${quotas.maxMemoryMb} MB)`;
  }
  if (usage.cpu + opts.cpuLimit > quotas.maxCpu) {
    return `CPU quota exceeded (${usage.cpu + opts.cpuLimit} / ${quotas.maxCpu})`;
  }
  return null;
}

/** Validate RAM/CPU change for an existing server (excludes current server from usage). */
export function assertCanUpdateServerResources(
  user: SessionUser,
  serverId: string,
  opts: { memoryMb: number; cpuLimit: number },
): string | null {
  if (user.role === "admin") return null;
  const server = getDb()
    .select()
    .from(servers)
    .where(eq(servers.id, serverId))
    .get();
  if (!server) return "Server not found";
  // Quotas always apply to the owner, even if a delegated user can edit settings
  const ownerId = server.ownerId;
  const quotas = getUserQuotas(ownerId);
  if (!quotas) return "Owner not found";
  const owned = getDb()
    .select()
    .from(servers)
    .where(eq(servers.ownerId, ownerId))
    .all()
    .filter((s) => s.id !== serverId);
  const memoryMb = owned.reduce((a, s) => a + s.memoryMb, 0) + opts.memoryMb;
  const cpu = owned.reduce((a, s) => a + s.cpuLimit, 0) + opts.cpuLimit;
  if (memoryMb > quotas.maxMemoryMb) {
    return `RAM quota exceeded (${memoryMb} / ${quotas.maxMemoryMb} MB)`;
  }
  if (cpu > quotas.maxCpu) {
    return `CPU quota exceeded (${cpu} / ${quotas.maxCpu})`;
  }
  return null;
}

export function getQuotaHeadroom(userId: string, excludeServerId?: string) {
  const quotas = getUserQuotas(userId);
  if (!quotas) return null;
  const owned = getDb()
    .select()
    .from(servers)
    .where(eq(servers.ownerId, userId))
    .all()
    .filter((s) => s.id !== excludeServerId);
  const usedMemory = owned.reduce((a, s) => a + s.memoryMb, 0);
  const usedCpu = owned.reduce((a, s) => a + s.cpuLimit, 0);
  return {
    ...quotas,
    usedServers: owned.length,
    usedMemoryMb: usedMemory,
    usedCpu,
    remainingMemoryMb: Math.max(0, quotas.maxMemoryMb - usedMemory),
    remainingCpu: Math.max(0, quotas.maxCpu - usedCpu),
    remainingServers: Math.max(0, quotas.maxServers - owned.length),
  };
}
