export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDataDirs } = await import("./lib/paths");
    ensureDataDirs();
    const { getDb } = await import("./lib/db");
    getDb();
    const { syncTemplatesToDb } = await import("./lib/templates/load");
    syncTemplatesToDb();

    if (process.env.NODE_ENV === "production") {
      const { existsSync } = await import("fs");
      const sock = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
      if (existsSync(sock)) {
        const { reconcileServers } = await import("./lib/docker/servers");
        const { startDockerEventSync } = await import("./lib/docker/events");
        await reconcileServers().catch((e) =>
          console.error("[reconcile]", e),
        );
        startDockerEventSync();
      } else {
        console.warn("[instrumentation] docker.sock not found — skipping Docker sync");
      }
      const { startFtpServer, startSftpServer } = await import("./lib/ftp/servers");
      const { refreshSchedules } = await import("./lib/schedules/runner");

      await startFtpServer();
      startSftpServer();
      refreshSchedules();
    } else {
      // In development, still sync templates and start lightweight services
      try {
        const { startFtpServer, startSftpServer } = await import("./lib/ftp/servers");
        const { refreshSchedules } = await import("./lib/schedules/runner");
        await startFtpServer();
        startSftpServer();
        refreshSchedules();
      } catch (e) {
        console.warn("[instrumentation] optional services:", e);
      }
    }
  }
}
