"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Label, Select, Textarea } from "@/components/ui/field";
import { TemplateForm } from "@/components/template-form";
import {
  defaultConfigFromTemplate,
  parseTemplateYaml,
} from "@/lib/templates/definition";
import type { GameTemplate } from "@/lib/templates/types";

type TplMeta = {
  id: string;
  name: string;
  description?: string;
  source?: string;
  updatedAt?: string;
  mods?: { providers?: string[] };
};

export default function TemplatesPage() {
  const [list, setList] = useState<TplMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [yaml, setYaml] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"yaml" | "preview" | "split">("split");
  const [previewConfig, setPreviewConfig] = useState<Record<string, unknown>>(
    {},
  );
  const [wideLayout, setWideLayout] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWideLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const preview = useMemo(() => {
    if (!yaml.trim()) {
      return { tpl: null as GameTemplate | null, error: "" };
    }
    try {
      return { tpl: parseTemplateYaml(yaml), error: "" };
    } catch (e) {
      return {
        tpl: null as GameTemplate | null,
        error: e instanceof Error ? e.message : "Invalid YAML",
      };
    }
  }, [yaml]);

  const previewValue = useMemo(() => {
    if (!preview.tpl) return {};
    return { ...defaultConfigFromTemplate(preview.tpl), ...previewConfig };
  }, [preview.tpl, previewConfig]);

  async function reload() {
    const res = await fetch("/api/templates");
    const data = await res.json();
    setList(data.templates || []);
  }

  useEffect(() => {
    reload().catch(() => setMessage("Failed to load templates"));
  }, []);

  useEffect(() => {
    setPreviewConfig({});
  }, [selectedId]);

  async function openEdit(id: string) {
    setSelectedId(id);
    setMessage("");
    const res = await fetch(
      `/api/templates?id=${encodeURIComponent(id)}&format=yaml`,
    );
    const text = await res.text();
    setYaml(text);
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml, id: selectedId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setMessage(`Saved template ${data.id}`);
    setSelectedId(data.id);
    reload();
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setMessage("");
    const text = await file.text();
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml: text }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error || "Upload failed");
      return;
    }
    setMessage(`Uploaded ${data.id}`);
    await reload();
    openEdit(data.id);
  }

  function download(id: string) {
    window.open(
      `/api/templates?id=${encodeURIComponent(id)}&format=yaml`,
      "_blank",
    );
  }

  async function remove(id: string) {
    if (!confirm(`Delete template ${id}?`)) return;
    const res = await fetch("/api/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const j = await res.json();
      setMessage(j.error || "Delete failed");
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      setYaml("");
    }
    setMessage("Deleted");
    reload();
  }

  function newBlank() {
    setSelectedId(null);
    setYaml(
      `id: my-game\nname: My Game\ndescription: Custom template\nruntime:\n  image: example/game:latest\n  memoryMb: 4096\n  cpuLimit: 2\n  stopTimeout: 60\n  ports:\n    - { key: game, container: 7777, protocol: udp }\n  volumes:\n    - { key: data, container: /data }\nfields:\n  - key: serverName\n    type: string\n    group: Server\n    label: Server name\n    required: true\n    default: My Server\n    bind: { env: SERVER_NAME }\n`,
    );
  }

  const showYaml = tab === "yaml" || tab === "split";
  const showPreview = tab === "preview" || tab === "split";
  const sideBySide = showYaml && showPreview && wideLayout;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:gap-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Templates
          </h2>
          <p className="text-sm text-muted">
            Game server blueprints — edit YAML and preview the config form
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="secondary" onClick={newBlank} className="flex-1 sm:flex-none">
            New blank
          </Button>
          <label className="inline-flex flex-1 cursor-pointer sm:flex-none">
            <input
              type="file"
              accept=".yaml,.yml,text/yaml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-card-elevated px-3.5 text-sm hover:border-accent/40 sm:w-auto">
              Upload
            </span>
          </label>
        </div>
      </div>

      {message && (
        <p className="shrink-0 rounded-lg border border-border bg-accent-soft px-3 py-2 text-sm text-accent">
          {message}
        </p>
      )}

      {list.length > 0 && (
        <div className="shrink-0 lg:hidden">
          <Label>Template</Label>
          <Select
            value={selectedId ?? ""}
            onChange={(e) => {
              const id = e.target.value;
              if (id) openEdit(id);
            }}
          >
            <option value="">Select a template…</option>
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.id})
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-stretch">
        <Card className="hidden h-fit max-h-[calc(100dvh-12rem)] overflow-y-auto p-2 lg:block">
          <ul className="space-y-0.5">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openEdit(t.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                    selectedId === t.id
                      ? "bg-accent-soft text-accent"
                      : "hover:bg-card-elevated"
                  }`}
                >
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.id} · {t.source || "builtin"}
                  </p>
                  {t.mods?.providers?.length ? (
                    <p className="mt-1 text-[11px] text-accent">
                      Mods:{" "}
                      {t.mods.providers
                        .map((p) =>
                          p === "steam-workshop"
                            ? "Steam Workshop"
                            : p === "thunderstore"
                              ? "Thunderstore"
                              : "CurseForge",
                        )
                        .join(", ")}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
            {list.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted">
                No templates
              </li>
            )}
          </ul>
        </Card>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Label className="mb-0">
                {selectedId ? `Editing ${selectedId}` : "New / paste YAML"}
              </Label>
              <p className="text-xs text-muted">
                Saving marks the template as custom
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex w-full gap-1 rounded-lg bg-card-elevated p-1 sm:w-auto">
                {(["yaml", "preview", "split"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm capitalize sm:flex-none ${
                      tab === t
                        ? "bg-accent text-accent-fg"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {selectedId && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => download(selectedId)}
                  >
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(selectedId)}
                  >
                    Delete
                  </Button>
                </>
              )}
              <Button
                onClick={save}
                disabled={busy || !yaml.trim()}
                className="w-full sm:w-auto"
              >
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div
            className={`grid min-h-0 flex-1 gap-4 ${
              sideBySide ? "lg:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {showYaml && (
              <Card className="flex min-h-[min(420px,calc(100dvh-14rem))] min-w-0 flex-1 flex-col p-3 sm:p-5 lg:min-h-[min(640px,calc(100dvh-10rem))]">
                <Textarea
                  className="min-h-[320px] flex-1 resize-y font-mono text-xs sm:min-h-[380px]"
                  value={yaml}
                  onChange={(e) => setYaml(e.target.value)}
                  spellCheck={false}
                  placeholder="Select a template or paste YAML…"
                />
              </Card>
            )}
            {showPreview && (
              <Card className="min-w-0 space-y-4 overflow-y-auto p-3 sm:p-5 lg:max-h-[calc(100dvh-10rem)]">
                {preview.error ? (
                  <p className="text-sm text-danger">{preview.error}</p>
                ) : !preview.tpl ? (
                  <p className="text-sm text-muted">
                    Paste or select a template to preview the config form.
                  </p>
                ) : (
                  <>
                    <div>
                      <h3 className="font-medium">{preview.tpl.name}</h3>
                      <p className="text-sm text-muted">
                        {preview.tpl.description || preview.tpl.id}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-muted">
                        {preview.tpl.runtime.image}
                        {preview.tpl.runtime.ports?.length
                          ? ` · ${preview.tpl.runtime.ports
                              .map(
                                (p) => `${p.key} ${p.container}/${p.protocol}`,
                              )
                              .join(", ")}`
                          : ""}
                      </p>
                    </div>
                    <TemplateForm
                      key={preview.tpl.id}
                      template={preview.tpl}
                      value={previewValue}
                      onChange={setPreviewConfig}
                      mode="all"
                    />
                  </>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
