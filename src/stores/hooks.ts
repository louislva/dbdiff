import { useCallback, useEffect, useRef } from "react";
import type {
  CellChange,
  ConsoleTabState,
  DiffResponse,
  InnerTab,
  QueryResponse,
  ShortcutAction,
  TableCellEditState,
  TableMetadata,
  TableTabState,
} from "../types";
import { PAGE_SIZE } from "../constants";
import { DEFAULT_SHORTCUTS, useStore } from "./store";

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

/**
 * Parse a shortcut string like "mod+shift+k" into its components.
 * "mod" maps to Cmd on Mac, Ctrl on Windows/Linux.
 */
function parseShortcut(shortcut: string) {
  const parts = shortcut.toLowerCase().split("+");
  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    key: parts[parts.length - 1],
  };
}

/**
 * Check if a keyboard event matches a shortcut config.
 */
function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  const isMac = navigator.platform.toUpperCase().includes("MAC");

  // "mod" = Cmd on Mac, Ctrl elsewhere
  const modPressed = isMac ? e.metaKey : e.ctrlKey;

  // On macOS, Alt+letter produces special characters (e.g. Alt+T → †).
  // Use e.code to get the physical key when Alt is held.
  let key = e.key.toLowerCase();
  if (e.altKey && e.code.startsWith("Key")) {
    key = e.code.slice(3).toLowerCase();
  }

  // Check modifiers
  if (parsed.mod && !modPressed) return false;
  // On Mac, accept Cmd as equivalent to Ctrl (so Cmd+Enter works like Ctrl+Enter)
  if (parsed.ctrl && !e.ctrlKey && !(isMac && e.metaKey)) return false;
  if (parsed.alt && !e.altKey) return false;
  if (parsed.shift && !e.shiftKey) return false;

  // Check that we don't have extra modifiers
  if (!parsed.mod && !parsed.ctrl && (e.ctrlKey || e.metaKey)) return false;
  if (!parsed.alt && e.altKey) return false;
  if (!parsed.shift && e.shiftKey) return false;

  // Check key
  const expectedKey = parsed.key;

  // Handle special keys
  if (expectedKey === "enter" && key === "enter") return true;
  if (expectedKey === "escape" && key === "escape") return true;
  if (expectedKey === "tab" && key === "tab") return true;
  if (expectedKey === "[" && key === "[") return true;
  if (expectedKey === "]" && key === "]") return true;
  // Handle delete key (also match backspace since Mac keyboards use backspace for Delete)
  if (expectedKey === "delete" && (key === "delete" || key === "backspace"))
    return true;

  return key === expectedKey;
}

interface UseHotkeyOptions {
  /** Only trigger when this is true */
  enabled?: boolean;
  /** Prevent default browser behavior */
  preventDefault?: boolean;
}

/**
 * Get the configured shortcut for an action (override or default)
 */
export function useShortcut(action: ShortcutAction): string {
  const override = useStore((state) => state.shortcutOverrides[action]);
  return override ?? DEFAULT_SHORTCUTS[action];
}

export function useHotkey(
  action: ShortcutAction,
  handler: () => void,
  options: UseHotkeyOptions = {},
) {
  const { enabled = true, preventDefault = true } = options;
  const shortcut = useShortcut(action);
  const handlerRef = useRef(handler);

  // Keep handler ref updated to avoid stale closures
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled || !shortcut) return;

    const listener = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea (unless it's a special case)
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const isContentEditable = target.isContentEditable;
      const isInCodeMirror = !!target.closest?.(".cm-editor");

      if (isInCodeMirror) {
        // In CodeMirror: block only shortcuts that conflict with text editing
        if (action === "deleteRows" || action === "selectAll") return;
      } else if (isInput || isContentEditable) {
        // In regular inputs: only allow specific shortcuts
        const allowInInput = action === "runQuery" || action === "closeModal";
        if (!allowInInput) return;
      }

      if (matchesShortcut(e, shortcut)) {
        if (preventDefault) {
          e.preventDefault();
        }
        handlerRef.current();
      }
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [shortcut, enabled, preventDefault, action]);
}

/**
 * Get the display string for a shortcut (e.g., "⌘T" or "Ctrl+T")
 */
export function useShortcutDisplay(action: ShortcutAction): string {
  const shortcut = useShortcut(action);
  return formatShortcutDisplay(shortcut);
}

export function formatShortcutDisplay(shortcut: string): string {
  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().includes("MAC");

  const parts = shortcut.toLowerCase().split("+");

  const symbols: string[] = [];
  for (const part of parts) {
    switch (part) {
      case "mod":
        symbols.push(isMac ? "⌘" : "Ctrl");
        break;
      case "ctrl":
        symbols.push(isMac ? "⌃" : "Ctrl");
        break;
      case "alt":
        symbols.push(isMac ? "⌥" : "Alt");
        break;
      case "shift":
        symbols.push(isMac ? "⇧" : "Shift");
        break;
      case "enter":
        symbols.push(isMac ? "↵" : "Enter");
        break;
      case "escape":
        symbols.push("Esc");
        break;
      case "delete":
        symbols.push(isMac ? "⌫" : "Del");
        break;
      case "backspace":
        symbols.push(isMac ? "⌫" : "Backspace");
        break;
      default:
        symbols.push(part.toUpperCase());
    }
  }

  return isMac ? symbols.join("") : symbols.join("+");
}

/** Get the database config for the currently active connection tab */
export function useActiveDatabaseConfig() {
  return useStore((state) => {
    const activeTab = state.connectionTabs.find(
      (t) => t.id === state.activeTabId,
    );
    if (!activeTab?.databaseConfigId) return null;
    return (
      state.databaseConfigs.find((c) => c.id === activeTab.databaseConfigId) ??
      null
    );
  });
}

export interface OpenTableTabOptions {
  whereClause?: string;
  forceNew?: boolean;
}

/** Open a table tab, or focus it if already open */
export function useOpenTableTab() {
  const addInnerTab = useStore((state) => state.addInnerTab);
  const selectInnerTab = useStore((state) => state.selectInnerTab);
  const getActiveTab = useStore((state) => state.getActiveTab);
  const initTableState = useStore((state) => state.initTableState);
  const updateTableState = useStore((state) => state.updateTableState);

  return (tableName: string, options?: OpenTableTabOptions) => {
    const activeTab = getActiveTab();

    // If a whereClause or forceNew is provided, always create a new tab (don't reuse)
    if (!options?.whereClause && !options?.forceNew) {
      const existingTab = activeTab?.innerTabs.find(
        (t) => t.type === "table" && t.name === tableName,
      );

      if (existingTab) {
        selectInnerTab(existingTab.id);

        // Trigger refresh if no pending changes
        const tableState = useStore.getState().tableStates[existingTab.id];
        if (tableState) {
          const hasPendingChanges =
            Object.keys(tableState.cellEditState.pendingChanges).length > 0 ||
            tableState.cellEditState.pendingNewRows.length > 0;

          if (!hasPendingChanges) {
            // Reset status to idle to trigger auto-execute in TableView
            updateTableState(existingTab.id, { status: "idle" });
          }
        }
        return;
      }
    }

    const newInnerTab: InnerTab = {
      id: Date.now().toString(),
      type: "table",
      name: tableName,
    };
    addInnerTab(newInnerTab);
    // Pass initial whereClause so it's set before auto-execute triggers
    initTableState(newInnerTab.id, tableName, options?.whereClause);
  };
}

/** Create a new console tab with auto-numbered name */
export function useNewConsoleTab() {
  const addInnerTab = useStore((state) => state.addInnerTab);
  const getActiveTab = useStore((state) => state.getActiveTab);
  const initConsoleState = useStore((state) => state.initConsoleState);

  return () => {
    const activeTab = getActiveTab();
    const consoleCount =
      activeTab?.innerTabs.filter((t) => t.type === "console").length ?? 0;

    const newInnerTab: InnerTab = {
      id: Date.now().toString(),
      type: "console",
      name: consoleCount === 0 ? "Console" : `Console ${consoleCount + 1}`,
    };
    addInnerTab(newInnerTab);
    initConsoleState(newInnerTab.id);
  };
}

/** Read the database config for the active connection tab (non-reactive, for use in callbacks) */
function getActiveDatabaseConfigSnapshot() {
  const state = useStore.getState();
  const activeTab = state.connectionTabs.find(
    (t) => t.id === state.activeTabId,
  );
  if (!activeTab?.databaseConfigId) return null;
  return (
    state.databaseConfigs.find((c) => c.id === activeTab.databaseConfigId) ??
    null
  );
}

const DEFAULT_CONSOLE_STATE: ConsoleTabState = {
  queryText: "",
  status: "idle",
  executionId: null,
  startedAt: null,
  completedAt: null,
  result: null,
  error: null,
  diffResult: null,
  lastAction: null,
};

/** Get console state for a specific tab */
export function useConsoleState(tabId: string) {
  const consoleState = useStore((state) => state.consoleStates[tabId]);
  const initConsoleState = useStore((state) => state.initConsoleState);

  // Initialize state if it doesn't exist
  if (!consoleState) {
    initConsoleState(tabId);
    return DEFAULT_CONSOLE_STATE;
  }

  return consoleState;
}

/** Hook for executing queries with race condition handling */
export function useConsoleExecution(tabId: string) {
  const updateConsoleState = useStore((state) => state.updateConsoleState);
  const getConsoleState = useCallback(
    () => useStore.getState().consoleStates[tabId],
    [tabId],
  );

  // Use ref to track current execution ID to handle race conditions
  const currentExecutionRef = useRef<string | null>(null);

  const execute = useCallback(async () => {
    const consoleState = getConsoleState();
    const databaseConfig = getActiveDatabaseConfigSnapshot();

    if (!consoleState || !databaseConfig || !consoleState.queryText.trim()) {
      return;
    }

    // Generate unique execution ID for race condition handling
    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    currentExecutionRef.current = executionId;

    // Set executing state
    updateConsoleState(tabId, {
      status: "executing",
      executionId,
      startedAt: Date.now(),
      completedAt: null,
      result: null,
      error: null,
      diffResult: null,
      lastAction: "run",
    });

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection: databaseConfig.connection,
          query: consoleState.queryText,
        }),
      });

      // Check if this execution is still current (race condition check)
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      const data = await response.json();

      // Double-check after async operation
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      if (!response.ok) {
        updateConsoleState(tabId, {
          status: "error",
          completedAt: Date.now(),
          error: data.error || "Query failed",
        });
      } else {
        updateConsoleState(tabId, {
          status: "completed",
          completedAt: Date.now(),
          result: data as QueryResponse,
        });
      }
    } catch (err) {
      // Check if this execution is still current
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      updateConsoleState(tabId, {
        status: "error",
        completedAt: Date.now(),
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [tabId, getConsoleState, updateConsoleState]);

  return { execute };
}

/** Hook for previewing query diff (rolled-back transaction) */
export function useConsoleDiff(tabId: string) {
  const updateConsoleState = useStore((state) => state.updateConsoleState);
  const getConsoleState = useCallback(
    () => useStore.getState().consoleStates[tabId],
    [tabId],
  );

  const currentExecutionRef = useRef<string | null>(null);

  const executeDiff = useCallback(async () => {
    const consoleState = getConsoleState();
    const databaseConfig = getActiveDatabaseConfigSnapshot();

    if (!consoleState || !databaseConfig || !consoleState.queryText.trim()) {
      return;
    }

    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    currentExecutionRef.current = executionId;

    updateConsoleState(tabId, {
      status: "executing",
      executionId,
      startedAt: Date.now(),
      completedAt: null,
      result: null,
      error: null,
      diffResult: null,
      lastAction: "diff",
    });

    try {
      const response = await fetch("/api/query-diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection: databaseConfig.connection,
          query: consoleState.queryText,
        }),
      });

      if (currentExecutionRef.current !== executionId) return;

      const data = await response.json();

      if (currentExecutionRef.current !== executionId) return;

      if (!response.ok) {
        updateConsoleState(tabId, {
          status: "error",
          completedAt: Date.now(),
          error: data.error || "Diff failed",
        });
      } else {
        updateConsoleState(tabId, {
          status: "completed",
          completedAt: Date.now(),
          diffResult: data as DiffResponse,
        });
      }
    } catch (err) {
      if (currentExecutionRef.current !== executionId) return;

      updateConsoleState(tabId, {
        status: "error",
        completedAt: Date.now(),
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [tabId, getConsoleState, updateConsoleState]);

  return { executeDiff };
}

// Table tab hooks

const DEFAULT_TABLE_STATE: TableTabState = {
  tableName: "",
  whereClause: "",
  sortColumns: [],
  currentPage: 0,
  totalRowCount: null,
  status: "idle",
  executionId: null,
  startedAt: null,
  completedAt: null,
  result: null,
  error: null,
  cellEditState: {
    selectedCell: null,
    selectedRange: null,
    isDragging: false,
    editingCell: null,
    editValue: "",
    pendingChanges: {},
    pendingNewRows: [],
    pendingDeletions: [],
  },
};

/** Get table state for a specific tab */
export function useTableState(tabId: string) {
  const tableState = useStore((state) => state.tableStates[tabId]);
  return tableState ?? DEFAULT_TABLE_STATE;
}

/** Hook for executing table queries with race condition handling */
export function useTableExecution(tabId: string) {
  const updateTableState = useStore((state) => state.updateTableState);
  const getTableState = useCallback(
    () => useStore.getState().tableStates[tabId],
    [tabId],
  );

  const currentExecutionRef = useRef<string | null>(null);

  const execute = useCallback(async () => {
    const tableState = getTableState();
    const databaseConfig = getActiveDatabaseConfigSnapshot();

    if (!tableState || !databaseConfig) {
      return;
    }

    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    currentExecutionRef.current = executionId;

    updateTableState(tabId, {
      status: "executing",
      executionId,
      startedAt: Date.now(),
      completedAt: null,
      // Keep previous result visible while loading
      error: null,
    });

    // Build WHERE fragment (shared between data and count queries)
    const whereFragment = tableState.whereClause.trim()
      ? ` WHERE ${tableState.whereClause}`
      : "";

    const quotedTable = getQuotedTableName(tableState.tableName);

    // Data query with LIMIT/OFFSET
    let dataQuery = `SELECT * FROM ${quotedTable}${whereFragment}`;
    if (tableState.sortColumns.length > 0) {
      const orderByParts = tableState.sortColumns.map(
        (s) => `"${s.column}" ${s.direction}`,
      );
      dataQuery += ` ORDER BY ${orderByParts.join(", ")}`;
    }
    const pageSize =
      databaseConfig.tableConfigs?.[tableState.tableName]?.pageSize ??
      PAGE_SIZE;
    dataQuery += ` LIMIT ${pageSize} OFFSET ${tableState.currentPage * pageSize}`;

    // Count query (no ORDER BY, no LIMIT)
    const countQuery = `SELECT COUNT(*) AS count FROM ${quotedTable}${whereFragment}`;

    try {
      const [dataResponse, countResponse] = await Promise.all([
        fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection: databaseConfig.connection,
            query: dataQuery,
          }),
        }),
        fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection: databaseConfig.connection,
            query: countQuery,
          }),
        }),
      ]);

      if (currentExecutionRef.current !== executionId) {
        return;
      }

      const [dataJson, countJson] = await Promise.all([
        dataResponse.json(),
        countResponse.json(),
      ]);

      if (currentExecutionRef.current !== executionId) {
        return;
      }

      if (!dataResponse.ok) {
        updateTableState(tabId, {
          status: "error",
          completedAt: Date.now(),
          error: dataJson.error || "Query failed",
        });
      } else {
        // Parse count — gracefully degrade if count query failed
        let totalRowCount: number | null = null;
        if (countResponse.ok && countJson.rows?.[0]?.count != null) {
          totalRowCount = parseInt(countJson.rows[0].count, 10);
        }

        updateTableState(tabId, {
          status: "completed",
          completedAt: Date.now(),
          result: dataJson as QueryResponse,
          totalRowCount,
        });
      }
    } catch (err) {
      if (currentExecutionRef.current !== executionId) {
        return;
      }

      updateTableState(tabId, {
        status: "error",
        completedAt: Date.now(),
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [tabId, getTableState, updateTableState]);

  return { execute };
}

// ============================================================================
// Cell Editing Hooks
// ============================================================================

/** Get cell edit state for a table tab */
export function useTableCellEdit(tabId: string) {
  const cellEditState = useStore(
    (state) => state.tableStates[tabId]?.cellEditState,
  );
  const selectCell = useStore((state) => state.selectCell);
  const selectCellRange = useStore((state) => state.selectCellRange);
  const setCellDragging = useStore((state) => state.setCellDragging);
  const startEditingCell = useStore((state) => state.startEditingCell);
  const updateEditValue = useStore((state) => state.updateEditValue);
  const commitCellEdit = useStore((state) => state.commitCellEdit);
  const cancelCellEdit = useStore((state) => state.cancelCellEdit);
  const clearPendingChanges = useStore((state) => state.clearPendingChanges);
  const revertCellChangeStore = useStore((state) => state.revertCellChange);
  const setCellToNullStore = useStore((state) => state.setCellToNull);
  const addNewRowStore = useStore((state) => state.addNewRow);
  const removeNewRowStore = useStore((state) => state.removeNewRow);
  const setNewRowValueStore = useStore((state) => state.setNewRowValue);
  const setNewRowToDefaultStore = useStore((state) => state.setNewRowToDefault);
  const pasteCellRangeStore = useStore((state) => state.pasteCellRange);
  const markRowsForDeletionStore = useStore(
    (state) => state.markRowsForDeletion,
  );

  const defaultState: TableCellEditState = {
    selectedCell: null,
    selectedRange: null,
    isDragging: false,
    editingCell: null,
    editValue: "",
    pendingChanges: {},
    pendingNewRows: [],
    pendingDeletions: [],
  };

  return {
    ...(cellEditState ?? defaultState),
    selectCell: useCallback(
      (cell: { rowIndex: number; columnName: string } | null) =>
        selectCell(tabId, cell),
      [tabId, selectCell],
    ),
    selectCellRange: useCallback(
      (
        range: {
          start: { rowIndex: number; columnName: string };
          end: { rowIndex: number; columnName: string };
        } | null,
      ) => selectCellRange(tabId, range),
      [tabId, selectCellRange],
    ),
    setCellDragging: useCallback(
      (isDragging: boolean) => setCellDragging(tabId, isDragging),
      [tabId, setCellDragging],
    ),
    startEditingCell: useCallback(
      (
        cell: { rowIndex: number; columnName: string },
        initialValue: string | null,
      ) => startEditingCell(tabId, cell, initialValue),
      [tabId, startEditingCell],
    ),
    updateEditValue: useCallback(
      (value: string) => updateEditValue(tabId, value),
      [tabId, updateEditValue],
    ),
    commitCellEdit: useCallback(
      () => commitCellEdit(tabId),
      [tabId, commitCellEdit],
    ),
    cancelCellEdit: useCallback(
      () => cancelCellEdit(tabId),
      [tabId, cancelCellEdit],
    ),
    clearPendingChanges: useCallback(
      () => clearPendingChanges(tabId),
      [tabId, clearPendingChanges],
    ),
    revertCellChange: useCallback(
      (cell: { rowIndex: number; columnName: string }) =>
        revertCellChangeStore(tabId, cell),
      [tabId, revertCellChangeStore],
    ),
    setCellToNull: useCallback(
      (cell: { rowIndex: number; columnName: string }) =>
        setCellToNullStore(tabId, cell),
      [tabId, setCellToNullStore],
    ),
    addNewRow: useCallback(
      () => addNewRowStore(tabId),
      [tabId, addNewRowStore],
    ),
    removeNewRow: useCallback(
      (tempId: string) => removeNewRowStore(tabId, tempId),
      [tabId, removeNewRowStore],
    ),
    setNewRowValue: useCallback(
      (
        tempId: string,
        columnName: string,
        value: string | null,
        isExplicit: boolean,
      ) => setNewRowValueStore(tabId, tempId, columnName, value, isExplicit),
      [tabId, setNewRowValueStore],
    ),
    setNewRowToDefault: useCallback(
      (tempId: string, columnName: string) =>
        setNewRowToDefaultStore(tabId, tempId, columnName),
      [tabId, setNewRowToDefaultStore],
    ),
    pasteCellRange: useCallback(
      (
        cells: Array<{
          rowIndex: number;
          columnName: string;
          value: string | null;
        }>,
      ) => pasteCellRangeStore(tabId, cells),
      [tabId, pasteCellRangeStore],
    ),
    markRowsForDeletion: useCallback(
      (rowIndices: number[]) => markRowsForDeletionStore(tabId, rowIndices),
      [tabId, markRowsForDeletionStore],
    ),
  };
}

/** Get primary key columns for a table from cached schema metadata */
export function useTablePrimaryKey(tableName: string): string[] {
  const databaseConfig = useActiveDatabaseConfig();

  if (!databaseConfig?.cache?.schemas) return [];

  // Parse tableName - could be "schema.table" or just "table"
  const parts = tableName.split(".");
  let schemaName = "public";
  let tableNameOnly = tableName;

  if (parts.length === 2) {
    schemaName = parts[0];
    tableNameOnly = parts[1];
  }

  // Find the schema
  const schema = databaseConfig.cache.schemas.find(
    (s) => s.name === schemaName,
  );
  if (!schema) return [];

  // Find the table
  const tableMetadata = schema.tables.find((t) => t.name === tableNameOnly);
  if (!tableMetadata) return [];

  return tableMetadata.primaryKey;
}

/** Get full table metadata from cached schema */
export function useTableMetadata(tableName: string): TableMetadata | null {
  const databaseConfig = useActiveDatabaseConfig();

  if (!databaseConfig?.cache?.schemas) return null;

  // Parse tableName - could be "schema.table" or just "table"
  const parts = tableName.split(".");
  let schemaName = "public";
  let tableNameOnly = tableName;

  if (parts.length === 2) {
    schemaName = parts[0];
    tableNameOnly = parts[1];
  }

  // Find the schema
  const schema = databaseConfig.cache.schemas.find(
    (s) => s.name === schemaName,
  );
  if (!schema) return null;

  // Find the table
  return schema.tables.find((t) => t.name === tableNameOnly) ?? null;
}

export interface ForeignKeyRef {
  schema: string;
  table: string;
  column: string;
}

/** Get a map of column names to their foreign key references for quick lookup */
export function useForeignKeyMap(
  tableName: string,
): Map<string, ForeignKeyRef> {
  const tableMetadata = useTableMetadata(tableName);

  const map = new Map<string, ForeignKeyRef>();
  if (!tableMetadata) return map;

  for (const column of tableMetadata.columns) {
    if (column.constraints.isForeignKey && column.constraints.foreignKeyRef) {
      map.set(column.name, column.constraints.foreignKeyRef);
    }
  }

  return map;
}

export interface IncomingForeignKey {
  fromSchema: string;
  fromTable: string;
  fromColumn: string;
  toColumn: string;
}

/** Get all foreign keys from other tables that reference this table */
export function useIncomingForeignKeys(
  tableName: string,
): IncomingForeignKey[] {
  const databaseConfig = useActiveDatabaseConfig();

  if (!databaseConfig?.cache?.schemas) return [];

  // Parse tableName - could be "schema.table" or just "table"
  const parts = tableName.split(".");
  let targetSchema = "public";
  let targetTable = tableName;

  if (parts.length === 2) {
    targetSchema = parts[0];
    targetTable = parts[1];
  }

  const incomingFKs: IncomingForeignKey[] = [];

  // Search all schemas and tables for foreign keys pointing to this table
  for (const schema of databaseConfig.cache.schemas) {
    for (const table of schema.tables) {
      for (const column of table.columns) {
        if (
          column.constraints.isForeignKey &&
          column.constraints.foreignKeyRef
        ) {
          const ref = column.constraints.foreignKeyRef;
          if (ref.schema === targetSchema && ref.table === targetTable) {
            incomingFKs.push({
              fromSchema: schema.name,
              fromTable: table.name,
              fromColumn: column.name,
              toColumn: ref.column,
            });
          }
        }
      }
    }
  }

  return incomingFKs;
}

/**
 * Escape a value for SQL string literal (single quotes)
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Format a value for use in a WHERE clause based on its type
 */
export function formatWhereValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  // Default to string - escape single quotes
  return `'${escapeSqlString(String(value))}'`;
}

/**
 * Helper to get quoted table name
 */
export function getQuotedTableName(tableName: string): string {
  const parts = tableName.split(".");
  if (parts.length === 2) {
    return `"${parts[0]}"."${parts[1]}"`;
  }
  return `"${tableName}"`;
}

/**
 * Generate INSERT queries for pending new rows
 */
export function useGenerateInsertQueries(
  tabId: string,
  tableName: string,
): () => string {
  const pendingNewRows = useStore(
    (state) => state.tableStates[tabId]?.cellEditState.pendingNewRows ?? [],
  );

  return useCallback(() => {
    if (pendingNewRows.length === 0) return "";

    const quotedTableName = getQuotedTableName(tableName);
    const queries: string[] = [];

    for (const newRow of pendingNewRows) {
      const explicitColumns = Array.from(newRow.explicitlySetColumns);

      if (explicitColumns.length === 0) {
        // No explicit columns - use DEFAULT VALUES
        queries.push(`INSERT INTO ${quotedTableName} DEFAULT VALUES;`);
      } else {
        // Build column list and values
        const columnList = explicitColumns.map((col) => `"${col}"`).join(", ");
        const valueList = explicitColumns
          .map((col) => {
            const value = newRow.values[col];
            if (value === null) {
              return "NULL";
            }
            return `'${escapeSqlString(value)}'`;
          })
          .join(", ");

        queries.push(
          `INSERT INTO ${quotedTableName} (${columnList}) VALUES (${valueList});`,
        );
      }
    }

    return queries.join("\n");
  }, [pendingNewRows, tableName]);
}

/**
 * Generate UPDATE queries for pending cell changes
 */
export function useGenerateUpdateQueries(
  tabId: string,
  tableName: string,
  rows: Record<string, unknown>[],
): () => string {
  const primaryKeyColumns = useTablePrimaryKey(tableName);
  const pendingChanges = useStore(
    (state) => state.tableStates[tabId]?.cellEditState.pendingChanges ?? {},
  );

  return useCallback(() => {
    if (Object.keys(pendingChanges).length === 0) return "";
    if (primaryKeyColumns.length === 0) {
      return "-- ERROR: Cannot generate UPDATE queries without a primary key";
    }

    // Group changes by row
    const changesByRow = new Map<number, CellChange[]>();
    for (const change of Object.values(pendingChanges)) {
      const existing = changesByRow.get(change.rowIndex) ?? [];
      existing.push(change);
      changesByRow.set(change.rowIndex, existing);
    }

    // Generate UPDATE for each row
    const quotedTableName = getQuotedTableName(tableName);
    const queries: string[] = [];
    for (const [rowIndex, changes] of changesByRow) {
      const row = rows[rowIndex];
      if (!row) continue;

      // Build SET clause
      const setClauses = changes.map((change) => {
        if (change.newValue === null) {
          return `"${change.columnName}" = NULL`;
        }
        const escapedValue = escapeSqlString(change.newValue);
        return `"${change.columnName}" = '${escapedValue}'`;
      });

      // Build WHERE clause from primary key
      const whereClauses = primaryKeyColumns.map((pkCol) => {
        const pkValue = row[pkCol];
        if (pkValue === null || pkValue === undefined) {
          return `"${pkCol}" IS NULL`;
        }
        const escapedPkValue = escapeSqlString(String(pkValue));
        return `"${pkCol}" = '${escapedPkValue}'`;
      });

      queries.push(
        `UPDATE ${quotedTableName} SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")};`,
      );
    }

    return queries.join("\n");
  }, [pendingChanges, primaryKeyColumns, rows, tableName]);
}

/**
 * Generate DELETE queries for pending deletions
 */
export function useGenerateDeleteQueries(
  tabId: string,
  tableName: string,
  rows: Record<string, unknown>[],
): () => string {
  const primaryKeyColumns = useTablePrimaryKey(tableName);
  const pendingDeletions = useStore(
    (state) => state.tableStates[tabId]?.cellEditState.pendingDeletions ?? [],
  );

  return useCallback(() => {
    if (pendingDeletions.length === 0) return "";
    if (primaryKeyColumns.length === 0) {
      return "-- ERROR: Cannot generate DELETE queries without a primary key";
    }

    const quotedTableName = getQuotedTableName(tableName);
    const queries: string[] = [];

    for (const rowIndex of pendingDeletions) {
      const row = rows[rowIndex];
      if (!row) continue;

      // Build WHERE clause from primary key
      const whereClauses = primaryKeyColumns.map((pkCol) => {
        const pkValue = row[pkCol];
        if (pkValue === null || pkValue === undefined) {
          return `"${pkCol}" IS NULL`;
        }
        const escapedPkValue = escapeSqlString(String(pkValue));
        return `"${pkCol}" = '${escapedPkValue}'`;
      });

      queries.push(
        `DELETE FROM ${quotedTableName} WHERE ${whereClauses.join(" AND ")};`,
      );
    }

    return queries.join("\n");
  }, [pendingDeletions, primaryKeyColumns, rows, tableName]);
}

/**
 * Generate combined DELETE, UPDATE, and INSERT queries
 */
export function useGenerateCombinedQueries(
  tabId: string,
  tableName: string,
  rows: Record<string, unknown>[],
): () => string {
  const generateDeleteQueries = useGenerateDeleteQueries(
    tabId,
    tableName,
    rows,
  );
  const generateUpdateQueries = useGenerateUpdateQueries(
    tabId,
    tableName,
    rows,
  );
  const generateInsertQueries = useGenerateInsertQueries(tabId, tableName);

  return useCallback(() => {
    const deleteQueries = generateDeleteQueries();
    const updateQueries = generateUpdateQueries();
    const insertQueries = generateInsertQueries();

    const parts: string[] = [];
    // Order: DELETE first, then UPDATE, then INSERT
    if (deleteQueries) parts.push(deleteQueries);
    if (updateQueries) parts.push(updateQueries);
    if (insertQueries) parts.push(insertQueries);

    return parts.join("\n");
  }, [generateDeleteQueries, generateUpdateQueries, generateInsertQueries]);
}

/** Open a new console tab with pre-filled SQL */
export function useOpenConsoleWithQuery() {
  const addInnerTab = useStore((state) => state.addInnerTab);
  const getActiveTab = useStore((state) => state.getActiveTab);
  const initConsoleState = useStore((state) => state.initConsoleState);
  const setConsoleQueryText = useStore((state) => state.setConsoleQueryText);

  return useCallback(
    (queryText: string) => {
      const activeTab = getActiveTab();
      const consoleCount =
        activeTab?.innerTabs.filter((t) => t.type === "console").length ?? 0;

      const newInnerTab: InnerTab = {
        id: Date.now().toString(),
        type: "console",
        name: consoleCount === 0 ? "Console" : `Console ${consoleCount + 1}`,
      };
      addInnerTab(newInnerTab);
      initConsoleState(newInnerTab.id);
      // Set the query text after a microtask to ensure state is initialized
      setTimeout(() => {
        setConsoleQueryText(newInnerTab.id, queryText);
      }, 0);
    },
    [addInnerTab, getActiveTab, initConsoleState, setConsoleQueryText],
  );
}
