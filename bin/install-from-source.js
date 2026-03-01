#!/usr/bin/env node
import { execSync } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.platform !== "darwin") {
  console.error("install-from-source is currently only supported on macOS.");
  process.exit(1);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
);

console.log(`\nInstalling dbdiff v${pkg.version}...\n`);

// --- Step 1: Install globally (skip if already running from global) ---

const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
const packageDir = path.join(globalRoot, "dbdiff-app");
const alreadyGlobal =
  fs.existsSync(packageDir) && __dirname.startsWith(globalRoot);

if (alreadyGlobal) {
  console.log("Already installed globally, skipping npm install.");
} else {
  console.log("Installing npm package globally...");
  try {
    execSync(`npm install -g dbdiff-app@${pkg.version}`, {
      stdio: "inherit",
    });
  } catch {
    console.error(
      "\nFailed to install globally. You may need to run with sudo:",
    );
    console.error("  sudo npx dbdiff-app install-from-source\n");
    process.exit(1);
  }
}

if (!fs.existsSync(packageDir)) {
  console.error(`Could not find global install at ${packageDir}`);
  process.exit(1);
}

// --- Step 2: Install Electron into the global package ---
// (electron is a devDependency so npm doesn't install it globally —
//  we install it separately into the package's node_modules)

const electronDir = path.join(packageDir, "node_modules", "electron");
if (!fs.existsSync(electronDir)) {
  console.log("Installing Electron...");
  execSync(`npm install --no-save --prefix "${packageDir}" electron@^35.1.2`, {
    stdio: "inherit",
  });
}

// --- Step 3: Resolve Electron binary path ---

const require2 = createRequire(path.join(packageDir, "package.json"));
const electronBin = require2("electron");

// Electron.app is 3 levels up from the binary:
//   .../Electron.app/Contents/MacOS/Electron
const electronAppDir = path.resolve(electronBin, "..", "..", "..");

// --- Step 4: Patch Electron.app for dbdiff branding ---

// Patch Info.plist so menu bar shows "dbdiff" and Dock uses our icon
const electronPlistPath = path.join(electronAppDir, "Contents", "Info.plist");
if (fs.existsSync(electronPlistPath)) {
  let plist = fs.readFileSync(electronPlistPath, "utf8");
  plist = plist.replace(
    /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
    "$1dbdiff$2",
  );
  plist = plist.replace(
    /(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/,
    "$1dbdiff$2",
  );
  plist = plist.replace(
    /(<key>CFBundleIconFile<\/key>\s*<string>)[^<]*(<\/string>)/,
    "$1dbdiff$2",
  );
  fs.writeFileSync(electronPlistPath, plist);
}

// Copy our icon into Electron.app's Resources (for Dock icon)
const iconSrc = path.join(packageDir, "electron", "icon.icns");
const electronResourcesDir = path.join(electronAppDir, "Contents", "Resources");
if (fs.existsSync(iconSrc) && fs.existsSync(electronResourcesDir)) {
  fs.copyFileSync(iconSrc, path.join(electronResourcesDir, "dbdiff.icns"));
}

// --- Step 5: Kill existing dbdiff.app if running ---

let wasRunning = false;
try {
  execSync("pkill -f '/Applications/dbdiff.app'", { stdio: "pipe" });
  wasRunning = true;
  console.log("\nQuit running dbdiff instance.");
} catch {
  // Not running — that's fine
}

// --- Step 6: Create .app bundle in /Applications ---

const appDir = "/Applications/dbdiff.app";
const contentsDir = path.join(appDir, "Contents");
const macOSDir = path.join(contentsDir, "MacOS");
const resourcesDir = path.join(contentsDir, "Resources");

if (fs.existsSync(appDir)) {
  console.log("Removing existing /Applications/dbdiff.app...");
  fs.rmSync(appDir, { recursive: true });
}

fs.mkdirSync(macOSDir, { recursive: true });
fs.mkdirSync(resourcesDir, { recursive: true });

// Launcher script — uses absolute paths so it works from Finder/Spotlight
// (no PATH dependency, no node dependency at launch time)
const launcher = `#!/bin/bash
exec "${electronBin}" "${packageDir}"
`;
fs.writeFileSync(path.join(macOSDir, "dbdiff"), launcher, { mode: 0o755 });

// Info.plist
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>dbdiff</string>
    <key>CFBundleDisplayName</key>
    <string>dbdiff</string>
    <key>CFBundleIdentifier</key>
    <string>com.dbdiff.app</string>
    <key>CFBundleVersion</key>
    <string>${pkg.version}</string>
    <key>CFBundleShortVersionString</key>
    <string>${pkg.version}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>dbdiff</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>`;
fs.writeFileSync(path.join(contentsDir, "Info.plist"), infoPlist);

// Copy icon
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(resourcesDir, "icon.icns"));
}

console.log("\nInstalled dbdiff to /Applications/dbdiff.app");
console.log("Launch it from Spotlight or your Applications folder.\n");

if (wasRunning) {
  console.log("Reopening dbdiff...");
  execSync("open /Applications/dbdiff.app");
}
