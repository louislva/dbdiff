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
execSync("npm run install-from-source", { cwd: packageDir, stdio: "inherit" });
