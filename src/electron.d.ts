interface ElectronAPI {
  onMenuAction: (callback: (action: string) => void) => () => void;
  setDatabaseMenuEnabled: (enabled: boolean) => void;
  onCloudAuthCallback: (
    callback: (data: { key: string; state: string }) => void,
  ) => () => void;
  platform: string;
}

interface Window {
  electronAPI?: ElectronAPI;
}
