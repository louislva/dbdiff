import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import type { ConnectionTab, DatabaseConfig } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import { DatabaseMenu } from "./DatabaseMenu";

const isElectron = navigator.userAgent.includes("Electron");
const dragStyle = isElectron
  ? ({ WebkitAppRegion: "drag" } as React.CSSProperties)
  : undefined;
const noDragStyle = isElectron
  ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties)
  : undefined;

interface TabBarProps {
  tabs: ConnectionTab[];
  activeTabId: string;
  draggedTabId: string | null;
  databaseConfigs: DatabaseConfig[];
  darkMode: boolean;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onDragStart: (e: React.DragEvent, tabId: string) => void;
  onDragOver: (e: React.DragEvent, tabId: string) => void;
  onDragEnd: () => void;
  onThemeToggle: () => void;
  onOpenShortcutSettings: () => void;
  onScanLocalhost?: () => void;
  isScanning: boolean;
  onResetUIState: () => void;
  activeDatabaseConfig?: DatabaseConfig | null;
  hideMenus?: boolean;
}

export function TabBar({
  tabs,
  activeTabId,
  draggedTabId,
  databaseConfigs,
  darkMode,
  onTabSelect,
  onTabClose,
  onNewTab,
  onDragStart,
  onDragOver,
  onDragEnd,
  onThemeToggle,
  onOpenShortcutSettings,
  onScanLocalhost,
  isScanning,
  onResetUIState,
  activeDatabaseConfig,
  hideMenus,
}: TabBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  return (
    <div
      className={`flex items-center h-11 bg-stone-100 dark:bg-[#0a0a0a] border-b border-stone-200 dark:border-white/[0.06] px-3 gap-1${isElectron ? " pl-[80px]" : ""}`}
      style={dragStyle}
    >
      {!hideMenus && (
        <div className="relative mr-2" ref={menuRef} style={noDragStyle}>
          <button
            className="px-3 h-8 rounded-md text-[13px] font-semibold text-secondary hover:text-primary hover:bg-stone-200/50 dark:hover:bg-white/[0.06] transition-all duration-150"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            dbdiff
          </button>
          {menuOpen && (
            <div className="absolute top-full left-0 mt-1 p-1 min-w-[200px] bg-white/90 dark:bg-[#2a2a2a]/90 backdrop-blur-xl border border-stone-200/50 dark:border-white/10 rounded-lg shadow-xl z-50">
              <button
                className="w-full px-2.5 py-1 text-left text-[13px] text-primary rounded-md hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenShortcutSettings();
                }}
              >
                Shortcut Settings
              </button>
              {onScanLocalhost && (
                <button
                  className="w-full px-2.5 py-1 text-left text-[13px] text-primary rounded-md hover:bg-stone-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                  disabled={isScanning}
                  onClick={() => {
                    setMenuOpen(false);
                    onScanLocalhost();
                  }}
                >
                  {isScanning ? "Scanning..." : "Scan Localhost"}
                </button>
              )}
              <div className="my-1 border-t border-stone-200/50 dark:border-white/10" />
              <button
                className="w-full px-2.5 py-1 text-left text-[13px] text-primary rounded-md hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onResetUIState();
                }}
              >
                Reset UI State
              </button>
            </div>
          )}
        </div>
      )}
      {!hideMenus && activeDatabaseConfig && (
        <div style={noDragStyle}>
          <DatabaseMenu databaseConfig={activeDatabaseConfig} />
        </div>
      )}
      {tabs.map((tab) => {
        const config = tab.databaseConfigId
          ? databaseConfigs.find((c) => c.id === tab.databaseConfigId)
          : null;
        return (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => onDragStart(e, tab.id)}
            onDragOver={(e) => onDragOver(e, tab.id)}
            onDragEnd={onDragEnd}
            style={noDragStyle}
            className={`group flex items-center gap-2 pl-4 pr-2 h-8 rounded-md cursor-pointer select-none transition-all duration-150 ${
              tab.id === activeTabId
                ? "bg-white dark:bg-white/[0.08] text-primary shadow-sm dark:shadow-none"
                : "text-secondary hover:text-primary hover:bg-stone-200/50 dark:hover:bg-white/[0.04]"
            } ${draggedTabId === tab.id ? "opacity-50" : ""}`}
            onClick={() => onTabSelect(tab.id)}
          >
            {config && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.display.color }}
              />
            )}
            <span className="text-[13px] font-medium tracking-[-0.01em] truncate max-w-[140px]">
              {tab.name}
            </span>
            <button
              className="w-5 h-5 flex items-center justify-center rounded-full transition-all hover:bg-stone-200 dark:hover:bg-white/10 opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
      <button
        className="w-8 h-8 flex items-center justify-center rounded-md text-interactive hover:bg-stone-200/50 dark:hover:bg-white/[0.04] transition-all duration-150 focus:outline-none"
        style={noDragStyle}
        onClick={onNewTab}
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>

      <div className="ml-auto" style={noDragStyle}>
        <ThemeToggle darkMode={darkMode} onToggle={onThemeToggle} />
      </div>
    </div>
  );
}
