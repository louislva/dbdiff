// Waits for the Vite dev server to be ready, then launches Electron.
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VITE_URL = "http://localhost:4089";

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  console.log("Waiting for Vite dev server...");
  await waitForServer(VITE_URL);
  console.log("Vite ready — launching Electron");

  const electronBin = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ".bin",
    "electron",
  );
  const child = spawn(electronBin, ["."], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: VITE_URL },
  });

  child.on("close", (code) => process.exit(code));
}

main();
