import { execSync } from "child_process";
import { existsSync, statfsSync } from "fs";

export function freeDiskSync(targetPath: string): { total: number; free: number } {
  if (typeof statfsSync === "function" && existsSync(targetPath)) {
    try {
      const s = statfsSync(targetPath);
      return {
        total: Number(s.blocks) * Number(s.bsize),
        free: Number(s.bavail) * Number(s.bsize),
      };
    } catch {
      /* fall through */
    }
  }
  try {
    const out = execSync(`df -k "${targetPath}" | tail -1`, {
      encoding: "utf8",
    });
    const parts = out.trim().split(/\s+/);
    const total = Number(parts[1]) * 1024;
    const free = Number(parts[3]) * 1024;
    return { total, free };
  } catch {
    return { total: 0, free: 0 };
  }
}
