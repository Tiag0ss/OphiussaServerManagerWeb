import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { alertState } from "../db/schema";
import { getSettings } from "../settings";

export type AlertPayload = {
  title: string;
  message: string;
  severity: "info" | "warn" | "critical";
  meta?: Record<string, unknown>;
};

export async function sendDiscord(webhook: string, payload: AlertPayload) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: payload.title,
          description: payload.message,
          color:
            payload.severity === "critical"
              ? 0xf07178
              : payload.severity === "warn"
                ? 0xe6c07b
                : 0x3d9cfd,
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Discord webhook failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    );
  }
}

async function sendWebhook(url: string, payload: AlertPayload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Alert webhook failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    );
  }
}

async function sendEmail(payload: AlertPayload) {
  const s = getSettings();
  if (!s.alertEmailEnabled || !s.smtpHost || !s.alertEmailTo) return;

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpPort === 465,
    auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPass } : undefined,
  });

  await transport.sendMail({
    from: s.smtpFrom || s.smtpUser || "ophiussa@localhost",
    to: s.alertEmailTo,
    subject: `[Ophiussa] ${payload.title}`,
    text: `${payload.message}\n\n${JSON.stringify(payload.meta ?? {}, null, 2)}`,
  });
}

export async function dispatchAlert(payload: AlertPayload) {
  const s = getSettings();
  const tasks: Promise<void>[] = [];
  if (s.alertDiscordWebhook) {
    tasks.push(
      sendDiscord(s.alertDiscordWebhook, payload).catch((err) =>
        console.error("[alerts] discord webhook error:", err),
      ),
    );
  }
  if (s.alertWebhookUrl) {
    tasks.push(
      sendWebhook(s.alertWebhookUrl, payload).catch((err) =>
        console.error("[alerts] generic webhook error:", err),
      ),
    );
  }
  if (s.alertEmailEnabled) {
    tasks.push(
      sendEmail(payload).catch((err) =>
        console.error("[alerts] email error:", err),
      ),
    );
  }
  await Promise.all(tasks);
}

/** Fire at most once per cooldown window unless value changes. */
export async function dispatchAlertDeduped(
  key: string,
  payload: AlertPayload,
  cooldownMs = 15 * 60 * 1000,
) {
  const db = getDb();
  // Fingerprint on severity, not the raw message: fluctuating metrics (e.g.
  // "CPU at 81.3%") would otherwise change on every tick and defeat the cooldown.
  const fingerprint = payload.severity;
  const row = db.select().from(alertState).where(eq(alertState.key, key)).get();
  const now = Date.now();
  if (
    row &&
    row.lastValue === fingerprint &&
    now - row.lastFiredAt.getTime() < cooldownMs
  ) {
    return;
  }
  await dispatchAlert(payload);
  db.insert(alertState)
    .values({ key, lastFiredAt: new Date(now), lastValue: fingerprint })
    .onConflictDoUpdate({
      target: alertState.key,
      set: { lastFiredAt: new Date(now), lastValue: fingerprint },
    })
    .run();
}

/**
 * Fire-and-forget: send both the global panel alert channels AND, if this
 * server has its own "Discord webhook URL" config field set, post directly
 * there too. Several game templates expose that field bound to a container
 * env var the underlying image doesn't actually implement (see valheim.yaml),
 * so this is what makes a per-server webhook actually do something.
 */
export function notifyServerEvent(
  server: { name: string; configJson: string },
  payload: AlertPayload,
) {
  dispatchAlert(payload).catch(() => undefined);
  try {
    const config = JSON.parse(server.configJson) as Record<string, unknown>;
    const url =
      typeof config.discordWebhook === "string" ? config.discordWebhook.trim() : "";
    if (url) {
      sendDiscord(url, payload).catch(() => undefined);
    }
  } catch {
    /* malformed config — global alert above still fired */
  }
}

export async function sendTestAlert() {
  await dispatchAlert({
    title: "Test alert",
    message: "Ophiussa alert channels are configured correctly.",
    severity: "info",
  });
}
