import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { serverMods } from "@/lib/db/schema";
import { canAccessServer } from "@/lib/permissions";
import { getTemplate } from "@/lib/templates/load";
import { servers } from "@/lib/db/schema";
import {
  installThunderstoreMod,
  installWorkshopMod,
  reinstallAllMods,
  reinstallMod,
  removeMod,
  searchCurseforge,
  searchThunderstore,
  searchWorkshop,
  workshopAppIdFor,
} from "@/lib/mods/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "mods")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const provider = url.searchParams.get("provider");
  const db = getDb();

  if (provider) {
    const server = db.select().from(servers).where(eq(servers.id, id)).get();
    const tpl = server ? getTemplate(server.templateId) : null;
    try {
      if (provider === "thunderstore" && tpl?.mods?.thunderstoreNamespace) {
        return NextResponse.json({
          results: await searchThunderstore(tpl.mods.thunderstoreNamespace, q),
        });
      }
      if (provider === "curseforge" && tpl?.mods?.curseforgeGameId) {
        return NextResponse.json({
          results: await searchCurseforge(tpl.mods.curseforgeGameId, q),
        });
      }
      if (provider === "steam-workshop") {
        const appId = server ? workshopAppIdFor(server) : null;
        if (appId) {
          return NextResponse.json({
            results: await searchWorkshop(appId, q),
          });
        }
        const id = q.trim();
        if (/^\d{5,20}$/.test(id)) {
          return NextResponse.json({
            results: [
              {
                id,
                name: `Workshop item ${id}`,
                summary: "Set Workshop client App ID in server config for search",
                provider: "steam-workshop",
              },
            ],
          });
        }
        return NextResponse.json({ results: [] });
      }
      return NextResponse.json({ results: [] });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "search failed" },
        { status: 500 },
      );
    }
  }

  const installed = db
    .select()
    .from(serverMods)
    .where(eq(serverMods.serverId, id))
    .all();
  return NextResponse.json({ mods: installed });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "mods")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  try {
    if (body.action === "reinstall") {
      if (!body.modId) {
        return NextResponse.json({ error: "modId required" }, { status: 400 });
      }
      await reinstallMod(body.modId);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "reinstall-all") {
      const count = await reinstallAllMods(id);
      return NextResponse.json({ ok: true, count });
    }
    if (body.provider === "steam-workshop") {
      const modId = await installWorkshopMod(id, body.externalId, body.name);
      return NextResponse.json({ id: modId });
    }
    if (body.provider === "thunderstore") {
      const modId = await installThunderstoreMod(
        id,
        body.externalId,
        body.version,
      );
      return NextResponse.json({ id: modId });
    }
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "install failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "mods")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { modId } = await req.json();
  await removeMod(modId);
  return NextResponse.json({ ok: true });
}
