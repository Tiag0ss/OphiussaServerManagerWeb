import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { settings } from "./db/schema";

export type PanelSettings = {
  setupComplete: boolean;
  publicIp: string;
  portRangeStart: number;
  portRangeEnd: number;
  timezone: string;
  puid: number;
  pgid: number;
  backupRetention: number;
  curseforgeApiKey: string;
  steamWebApiKey: string;
  steamUsername: string;
  steamPassword: string;
};

const DEFAULTS: PanelSettings = {
  setupComplete: false,
  publicIp: "",
  portRangeStart: 25565,
  portRangeEnd: 26000,
  timezone: "Europe/Lisbon",
  puid: 1000,
  pgid: 1000,
  backupRetention: 7,
  curseforgeApiKey: "",
  steamWebApiKey: "",
  steamUsername: "",
  steamPassword: "",
};

export function getSettings(): PanelSettings {
  const db = getDb();
  const rows = db.select().from(settings).all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    setupComplete: map.setupComplete === "true",
    publicIp: map.publicIp ?? DEFAULTS.publicIp,
    portRangeStart: Number(map.portRangeStart ?? DEFAULTS.portRangeStart),
    portRangeEnd: Number(map.portRangeEnd ?? DEFAULTS.portRangeEnd),
    timezone: map.timezone ?? DEFAULTS.timezone,
    puid: Number(map.puid ?? DEFAULTS.puid),
    pgid: Number(map.pgid ?? DEFAULTS.pgid),
    backupRetention: Number(map.backupRetention ?? DEFAULTS.backupRetention),
    curseforgeApiKey: map.curseforgeApiKey ?? "",
    steamWebApiKey: map.steamWebApiKey ?? "",
    steamUsername: map.steamUsername ?? "",
    steamPassword: map.steamPassword ?? "",
  };
}

export function setSetting(key: keyof PanelSettings, value: string | number | boolean) {
  const db = getDb();
  const str = String(value);
  db.insert(settings)
    .values({ key, value: str })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: str },
    })
    .run();
}

export function updateSettings(partial: Partial<PanelSettings>) {
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    setSetting(key as keyof PanelSettings, value as string | number | boolean);
  }
}

export function isSetupComplete() {
  const db = getDb();
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, "setupComplete"))
    .get();
  return row?.value === "true";
}
