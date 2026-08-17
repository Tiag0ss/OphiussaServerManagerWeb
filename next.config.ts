import type { NextConfig } from "next";

function defaultDistDir() {
  if (process.env.OPHIUSSA_DIST_DIR) return process.env.OPHIUSSA_DIST_DIR;
  // next build / next start keep the project .next (standalone). Dev uses /tmp
  // so a leftover bind-mounted or root-owned .next cannot EACCES Turbopack.
  const isProdBuild =
    process.env.NODE_ENV === "production" ||
    process.argv.includes("build") ||
    process.argv.includes("start");
  return isProdBuild ? ".next" : "/tmp/ophiussa-next";
}

const nextConfig: NextConfig = {
  distDir: defaultDistDir(),
  output: "standalone",
  serverExternalPackages: [
    "better-sqlite3",
    "dockerode",
    "ssh2",
    "ftp-srv",
    "cpu-features",
  ],
};

export default nextConfig;
