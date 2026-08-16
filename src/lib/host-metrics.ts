import { freeDiskSync } from "./disk";
import { totalmem, freemem } from "os";
import { DATA_DIR, ensureDataDirs } from "./paths";

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
    ram: {
      totalMb: Math.round(total / 1024 / 1024),
      freeMb: Math.round(free / 1024 / 1024),
      usedPercent: Math.round(((total - free) / total) * 1000) / 10,
    },
    disk: {
      totalMb: Math.round(disk.total / 1024 / 1024),
      freeMb: Math.round(disk.free / 1024 / 1024),
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
