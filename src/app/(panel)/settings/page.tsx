"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "password";
  hint?: string;
};

const TABS = [
  { id: "general", label: "General" },
  { id: "network", label: "Network" },
  { id: "data", label: "Data" },
  { id: "alerts", label: "Alerts" },
  { id: "integrations", label: "Integrations" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function FieldGroup({
  fields,
  form,
  onChange,
}: {
  fields: FieldDef[];
  form: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {fields.map(({ key, label, type = "text", hint }) => (
        <div key={key}>
          <Label>{label}</Label>
          <Input
            type={type}
            value={String(form[key] ?? "")}
            onChange={(e) => onChange(key, e.target.value)}
          />
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("general");
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setForm(d));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setMessage(res.ok ? "Saved" : "Failed to save");
  }

  function set(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function testAlert() {
    const res = await fetch("/api/alerts/test", { method: "POST" });
    setMessage(res.ok ? "Test alert sent" : "Alert test failed");
  }

  const tabIntro: Record<TabId, { title: string; description: string }> = {
    general: {
      title: "General",
      description: "Identity and container file ownership",
    },
    network: {
      title: "Network",
      description: "Default host port range for new servers",
    },
    data: {
      title: "Data retention",
      description: "How long backups and metrics are kept",
    },
    alerts: {
      title: "Alerts",
      description: "Thresholds and notification channels",
    },
    integrations: {
      title: "Integrations",
      description: "API keys for mod providers and Steam downloads",
    },
  };

  return (
    <div className="mx-auto w-full max-w-none space-y-6 xl:max-w-3xl">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-muted">Panel-wide configuration</p>
      </div>

      <div className="flex flex-wrap gap-2 overflow-x-auto border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm transition",
              tab === t.id
                ? "bg-accent text-accent-fg"
                : "bg-card-elevated text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <Card className="space-y-4">
          <div>
            <h3 className="font-medium">{tabIntro[tab].title}</h3>
            <p className="mt-1 text-sm text-muted">{tabIntro[tab].description}</p>
          </div>

          {tab === "general" && (
            <FieldGroup
              form={form}
              onChange={set}
              fields={[
                {
                  key: "publicIp",
                  label: "Public IP",
                  hint: "Shown in join addresses",
                },
                {
                  key: "timezone",
                  label: "Timezone",
                  hint: "Used for scheduled tasks",
                },
                { key: "puid", label: "PUID", type: "number" },
                { key: "pgid", label: "PGID", type: "number" },
              ]}
            />
          )}

          {tab === "network" && (
            <FieldGroup
              form={form}
              onChange={set}
              fields={[
                {
                  key: "portRangeStart",
                  label: "Port range start",
                  type: "number",
                },
                {
                  key: "portRangeEnd",
                  label: "Port range end",
                  type: "number",
                },
              ]}
            />
          )}

          {tab === "data" && (
            <FieldGroup
              form={form}
              onChange={set}
              fields={[
                {
                  key: "backupRetention",
                  label: "Backup retention",
                  type: "number",
                  hint: "Max backups per server",
                },
                {
                  key: "metricsRetentionHours",
                  label: "Metrics retention (hours)",
                  type: "number",
                  hint: "Historical charts and alert context",
                },
              ]}
            />
          )}

          {tab === "alerts" && (
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                  Thresholds
                </p>
                <FieldGroup
                  form={form}
                  onChange={set}
                  fields={[
                    {
                      key: "alertCpuThreshold",
                      label: "CPU threshold (%)",
                      type: "number",
                    },
                    {
                      key: "alertRamThreshold",
                      label: "RAM threshold (%)",
                      type: "number",
                    },
                    {
                      key: "alertDiskThreshold",
                      label: "Disk threshold (%)",
                      type: "number",
                    },
                  ]}
                />
              </div>

              <div className="border-t border-border/60 pt-6">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                  Notifications
                </p>
                <div className="space-y-4">
                  <div>
                    <Label>Discord webhook URL</Label>
                    <Input
                      type="password"
                      value={String(form.alertDiscordWebhook ?? "")}
                      onChange={(e) => set("alertDiscordWebhook", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Generic webhook URL</Label>
                    <Input
                      type="password"
                      value={String(form.alertWebhookUrl ?? "")}
                      onChange={(e) => set("alertWebhookUrl", e.target.value)}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form.alertEmailEnabled)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          alertEmailEnabled: e.target.checked,
                        }))
                      }
                    />
                    Enable email alerts (SMTP)
                  </label>

                  {Boolean(form.alertEmailEnabled) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label>Alert recipient</Label>
                        <Input
                          value={String(form.alertEmailTo ?? "")}
                          onChange={(e) => set("alertEmailTo", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>SMTP host</Label>
                        <Input
                          value={String(form.smtpHost ?? "")}
                          onChange={(e) => set("smtpHost", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>SMTP port</Label>
                        <Input
                          type="number"
                          value={String(form.smtpPort ?? "")}
                          onChange={(e) => set("smtpPort", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>SMTP user</Label>
                        <Input
                          value={String(form.smtpUser ?? "")}
                          onChange={(e) => set("smtpUser", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>SMTP password</Label>
                        <Input
                          type="password"
                          value={String(form.smtpPass ?? "")}
                          onChange={(e) => set("smtpPass", e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>From address</Label>
                        <Input
                          value={String(form.smtpFrom ?? "")}
                          onChange={(e) => set("smtpFrom", e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <Button type="button" variant="secondary" onClick={testAlert}>
                    Send test alert
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === "integrations" && (
            <FieldGroup
              form={form}
              onChange={set}
              fields={[
                {
                  key: "curseforgeApiKey",
                  label: "CurseForge API key",
                  type: "password",
                },
                {
                  key: "steamWebApiKey",
                  label: "Steam Web API key",
                  type: "password",
                },
                { key: "steamUsername", label: "Steam username (optional)" },
                {
                  key: "steamPassword",
                  label: "Steam password (optional)",
                  type: "password",
                },
              ]}
            />
          )}
        </Card>

        {message && <p className="text-sm text-muted">{message}</p>}
        <Button type="submit">Save settings</Button>
      </form>
    </div>
  );
}
