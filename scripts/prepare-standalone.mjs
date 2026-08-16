import { cpSync, existsSync, mkdirSync } from "fs";
import path from "path";

const root = process.cwd();
const standalone = path.join(root, ".next/standalone");

if (!existsSync(standalone)) {
  console.warn("No standalone output — skip prepare");
  process.exit(0);
}

function copy(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

copy(path.join(root, "public"), path.join(standalone, "public"));
copy(path.join(root, ".next/static"), path.join(standalone, ".next/static"));
copy(path.join(root, "templates"), path.join(standalone, "templates"));
console.log("Standalone package prepared");
