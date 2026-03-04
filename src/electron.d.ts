interface ElectronAPI {
  onMenuAction: (callback: (action: string) => void) => () => void;
  setDatabaseMenuEnabled: (enabled: boolean) => void;
  onCloudAuthCallback: (
    callback: (data: { key: string; state: string }) => void,
  ) => () => void;
  sendUpdateCheckResult: (result: {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string | null;
  }) => void;
  platform: string;
}

interface Window {
  electronAPI?: ElectronAPI;
}
