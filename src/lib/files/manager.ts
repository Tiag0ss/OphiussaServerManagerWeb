import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { serverDataDir } from "../paths";

function normalizeRel(relative: string) {
  const cleaned = (relative || ".")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!cleaned || cleaned === ".") return ".";
  const parts = cleaned.split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) throw new Error("Path traversal blocked");
  return parts.join("/") || ".";
}

function resolveSafe(serverId: string, relative: string) {
  const root = path.resolve(serverDataDir(serverId));
  mkdirSync(root, { recursive: true });
  const rel = normalizeRel(relative);
  const target =
    rel === "." ? root : path.resolve(root, ...rel.split("/"));
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error("Path traversal blocked");
  }
  return { root, target, rel };
}

export function listFiles(serverId: string, relative = ".") {
  const { root, target, rel } = resolveSafe(serverId, relative);
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
  }
  const st = statSync(target);
  if (!st.isDirectory()) {
    throw new Error("Not a directory");
  }
  const entries = readdirSync(target, { withFileTypes: true })
    .map((dirent) => {
      const full = path.join(target, dirent.name);
      let size = 0;
      let mtime = new Date().toISOString();
      let isDirectory = dirent.isDirectory();
      try {
        const info = statSync(full);
        size = info.size;
        mtime = info.mtime.toISOString();
        isDirectory = info.isDirectory();
      } catch {
        /* ignore broken symlinks */
      }
      const entryPath =
        rel === "." ? dirent.name : `${rel}/${dirent.name}`;
      return {
        name: dirent.name,
        path: entryPath,
        isDirectory,
        size,
        mtime,
      };
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    cwd: rel,
    root,
    entries,
  };
}

export function readFile(serverId: string, relative: string) {
  const { target } = resolveSafe(serverId, relative);
  if (!existsSync(target) || statSync(target).isDirectory()) {
    throw new Error("File not found");
  }
  const buf = readFileSync(target);
  // Avoid dumping huge binaries into the editor
  if (buf.length > 2_000_000) {
    throw new Error("File too large to edit in the panel (>2MB)");
  }
  return buf.toString("utf8");
}

export function writeFile(serverId: string, relative: string, content: string) {
  const { target } = resolveSafe(serverId, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

export function writeBinary(serverId: string, relative: string, data: Buffer) {
  const { target } = resolveSafe(serverId, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data);
}

export function deletePath(serverId: string, relative: string) {
  const { root, target } = resolveSafe(serverId, relative);
  if (target === root) throw new Error("Cannot delete server root");
  rmSync(target, { recursive: true, force: true });
}

export function mkdir(serverId: string, relative: string) {
  const { target } = resolveSafe(serverId, relative);
  mkdirSync(target, { recursive: true });
}

export function renamePath(serverId: string, from: string, to: string) {
  const a = resolveSafe(serverId, from).target;
  const b = resolveSafe(serverId, to).target;
  mkdirSync(path.dirname(b), { recursive: true });
  renameSync(a, b);
}
