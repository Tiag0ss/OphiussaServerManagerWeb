import { freeDiskSync } from "./disk";
import { totalmem, freemem, cpus, loadavg } from "os";
import { readFileSync } from "fs";
import { DATA_DIR, ensureDataDirs } from "./paths";

let lastCpuSample: { idle: number; total: number } | null = null;

/** Host CPU usage % since the previous sample (null on first call). */
export function getHostCpuPercent(): number | null {
  try {
    if (process.platform === "linux") {
      const line = readFileSync("/proc/stat", "utf8").split("\n")[0] ?? "";
      const parts = line.trim().split(/\s+/).slice(1).map(Number);
      if (parts.length < 4) return null;
      const idle = parts[3]! + (parts[4] ?? 0);
      const total = parts.reduce((a, b) => a + b, 0);
      if (!lastCpuSample) {
        lastCpuSample = { idle, total };
        return null;
      }
      const idleDelta = idle - lastCpuSample.idle;
      const totalDelta = total - lastCpuSample.total;
      lastCpuSample = { idle, total };
      if (totalDelta <= 0) return 0;
      return Math.round((1 - idleDelta / totalDelta) * 1000) / 10;
    }
    const n = cpus().length || 1;
    const load = loadavg()[0] ?? 0;
    return Math.min(100, Math.round((load / n) * 1000) / 10);
  } catch {
    return null;
  }
}

export function getHostMetrics() {
  const total = totalmem();
  const free = freemem();
  ensureDataDirs();
  let disk = { total: 0, free: 0 };
  try {
    disk = freeDiskSync(DATA_DIR);
  } catch {
    try {
      disk = freeDiskSync(process.cwd());
    } catch {
      /* ignore */
    }
  }
  return {
    cpuPercent: getHostCpuPercent(),
    ram: {
      totalMb: Math.round(total / 1024 / 1024),
      freeMb: Math.round(free / 1024 / 1024),
      usedMb: Math.round((total - free) / 1024 / 1024),
      usedPercent: Math.round(((total - free) / total) * 1000) / 10,
    },
    disk: {
      totalMb: Math.round(disk.total / 1024 / 1024),
      freeMb: Math.round(disk.free / 1024 / 1024),
      usedMb:
        disk.total > 0
          ? Math.round((disk.total - disk.free) / 1024 / 1024)
          : 0,
      usedPercent:
        disk.total > 0
          ? Math.round(((disk.total - disk.free) / disk.total) * 1000) / 10
          : 0,
      available: disk.total > 0,
    },
  };
}

export function canAllocateMemory(neededMb: number, alreadyReservedMb: number) {
  const metrics = getHostMetrics();
  // leave 512MB headroom for the panel/OS
  return alreadyReservedMb + neededMb + 512 <= metrics.ram.totalMb;
}

export function hasDiskSpace(neededMb = 1024) {
  const metrics = getHostMetrics();
  // If we cannot measure disk (dev / unusual mounts), do not block creation
  if (!metrics.disk.available) return true;
  return metrics.disk.freeMb >= neededMb;
}
