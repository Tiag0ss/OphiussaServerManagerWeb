import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { canAccessServer } from "@/lib/permissions";
import * as files from "@/lib/files/manager";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "files")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || ".";
  const mode = url.searchParams.get("mode") || "list";
  try {
    if (mode === "download") {
      const file = files.readBinary(id, path);
      const safe = file.name.replace(/[\r\n"]/g, "_");
      return new NextResponse(new Uint8Array(file.data), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safe}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (mode === "read") {
      return NextResponse.json({ content: files.readFile(id, path), path });
    }
    const listing = files.listFiles(id, path);
    return NextResponse.json(listing);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "files")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const action = String(form.get("action") || "upload");
      if (action === "upload") {
        const file = form.get("file");
        const dir = String(form.get("path") || ".");
        if (!(file instanceof File)) {
          return NextResponse.json({ error: "file required" }, { status: 400 });
        }
        const dest =
          dir === "." ? file.name : `${dir.replace(/\/$/, "")}/${file.name}`;
        const buf = Buffer.from(await file.arrayBuffer());
        files.writeBinary(id, dest, buf);
        return NextResponse.json({ ok: true, path: dest });
      }
    }

    const body = await req.json();
    if (body.action === "mkdir") {
      files.mkdir(id, body.path);
    } else if (body.action === "rename") {
      files.renamePath(id, body.from, body.to);
    } else if (body.action === "copy") {
      const dest = files.uniqueDest(id, body.to);
      files.copyPath(id, body.from, dest);
      return NextResponse.json({ ok: true, path: dest });
    } else {
      files.writeFile(id, body.path, body.content ?? "");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "files")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { path } = await req.json();
  try {
    files.deletePath(id, path);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}
