export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDataDirs } = await import("./lib/paths");
    ensureDataDirs();
    const { getDb } = await import("./lib/db");
    getDb();
    const { syncTemplatesToDb } = await import("./lib/templates/load");
    syncTemplatesToDb();

    const { existsSync } = await import("fs");
    const { resolveDockerSocket } = await import("./lib/docker/client");
    const sock = resolveDockerSocket();

    const startBackgroundJobs = async () => {
      const g = globalThis as {
        __ophiussaAlertTimer?: ReturnType<typeof setInterval>;
      };
      if (!g.__ophiussaAlertTimer) {
        const { runAlertMonitor } = await import("./lib/alerts/monitor");
        const { pruneOldMetrics } = await import("./lib/metrics-store");
        g.__ophiussaAlertTimer = setInterval(() => {
          runAlertMonitor().catch((e) => console.error("[alerts]", e));
          pruneOldMetrics();
        }, 60_000);
      }
    };

    const startDockerSync = async () => {
      if (!existsSync(sock)) {
        console.warn(
          `[instrumentation] docker.sock not found (${sock}) — skipping Docker sync`,
        );
        return;
      }
      const { reconcileServers } = await import("./lib/docker/servers");
      const { startDockerEventSync } = await import("./lib/docker/events");
      await reconcileServers().catch((e) => console.error("[reconcile]", e));
      startDockerEventSync();
      const g = globalThis as { __ophiussaReconcileTimer?: ReturnType<typeof setInterval> };
      if (!g.__ophiussaReconcileTimer) {
        g.__ophiussaReconcileTimer = setInterval(() => {
          reconcileServers().catch(() => undefined);
        }, 30_000);
      }
    };

    if (process.env.NODE_ENV === "production") {
      await startDockerSync();
      const { startFtpServer, startSftpServer } = await import("./lib/ftp/servers");
      const { refreshSchedules } = await import("./lib/schedules/runner");

      await startFtpServer();
      startSftpServer();
      refreshSchedules();
      await startBackgroundJobs();
    } else {
      try {
        await startDockerSync();
        const { startFtpServer, startSftpServer } = await import("./lib/ftp/servers");
        const { refreshSchedules } = await import("./lib/schedules/runner");
        await startFtpServer();
        startSftpServer();
        refreshSchedules();
        await startBackgroundJobs();
      } catch (e) {
        console.warn("[instrumentation] optional services:", e);
      }
    }
  }
}
