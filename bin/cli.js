#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.join(__dirname, "..");
const command = process.argv[2];

if (command !== "install-from-source") {
  console.log("Usage: npx dbdiff-app install-from-source");
  console.log("  Builds dbdiff from source and installs to /Applications/");
  process.exit(command ? 1 : 0);
}

if (process.platform !== "darwin") {
  console.error("install-from-source is currently macOS only.");
  process.exit(1);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"),
);

console.log(`\nInstalling dbdiff v${pkg.version} from source...\n`);

// Step 1: Install all dependencies (including devDependencies needed for building)
console.log("Installing dependencies...");
execSync("npm install --include=dev", { cwd: packageDir, stdio: "inherit" });

// Step 2: Build the Electron app
console.log("\nBuilding...");
execSync("npm run build:electron", { cwd: packageDir, stdio: "inherit" });

// Step 3: Find the built .app bundle
const releaseDir = path.join(packageDir, "release");
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
  console.error("Build failed — could not find dbdiff.app in release/");
  process.exit(1);
}

// Step 4: Install to /Applications
const dest = "/Applications/dbdiff.app";

let wasRunning = false;
try {
  execSync("pkill -f '/Applications/dbdiff.app'", { stdio: "pipe" });
  wasRunning = true;
  console.log("\nQuit running dbdiff instance.");
} catch {
  // Not running — that's fine
}

if (fs.existsSync(dest)) {
  console.log("Removing existing /Applications/dbdiff.app...");
  execSync(`rm -rf "${dest}"`);
}

console.log(
  `Copying ${path.basename(path.dirname(appPath))}/dbdiff.app → /Applications/`,
);
execSync(`cp -R "${appPath}" "${dest}"`);

console.log("\nInstalled dbdiff to /Applications/dbdiff.app");
console.log("Launch it from Spotlight or your Applications folder.\n");

if (wasRunning) {
  console.log("Reopening dbdiff...");
  execSync("open /Applications/dbdiff.app");
}
