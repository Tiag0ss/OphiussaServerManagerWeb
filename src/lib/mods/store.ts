import { spawn } from "child_process";
import {
  mkdirSync,
  renameSync,
  existsSync,
  rmSync,
  writeFileSync,
  readdirSync,
  cpSync,
  statSync,
} from "fs";
import path from "path";
import { eq, and } from "drizzle-orm";
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

const TS_HEADERS = {
  "User-Agent": "OphiussaServerManager/0.1 (+https://github.com/)",
  Accept: "application/json",
};

export async function searchThunderstore(
  community: string,
  query: string,
): Promise<ModSearchResult[]> {
  // Never use /c/{community}/api/v1/package/ — that dumps the full index (~100MB+).
  // Cyberstorm listing is a paginated search (~tens of KB).
  const q = query.trim();
  if (q.length > 0 && q.length < 2) {
    throw new Error("Type at least 2 characters to search Thunderstore");
  }

  const url = new URL(
    `https://thunderstore.io/api/cyberstorm/listing/${encodeURIComponent(community)}/`,
  );
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("page_size", "30");

  const res = await fetch(url, {
    headers: TS_HEADERS,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Thunderstore search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    results?: Array<{
      namespace: string;
      name: string;
      description?: string;
      download_count?: number;
      is_deprecated?: boolean;
      is_nsfw?: boolean;
    }>;
  };

  return (data.results || [])
    .filter((p) => !p.is_deprecated && !p.is_nsfw)
    .slice(0, 30)
    .map((p) => ({
      id: `${p.namespace}-${p.name}`,
      name: `${p.namespace}-${p.name}`,
      author: p.namespace,
      summary: p.description,
      downloads: p.download_count,
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

export function workshopAppIdFor(server: {
  templateId: string;
  configJson: string;
}): number | null {
  const tpl = getTemplate(server.templateId);
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(server.configJson) as Record<string, unknown>;
  } catch {
    config = {};
  }
  const fromConfig = Number(String(config.workshopAppId ?? "").split(/\s+/)[0]);
  if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
  if (tpl?.mods?.workshopAppId) return tpl.mods.workshopAppId;
  const fromGameId = Number(String(config.gameId ?? "").split(/\s+/)[0]);
  if (Number.isFinite(fromGameId) && fromGameId > 0) return fromGameId;
  return null;
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
  const appId = workshopAppIdFor(server);
  if (!appId) throw new Error("Set a Workshop client App ID on the server config");

  const settings = getSettings();
  const installRoot = path.join(serverDataDir(serverId), tpl?.mods?.installPath || "mods");
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

  const existing = db
    .select()
    .from(serverMods)
    .where(
      and(
        eq(serverMods.serverId, serverId),
        eq(serverMods.externalId, fileId),
      ),
    )
    .get();
  if (existing) {
    db.update(serverMods)
      .set({ name, installPath: dest })
      .where(eq(serverMods.id, existing.id))
      .run();
    return existing.id;
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

function extractZip(zipPath: string, destDir: string) {
  mkdirSync(destDir, { recursive: true });
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "python3",
      ["-c", "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zipPath, destDir],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `zip extract failed (${code})`));
    });
  });
}

function mergeDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (statSync(from).isDirectory()) mergeDir(from, to);
    else {
      mkdirSync(path.dirname(to), { recursive: true });
      cpSync(from, to);
    }
  }
}

/**
 * Breadth-first search (bounded depth) for a directory named `wanted`
 * anywhere under `root`. Real Thunderstore packages ship `manifest.json`,
 * `README.md`, `icon.png` alongside the actual content folder, so the
 * target directory is rarely at the top level — a plain top-level check
 * misses it and a naive "unwrap the one folder" heuristic never fires
 * because the top level has several entries, not one.
 */
function findDirRecursive(
  root: string,
  wanted: string,
  maxDepth = 4,
): string | null {
  const wantedLower = wanted.toLowerCase();
  let frontier = [root];
  for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const dir of frontier) {
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (!statSync(full).isDirectory()) continue;
        if (name.toLowerCase() === wantedLower) return full;
        next.push(full);
      }
    }
    frontier = next;
  }
  return null;
}

/** Template installPath is e.g. bepinex/plugins — that casing is what the image uses. */
function bepinexRootFromInstallPath(dataDir: string, installPath: string) {
  const rel = installPath.replace(/\\/g, "/");
  const rootRel = rel.toLowerCase().endsWith("/plugins")
    ? rel.slice(0, -"/plugins".length)
    : rel.split("/")[0] || "bepinex";
  return path.join(dataDir, rootRel);
}

function mergeWrongCaseBepInEx(dataDir: string, canonicalRoot: string) {
  const canonicalName = path.basename(canonicalRoot);
  if (!existsSync(dataDir)) return;
  for (const name of readdirSync(dataDir)) {
    if (name === canonicalName) continue;
    if (name.toLowerCase() !== canonicalName.toLowerCase()) continue;
    const wrong = path.join(dataDir, name);
    if (!statSync(wrong).isDirectory()) continue;
    mergeDir(wrong, canonicalRoot);
    rmSync(wrong, { recursive: true, force: true });
  }
}

/**
 * Place extracted Thunderstore package into the server data dir.
 * Zips often ship `BepInEx/` (PascalCase); Valheim's image uses `bepinex/` (lowercase).
 * Always merge into the template installPath casing so Linux does not create a second folder.
 */
function placeThunderstoreExtract(
  extractDir: string,
  dataDir: string,
  installPath: string,
) {
  const pluginsDest = path.join(dataDir, installPath);
  const bepinexDest = bepinexRootFromInstallPath(dataDir, installPath);

  // Packages vary: some ship BepInEx/ or plugins/ right at the top, others
  // bury it under manifest.json/README.md/icon.png plus a wrapper folder
  // (e.g. "manifest.json, icon.png, ModName/plugins/…"). Search the whole
  // extracted tree for the first BepInEx/plugins folder rather than only
  // checking the top level.
  const zipBep = findDirRecursive(extractDir, "BepInEx");
  if (zipBep) {
    mergeDir(zipBep, bepinexDest);
    mergeWrongCaseBepInEx(dataDir, bepinexDest);
    return pluginsDest;
  }

  const zipPlugins = findDirRecursive(extractDir, "plugins");
  if (zipPlugins) {
    mergeDir(zipPlugins, pluginsDest);
    mergeWrongCaseBepInEx(dataDir, bepinexDest);
    return pluginsDest;
  }

  // Neither found anywhere: unwrap any redundant single-folder wrapper(s),
  // then drop the remaining content straight into plugins/.
  let current = extractDir;
  for (;;) {
    const entries = existsSync(current) ? readdirSync(current) : [];
    if (entries.length === 1 && statSync(path.join(current, entries[0])).isDirectory()) {
      current = path.join(current, entries[0]);
      continue;
    }
    break;
  }
  mergeDir(current, pluginsDest);
  mergeWrongCaseBepInEx(dataDir, bepinexDest);
  return pluginsDest;
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
  const community = tpl?.mods?.thunderstoreNamespace;
  if (!community) throw new Error("No Thunderstore community on this template");

  // Accept "Owner-Package" or "Owner/Package"
  const normalized = packageName.replace(/\//g, "-");
  const dash = normalized.indexOf("-");
  if (dash <= 0) {
    throw new Error(
      'Invalid package id — expected "Author-PackageName" (e.g. ValheimModding-Jotunn)',
    );
  }
  const owner = normalized.slice(0, dash);
  const name = normalized.slice(dash + 1);

  const metaUrl = `https://thunderstore.io/api/experimental/package/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/`;
  const metaRes = await fetch(metaUrl, {
    headers: TS_HEADERS,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!metaRes.ok) {
    throw new Error(
      `Package not found on Thunderstore (${owner}/${name}). Use Author-PackageName from search results.`,
    );
  }
  const meta = (await metaRes.json()) as {
    latest: { version_number: string; download_url: string };
  };
  const ver = version || meta.latest.version_number;
  const downloadUrl =
    version && version !== meta.latest.version_number
      ? `https://thunderstore.io/package/download/${owner}/${name}/${ver}/`
      : meta.latest.download_url;

  const dataDir = serverDataDir(serverId);
  const installRel = tpl?.mods?.installPath || "bepinex/plugins";
  const tmpRoot = path.join(dataDir, ".mod-tmp", nanoid());
  const zipPath = path.join(tmpRoot, `${owner}-${name}-${ver}.zip`);
  const extractDir = path.join(tmpRoot, "extract");
  mkdirSync(extractDir, { recursive: true });

  try {
    const res = await fetch(downloadUrl, {
      headers: TS_HEADERS,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error("Download failed from Thunderstore");
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    await extractZip(zipPath, extractDir);
    const placed = placeThunderstoreExtract(extractDir, dataDir, installRel);
    // Move leftovers from a previous PascalCase extract (BepInEx vs bepinex)
    mergeWrongCaseBepInEx(dataDir, bepinexRootFromInstallPath(dataDir, installRel));

    const existing = db
      .select()
      .from(serverMods)
      .where(
        and(
          eq(serverMods.serverId, serverId),
          eq(serverMods.externalId, `${owner}-${name}`),
        ),
      )
      .get();
    if (existing) {
      db.update(serverMods)
        .set({
          name: `${owner}-${name}`,
          version: ver,
          installPath: placed,
        })
        .where(eq(serverMods.id, existing.id))
        .run();
      return existing.id;
    }

    const id = nanoid();
    db.insert(serverMods)
      .values({
        id,
        serverId,
        provider: "thunderstore",
        externalId: `${owner}-${name}`,
        name: `${owner}-${name}`,
        version: ver,
        installPath: placed,
        createdAt: new Date(),
      })
      .run();
    return id;
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export async function reinstallMod(modId: string) {
  const db = getDb();
  const mod = db.select().from(serverMods).where(eq(serverMods.id, modId)).get();
  if (!mod) throw new Error("Mod not found");
  if (mod.provider === "thunderstore") {
    return installThunderstoreMod(mod.serverId, mod.externalId);
  }
  if (mod.provider === "steam-workshop") {
    return installWorkshopMod(mod.serverId, mod.externalId, mod.name);
  }
  throw new Error(`Cannot reinstall ${mod.provider} mods`);
}

export async function reinstallAllMods(serverId: string) {
  const db = getDb();
  const list = db
    .select()
    .from(serverMods)
    .where(eq(serverMods.serverId, serverId))
    .all();
  if (!list.length) throw new Error("No mods to reinstall");
  const errors: string[] = [];
  for (const m of list) {
    try {
      await reinstallMod(m.id);
    } catch (e) {
      errors.push(`${m.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  if (errors.length) {
    throw new Error(`Reinstall finished with errors — ${errors.join("; ")}`);
  }
  return list.length;
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
