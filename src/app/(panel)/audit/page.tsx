"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/field";

type Entry = {
  id: string;
  userEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    fetch("/api/audit")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Audit log</h2>
        <p className="text-sm text-muted">Panel actions recorded for accountability</p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted">
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Action</th>
              <th className="py-2 pr-4">Target</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border/50">
                <td className="py-2 pr-4 tabular-nums text-muted">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4">{e.userEmail ?? "—"}</td>
                <td className="py-2 pr-4 font-mono text-xs">{e.action}</td>
                <td className="py-2 pr-4 text-muted">
                  {e.targetType ? `${e.targetType}:${e.targetId}` : "—"}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted">
                  No entries yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
