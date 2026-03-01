import { useCallback, useEffect } from "react";
import { useHotkey, useNewConsoleTab } from "../stores/hooks";
import { useStore } from "../stores/store";

interface GlobalShortcutsProps {
  onOpenTableSwitcher: () => void;
  onOpenDatabaseSwitcher: () => void;
}

/**
 * Registers global keyboard shortcuts for the app.
 * Render this once at the app root.
 */
export function GlobalShortcuts({
  onOpenTableSwitcher,
  onOpenDatabaseSwitcher,
}: GlobalShortcutsProps) {
  // Prevent default on all ctrl/cmd shortcuts to avoid browser interference
  useEffect(() => {
    const isElectron = navigator.userAgent.includes("Electron");

    const handler = (e: KeyboardEvent) => {
      // Only intercept when ctrl or cmd is pressed (but not just shift/alt alone)
      if (!e.ctrlKey && !e.metaKey) return;

      const target = e.target as HTMLElement;
      const key = e.key.toLowerCase();

      // For CodeMirror editors: only prevent default for keys used by app shortcuts.
      // Let all other key combos through so CodeMirror handles them (Cmd+D, Cmd+/, etc.)
      const isInCodeMirror = !!target.closest?.(".cm-editor");
      if (isInCodeMirror) {
        const appShortcutKeys = new Set([
          "t",
          "w",
          "p",
          "o",
          "r",
          "k",
          "j",
          "tab",
          "enter",
        ]);
        if (appShortcutKeys.has(key)) {
          e.preventDefault();
        }
        return;
      }

      // In Electron, let Cmd+Q through so the app can quit natively
      if (isElectron && e.metaKey && key === "q") return;

      // Allow standard text editing shortcuts in input fields
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Always allow these text editing shortcuts in inputs
      const textEditingKeys = ["c", "v", "x", "z", "a"];
      if (isInput && textEditingKeys.includes(key) && !e.shiftKey) {
        return;
      }

      // Prevent default for all other ctrl/cmd combinations
      e.preventDefault();
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, []);
  const selectInnerTab = useStore((state) => state.selectInnerTab);
  const closeInnerTab = useStore((state) => state.closeInnerTab);
  const selectConnectionTab = useStore((state) => state.selectConnectionTab);
  const createConnectionTab = useStore((state) => state.createConnectionTab);
  const closeConnectionTab = useStore((state) => state.closeConnectionTab);
  const connectionTabs = useStore((state) => state.connectionTabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const getActiveTab = useStore((state) => state.getActiveTab);
  const newConsoleTab = useNewConsoleTab();

  // New console tab
  useHotkey(
    "newConsole",
    useCallback(() => {
      const activeTab = getActiveTab();
      if (activeTab?.databaseConfigId) {
        newConsoleTab();
      }
    }, [getActiveTab, newConsoleTab]),
  );

  // Close inner tab
  useHotkey(
    "closeInnerTab",
    useCallback(() => {
      const activeTab = getActiveTab();
      if (activeTab?.activeInnerTabId) {
        closeInnerTab(activeTab.activeInnerTabId);
      }
    }, [getActiveTab, closeInnerTab]),
  );

  // Next inner tab
  useHotkey(
    "nextInnerTab",
    useCallback(() => {
      const activeTab = getActiveTab();
      if (!activeTab || activeTab.innerTabs.length === 0) return;
      const currentIndex = activeTab.innerTabs.findIndex(
        (t) => t.id === activeTab.activeInnerTabId,
      );
      const nextIndex = (currentIndex + 1) % activeTab.innerTabs.length;
      selectInnerTab(activeTab.innerTabs[nextIndex].id);
    }, [getActiveTab, selectInnerTab]),
  );

  // Previous inner tab
  useHotkey(
    "prevInnerTab",
    useCallback(() => {
      const activeTab = getActiveTab();
      if (!activeTab || activeTab.innerTabs.length === 0) return;
      const currentIndex = activeTab.innerTabs.findIndex(
        (t) => t.id === activeTab.activeInnerTabId,
      );
      const prevIndex =
        (currentIndex - 1 + activeTab.innerTabs.length) %
        activeTab.innerTabs.length;
      selectInnerTab(activeTab.innerTabs[prevIndex].id);
    }, [getActiveTab, selectInnerTab]),
  );

  // New connection tab
  useHotkey(
    "newConnectionTab",
    useCallback(() => {
      createConnectionTab();
    }, [createConnectionTab]),
  );

  // Close connection tab
  useHotkey(
    "closeConnectionTab",
    useCallback(() => {
      if (activeTabId) {
        closeConnectionTab(activeTabId);
      }
    }, [activeTabId, closeConnectionTab]),
  );

  // Next connection tab
  useHotkey(
    "nextConnectionTab",
    useCallback(() => {
      if (connectionTabs.length === 0) return;
      const currentIndex = connectionTabs.findIndex(
        (t) => t.id === activeTabId,
      );
      const nextIndex = (currentIndex + 1) % connectionTabs.length;
      selectConnectionTab(connectionTabs[nextIndex].id);
    }, [connectionTabs, activeTabId, selectConnectionTab]),
  );

  // Previous connection tab
  useHotkey(
    "prevConnectionTab",
    useCallback(() => {
      if (connectionTabs.length === 0) return;
      const currentIndex = connectionTabs.findIndex(
        (t) => t.id === activeTabId,
      );
      const prevIndex =
        (currentIndex - 1 + connectionTabs.length) % connectionTabs.length;
      selectConnectionTab(connectionTabs[prevIndex].id);
    }, [connectionTabs, activeTabId, selectConnectionTab]),
  );

  // Open table switcher
  useHotkey(
    "openTableSwitcher",
    useCallback(() => {
      const activeTab = getActiveTab();
      if (activeTab?.databaseConfigId) {
        onOpenTableSwitcher();
      }
    }, [getActiveTab, onOpenTableSwitcher]),
  );

  // Open database switcher
  useHotkey(
    "openDatabaseSwitcher",
    useCallback(() => {
      onOpenDatabaseSwitcher();
    }, [onOpenDatabaseSwitcher]),
  );

  // This component doesn't render anything
  return null;
}
