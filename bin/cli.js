#!/usr/bin/env node
import { spawn } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, "..");

// The `electron` npm package exports the path to the electron binary
const require = createRequire(import.meta.url);
let electronPath;
try {
  electronPath = require("electron");
} catch {
  console.error("Electron not found.\n");
  process.exit(1);
}

// Patch Electron.app Info.plist so macOS menu bar shows "dbdiff"
if (process.platform === "darwin") {
  await import("../electron/patch-dev-plist.js");
}

// Pass the app directory so Electron reads package.json for name + main entry
const child = spawn(electronPath, [appPath], { stdio: "inherit" });

child.on("close", (code) => {
  process.exit(code ?? 0);
});
