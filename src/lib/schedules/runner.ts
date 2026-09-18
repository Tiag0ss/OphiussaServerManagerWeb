import cron from "node-cron";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { schedules, servers } from "../db/schema";
import { createServerBackup, backupPanelDb } from "../backups";
import {
  restartServer,
  startServer,
  stopServer,
  updateServerImage,
} from "../docker/servers";
import { sendRcon } from "../rcon/client";
import { getSettings } from "../settings";
import { notifyServerEvent } from "../alerts/notify";

type CronTask = ReturnType<typeof cron.schedule>;
type ScheduleRow = typeof schedules.$inferSelect;

const jobs = new Map<string, CronTask>();
let panelBackupJob: CronTask | null = null;

async function runScheduleAction(row: ScheduleRow) {
  switch (row.action) {
    case "start":
      await startServer(row.serverId);
      break;
    case "stop":
      await stopServer(row.serverId);
      break;
    case "restart":
      await restartServer(row.serverId);
      break;
    case "backup":
      await createServerBackup(row.serverId);
      break;
    case "update-image":
      await updateServerImage(row.serverId);
      break;
    case "rcon":
      if (!row.commandText?.trim()) {
        throw new Error("No RCON command configured for this schedule");
      }
      await sendRcon(row.serverId, row.commandText.trim());
      break;
  }
}

/** Runs one schedule's action, recording the result and notifying on failure. */
export async function executeSchedule(row: ScheduleRow) {
  const db = getDb();
  try {
    await runScheduleAction(row);
    db.update(schedules)
      .set({ lastRunAt: new Date(), lastRunStatus: "ok", lastRunError: null })
      .where(eq(schedules.id, row.id))
      .run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[schedule ${row.id}]`, e);
    db.update(schedules)
      .set({ lastRunAt: new Date(), lastRunStatus: "fail", lastRunError: message })
      .where(eq(schedules.id, row.id))
      .run();
    const server = db.select().from(servers).where(eq(servers.id, row.serverId)).get();
    if (server) {
      notifyServerEvent(server, {
        title: `Schedule failed — ${row.name}`,
        message: `${server.name}: "${row.name}" (${row.action}) failed — ${message}`,
        severity: "critical",
      });
    }
  }
}

/** Manually trigger a schedule right now (same recording/notify path as the cron job). */
export async function runScheduleNow(scheduleId: string) {
  const row = getDb().select().from(schedules).where(eq(schedules.id, scheduleId)).get();
  if (!row) throw new Error("Schedule not found");
  await executeSchedule(row);
}

export function refreshSchedules() {
  for (const [, job] of jobs) job.stop();
  jobs.clear();

  const db = getDb();
  const rows = db.select().from(schedules).all().filter((s) => s.enabled);
  const tz = getSettings().timezone || "Europe/Lisbon";

  for (const row of rows) {
    if (!cron.validate(row.cron)) continue;
    const task = cron.schedule(row.cron, () => executeSchedule(row), {
      timezone: tz,
    });
    jobs.set(row.id, task);
  }

  if (!panelBackupJob) {
    panelBackupJob = cron.schedule(
      "0 3 * * *",
      () => {
        backupPanelDb().catch((e) => console.error("[panel-backup]", e));
      },
      { timezone: tz },
    );
  }
}
