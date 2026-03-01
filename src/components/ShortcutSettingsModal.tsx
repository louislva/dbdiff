import { useState, useEffect, useRef } from "react";
import type { ShortcutAction } from "../types";
import { useHotkey, formatShortcutDisplay } from "../stores/hooks";
import { useStore } from "../stores";

// Human-readable labels for each shortcut action
const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  newConsole: "New Console",
  closeInnerTab: "Close Tab",
  nextInnerTab: "Next Tab",
  prevInnerTab: "Previous Tab",
  newConnectionTab: "New Connection Tab",
  closeConnectionTab: "Close Connection Tab",
  nextConnectionTab: "Next Connection",
  prevConnectionTab: "Previous Connection",
  runQuery: "Run Query",
  closeModal: "Close Modal",
  openTableSwitcher: "Switch Table",
  openDatabaseSwitcher: "Switch Database",
  deleteRows: "Delete Rows",
  selectAll: "Select All",
  refreshTable: "Refresh Table",
};

// Default shortcuts (keep in sync with store.ts BROWSER_SHORTCUTS)
const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  newConsole: "alt+t",
  closeInnerTab: "alt+w",
  nextInnerTab: "alt+tab",
  prevInnerTab: "alt+shift+tab",
  newConnectionTab: "mod+alt+n",
  closeConnectionTab: "mod+alt+w",
  prevConnectionTab: "mod+alt+j",
  nextConnectionTab: "mod+alt+k",
  runQuery: "ctrl+enter",
  closeModal: "escape",
  openTableSwitcher: "mod+o",
  openDatabaseSwitcher: "mod+p",
  deleteRows: "delete",
  selectAll: "mod+a",
  refreshTable: "mod+r",
};

const ALL_ACTIONS: ShortcutAction[] = [
  "newConsole",
  "closeInnerTab",
  "nextInnerTab",
  "prevInnerTab",
  "newConnectionTab",
  "closeConnectionTab",
  "nextConnectionTab",
  "prevConnectionTab",
  "runQuery",
  "closeModal",
  "openTableSwitcher",
  "openDatabaseSwitcher",
  "deleteRows",
  "selectAll",
  "refreshTable",
];

interface ShortcutSettingsModalProps {
  onClose: () => void;
}

interface ShortcutRowProps {
  action: ShortcutAction;
  currentShortcut: string;
  isCustom: boolean;
  onEdit: (action: ShortcutAction) => void;
  onReset: (action: ShortcutAction) => void;
}

function ShortcutRow({
  action,
  currentShortcut,
  isCustom,
  onEdit,
  onReset,
}: ShortcutRowProps) {
  const defaultShortcut = DEFAULT_SHORTCUTS[action];

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-stone-100 dark:border-white/5 last:border-b-0">
      <div className="flex-1">
        <div className="text-[14px] text-primary font-medium">
          {SHORTCUT_LABELS[action]}
        </div>
        {isCustom && (
          <div className="text-[11px] text-tertiary mt-0.5">
            Default: {formatShortcutDisplay(defaultShortcut)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(action)}
          className={`px-3 py-1.5 text-[13px] font-mono rounded-md transition-colors ${
            isCustom
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
              : "bg-stone-100 dark:bg-white/5 text-secondary hover:bg-stone-200 dark:hover:bg-white/10"
          }`}
        >
          {formatShortcutDisplay(currentShortcut)}
        </button>
        {isCustom && (
          <button
            onClick={() => onReset(action)}
            className="p-1.5 text-tertiary hover:text-secondary transition-colors"
            title="Reset to default"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

interface RecordingOverlayProps {
  action: ShortcutAction;
  onCancel: () => void;
  onSave: (keys: string) => void;
}

function RecordingOverlay({ action, onCancel, onSave }: RecordingOverlayProps) {
  const [recordedKeys, setRecordedKeys] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore lone modifier keys
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        return;
      }

      // Build the shortcut string
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("ctrl");
      if (e.altKey) parts.push("alt");
      if (e.shiftKey) parts.push("shift");

      // Handle special keys — use e.code for Alt+letter on macOS
      let key = e.key.toLowerCase();
      if (e.altKey && e.code.startsWith("Key")) {
        key = e.code.slice(3).toLowerCase();
      }
      if (key === " ") key = "space";
      if (key === "escape") {
        // If pressing escape with no modifiers, cancel
        if (parts.length === 0) {
          onCancel();
          return;
        }
      }

      parts.push(key);
      setRecordedKeys(parts.join("+"));
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-stone-200 dark:border-white/10">
        <h3 className="text-[16px] font-semibold text-primary mb-2">
          Set shortcut for "{SHORTCUT_LABELS[action]}"
        </h3>
        <p className="text-[13px] text-secondary mb-6">
          Press the key combination you want to use, or Esc to cancel.
        </p>

        <div className="flex items-center justify-center py-8 mb-6 bg-stone-50 dark:bg-white/5 rounded-lg border border-stone-200 dark:border-white/10">
          {recordedKeys ? (
            <span className="text-[20px] font-mono text-primary">
              {formatShortcutDisplay(recordedKeys)}
            </span>
          ) : (
            <span className="text-[14px] text-tertiary">
              Waiting for input...
            </span>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-[14px] font-medium text-secondary bg-stone-100 dark:bg-white/5 hover:bg-stone-200 dark:hover:bg-white/10 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => recordedKeys && onSave(recordedKeys)}
            disabled={!recordedKeys}
            className="flex-1 px-4 py-2.5 text-[14px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShortcutSettingsModal({ onClose }: ShortcutSettingsModalProps) {
  const shortcutOverrides = useStore((s) => s.shortcutOverrides);
  const setShortcut = useStore((s) => s.setShortcut);
  const resetShortcut = useStore((s) => s.resetShortcut);
  const resetAllShortcuts = useStore((s) => s.resetAllShortcuts);

  const [editingAction, setEditingAction] = useState<ShortcutAction | null>(
    null,
  );

  // Only use escape to close when not recording a shortcut
  useHotkey("closeModal", () => {
    if (!editingAction) {
      onClose();
    }
  });

  function getCurrentShortcut(action: ShortcutAction): string {
    return shortcutOverrides[action] ?? DEFAULT_SHORTCUTS[action];
  }

  function isCustom(action: ShortcutAction): boolean {
    return action in shortcutOverrides;
  }

  function handleSaveShortcut(keys: string) {
    if (editingAction) {
      setShortcut(editingAction, keys);
      setEditingAction(null);
    }
  }

  const hasAnyCustom = ALL_ACTIONS.some((action) => isCustom(action));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-md mx-4 border border-stone-200 dark:border-white/10 max-h-[80vh] flex flex-col">
          <div className="p-6 pb-0 shrink-0">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[18px] font-semibold text-primary">
                Keyboard Shortcuts
              </h2>
              {hasAnyCustom && (
                <button
                  onClick={resetAllShortcuts}
                  className="text-[12px] text-tertiary hover:text-secondary transition-colors"
                >
                  Reset All
                </button>
              )}
            </div>
          </div>

          <div className="px-6 pb-4 overflow-y-auto min-h-0">
            <div className="divide-y divide-stone-100 dark:divide-white/5">
              {ALL_ACTIONS.map((action) => (
                <ShortcutRow
                  key={action}
                  action={action}
                  currentShortcut={getCurrentShortcut(action)}
                  isCustom={isCustom(action)}
                  onEdit={setEditingAction}
                  onReset={resetShortcut}
                />
              ))}
            </div>
          </div>

          <div className="p-6 pt-4 border-t border-stone-200 dark:border-white/10 shrink-0">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 text-[14px] font-medium text-secondary bg-stone-100 dark:bg-white/5 hover:bg-stone-200 dark:hover:bg-white/10 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {editingAction && (
        <RecordingOverlay
          action={editingAction}
          onCancel={() => setEditingAction(null)}
          onSave={handleSaveShortcut}
        />
      )}
    </>
  );
}
