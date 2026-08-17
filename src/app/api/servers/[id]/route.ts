import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { allocations, servers } from "@/lib/db/schema";
import {
  deleteServerWipe,
  getContainerStats,
  restartServer,
  startServer,
  stopServer,
  createServerContainer,
  updateServerImage,
} from "@/lib/docker/servers";
import { canAccessServer } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  assertCanUpdateServerResources,
  getQuotaHeadroom,
} from "@/lib/quotas";
import { getTemplate, mergeConfigWithDefaults } from "@/lib/templates/load";
import { getSettings } from "@/lib/settings";
import { generatePassword, hashPassword } from "@/lib/auth/password";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { ftpPort, sftpPort } from "@/lib/ports";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, id)).get();
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tpl = getTemplate(server.templateId);
  const ports = db
    .select()
    .from(allocations)
    .where(eq(allocations.serverId, id))
    .all();
  const stats = await getContainerStats(id);
  const settings = getSettings();
  const headroomOwnerId =
    user.role === "admin" ? server.ownerId : user.id;
  const quotas = getQuotaHeadroom(headroomOwnerId, id);
  const { getUserPortRange } = await import("@/lib/port-alloc");
  const portRange = getUserPortRange(server.ownerId);
  const { users } = await import("@/lib/db/schema");
  const owner = db.select().from(users).where(eq(users.id, server.ownerId)).get();
  const ownerLabel =
    owner?.name?.trim() ||
    owner?.email?.split("@")[0] ||
    server.ownerId.slice(0, 8);
  const { buildContainerName } = await import("@/lib/docker/servers");
  const { getDocker, getDockerSocketPath, LABEL_NETWORK_MODE } = await import(
    "@/lib/docker/client"
  );
  const containerName = buildContainerName({
    templateId: server.templateId,
    ownerName: ownerLabel,
    serverName: server.name,
    serverId: id,
  });
  let networkMode = "ophiussa_games";
  if (server.containerId) {
    try {
      const info = await getDocker().getContainer(server.containerId).inspect();
      networkMode =
        info.Config?.Labels?.[LABEL_NETWORK_MODE] ||
        info.HostConfig?.NetworkMode ||
        networkMode;
    } catch {
      /* ignore */
    }
  }
  const canRevealFtp =
    canAccessServer(user, id, "files") ||
    canAccessServer(user, id, "settings");
  const ftpPassword = canRevealFtp
    ? decryptSecret(server.ftpPasswordEnc)
    : null;
  return NextResponse.json({
    server: {
      ...server,
      config: mergeConfigWithDefaults(
        tpl!,
        JSON.parse(server.configJson) as Record<string, unknown>,
      ),
      ftpPasswordHash: undefined,
      ftpPasswordEnc: undefined,
    },
    template: tpl,
    ports,
    stats,
    quotas,
    portRange,
    containerName,
    ownerName: ownerLabel,
    dockerNetwork: networkMode,
    dockerSocket: getDockerSocketPath(),
    isAdmin: user.role === "admin",
    publicIp: settings.publicIp,
    ftpPort: ftpPort(),
    sftpPort: sftpPort(),
    ftpPassword,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, id)).get();
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nextMemory =
    typeof body.memoryMb === "number" ? body.memoryMb : server.memoryMb;
  const nextCpu =
    typeof body.cpuLimit === "number" ? body.cpuLimit : server.cpuLimit;

  if (
    typeof body.memoryMb === "number" ||
    typeof body.cpuLimit === "number"
  ) {
    if (nextMemory < 256 || nextCpu < 0.25) {
      return NextResponse.json(
        { error: "Invalid resource limits" },
        { status: 400 },
      );
    }
    const quotaErr = assertCanUpdateServerResources(user, id, {
      memoryMb: nextMemory,
      cpuLimit: nextCpu,
    });
    if (quotaErr) {
      return NextResponse.json({ error: quotaErr }, { status: 400 });
    }
  }

  const patch: Partial<typeof servers.$inferInsert> = { updatedAt: new Date() };
  if (body.name) patch.name = body.name;
  if (body.config) patch.configJson = JSON.stringify(body.config);
  if (typeof body.memoryMb === "number") patch.memoryMb = nextMemory;
  if (typeof body.cpuLimit === "number") patch.cpuLimit = nextCpu;
  if (typeof body.ftpEnabled === "boolean") patch.ftpEnabled = body.ftpEnabled;

  const resourcesChanged =
    (typeof body.memoryMb === "number" && body.memoryMb !== server.memoryMb) ||
    (typeof body.cpuLimit === "number" && body.cpuLimit !== server.cpuLimit);

  let portsChanged = false;
  if (body.ports && typeof body.ports === "object") {
    const preferred = body.ports as Record<string, number>;
    const { reallocatePorts } = await import("@/lib/docker/servers");
    try {
      await reallocatePorts(id, preferred);
      portsChanged = true;
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Port allocation failed" },
        { status: 400 },
      );
    }
  }

  const shouldRecreate =
    Boolean(body.recreate) || resourcesChanged || portsChanged;

  db.update(servers).set(patch).where(eq(servers.id, id)).run();

  if (shouldRecreate) {
    try {
      await stopServer(id).catch(() => undefined);
      const { removeServerContainers } = await import("@/lib/docker/servers");
      await removeServerContainers(id);
      db.update(servers)
        .set({ containerId: null, status: "stopped", updatedAt: new Date() })
        .where(eq(servers.id, id))
        .run();
      await createServerContainer(id);
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error ? e.message : "Failed to recreate container",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, recreated: shouldRecreate });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "delete")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { confirmName } = await req.json();
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, id)).get();
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (confirmName !== server.name) {
    return NextResponse.json(
      { error: "Confirmation name does not match" },
      { status: 400 },
    );
  }
  await deleteServerWipe(id);
  writeAudit(user, "server.delete", {
    targetType: "server",
    targetId: id,
    details: { name: server.name },
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  const { action } = await req.json();
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, id)).get();
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    switch (action) {
      case "start":
        if (!canAccessServer(user, id, "start")) throw new Error("FORBIDDEN");
        await startServer(id);
        writeAudit(user, "server.start", { targetType: "server", targetId: id });
        break;
      case "stop":
        if (!canAccessServer(user, id, "stop")) throw new Error("FORBIDDEN");
        await stopServer(id);
        writeAudit(user, "server.stop", { targetType: "server", targetId: id });
        break;
      case "kill":
        if (!canAccessServer(user, id, "stop")) throw new Error("FORBIDDEN");
        await stopServer(id, { kill: true });
        writeAudit(user, "server.stop", {
          targetType: "server",
          targetId: id,
          details: { kill: true },
        });
        break;
      case "restart":
        if (!canAccessServer(user, id, "start")) throw new Error("FORBIDDEN");
        await restartServer(id);
        writeAudit(user, "server.restart", { targetType: "server", targetId: id });
        break;
      case "update-image": {
        if (!canAccessServer(user, id, "settings")) throw new Error("FORBIDDEN");
        await updateServerImage(id);
        writeAudit(user, "server.update_image", {
          targetType: "server",
          targetId: id,
        });
        break;
      }
      case "reset-ftp-password": {
        if (
          !canAccessServer(user, id, "settings") &&
          !canAccessServer(user, id, "files")
        ) {
          throw new Error("FORBIDDEN");
        }
        const pw = generatePassword(14);
        db.update(servers)
          .set({
            ftpPasswordHash: await hashPassword(pw),
            ftpPasswordEnc: encryptSecret(pw),
            updatedAt: new Date(),
          })
          .where(eq(servers.id, id))
          .run();
        return NextResponse.json({ ftpPassword: pw, ftpUsername: server.ftpUsername });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
