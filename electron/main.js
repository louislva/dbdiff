import { app, BrowserWindow, Menu, ipcMain, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === "darwin";

let win;
const devServerURL = process.env.VITE_DEV_SERVER_URL;
const serverPort = process.env.PORT || "4088";

// Database menu items — kept as references so we can enable/disable them
let exportSchemaItem;
let exportSchemaAndDataItem;

function sendMenuAction(action) {
  win?.webContents.send("menu-action", action);
}

function buildMenu() {
  exportSchemaItem = {
    label: "Export Schema",
    enabled: false,
    click: () => sendMenuAction("export-schema"),
  };
  exportSchemaAndDataItem = {
    label: "Export Schema + Data",
    enabled: false,
    click: () => sendMenuAction("export-schema-and-data"),
  };

  const template = [
    // App menu (macOS only) — includes dbdiff-specific items
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Shortcut Settings...",
                click: () => sendMenuAction("shortcut-settings"),
              },
              {
                label: "Scan Localhost",
                click: () => sendMenuAction("scan-localhost"),
              },
              { type: "separator" },
              {
                label: "Check for Updates...",
                click: () => sendMenuAction("check-for-updates"),
              },
              {
                label: "Reset UI State",
                click: () => sendMenuAction("reset-ui-state"),
              },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    // Database menu (macOS only — on other platforms these stay in the web UI)
    ...(isMac
      ? [
          {
            label: "Database",
            submenu: [exportSchemaItem, exportSchemaAndDataItem],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  // In dev mode, the Express server is already running externally via tsx watch.
  // In production, we start it ourselves from the built output.
  if (!devServerURL) {
    const { serverReady } = await import("../dist-server/server/index.js");
    await serverReady;
  }

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, "icon.png"),
    titleBarStyle: isMac ? "hiddenInset" : "default",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  buildMenu();

  // Renderer tells us when a database is active so we can enable/disable menu items
  ipcMain.on("set-database-menu-enabled", (_event, enabled) => {
    if (exportSchemaItem) exportSchemaItem.enabled = enabled;
    if (exportSchemaAndDataItem) exportSchemaAndDataItem.enabled = enabled;
  });

  // Show native dialog with update check result
  ipcMain.on("update-check-result", (_event, { updateAvailable, currentVersion, latestVersion }) => {
    if (updateAvailable) {
      dialog.showMessageBox(win, {
        type: "info",
        title: "Update Available",
        message: `A new version of dbdiff is available!`,
        detail: `Current: v${currentVersion}\nLatest: v${latestVersion}\n\nRun the following to update:\nnpx dbdiff-app@latest install-from-source`,
        buttons: ["OK"],
      });
    } else {
      dialog.showMessageBox(win, {
        type: "info",
        title: "No Updates",
        message: `You're on the latest version (v${currentVersion}).`,
        buttons: ["OK"],
      });
    }
  });

  // In dev mode, load from Vite dev server (HMR). Otherwise use the Express server.
  // Handle child windows opened via window.open() (e.g. cloud auth popup).
  // When the auth flow redirects back to localhost with key+state params,
  // forward them to the main window and close the popup.
  win.webContents.on("did-create-window", (childWindow) => {
    childWindow.webContents.on("did-navigate", (_event, url) => {
      try {
        const parsed = new URL(url);
        if (
          (parsed.hostname === "localhost" ||
            parsed.hostname === "127.0.0.1") &&
          parsed.searchParams.has("key") &&
          parsed.searchParams.has("state")
        ) {
          win.webContents.send("cloud-auth-callback", {
            key: parsed.searchParams.get("key"),
            state: parsed.searchParams.get("state"),
          });
          childWindow.close();
        }
      } catch {
        // ignore malformed URLs
      }
    });
  });

  win.loadURL(devServerURL || `http://localhost:${serverPort}`);
}

app.whenReady().then(() => {
  if (isMac) {
    app.dock.setIcon(path.join(__dirname, "icon.png"));
  }
  createWindow().catch((err) => {
    console.error("Failed to create window:", err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
