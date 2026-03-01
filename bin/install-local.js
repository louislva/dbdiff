#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.join(__dirname, "..", "release");

// Find the .app bundle — electron-builder outputs to release/mac-<arch>/
const entries = fs.readdirSync(releaseDir).filter((e) => e.startsWith("mac"));
let appPath = null;

for (const entry of entries) {
  const candidate = path.join(releaseDir, entry, "dbdiff.app");
  if (fs.existsSync(candidate)) {
    appPath = candidate;
    break;
  }
}

if (!appPath) {
  console.error(
    "Could not find dbdiff.app in release/. Run `npm run dist:dir` first.",
  );
  process.exit(1);
}

const dest = "/Applications/dbdiff.app";

// Kill dbdiff if it's currently running
let wasRunning = false;
try {
  execSync("pkill -f '/Applications/dbdiff.app'", { stdio: "pipe" });
  wasRunning = true;
  console.log("Quit running dbdiff instance.");
} catch {
  // pkill exits non-zero when no processes match — that's fine
}

if (fs.existsSync(dest)) {
  console.log("Removing existing /Applications/dbdiff.app...");
  execSync(`rm -rf "${dest}"`);
}

console.log(
  `Copying ${path.basename(path.dirname(appPath))}/dbdiff.app → /Applications/`,
);
execSync(`cp -R "${appPath}" "${dest}"`);

console.log("Installed!");

if (wasRunning) {
  console.log("Reopening dbdiff...");
  execSync("open /Applications/dbdiff.app");
}
