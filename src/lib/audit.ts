import { nanoid } from "nanoid";
import { desc } from "drizzle-orm";
import { getDb } from "./db";
import { auditLog } from "./db/schema";
import type { SessionUser } from "./auth/session";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "server.create"
  | "server.delete"
  | "server.start"
  | "server.stop"
  | "server.restart"
  | "server.update"
  | "server.clone"
  | "server.import"
  | "server.export"
  | "server.update_image"
  | "server.permissions"
  | "backup.create"
  | "backup.restore"
  | "backup.delete"
  | "settings.update"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "template.update";

export function writeAudit(
  user: SessionUser | null,
  action: AuditAction,
  opts?: {
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
  },
) {
  const db = getDb();
  db.insert(auditLog)
    .values({
      id: nanoid(),
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      action,
      targetType: opts?.targetType ?? null,
      targetId: opts?.targetId ?? null,
      detailsJson: JSON.stringify(opts?.details ?? {}),
      createdAt: new Date(),
    })
    .run();
}

export function listAuditLog(limit = 200) {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .all();
}
