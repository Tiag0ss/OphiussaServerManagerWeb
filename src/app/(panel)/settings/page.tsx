"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/field";

export default function SettingsPage() {
  const [form, setForm] = useState<Record<string, string | number>>({});
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

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6 xl:max-w-4xl">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-muted">Panel-wide configuration</p>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          {(
            [
              ["publicIp", "Public IP"],
              ["portRangeStart", "Port range start"],
              ["portRangeEnd", "Port range end"],
              ["timezone", "Timezone"],
              ["puid", "PUID"],
              ["pgid", "PGID"],
              ["backupRetention", "Backup retention (count)"],
              ["curseforgeApiKey", "CurseForge API key"],
              ["steamWebApiKey", "Steam Web API key"],
              ["steamUsername", "Steam username (optional)"],
              ["steamPassword", "Steam password (optional)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                type={
                  key.includes("Password") || key.includes("Key")
                    ? "password"
                    : key.includes("port") ||
                        key === "puid" ||
                        key === "pgid" ||
                        key === "backupRetention"
                      ? "number"
                      : "text"
                }
                value={String(form[key] ?? "")}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
          {message && <p className="text-sm text-muted">{message}</p>}
          <Button type="submit">Save settings</Button>
        </form>
      </Card>
    </div>
  );
}
