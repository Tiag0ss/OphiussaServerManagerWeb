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
} from "@/lib/docker/servers";
import { canAccessServer } from "@/lib/permissions";
import {
  assertCanUpdateServerResources,
  getQuotaHeadroom,
} from "@/lib/quotas";
import { getTemplate, mergeConfigWithDefaults } from "@/lib/templates/load";
import { getSettings } from "@/lib/settings";
import { generatePassword, hashPassword } from "@/lib/auth/password";
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
  return NextResponse.json({
    server: {
      ...server,
      config: mergeConfigWithDefaults(
        tpl!,
        JSON.parse(server.configJson) as Record<string, unknown>,
      ),
      ftpPasswordHash: undefined,
    },
    template: tpl,
    ports,
    stats,
    quotas,
    isAdmin: user.role === "admin",
    publicIp: settings.publicIp,
    ftpPort: ftpPort(),
    sftpPort: sftpPort(),
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
  const shouldRecreate = Boolean(body.recreate) || resourcesChanged;

  db.update(servers).set(patch).where(eq(servers.id, id)).run();

  if (shouldRecreate) {
    if (server.containerId) {
      await stopServer(id).catch(() => undefined);
      const { getDocker } = await import("@/lib/docker/client");
      await getDocker()
        .getContainer(server.containerId)
        .remove({ force: true })
        .catch(() => undefined);
      db.update(servers)
        .set({ containerId: null })
        .where(eq(servers.id, id))
        .run();
    }
    await createServerContainer(id);
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
        break;
      case "stop":
        if (!canAccessServer(user, id, "stop")) throw new Error("FORBIDDEN");
        await stopServer(id);
        break;
      case "kill":
        if (!canAccessServer(user, id, "stop")) throw new Error("FORBIDDEN");
        await stopServer(id, { kill: true });
        break;
      case "restart":
        if (!canAccessServer(user, id, "start")) throw new Error("FORBIDDEN");
        await restartServer(id);
        break;
      case "reset-ftp-password": {
        if (!canAccessServer(user, id, "settings")) throw new Error("FORBIDDEN");
        const pw = generatePassword(14);
        db.update(servers)
          .set({
            ftpPasswordHash: await hashPassword(pw),
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
