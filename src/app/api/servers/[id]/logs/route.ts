import { requireSession } from "@/lib/auth/session";
import { canAccessServer } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { servers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getDocker } from "@/lib/docker/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "console")) {
    return new Response("Forbidden", { status: 403 });
  }
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, id)).get();
  if (!server?.containerId) {
    return new Response("No container", { status: 404 });
  }

  const container = getDocker().getContainer(server.containerId);
  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 200,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      const onData = (chunk: Buffer) => {
        // docker multiplex header is 8 bytes
        let offset = 0;
        while (offset < chunk.length) {
          if (chunk.length - offset < 8) break;
          const size = chunk.readUInt32BE(offset + 4);
          const payload = chunk.subarray(offset + 8, offset + 8 + size);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload.toString("utf8"))}\n\n`),
          );
          offset += 8 + size;
        }
      };
      stream.on("data", onData);
      stream.on("end", () => controller.close());
      stream.on("error", () => controller.close());
    },
    cancel() {
      try {
        (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
