"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/field";

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (d.setupComplete) router.replace("/login");
      });
  }, [router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        publicIp: fd.get("publicIp"),
        portRangeStart: Number(fd.get("portRangeStart")),
        portRangeEnd: Number(fd.get("portRangeEnd")),
        timezone: fd.get("timezone"),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Setup failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <Card className="w-full">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Welcome</p>
        <h1 className="mt-1 text-2xl font-semibold">Ophiussa Server Manager</h1>
        <p className="mt-2 text-sm text-muted">
          Create the first admin account and basic panel settings.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <Label>Name</Label>
            <Input name="name" required defaultValue="Admin" />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" required />
          </div>
          <div>
            <Label>Password</Label>
            <Input name="password" type="password" required minLength={8} />
          </div>
          <div>
            <Label>Public IP / hostname</Label>
            <Input name="publicIp" placeholder="203.0.113.10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Port range start</Label>
              <Input name="portRangeStart" type="number" defaultValue={25565} />
            </div>
            <div>
              <Label>Port range end</Label>
              <Input name="portRangeEnd" type="number" defaultValue={26000} />
            </div>
          </div>
          <div>
            <Label>Timezone</Label>
            <Input name="timezone" defaultValue="Europe/Lisbon" />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Setting up…" : "Finish setup"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
