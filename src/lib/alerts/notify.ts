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

async function sendDiscord(webhook: string, payload: AlertPayload) {
  await fetch(webhook, {
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
}

async function sendWebhook(url: string, payload: AlertPayload) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      at: new Date().toISOString(),
    }),
  });
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
    tasks.push(sendDiscord(s.alertDiscordWebhook, payload).catch(console.error));
  }
  if (s.alertWebhookUrl) {
    tasks.push(sendWebhook(s.alertWebhookUrl, payload).catch(console.error));
  }
  if (s.alertEmailEnabled) {
    tasks.push(sendEmail(payload).catch(console.error));
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
  const fingerprint = JSON.stringify({ title: payload.title, message: payload.message });
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

export async function sendTestAlert() {
  await dispatchAlert({
    title: "Test alert",
    message: "Ophiussa alert channels are configured correctly.",
    severity: "info",
  });
}
