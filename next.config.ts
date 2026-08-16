import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In Dev Containers, bind-mounted .next often ends up with mixed host/container
  // ownership and Turbopack fails with EACCES. Prefer a container-local path.
  distDir: process.env.OPHIUSSA_DIST_DIR || ".next",
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
