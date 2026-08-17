import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashPassword, generatePassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/secrets";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { servers } from "@/lib/db/schema";
import {
  createServerContainer,
  startServer,
} from "@/lib/docker/servers";
import { canAllocateMemory, hasDiskSpace } from "@/lib/host-metrics";
import { listAccessibleServers } from "@/lib/permissions";
import { assertCanCreateServer } from "@/lib/quotas";
import {
  defaultConfigFromTemplate,
  getTemplate,
  syncTemplatesToDb,
} from "@/lib/templates/load";
import { serverDataDir } from "@/lib/paths";
import { mkdirSync } from "fs";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireSession();
  const list = listAccessibleServers(user);
  return NextResponse.json({
    servers: list.map((s) => ({
      id: s.id,
      name: s.name,
      templateId: s.templateId,
      status: s.status,
      memoryMb: s.memoryMb,
      cpuLimit: s.cpuLimit,
      ownerId: s.ownerId,
      updatedAt: s.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const user = await requireSession();
  const body = await req.json();
  const { name, templateId, config, memoryMb, cpuLimit, start, ports } = body as {
    name: string;
    templateId: string;
    config?: Record<string, unknown>;
    memoryMb?: number;
    cpuLimit?: number;
    start?: boolean;
    /** Optional host port map: { game: 25565, query: 25566 } */
    ports?: Record<string, number>;
  };

  if (!name || !templateId) {
    return NextResponse.json({ error: "name and templateId required" }, { status: 400 });
  }

  syncTemplatesToDb();
  const tpl = getTemplate(templateId);
  if (!tpl) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const db = getDb();
  const existing = db.select().from(servers).all();
  const reserved = existing.reduce((a, s) => a + s.memoryMb, 0);
  const mem = memoryMb ?? tpl.runtime.memoryMb ?? 2048;
  const cpu = cpuLimit ?? tpl.runtime.cpuLimit ?? 1;

  const quotaError = assertCanCreateServer(user, {
    templateId,
    memoryMb: mem,
    cpuLimit: cpu,
  });
  if (quotaError) {
    return NextResponse.json({ error: quotaError }, { status: 403 });
  }

  if (!canAllocateMemory(mem, reserved)) {
    return NextResponse.json(
      { error: "Not enough host RAM to create this server" },
      { status: 400 },
    );
  }
  if (!hasDiskSpace(1024)) {
    return NextResponse.json(
      { error: "Not enough free disk space" },
      { status: 400 },
    );
  }

  const id = nanoid();
  const merged = {
    ...defaultConfigFromTemplate(tpl),
    ...(config || {}),
  };
  const ftpPassword = generatePassword(14);
  const ftpUsername = `ophiussa.${id.slice(0, 8)}`;

  mkdirSync(serverDataDir(id), { recursive: true });

  db.insert(servers)
    .values({
      id,
      name,
      templateId,
      ownerId: user.id,
      status: "created",
      configJson: JSON.stringify(merged),
      memoryMb: mem,
      cpuLimit: cpu,
      ftpEnabled: true,
      ftpUsername,
      ftpPasswordHash: await hashPassword(ftpPassword),
      ftpPasswordEnc: encryptSecret(ftpPassword),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  try {
    const { allocatePorts } = await import("@/lib/docker/servers");
    await allocatePorts(tpl, id, {
      ownerId: user.id,
      preferred: ports,
    });
    await createServerContainer(id);
    if (start !== false) {
      await startServer(id);
    }
  } catch (e) {
    return NextResponse.json(
      {
        id,
        ftpUsername,
        ftpPassword,
        warning: e instanceof Error ? e.message : "Container create failed",
      },
      { status: 201 },
    );
  }

  return NextResponse.json({
    id,
    ftpUsername,
    ftpPassword,
  });
}

void eq;
