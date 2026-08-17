"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Label, Textarea } from "@/components/ui/field";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Templates</h2>
          <p className="text-sm text-muted">
            Game server blueprints — edit YAML and preview the config form
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={newBlank}>
            New blank
          </Button>
          <label className="inline-flex cursor-pointer">
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
            <span className="inline-flex h-9 items-center rounded-lg border border-border bg-card-elevated px-3.5 text-sm hover:border-accent/40">
              Upload
            </span>
          </label>
        </div>
      </div>

      {message && (
        <p className="rounded-lg border border-border bg-accent-soft px-3 py-2 text-sm text-accent">
          {message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-2">
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

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label className="mb-0">
                {selectedId ? `Editing ${selectedId}` : "New / paste YAML"}
              </Label>
              <p className="text-xs text-muted">
                Saving marks the template as custom
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["yaml", "preview", "split"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                    tab === t
                      ? "bg-accent text-accent-fg"
                      : "bg-card-elevated text-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
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
              <Button onClick={save} disabled={busy || !yaml.trim()}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div
            className={`grid gap-4 ${
              showYaml && showPreview ? "xl:grid-cols-2" : ""
            }`}
          >
            {showYaml && (
              <Card>
                <Textarea
                  className="min-h-[560px] font-mono text-xs"
                  value={yaml}
                  onChange={(e) => setYaml(e.target.value)}
                  spellCheck={false}
                  placeholder="Select a template or paste YAML…"
                />
              </Card>
            )}
            {showPreview && (
              <Card className="space-y-4">
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
                      <p className="mt-1 font-mono text-xs text-muted">
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
