import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getUserPortRange, getUsedHostPorts, findConsecutiveFreePorts } from "@/lib/port-alloc";
import { getUserQuotas, getUserResourceUsage, getQuotaHeadroom } from "@/lib/quotas";
import { getSettings } from "@/lib/settings";
import { getTemplate } from "@/lib/templates/load";

export const dynamic = "force-dynamic";

/** Current user quotas, port range, and suggested free ports for a template. */
export async function GET(req: Request) {
  const user = await requireSession();
  const url = new URL(req.url);
  const templateId = url.searchParams.get("templateId");
  const settings = getSettings();
  const range =
    user.role === "admin"
      ? { start: settings.portRangeStart, end: settings.portRangeEnd }
      : getUserPortRange(user.id);
  const quotas = getUserQuotas(user.id);
  const usage = getUserResourceUsage(user.id);
  const headroom = getQuotaHeadroom(user.id);

  let suggestedPorts: Record<string, number> | null = null;
  if (templateId) {
    const tpl = getTemplate(templateId);
    if (tpl) {
      const used = getUsedHostPorts();
      const block = findConsecutiveFreePorts(
        range,
        tpl.runtime.ports.length,
        used,
      );
      if (block) {
        suggestedPorts = {};
        tpl.runtime.ports.forEach((p, i) => {
          suggestedPorts![p.key] = block[i]!;
        });
      }
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    portRange: range,
    globalPortRange: {
      start: settings.portRangeStart,
      end: settings.portRangeEnd,
    },
    quotas,
    usage,
    headroom,
    suggestedPorts,
    usedPorts: [...getUsedHostPorts()].sort((a, b) => a - b),
  });
}
