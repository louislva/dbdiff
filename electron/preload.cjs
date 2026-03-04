const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("menu-action", handler);
    return () => ipcRenderer.removeListener("menu-action", handler);
  },
  setDatabaseMenuEnabled: (enabled) => {
    ipcRenderer.send("set-database-menu-enabled", enabled);
  },
  onCloudAuthCallback: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("cloud-auth-callback", handler);
    return () => ipcRenderer.removeListener("cloud-auth-callback", handler);
  },
  sendUpdateCheckResult: (result) => {
    ipcRenderer.send("update-check-result", result);
  },
  platform: process.platform,
});
