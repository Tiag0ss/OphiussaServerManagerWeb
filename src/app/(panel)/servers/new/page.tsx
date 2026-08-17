"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameTemplate } from "@/lib/templates/types";
import { TemplateForm } from "@/components/template-form";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/field";
import { SecretInput } from "@/components/ui/secret-input";

function modsLabel(t: GameTemplate) {
  const p = t.mods?.providers || [];
  if (!p.length) return "No mod providers";
  return p
    .map((x) =>
      x === "steam-workshop"
        ? "Steam Workshop"
        : x === "thunderstore"
          ? "Thunderstore"
          : "CurseForge",
    )
    .join(" · ");
}

export default function NewServerPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<GameTemplate[]>([]);
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("changeme");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [ports, setPorts] = useState<Record<string, number>>({});
  const [portRange, setPortRange] = useState({ start: 25565, end: 26000 });
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [error, setError] = useState("");
  const [ftpCreds, setFtpCreds] = useState<{ user: string; pass: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const template = templates.find((t) => t.id === templateId);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []));
  }, []);

  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/me?templateId=${encodeURIComponent(templateId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.portRange) setPortRange(d.portRange);
        if (d.suggestedPorts) setPorts(d.suggestedPorts);
      })
      .catch(() => undefined);
  }, [templateId]);

  useEffect(() => {
    if (!template) return;
    const defaults: Record<string, unknown> = {};
    for (const f of template.fields) {
      if (f.default !== undefined) defaults[f.key] = f.default;
    }
    if (name) {
      if ("serverName" in defaults) defaults.serverName = name;
      if ("sessionName" in defaults) defaults.sessionName = name;
    }
    if (password) {
      if ("serverPass" in defaults) defaults.serverPass = password;
      if ("serverPassword" in defaults) defaults.serverPassword = password;
      if ("password" in defaults) defaults.password = password;
    }
    setConfig(defaults);
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!templateId || !name) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        templateId,
        config,
        ports,
        start: true,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Create failed");
      return;
    }
    if (data.ftpUsername) {
      setFtpCreds({ user: data.ftpUsername, pass: data.ftpPassword });
    }
    if (data.warning) setError(data.warning);
    setTimeout(() => {
      router.push(`/servers/${data.id}`);
      router.refresh();
    }, data.ftpUsername ? 2500 : 0);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Create server</h2>
        <p className="text-sm text-muted">
          Step {step} of 3 — game, ports & basics, then config
        </p>
      </div>

      {step === 1 && (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTemplateId(t.id);
                setName(`My ${t.name}`);
                setStep(2);
              }}
              className="rounded-xl border border-border bg-card p-4 text-left hover:border-accent"
            >
              <h3 className="font-semibold">{t.name}</h3>
              <p className="mt-1 text-sm text-muted">{t.description}</p>
              <p className="mt-2 text-xs text-accent">{modsLabel(t)}</p>
            </button>
          ))}
        </div>
      )}

      {step === 2 && template && (
        <Card className="space-y-4">
          <div>
            <Label>Server display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Join password</Label>
            <SecretInput value={password} onChange={setPassword} />
          </div>
          <div>
            <Label>
              Host ports{" "}
              <span className="font-normal text-muted">
                (allowed {portRange.start}–{portRange.end})
              </span>
            </Label>
            <p className="mb-2 text-xs text-muted">
              Consecutive ports are suggested automatically. Change them within
              your allowed range.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {template.runtime.ports.map((p) => (
                <div key={p.key}>
                  <Label className="text-xs">
                    {p.key} → container {p.container}/{p.protocol}
                  </Label>
                  <Input
                    type="number"
                    min={portRange.start}
                    max={portRange.end}
                    value={ports[p.key] ?? ""}
                    onChange={(e) =>
                      setPorts((prev) => ({
                        ...prev,
                        [p.key]: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 3 && template && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Configuration</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide advanced" : "Advanced"}
            </Button>
          </div>
          <TemplateForm
            template={template}
            value={config}
            onChange={setConfig}
            mode={showAdvanced ? "all" : "simple"}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          {ftpCreds && (
            <p className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">
              FTP/SFTP user <code>{ftpCreds.user}</code> password{" "}
              <code>{ftpCreds.pass}</code> — save this, it is shown once.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={create} disabled={loading}>
              {loading ? "Creating…" : "Create server"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
