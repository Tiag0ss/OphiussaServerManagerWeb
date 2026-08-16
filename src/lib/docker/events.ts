import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { servers } from "../db/schema";
import { getDocker, LABEL_SERVER_ID } from "./client";

let started = false;

export function startDockerEventSync() {
  if (started || process.env.NEXT_PHASE === "phase-production-build") return;
  started = true;

  const docker = getDocker();
  docker.getEvents(
    {
      filters: {
        type: ["container"],
        label: ["ophiussa.managed=true"],
      },
    },
    (err, stream) => {
      if (err || !stream) {
        console.error("[docker-events]", err);
        setTimeout(() => {
          started = false;
          startDockerEventSync();
        }, 5000);
        return;
      }
      stream.on("data", (buf: Buffer) => {
        try {
          const event = JSON.parse(buf.toString()) as {
            Action?: string;
            Actor?: { Attributes?: Record<string, string> };
          };
          const serverId = event.Actor?.Attributes?.[LABEL_SERVER_ID];
          if (!serverId) return;
          const action = event.Action || "";
          let status: string | null = null;
          if (action === "start" || action === "unpause") status = "running";
          if (
            action === "die" ||
            action === "stop" ||
            action === "kill" ||
            action === "pause" ||
            action === "oom"
          ) {
            status = "stopped";
          }
          if (!status) return;
          const db = getDb();
          db.update(servers)
            .set({ status, updatedAt: new Date() })
            .where(eq(servers.id, serverId))
            .run();
        } catch {
          /* ignore malformed */
        }
      });
      stream.on("end", () => {
        started = false;
        setTimeout(startDockerEventSync, 2000);
      });
    },
  );
}
