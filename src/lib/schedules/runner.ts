import cron from "node-cron";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { schedules } from "../db/schema";
import {
  createServerBackup,
  backupPanelDb,
} from "../backups";
import {
  restartServer,
  startServer,
  stopServer,
} from "../docker/servers";
import { getSettings } from "../settings";

type CronTask = ReturnType<typeof cron.schedule>;

const jobs = new Map<string, CronTask>();
let panelBackupJob: CronTask | null = null;

export function refreshSchedules() {
  for (const [, job] of jobs) job.stop();
  jobs.clear();

  const db = getDb();
  const rows = db.select().from(schedules).all().filter((s) => s.enabled);
  const tz = getSettings().timezone || "Europe/Lisbon";

  for (const row of rows) {
    if (!cron.validate(row.cron)) continue;
    const task = cron.schedule(
      row.cron,
      async () => {
        try {
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
          }
          getDb()
            .update(schedules)
            .set({ lastRunAt: new Date() })
            .where(eq(schedules.id, row.id))
            .run();
        } catch (e) {
          console.error(`[schedule ${row.id}]`, e);
        }
      },
      { timezone: tz },
    );
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
