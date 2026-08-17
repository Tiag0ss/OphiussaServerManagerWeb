import { getHostMetrics } from "../host-metrics";
import { getSettings } from "../settings";
import { getDb } from "../db";
import { servers } from "../db/schema";
import { getContainerStats } from "../docker/servers";
import { checkServerHealth } from "../health-check";
import { dispatchAlertDeduped } from "./notify";

export async function runAlertMonitor() {
  const s = getSettings();
  const host = getHostMetrics();

  if (host.cpuPercent != null && host.cpuPercent >= s.alertCpuThreshold) {
    await dispatchAlertDeduped("host:cpu", {
      title: "Host CPU high",
      message: `Host CPU at ${host.cpuPercent}% (threshold ${s.alertCpuThreshold}%)`,
      severity: "warn",
      meta: { cpuPercent: host.cpuPercent },
    });
  }

  if (host.ram.usedPercent >= s.alertRamThreshold) {
    await dispatchAlertDeduped("host:ram", {
      title: "Host RAM high",
      message: `Host RAM at ${host.ram.usedPercent}% (threshold ${s.alertRamThreshold}%)`,
      severity: "warn",
      meta: { usedPercent: host.ram.usedPercent },
    });
  }

  if (
    host.disk.available &&
    host.disk.usedPercent >= s.alertDiskThreshold
  ) {
    await dispatchAlertDeduped("host:disk", {
      title: "Host disk high",
      message: `Host disk at ${host.disk.usedPercent}% (threshold ${s.alertDiskThreshold}%)`,
      severity: "critical",
      meta: { usedPercent: host.disk.usedPercent },
    });
  }

  const db = getDb();
  const all = db.select().from(servers).all();

  for (const server of all) {
    if (server.status === "running") {
      const stats = await getContainerStats(server.id);
      if (stats && stats.memoryPercent >= s.alertRamThreshold) {
        await dispatchAlertDeduped(`server:${server.id}:ram`, {
          title: `Server RAM high — ${server.name}`,
          message: `${server.name} RAM at ${stats.memoryPercent}%`,
          severity: "warn",
          meta: { serverId: server.id, memoryPercent: stats.memoryPercent },
        });
      }
      if (stats && stats.cpuPercent >= s.alertCpuThreshold) {
        await dispatchAlertDeduped(`server:${server.id}:cpu`, {
          title: `Server CPU high — ${server.name}`,
          message: `${server.name} CPU at ${stats.cpuPercent}%`,
          severity: "warn",
          meta: { serverId: server.id, cpuPercent: stats.cpuPercent },
        });
      }

      const health = await checkServerHealth(server.id);
      if (health.overall === "degraded" || health.overall === "down") {
        await dispatchAlertDeduped(`server:${server.id}:health`, {
          title: `Server unhealthy — ${server.name}`,
          message: `Health: ${health.overall} (port ${health.gamePort}, rcon ${health.rcon})`,
          severity: health.overall === "down" ? "critical" : "warn",
          meta: { serverId: server.id, health },
        });
      }
    } else if (server.status === "stopped") {
      // no alert for intentionally stopped
    } else {
      await dispatchAlertDeduped(`server:${server.id}:status`, {
        title: `Server unexpected status — ${server.name}`,
        message: `${server.name} status is ${server.status}`,
        severity: "warn",
        meta: { serverId: server.id, status: server.status },
      });
    }
  }
}

export function alertOnBackupFailure(serverName: string, serverId: string, error: string) {
  return dispatchAlertDeduped(`backup:${serverId}:fail`, {
    title: `Backup failed — ${serverName}`,
    message: error,
    severity: "critical",
    meta: { serverId },
  });
}
