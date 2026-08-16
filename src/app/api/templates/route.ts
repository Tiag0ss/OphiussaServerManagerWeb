import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin, requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { getUserQuotas } from "@/lib/quotas";
import {
  deleteTemplate,
  getTemplate,
  listTemplateRows,
  parseTemplateYaml,
  saveTemplateDefinition,
  syncTemplatesToDb,
  templateToYaml,
} from "@/lib/templates/load";
import type { GameTemplate } from "@/lib/templates/types";
import YAML from "yaml";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireSession();
  syncTemplatesToDb();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const format = url.searchParams.get("format");

  if (id) {
    const tpl = getTemplate(id);
    if (!tpl) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (format === "yaml") {
      return new NextResponse(templateToYaml(tpl), {
        headers: {
          "Content-Type": "text/yaml; charset=utf-8",
          "Content-Disposition": `attachment; filename="${id}.yaml"`,
        },
      });
    }
    const row = getDb()
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .get();
    return NextResponse.json({ template: tpl, source: row?.source || "builtin" });
  }

  let rows = listTemplateRows();
  if (user.role !== "admin") {
    const quotas = getUserQuotas(user.id);
    if (quotas && quotas.allowedTemplates.length > 0) {
      rows = rows.filter((r) => quotas.allowedTemplates.includes(r.id));
    }
  }

  return NextResponse.json({
    templates: rows.map((r) => ({
      ...(JSON.parse(r.definitionJson) as GameTemplate),
      source: r.source,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  await requireAdmin();
  const contentType = req.headers.get("content-type") || "";
  let tpl: GameTemplate;

  if (contentType.includes("text/yaml") || contentType.includes("application/x-yaml")) {
    const raw = await req.text();
    tpl = parseTemplateYaml(raw);
  } else {
    const body = await req.json();
    if (typeof body.yaml === "string") {
      tpl = parseTemplateYaml(body.yaml);
    } else if (body.template) {
      tpl = body.template as GameTemplate;
      // validate via round-trip
      parseTemplateYaml(YAML.stringify(tpl));
    } else {
      return NextResponse.json({ error: "Provide yaml or template" }, { status: 400 });
    }
  }

  saveTemplateDefinition(tpl, "custom");
  return NextResponse.json({ ok: true, id: tpl.id });
}

export async function PUT(req: Request) {
  await requireAdmin();
  const body = await req.json();
  let tpl: GameTemplate;
  if (typeof body.yaml === "string") {
    tpl = parseTemplateYaml(body.yaml);
  } else if (body.template) {
    tpl = body.template as GameTemplate;
    parseTemplateYaml(YAML.stringify(tpl));
  } else {
    return NextResponse.json({ error: "Provide yaml or template" }, { status: 400 });
  }
  if (body.id && body.id !== tpl.id) {
    return NextResponse.json(
      { error: "Template id in body must match definition id" },
      { status: 400 },
    );
  }
  saveTemplateDefinition(tpl, "custom");
  return NextResponse.json({ ok: true, id: tpl.id });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteTemplate(String(id));
  return NextResponse.json({ ok: true });
}
