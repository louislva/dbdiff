import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import {
  useHotkey,
  useActiveDatabaseConfig,
  useOpenTableTab,
} from "../stores/hooks";

interface CommandPaletteProps {
  onClose: () => void;
}

interface TableItem {
  schema: string;
  name: string;
  fullName: string;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeDatabaseConfig = useActiveDatabaseConfig();
  const openTableTab = useOpenTableTab();

  // Build flat list of all tables with schema prefix
  const allTables = useMemo((): TableItem[] => {
    const schemas = activeDatabaseConfig?.cache?.schemas ?? [];
    const tables: TableItem[] = [];

    for (const schema of schemas) {
      for (const table of schema.tables) {
        const fullName =
          schema.name === "public"
            ? table.name
            : `${schema.name}.${table.name}`;
        tables.push({
          schema: schema.name,
          name: table.name,
          fullName,
        });
      }
    }

    // Sort alphabetically by full name
    return tables.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [activeDatabaseConfig]);

  // Fuse.js instance for fuzzy search
  const fuse = useMemo(
    () =>
      new Fuse(allTables, {
        keys: ["fullName"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [allTables],
  );

  // Filter tables based on query (fuzzy)
  const filteredTables = useMemo(() => {
    if (!query.trim()) return allTables;
    return fuse.search(query).map((r) => r.item);
  }, [fuse, allTables, query]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-focus input on mount
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

  // Close on escape
  useHotkey("closeModal", onClose);

  const handleSelect = useCallback(
    (table: TableItem, forceNew = false) => {
      openTableTab(table.fullName, { forceNew });
      onClose();
    },
    [openTableTab, onClose],
  );

  // Cmd/Ctrl+Enter to force open in new tab — window-level listener
  // so it works reliably regardless of input focus/modifier quirks
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        if (filteredTables[selectedIndex]) {
          handleSelect(filteredTables[selectedIndex], true);
        }
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [filteredTables, selectedIndex, handleSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredTables.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredTables[selectedIndex]) {
            handleSelect(filteredTables[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredTables, selectedIndex, handleSelect, onClose],
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
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tables..."
            className="flex-1 bg-transparent text-primary placeholder-tertiary outline-none text-sm"
          />
          <kbd className="text-xs text-tertiary bg-stone-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {filteredTables.length === 0 ? (
            <div className="px-4 py-8 text-center text-tertiary text-sm">
              {allTables.length === 0
                ? "No tables found"
                : "No matching tables"}
            </div>
          ) : (
            filteredTables.map((table, index) => (
              <div
                key={table.fullName}
                onClick={(e) => handleSelect(table, e.metaKey || e.ctrlKey)}
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
                <svg
                  className="w-4 h-4 text-tertiary flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-primary text-sm">{table.name}</span>
                  {table.schema !== "public" && (
                    <span className="text-tertiary text-xs ml-2">
                      {table.schema}
                    </span>
                  )}
                </div>
                {index === selectedIndex && (
                  <div className="flex items-center gap-1.5">
                    <kbd className="text-xs text-tertiary bg-stone-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                      ↵
                    </kbd>
                    <kbd className="text-xs text-tertiary bg-stone-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                      ⌘↵ new tab
                    </kbd>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
