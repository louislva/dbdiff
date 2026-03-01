/**
 * Patches the Electron.app Info.plist so the macOS menu bar shows "dbdiff"
 * instead of "Electron" during development.
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const electronPath = dirname(require.resolve("electron"));
const plistPath = join(
  electronPath,
  "dist",
  "Electron.app",
  "Contents",
  "Info.plist",
);

const appName = "dbdiff";
let plist = readFileSync(plistPath, "utf8");

plist = plist.replace(
  /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
  `$1${appName}$2`,
);
plist = plist.replace(
  /(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/,
  `$1${appName}$2`,
);

writeFileSync(plistPath, plist);
