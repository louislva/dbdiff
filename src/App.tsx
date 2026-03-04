import { useCallback, useEffect, useState, useRef } from "react";
import {
  useStore,
  useActiveDatabaseConfig,
  useOpenTableTab,
  useNewConsoleTab,
  useSyncDatabase,
  useCloudSync,
} from "./stores";

import { CLOUD_URL, LOCALHOST_SCANNING_ENABLED } from "./constants";
import {
  TabBar,
  InnerTabBar,
  Sidebar,
  ConnectionPicker,
  ConnectedView,
  NewConnectionModal,
  EditConnectionModal,
  MembersModal,
  ShortcutSettingsModal,
  Resizer,
  GlobalShortcuts,
  CommandPalette,
  DatabaseSwitcher,
  ScanSuccessModal,
  UpdateBanner,
} from "./components";
import type {
  DatabaseConfig,
  ScanLocalhostResponse,
  ExportType,
} from "./types";
import "./App.css";

const isElectronMac =
  navigator.userAgent.includes("Electron") &&
  navigator.userAgent.includes("Macintosh");

function App() {
  const connectionTabs = useStore((s) => s.connectionTabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const draggedTabId = useStore((s) => s.draggedTabId);
  const draggedInnerTabId = useStore((s) => s.draggedInnerTabId);
  const databaseConfigs = useStore((s) => s.databaseConfigs);
  const darkMode = useStore((s) => s.darkMode);
  const cloudApiKey = useStore((s) => s.cloudApiKey);
  const setCloudApiKey = useStore((s) => s.setCloudApiKey);
  const clearCloudApiKey = useStore((s) => s.clearCloudApiKey);

  const createConnectionTab = useStore((s) => s.createConnectionTab);
  const closeConnectionTab = useStore((s) => s.closeConnectionTab);
  const selectConnectionTab = useStore((s) => s.selectConnectionTab);
  const connectToDatabase = useStore((s) => s.connectToDatabase);
  const reorderConnectionTabs = useStore((s) => s.reorderConnectionTabs);
  const setDraggedTabId = useStore((s) => s.setDraggedTabId);
  const setDraggedInnerTabId = useStore((s) => s.setDraggedInnerTabId);
  const selectInnerTab = useStore((s) => s.selectInnerTab);
  const closeInnerTab = useStore((s) => s.closeInnerTab);
  const reorderInnerTabs = useStore((s) => s.reorderInnerTabs);
  const toggleDarkMode = useStore((s) => s.toggleDarkMode);
  const resetUIState = useStore((s) => s.resetUIState);
  const addConfig = useStore((s) => s.addConfig);
  const updateConfig = useStore((s) => s.updateConfig);
  const deleteConfig = useStore((s) => s.deleteConfig);

  const [showNewConnectionModal, setShowNewConnectionModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<DatabaseConfig | null>(
    null,
  );
  const [managingMembersConfig, setManagingMembersConfig] =
    useState<DatabaseConfig | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [showShortcutSettings, setShowShortcutSettings] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showDatabaseSwitcher, setShowDatabaseSwitcher] = useState(false);
  const [scanResultCount, setScanResultCount] = useState<number | null>(null);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(150, Math.min(w + delta, 500)));
  }, []);

  const activeDatabaseConfig = useActiveDatabaseConfig();
  const openTableTab = useOpenTableTab();
  const newConsoleTab = useNewConsoleTab();
  const { sync: syncDatabase, isSyncing } = useSyncDatabase(
    activeDatabaseConfig?.id,
  );

  // Auto-sync schema on first connection (when cache is empty)
  useEffect(() => {
    if (
      activeDatabaseConfig &&
      !activeDatabaseConfig.cache.schemas?.length &&
      !isSyncing
    ) {
      syncDatabase();
    }
  }, [activeDatabaseConfig?.id]);

  const {
    sync: syncCloud,
    isSyncing: isCloudSyncing,
    error: cloudSyncError,
    transferToCloud,
    transferringId,
    updateCloudConnection,
    isUpdating: isCloudUpdating,
    updateError: cloudUpdateError,
    deleteCloudConnection,
    isDeleting: isCloudDeleting,
    deleteError: cloudDeleteError,
  } = useCloudSync();

  const activeTab = connectionTabs.find((t) => t.id === activeTabId);
  const activeInnerTab = activeTab?.activeInnerTabId
    ? activeTab.innerTabs.find((t) => t.id === activeTab.activeInnerTabId)
    : null;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Handle cloud API key from URL query param (after redirect from cloud.dbdiff.app)
  // This path is used in the browser; in Electron the IPC callback below handles it.
  const hasProcessedCloudKey = useRef(false);
  useEffect(() => {
    if (hasProcessedCloudKey.current) return;

    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    const state = params.get("state");

    if (key && state) {
      hasProcessedCloudKey.current = true;

      // Verify state matches what we stored (CSRF protection)
      const expectedState = sessionStorage.getItem("cloud_link_state");
      if (state === expectedState) {
        setCloudApiKey(key);
        sessionStorage.removeItem("cloud_link_state");
      } else {
        console.warn("Cloud link state mismatch - ignoring key");
      }

      // Clear the query params from URL
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [setCloudApiKey]);

  // In Electron, the main process intercepts the auth popup redirect and sends
  // the key+state via IPC, so the main window updates without a manual refresh.
  useEffect(() => {
    if (!window.electronAPI?.onCloudAuthCallback) return;
    return window.electronAPI.onCloudAuthCallback(({ key, state }) => {
      const expectedState = sessionStorage.getItem("cloud_link_state");
      if (state === expectedState) {
        setCloudApiKey(key);
        sessionStorage.removeItem("cloud_link_state");
      } else {
        console.warn("Cloud link state mismatch - ignoring key");
      }
    });
  }, [setCloudApiKey]);

  // Auto-scan localhost on mount when there are no database configs
  const hasAutoScanned = useRef(false);
  useEffect(() => {
    if (
      LOCALHOST_SCANNING_ENABLED &&
      databaseConfigs.length === 0 &&
      !hasAutoScanned.current
    ) {
      hasAutoScanned.current = true;
      handleScanLocalhost();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync cloud connections on mount and when cloudApiKey changes
  const hasSyncedOnMount = useRef(false);
  useEffect(() => {
    if (cloudApiKey && !hasSyncedOnMount.current) {
      hasSyncedOnMount.current = true;
      syncCloud();
    }
    // Reset the flag if cloudApiKey is cleared
    if (!cloudApiKey) {
      hasSyncedOnMount.current = false;
    }
  }, [cloudApiKey, syncCloud]);

  // --- Electron native menu bridge (macOS only) ---
  async function handleExportFromMenu(exportType: ExportType) {
    if (!activeDatabaseConfig) return;
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection: activeDatabaseConfig.connection,
          exportType,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename =
        match?.[1] ?? `${activeDatabaseConfig.connection.database}.sql`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  }

  // Use a ref so the IPC listener always calls the latest handlers
  const menuHandlersRef = useRef<Record<string, () => void>>({});
  menuHandlersRef.current = {
    "shortcut-settings": () => setShowShortcutSettings(true),
    "scan-localhost": () => {
      if (LOCALHOST_SCANNING_ENABLED) handleScanLocalhost();
    },
    "reset-ui-state": resetUIState,
    "export-schema": () => handleExportFromMenu("schema"),
    "export-schema-and-data": () => handleExportFromMenu("schema-and-data"),
  };

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onMenuAction((action) => {
      menuHandlersRef.current[action]?.();
    });
  }, []);

  // Keep native Database menu enabled state in sync
  useEffect(() => {
    window.electronAPI?.setDatabaseMenuEnabled(!!activeDatabaseConfig);
  }, [activeDatabaseConfig]);

  function handleDragStart(e: React.DragEvent, tabId: string) {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, tabId: string) {
    e.preventDefault();
    if (!draggedTabId || draggedTabId === tabId) return;

    const draggedIndex = connectionTabs.findIndex((t) => t.id === draggedTabId);
    const targetIndex = connectionTabs.findIndex((t) => t.id === tabId);
    if (draggedIndex === targetIndex) return;

    reorderConnectionTabs(draggedIndex, targetIndex);
  }

  function handleDragEnd() {
    setDraggedTabId(null);
  }

  function handleInnerDragStart(e: React.DragEvent, tabId: string) {
    setDraggedInnerTabId(tabId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleInnerDragOver(e: React.DragEvent, tabId: string) {
    e.preventDefault();
    if (!draggedInnerTabId || draggedInnerTabId === tabId || !activeTab) return;

    const draggedIndex = activeTab.innerTabs.findIndex(
      (t) => t.id === draggedInnerTabId,
    );
    const targetIndex = activeTab.innerTabs.findIndex((t) => t.id === tabId);
    if (
      draggedIndex === -1 ||
      targetIndex === -1 ||
      draggedIndex === targetIndex
    )
      return;

    reorderInnerTabs(draggedIndex, targetIndex);
  }

  function handleInnerDragEnd() {
    setDraggedInnerTabId(null);
  }

  function handleAddNewConnection() {
    setShowNewConnectionModal(true);
  }

  function handleSaveNewConnection(config: DatabaseConfig) {
    addConfig(config);
    setShowNewConnectionModal(false);
  }

  function handleEditConnection(config: DatabaseConfig) {
    setEditingConfig(config);
  }

  function handleManageMembers(config: DatabaseConfig) {
    setManagingMembersConfig(config);
  }

  async function handleSaveEditedConnection(config: DatabaseConfig) {
    if (config.source === "cloud") {
      const result = await updateCloudConnection(config);
      if (!result.success) return; // don't close modal on error
    }
    updateConfig(config.id, config);
    setEditingConfig(null);
  }

  async function handleDeleteConnection(id: string) {
    // If it's a cloud connection, delete from cloud first
    if (editingConfig?.source === "cloud" && editingConfig.cloud?.id) {
      const result = await deleteCloudConnection(editingConfig.cloud.id);
      if (!result.success) return; // don't close modal on error
    }

    // Close any tabs using this connection
    connectionTabs
      .filter((tab) => tab.databaseConfigId === id)
      .forEach((tab) => closeConnectionTab(tab.id));
    deleteConfig(id);
    setEditingConfig(null);
  }

  const SCAN_COLORS = [
    "#ef4444",
    "#f59e0b",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
  ];

  async function handleScanLocalhost() {
    setIsScanning(true);
    try {
      const res = await fetch("/api/scan-localhost");
      const data: ScanLocalhostResponse = await res.json();
      const existing = new Set(
        databaseConfigs.map(
          (c) =>
            `${c.connection.host}:${c.connection.port}:${c.connection.database}:${c.connection.username}`,
        ),
      );
      let added = 0;
      data.databases.forEach((db, i) => {
        const key = `${db.host}:${db.port}:${db.database}:${db.username}`;
        if (!existing.has(key)) {
          existing.add(key);
          addConfig({
            id: (Date.now() + i).toString(),
            display: {
              name: `${db.database} (localhost)`,
              color: SCAN_COLORS[added % SCAN_COLORS.length],
            },
            connection: {
              type: "postgres",
              host: db.host,
              port: db.port,
              database: db.database,
              username: db.username,
              password: db.password,
            },
            cache: {},
            source: "local",
          });
          added++;
        }
      });
      if (added > 0) {
        setScanResultCount(added);
      }
    } catch {
      // silently fail — nothing running on 5432
    } finally {
      setIsScanning(false);
    }
  }

  function handleLinkCloud() {
    // Generate random state for CSRF protection
    const state = crypto.randomUUID();
    sessionStorage.setItem("cloud_link_state", state);

    const redirectUrl = `${window.location.origin}?state=${state}`;
    const linkUrl = `${CLOUD_URL}/link?redirect=${encodeURIComponent(redirectUrl)}`;
    window.open(linkUrl, "_blank");
  }

  return (
    <div className="flex flex-col h-screen bg-stone-50 dark:bg-[#0a0a0a] text-primary antialiased transition-colors duration-200">
      <UpdateBanner />
      <GlobalShortcuts
        onOpenTableSwitcher={() => setShowCommandPalette(true)}
        onOpenDatabaseSwitcher={() => setShowDatabaseSwitcher(true)}
      />
      <TabBar
        tabs={connectionTabs}
        activeTabId={activeTabId}
        draggedTabId={draggedTabId}
        databaseConfigs={databaseConfigs}
        darkMode={darkMode}
        onTabSelect={selectConnectionTab}
        onTabClose={closeConnectionTab}
        onNewTab={createConnectionTab}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onThemeToggle={toggleDarkMode}
        onOpenShortcutSettings={() => setShowShortcutSettings(true)}
        onScanLocalhost={
          LOCALHOST_SCANNING_ENABLED ? handleScanLocalhost : undefined
        }
        isScanning={isScanning}
        onResetUIState={resetUIState}
        activeDatabaseConfig={activeDatabaseConfig}
        hideMenus={isElectronMac}
      />

      {activeTab?.databaseConfigId && (
        <InnerTabBar
          innerTabs={activeTab.innerTabs}
          activeInnerTabId={activeTab.activeInnerTabId}
          draggedInnerTabId={draggedInnerTabId}
          onTabSelect={selectInnerTab}
          onTabClose={closeInnerTab}
          onNewConsole={newConsoleTab}
          onDragStart={handleInnerDragStart}
          onDragOver={handleInnerDragOver}
          onDragEnd={handleInnerDragEnd}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {activeTab?.databaseConfigId && (
          <>
            <Sidebar
              schemas={activeDatabaseConfig?.cache.schemas ?? []}
              databaseConfig={activeDatabaseConfig ?? null}
              onTableClick={openTableTab}
              onTableOpenNewTab={(tableName) =>
                openTableTab(tableName, { forceNew: true })
              }
              onRefresh={syncDatabase}
              isRefreshing={isSyncing}
              width={sidebarWidth}
              activeTableName={
                activeInnerTab?.type === "table" ? activeInnerTab.name : null
              }
            />
            <Resizer direction="horizontal" onResize={handleSidebarResize} />
          </>
        )}

        <div className="flex-1 overflow-auto bg-white dark:bg-[#0f0f0f]">
          {activeTab?.databaseConfigId ? (
            <ConnectedView
              name={activeTab.name}
              databaseConfig={activeDatabaseConfig ?? null}
              activeInnerTab={activeInnerTab ?? null}
            />
          ) : (
            <ConnectionPicker
              databaseConfigs={databaseConfigs}
              onConnect={connectToDatabase}
              onAddNew={handleAddNewConnection}
              onEdit={handleEditConnection}
              cloudApiKey={cloudApiKey}
              onLinkCloud={handleLinkCloud}
              onUnlinkCloud={clearCloudApiKey}
              onRefreshCloud={syncCloud}
              isCloudSyncing={isCloudSyncing}
              cloudSyncError={cloudSyncError}
              onTransferToCloud={transferToCloud}
              transferringId={transferringId}
              onManageMembers={handleManageMembers}
            />
          )}
        </div>
      </div>

      {showNewConnectionModal && (
        <NewConnectionModal
          onClose={() => setShowNewConnectionModal(false)}
          onSave={handleSaveNewConnection}
        />
      )}

      {editingConfig && (
        <EditConnectionModal
          config={editingConfig}
          onClose={() => setEditingConfig(null)}
          onSave={handleSaveEditedConnection}
          onDelete={handleDeleteConnection}
          isSaving={isCloudUpdating}
          saveError={cloudUpdateError}
          isDeleting={isCloudDeleting}
          deleteError={cloudDeleteError}
        />
      )}

      {managingMembersConfig && (
        <MembersModal
          config={managingMembersConfig}
          onClose={() => setManagingMembersConfig(null)}
        />
      )}

      {showShortcutSettings && (
        <ShortcutSettingsModal onClose={() => setShowShortcutSettings(false)} />
      )}

      {showCommandPalette && activeTab?.databaseConfigId && (
        <CommandPalette onClose={() => setShowCommandPalette(false)} />
      )}

      {showDatabaseSwitcher && (
        <DatabaseSwitcher onClose={() => setShowDatabaseSwitcher(false)} />
      )}

      {scanResultCount !== null && (
        <ScanSuccessModal
          count={scanResultCount}
          onClose={() => setScanResultCount(null)}
        />
      )}
    </div>
  );
}

export default App;
