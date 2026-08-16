import { FtpSrv } from "ftp-srv";
import { Server as SshServer, utils as sshUtils } from "ssh2";
import { eq } from "drizzle-orm";
import { generateKeyPairSync } from "crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "fs";
import path from "path";
import { verifyPassword } from "../auth/password";
import { getDb } from "../db";
import { servers } from "../db/schema";
import { DATA_DIR, serverDataDir } from "../paths";
import { ftpPort, sftpPort } from "../ports";

type FtpSftpGlobals = {
  ftpStarted?: boolean;
  sftpStarted?: boolean;
};

function g(): FtpSftpGlobals {
  // Survive Turbopack reloads / duplicate instrumentation in the same process
  const key = "__ophiussa_ftp_sftp__";
  const store = globalThis as typeof globalThis & Record<string, FtpSftpGlobals>;
  if (!store[key]) store[key] = {};
  return store[key];
}

function isAddrInUse(e: unknown) {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "EADDRINUSE"
  );
}

async function findFtpUser(username: string, password: string) {
  const db = getDb();
  const row = db
    .select()
    .from(servers)
    .where(eq(servers.ftpUsername, username))
    .get();
  if (!row || !row.ftpEnabled || !row.ftpPasswordHash) return null;
  const ok = await verifyPassword(password, row.ftpPasswordHash);
  if (!ok) return null;
  return row;
}

function hostKeyPath() {
  return path.join(DATA_DIR, "sftp_host_key");
}

function ensureHostKey() {
  mkdirSync(DATA_DIR, { recursive: true });
  const p = hostKeyPath();
  if (existsSync(p)) return readFileSync(p);
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  writeFileSync(p, privateKey, { mode: 0o600 });
  return Buffer.from(privateKey);
}

export async function startFtpServer() {
  const state = g();
  if (state.ftpStarted || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  state.ftpStarted = true;
  const port = ftpPort();
  try {
    const ftp = new FtpSrv({
      url: `ftp://0.0.0.0:${port}`,
      anonymous: false,
      pasv_url: process.env.PUBLIC_IP || "127.0.0.1",
    });
    ftp.on("login", async ({ username, password }, resolve, reject) => {
      try {
        const user = await findFtpUser(username, password);
        if (!user) return reject(new Error("Invalid credentials"));
        const root = serverDataDir(user.id);
        mkdirSync(root, { recursive: true });
        resolve({ root });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    await ftp.listen();
    console.log(`[ftp] listening on :${port}`);
  } catch (e) {
    if (isAddrInUse(e)) {
      // Duplicate `npm run dev` or a sibling worker already owns the port.
      console.warn(
        `[ftp] port ${port} already in use — skipping (stop duplicate \`npm run dev\` if unexpected)`,
      );
      state.ftpStarted = true;
      return;
    }
    console.error("[ftp] failed to start on port", port, e);
    state.ftpStarted = false;
  }
}

export function startSftpServer() {
  const state = g();
  if (state.sftpStarted || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  state.sftpStarted = true;
  const port = sftpPort();
  try {
    const hostKeys = [ensureHostKey()];
    const server = new SshServer({ hostKeys }, (client) => {
      let rootDir = "";
      client.on("authentication", async (ctx) => {
        if (ctx.method !== "password") return ctx.reject(["password"]);
        try {
          const user = await findFtpUser(ctx.username, ctx.password || "");
          if (!user) return ctx.reject();
          rootDir = serverDataDir(user.id);
          mkdirSync(rootDir, { recursive: true });
          ctx.accept();
        } catch {
          ctx.reject();
        }
      });
      client.on("ready", () => {
        client.on("session", (accept) => {
          const session = accept();
          session.on("sftp", (acceptSftp) => {
            const sftp = acceptSftp();
            const handles = new Map<
              string,
              { path: string; fd?: number; dir?: string[] }
            >();
            let handleId = 0;

            const resolvePath = (p: string) => {
              const cleaned = p.replace(/^\/+/, "");
              const full = path.resolve(rootDir, cleaned || ".");
              if (!full.startsWith(rootDir)) throw new Error("Invalid path");
              return full;
            };

            sftp.on("REALPATH", (reqid, p) => {
              try {
                const full = resolvePath(p || ".");
                const st = statSync(full);
                const rel =
                  "/" + path.relative(rootDir, full).replace(/\\/g, "/");
                const filename = rel === "/." ? "/" : rel;
                sftp.name(reqid, [
                  {
                    filename,
                    longname: filename,
                    attrs: {
                      mode: st.mode,
                      uid: st.uid,
                      gid: st.gid,
                      size: st.size,
                      atime: Math.floor(st.atimeMs / 1000),
                      mtime: Math.floor(st.mtimeMs / 1000),
                    },
                  },
                ]);
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            sftp.on("OPENDIR", (reqid, p) => {
              try {
                const full = resolvePath(p);
                const names = readdirSync(full);
                const h = Buffer.from(`d${handleId++}`);
                handles.set(h.toString("hex"), { path: full, dir: names });
                sftp.handle(reqid, h);
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            sftp.on("READDIR", (reqid, handle) => {
              const entry = handles.get(handle.toString("hex"));
              if (!entry?.dir) {
                return sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
              if (entry.dir.length === 0) {
                return sftp.status(reqid, sshUtils.sftp.STATUS_CODE.EOF);
              }
              const batch = entry.dir.splice(0, 50);
              const attrs = batch.map((name) => {
                const full = path.join(entry.path, name);
                const st = statSync(full);
                return {
                  filename: name,
                  longname: `${st.isDirectory() ? "d" : "-"} ${name}`,
                  attrs: {
                    mode: st.mode,
                    uid: st.uid,
                    gid: st.gid,
                    size: st.size,
                    atime: Math.floor(st.atimeMs / 1000),
                    mtime: Math.floor(st.mtimeMs / 1000),
                  },
                };
              });
              sftp.name(reqid, attrs);
            });

            sftp.on("CLOSE", (reqid, handle) => {
              handles.delete(handle.toString("hex"));
              sftp.status(reqid, sshUtils.sftp.STATUS_CODE.OK);
            });

            sftp.on("OPEN", (reqid, p, flags) => {
              try {
                const full = resolvePath(p);
                let flag = "r";
                if (flags & sshUtils.sftp.OPEN_MODE.WRITE) flag = "w";
                if (flags & sshUtils.sftp.OPEN_MODE.APPEND) flag = "a";
                if (
                  (flags & sshUtils.sftp.OPEN_MODE.WRITE) &&
                  (flags & sshUtils.sftp.OPEN_MODE.READ)
                ) {
                  flag = "w+";
                }
                const fd = openSync(full, flag);
                const h = Buffer.from(`f${handleId++}`);
                handles.set(h.toString("hex"), { path: full, fd });
                sftp.handle(reqid, h);
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            sftp.on("READ", (reqid, handle, offset, length) => {
              try {
                const entry = handles.get(handle.toString("hex"));
                if (entry?.fd === undefined) {
                  return sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
                }
                const buf = Buffer.alloc(length);
                const n = readSync(entry.fd, buf, 0, length, offset);
                if (n === 0)
                  return sftp.status(reqid, sshUtils.sftp.STATUS_CODE.EOF);
                sftp.data(reqid, buf.subarray(0, n));
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            sftp.on("WRITE", (reqid, handle, offset, data) => {
              try {
                const entry = handles.get(handle.toString("hex"));
                if (entry?.fd === undefined) {
                  return sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
                }
                writeSync(entry.fd, data, 0, data.length, offset);
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.OK);
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            sftp.on("REMOVE", (reqid, p) => {
              try {
                unlinkSync(resolvePath(p));
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.OK);
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            sftp.on("RMDIR", (reqid, p) => {
              try {
                rmdirSync(resolvePath(p));
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.OK);
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            sftp.on("MKDIR", (reqid, p) => {
              try {
                mkdirSync(resolvePath(p), { recursive: true });
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.OK);
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            sftp.on("RENAME", (reqid, oldPath, newPath) => {
              try {
                renameSync(resolvePath(oldPath), resolvePath(newPath));
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.OK);
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            });

            const onStat = (reqid: number, p: string) => {
              try {
                const st = statSync(resolvePath(p));
                sftp.attrs(reqid, {
                  mode: st.mode,
                  uid: st.uid,
                  gid: st.gid,
                  size: st.size,
                  atime: Math.floor(st.atimeMs / 1000),
                  mtime: Math.floor(st.mtimeMs / 1000),
                });
              } catch {
                sftp.status(reqid, sshUtils.sftp.STATUS_CODE.FAILURE);
              }
            };
            sftp.on("STAT", onStat);
            sftp.on("LSTAT", onStat);
          });
        });
      });
    });
    server.on("error", (e: Error) => {
      if (isAddrInUse(e)) {
        console.warn(
          `[sftp] port ${port} already in use — skipping (stop duplicate \`npm run dev\` if unexpected)`,
        );
        state.sftpStarted = true;
        return;
      }
      console.error("[sftp] failed to start", e);
      state.sftpStarted = false;
    });
    server.listen(port, "0.0.0.0", () => {
      console.log(`[sftp] listening on :${port}`);
    });
  } catch (e) {
    if (isAddrInUse(e)) {
      console.warn(
        `[sftp] port ${port} already in use — skipping (stop duplicate \`npm run dev\` if unexpected)`,
      );
      state.sftpStarted = true;
      return;
    }
    console.error("[sftp] failed to start", e);
    state.sftpStarted = false;
  }
}
