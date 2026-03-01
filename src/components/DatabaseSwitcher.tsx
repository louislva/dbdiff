import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { useHotkey } from "../stores/hooks";
import { useStore } from "../stores/store";

interface DatabaseSwitcherProps {
  onClose: () => void;
}

export function DatabaseSwitcher({ onClose }: DatabaseSwitcherProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const databaseConfigs = useStore((state) => state.databaseConfigs);
  const connectionTabs = useStore((state) => state.connectionTabs);
  const selectConnectionTab = useStore((state) => state.selectConnectionTab);
  const createConnectionTab = useStore((state) => state.createConnectionTab);
  const connectToDatabase = useStore((state) => state.connectToDatabase);

  // Build list with "already open" status
  const items = useMemo(() => {
    return databaseConfigs.map((config) => {
      const openTab = connectionTabs.find(
        (t) => t.databaseConfigId === config.id,
      );
      return {
        id: config.id,
        name: config.display.name,
        color: config.display.color,
        connectionString: `${config.connection.host}:${config.connection.port}/${config.connection.database}`,
        isOpen: !!openTab,
        openTabId: openTab?.id ?? null,
      };
    });
  }, [databaseConfigs, connectionTabs]);

  // Fuse.js for fuzzy search
  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: ["name", "connectionString"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [items],
  );

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    return fuse.search(query).map((r) => r.item);
  }, [fuse, items, query]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement) return;
    const selectedElement = listElement.children[selectedIndex] as HTMLElement;
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  useHotkey("closeModal", onClose);

  const handleSelect = useCallback(
    (item: (typeof items)[0]) => {
      if (item.isOpen && item.openTabId) {
        // Switch to existing tab
        selectConnectionTab(item.openTabId);
      } else {
        // Open new connection tab and connect
        createConnectionTab();
        // connectToDatabase operates on the active tab, which is the one we just created
        connectToDatabase(item.id);
      }
      onClose();
    },
    [selectConnectionTab, createConnectionTab, connectToDatabase, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            handleSelect(filteredItems[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredItems, selectedIndex, handleSelect, onClose],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Content */}
      <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-lg mx-4 border border-stone-200 dark:border-white/10 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 dark:border-white/10">
          <svg
            className="w-5 h-5 text-tertiary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Switch database..."
            className="flex-1 bg-transparent text-primary placeholder-tertiary outline-none text-sm"
          />
          <kbd className="text-xs text-tertiary bg-stone-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-tertiary text-sm">
              {items.length === 0
                ? "No databases configured"
                : "No matching databases"}
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`
                  flex items-center gap-3 px-4 py-2.5 cursor-pointer
                  ${
                    index === selectedIndex
                      ? "bg-stone-100 dark:bg-white/5"
                      : "hover:bg-stone-50 dark:hover:bg-white/[0.02]"
                  }
                `}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-primary text-sm">{item.name}</span>
                  <span className="text-tertiary text-xs ml-2">
                    {item.connectionString}
                  </span>
                </div>
                {item.isOpen && (
                  <span className="text-xs text-tertiary bg-stone-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                    open
                  </span>
                )}
                {index === selectedIndex && (
                  <kbd className="text-xs text-tertiary bg-stone-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                    ↵
                  </kbd>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
