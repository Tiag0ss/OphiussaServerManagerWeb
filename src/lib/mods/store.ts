import { spawn } from "child_process";
import { mkdirSync, renameSync, existsSync, rmSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { serverMods, servers } from "../db/schema";
import { getSettings } from "../settings";
import { getTemplate } from "../templates/load";
import { serverDataDir } from "../paths";

export type ModSearchResult = {
  id: string;
  name: string;
  author?: string;
  summary?: string;
  downloads?: number;
  version?: string;
  provider: "thunderstore" | "curseforge" | "steam-workshop";
};

export async function searchThunderstore(
  namespace: string,
  query: string,
): Promise<ModSearchResult[]> {
  const url = `https://thunderstore.io/api/v1/package/?namespace=${encodeURIComponent(namespace)}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Thunderstore search failed");
  const data = (await res.json()) as Array<{
    uuid4: string;
    name: string;
    owner: string;
    versions: Array<{ version_number: string; description?: string; downloads: number }>;
  }>;
  const q = query.toLowerCase();
  return data
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.owner.toLowerCase().includes(q),
    )
    .slice(0, 40)
    .map((p) => ({
      id: `${p.owner}-${p.name}`,
      name: `${p.owner}-${p.name}`,
      author: p.owner,
      summary: p.versions[0]?.description,
      downloads: p.versions[0]?.downloads,
      version: p.versions[0]?.version_number,
      provider: "thunderstore" as const,
    }));
}

export async function searchCurseforge(
  gameId: number,
  query: string,
): Promise<ModSearchResult[]> {
  const settings = getSettings();
  if (!settings.curseforgeApiKey) {
    throw new Error("CurseForge API key not configured");
  }
  const url = new URL("https://api.curseforge.com/v1/mods/search");
  url.searchParams.set("gameId", String(gameId));
  url.searchParams.set("searchFilter", query);
  url.searchParams.set("pageSize", "30");
  const res = await fetch(url, {
    headers: { "x-api-key": settings.curseforgeApiKey },
  });
  if (!res.ok) throw new Error("CurseForge search failed");
  const json = (await res.json()) as {
    data: Array<{
      id: number;
      name: string;
      summary?: string;
      downloadCount?: number;
      authors?: Array<{ name: string }>;
    }>;
  };
  return json.data.map((m) => ({
    id: String(m.id),
    name: m.name,
    author: m.authors?.[0]?.name,
    summary: m.summary,
    downloads: m.downloadCount,
    provider: "curseforge" as const,
  }));
}

export async function searchWorkshop(
  appId: number,
  query: string,
): Promise<ModSearchResult[]> {
  const settings = getSettings();
  const key = settings.steamWebApiKey;
  // No Web API key: allow numeric Workshop file ID install without search
  if (!key) {
    const id = query.trim();
    if (/^\d{5,20}$/.test(id)) {
      return [
        {
          id,
          name: `Workshop item ${id}`,
          summary:
            "Install by Workshop file ID (no Steam Web API key configured for search)",
          provider: "steam-workshop",
        },
      ];
    }
    return [];
  }
  const body = new URLSearchParams({
    key,
    appid: String(appId),
    search_text: query,
    numperpage: "30",
    return_short_description: "true",
  });
  const url = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${body}`;
  const res2 = await fetch(url);
  if (!res2.ok) throw new Error("Steam Workshop search failed");
  const json = (await res2.json()) as {
    response?: {
      publishedfiledetails?: Array<{
        publishedfileid: string;
        title: string;
        file_description?: string;
        subscriptions?: number;
      }>;
    };
  };
  return (json.response?.publishedfiledetails || []).map((f) => ({
    id: f.publishedfileid,
    name: f.title,
    summary: f.file_description,
    downloads: f.subscriptions,
    provider: "steam-workshop" as const,
  }));
}

async function runSteamcmd(args: string[]) {
  const bin = process.env.STEAMCMD_PATH || "steamcmd";
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `steamcmd exited ${code}`));
    });
  });
}

export async function installWorkshopMod(
  serverId: string,
  fileId: string,
  name: string,
) {
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server) throw new Error("Server not found");
  const tpl = getTemplate(server.templateId);
  const appId = tpl?.mods?.workshopAppId;
  if (!appId) throw new Error("Template has no workshopAppId");

  const settings = getSettings();
  const installRoot = path.join(serverDataDir(serverId), tpl.mods?.installPath || "mods");
  mkdirSync(installRoot, { recursive: true });

  const login =
    settings.steamUsername && settings.steamPassword
      ? ["+login", settings.steamUsername, settings.steamPassword]
      : ["+login", "anonymous"];

  await runSteamcmd([
    ...login,
    "+workshop_download_item",
    String(appId),
    fileId,
    "+quit",
  ]);

  const steamPath = path.join(
    process.env.HOME || "/root",
    "Steam/steamapps/workshop/content",
    String(appId),
    fileId,
  );
  const dest = path.join(installRoot, fileId);
  if (existsSync(steamPath)) {
    mkdirSync(path.dirname(dest), { recursive: true });
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    renameSync(steamPath, dest);
  }

  const id = nanoid();
  db.insert(serverMods)
    .values({
      id,
      serverId,
      provider: "steam-workshop",
      externalId: fileId,
      name,
      installPath: dest,
      createdAt: new Date(),
    })
    .run();
  return id;
}

export async function installThunderstoreMod(
  serverId: string,
  packageName: string,
  version?: string,
) {
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server) throw new Error("Server not found");
  const tpl = getTemplate(server.templateId);
  const ns = tpl?.mods?.thunderstoreNamespace;
  if (!ns) throw new Error("No Thunderstore namespace");

  const [owner, name] = packageName.includes("-")
    ? (() => {
        const i = packageName.indexOf("-");
        return [packageName.slice(0, i), packageName.slice(i + 1)] as const;
      })()
    : [ns, packageName] as const;

  const metaUrl = `https://thunderstore.io/api/experimental/package/${owner}/${name}/`;
  const metaRes = await fetch(metaUrl);
  if (!metaRes.ok) throw new Error("Package not found on Thunderstore");
  const meta = (await metaRes.json()) as {
    latest: { version_number: string; download_url: string };
  };
  const ver = version || meta.latest.version_number;
  const downloadUrl =
    version && version !== meta.latest.version_number
      ? `https://thunderstore.io/package/download/${owner}/${name}/${ver}/`
      : meta.latest.download_url;

  const installRoot = path.join(
    serverDataDir(serverId),
    tpl?.mods?.installPath || "BepInEx/plugins",
  );
  mkdirSync(installRoot, { recursive: true });
  const zipPath = path.join(installRoot, `${owner}-${name}-${ver}.zip`);
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error("Download failed");
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFileSync } = await import("fs");
  writeFileSync(zipPath, buf);

  // extract with tar (zip) via unzip if available — store zip for now and note path
  const id = nanoid();
  db.insert(serverMods)
    .values({
      id,
      serverId,
      provider: "thunderstore",
      externalId: `${owner}-${name}`,
      name: `${owner}-${name}`,
      version: ver,
      installPath: zipPath,
      createdAt: new Date(),
    })
    .run();
  return id;
}

export async function removeMod(modId: string) {
  const db = getDb();
  const mod = db.select().from(serverMods).where(eq(serverMods.id, modId)).get();
  if (!mod) return;
  if (mod.installPath && existsSync(mod.installPath)) {
    rmSync(mod.installPath, { recursive: true, force: true });
  }
  db.delete(serverMods).where(eq(serverMods.id, modId)).run();
}
